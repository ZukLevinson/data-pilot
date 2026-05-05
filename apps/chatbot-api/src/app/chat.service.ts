import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatStreamChunk } from '@org/shared/models';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private llm: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;

  public readonly modelName: string;
  public readonly embeddingModel: string;

  constructor(private prisma: PrismaService) {
    // URL to your local Ollama or vLLM instance
    const baseURL = process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1';
    
    this.modelName = process.env['LOCAL_LLM_MODEL'] || 'qwen3-coder';
    this.embeddingModel = process.env['LOCAL_EMBEDDING_MODEL'] || 'nomic-embed-text';

    this.llm = new ChatOpenAI({
      modelName: this.modelName,
      apiKey: 'local-key', // LangChain now prefers apiKey over openAIApiKey
      configuration: { baseURL },
      temperature: 0.1,
    });

    this.embeddings = new OpenAIEmbeddings({
      modelName: this.embeddingModel,
      apiKey: 'local-key',
      configuration: { baseURL },
    });
  }

  async *processChatStream(userId: string, question: string): AsyncGenerator<ChatStreamChunk> {
    this.logger.log(`Streaming chat for user ${userId}: ${question}`);
    
    // 1. Generate embedding for the question
    const questionEmbedding = await this.embeddings.embedQuery(question);
    const vectorString = `[${questionEmbedding.join(',')}]`;

    // 2. Query Postgres for closest vectors
    const allowedEntities: any[] = await this.prisma.$queryRaw`
      SELECT e.id, e.content, e.type, e.embedding <=> ${vectorString}::vector as distance
      FROM "Entity" e
      LEFT JOIN "EntityTag" et ON e.id = et.entity_id
      WHERE 
        et.tag_id IS NULL 
        OR et.tag_id IN (
          SELECT tag_id FROM "UserTag" WHERE user_id = ${userId}::uuid
        )
      ORDER BY distance ASC
      LIMIT 5;
    `;

    const contextText = allowedEntities.map((e, i) => `[Document ${i+1}]: ${e.content}`).join('\n\n');

    // 3. Construct prompt - explicitly asking for <think> tags
    const prompt = `You are a helpful AI assistant. 
First, think through the answer step-by-step inside <think> tags. 
Then, provide the final answer based ONLY on the context provided.

Context:
${contextText}

Question: ${question}

Answer:`;

    // 4. Stream response from local Qwen
    const stream = await this.llm.stream(prompt);

    for await (const chunk of stream) {
      if (typeof chunk.content === 'string') {
        yield { data: chunk.content };
      }
    }
  }
}
