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
    
    // 1. Detect if this is a general/quantitative question
    const isGeneralQuery = /count|how many|כמה|מספר|כמות/i.test(question);
    
    // Detect if this is a "Show me" query (visual only)
    const isShowQuery = /show|הצג|תראה|תציג/i.test(question) && !/count|how many|כמה/i.test(question);

    // Spatial Resolver for major cities (Pilot)
    const cities: Record<string, [number, number]> = {
      'tel aviv': [34.7818, 32.0853],
      'תל אביב': [34.7818, 32.0853],
      'jerusalem': [35.2137, 31.7683],
      'ירושלים': [35.2137, 31.7683],
      'haifa': [34.9896, 32.7940],
      'חיפה': [34.9896, 32.7940],
      'paris': [2.3522, 48.8566],
      'פריז': [2.3522, 48.8566],
      'marseille': [5.3698, 43.2965],
      'מרסיי': [5.3698, 43.2965],
    };

    let targetCity = null;
    for (const city in cities) {
      if (question.toLowerCase().includes(city)) {
        targetCity = { name: city, coords: cities[city] };
        break;
      }
    }

    if (isGeneralQuery) {
      const countRes = await this.prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int as count FROM "Area"`;
      const totalCount = countRes[0]?.count ?? 0;
      const prompt = `המשתמש שואל שאלה כללית על כמות הישויות או על המערכת. 
נתון: ישנן ${totalCount} ישויות גיאוגרפיות במסד הנתונים.
ענה למשתמש בעברית ובצורה תמציתית על השאלה: ${question}`;
      
      yield { status: 'מכין תשובה...' };
      const stream = await this.llm.stream(prompt);
      for await (const chunk of stream) {
        if (typeof chunk.content === 'string' && chunk.content) {
          yield { content: chunk.content };
        }
      }
      return;
    }
    // 2. Query Postgres for closest areas
    let areas: EntitySearchResult[] = [];
    
    if (targetCity) {
      this.logger.log(`Performing Spatial Search for city: ${targetCity.name}`);
      const [lon, lat] = targetCity.coords;
      // Spatial KNN search using PostGIS <-> operator
      areas = await this.prisma.$queryRaw<EntitySearchResult[]>`
        SELECT a.id, a.name, a.content, a.type, a.color, ST_AsText(a.geom) as wkt, 
               ST_Distance(a.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) / 1000 as distance
        FROM "Area" a
        ORDER BY a.geom <-> ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        LIMIT 5;
      `;
    } else {
      // Fallback to Semantic Vector Search
      const questionEmbedding = await this.embeddings.embedQuery(question);
      const vectorString = `[${questionEmbedding.join(',')}]`;
      
      areas = await this.prisma.$queryRaw<EntitySearchResult[]>`
        SELECT a.id, a.name, a.content, a.type, a.color, ST_AsText(a.geom) as wkt, a.embedding <=> ${vectorString}::vector as distance
        FROM "Area" a
        ORDER BY distance ASC
        LIMIT 5;
      `;
    }

    const contextText = areas.map((e, i) => `[Document ${i+1}]: Name: ${e.name}. Type: ${e.type}. Content: ${e.content} ${targetCity ? `(Distance: ${e.distance.toFixed(2)} km)` : ''}`).join('\n\n');
    
    // Yield sources to the client
    yield { sources: areas };

    if (isShowQuery) {
      this.logger.log(`Show query detected, skipping LLM response.`);
      return;
    }

    yield { status: 'מכין תשובה...' };

    // 3. Construct prompt
    const prompt = `אתה עוזר GIS מקצועי. המשתמש שואל: "${question}"
על סמך המידע הגיאוגרפי הבא:

${contextText}

הנחיות:
1. ענה בעברית בצורה ישירה ותמציתית.
2. אם יש נתוני מרחק (Distance), ציין אותם בתשובתך.
3. אל תוסיף הקדמות מיותרות.

Answer:`;

    // 4. Stream response from local LLM
    this.logger.log(`--- SENDING PROMPT TO LLM ---`);
    this.logger.log(prompt);
    this.logger.log(`--- END PROMPT ---`);

    const stream = await this.llm.stream(prompt);

    let hasResponded = false;
    for await (const chunk of stream) {
      if (chunk.content) {
        if (!hasResponded) {
          this.logger.log(`LLM started responding...`);
          hasResponded = true;
        }
        yield { content: chunk.content as string };
      }
    }
    
    if (!hasResponded) {
      this.logger.warn('Model returned an empty response!');
    }
  }
}
