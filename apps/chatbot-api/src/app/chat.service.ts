import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatStreamChunk, EntitySearchResult } from '@org/models';

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
    
    yield { status: 'מנתח את השאלה...' };
    
    // 1. Generate embedding for the question
    const questionEmbedding = await this.embeddings.embedQuery(question);
    const vectorString = `[${questionEmbedding.join(',')}]`;

    yield { status: 'מחפש במסמכים רלוונטיים...' };

    // 2. Query Postgres for closest vectors (Semantic Search)
    const areas = await this.prisma.$queryRaw<EntitySearchResult[]>`
      SELECT a.id, a.content, a.type, a.embedding <=> ${vectorString}::vector as distance
      FROM "Area" a
      ORDER BY distance ASC
      LIMIT 5;
    `;

    const contextText = areas.map((e, i) => `[Document ${i+1}]: ${e.content}`).join('\n\n');

    yield { status: 'מכין תשובה מפורטת...' };

    // 3. Construct prompt - explicitly asking for <think> tags
    const prompt = `אתה מומחה לישויות גיאוגרפיות ומערכות מידע מרחביות (GIS). 
ענה על השאלות על סמך ההקשר המצורף בלבד. 
ההקשר מכיל מידע על ישויות גיאוגרפיות מסוג: נקודה (Point), מעגל (Circle), פוליגון פתוח/סגור (Polygon), מסדרון (Corridor) ואליפסה (Ellipse).

ראשית, חשוב על התשובה צעד אחר צעד בתוך תגיות <think>. 
לאחר מכן, ספק את התשובה הסופית בעברית.

Context:
${contextText}

Question: ${question}

Answer:`;

    // 4. Stream response from local Qwen
    const stream = await this.llm.stream(prompt);

    for await (const chunk of stream) {
      if (typeof chunk.content === 'string') {
        yield { content: chunk.content };
      }
    }
  }
}
