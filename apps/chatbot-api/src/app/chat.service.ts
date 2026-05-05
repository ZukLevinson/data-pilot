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
    // Detect mode: 'replace' (default) vs 'append'
    const isAddQuery = /add|keep|also|בנוסף|תתקדם|תשאיר|וכן|תצרף|תוסיף/i.test(question);
    const mode: 'replace' | 'append' = isAddQuery ? 'append' : 'replace';

    // Extract requested result count (e.g. "show me 10 areas" → limit=10)
    // If user says "all" / "כל" / "הכל", remove the limit
    const isAllQuery = /\ball\b|כל\s+ה|את\s+כל|הכל|הצג\s+הכל/i.test(question);
    const countMatch = question.match(/\b(\d+)\b/);
    const requestedLimit = isAllQuery ? 10000 : (countMatch ? Math.min(parseInt(countMatch[1], 10), 1000) : 5);

    // 1. Extract potential filters (Name, Color, Type) using a quick LLM pass
    let filters: { name?: string, type?: string, color?: string } = {};
    try {
      const filterPrompt = `Extract geographic filters from the question: "${question}".
Return ONLY a JSON object: {"name": string, "type": string, "color": string}. 

CRITICAL RULES:
1. ONLY include a field if it is EXPLICITLY and LITERALLY mentioned in the question.
2. If a property is not mentioned, DO NOT include it in the JSON at all (omit the key).
3. "areas", "אזורים", "איזורים", "אזור", "איזור", or "ישויות" are GENERIC terms. DO NOT assign a "type" if these are the only terms used.
4. NEVER guess "point" as a default type unless they literally say "points".
5. If the user says "red areas", set color to "#ef4444" and leave "name" and "type" OUT.
6. DO NOT guess the type if not mentioned.
7. DO NOT use the question text as the "name" unless they say "named X" or "שם X".
8. NUMBERS (like 5, 10, 100) are ALWAYS quantity counts, NEVER names. Ignore them entirely.
9. Be clinical and minimal.

EXAMPLES:
- "how many red areas" -> {"color": "#ef4444"}
- "circles in Paris" -> {"type": "circle"}
- "areas named France" -> {"name": "France"}
- "blue polygons" -> {"color": "#3b82f6", "type": "polygon"}
- "תציג 5 אזורים" -> {}
- "תציג 5 איזורים" -> {}
- "הצג 10 אזורים אדומים" -> {"color": "#ef4444"}
- "show me 7 circles" -> {"type": "circle"}

Colors: #ef4444 (red), #f97316 (orange), #f59e0b (yellow), #10b981 (green), #3b82f6 (blue), #6366f1 (indigo), #8b5cf6 (purple), #d946ef (pink).
Types: point, circle, open polygon, closed polygon, corridor, ellipse.`;
      
      const filterRes = await this.llm.invoke(filterPrompt);
      const match = filterRes.content.toString().match(/\{[\s\S]*\}/);
      if (match) {
        filters = JSON.parse(match[0]);
        this.logger.log(`Extracted Filters: ${JSON.stringify(filters)}`);
      }
    } catch (e) {
      this.logger.warn('Failed to extract filters, falling back to semantic only.');
    }

    // 1. Detect if this is a general/quantitative question
    const isGeneralQuery = /count|how many|כמה|מספר|כמות/i.test(question);
    
    // Type detection mapping for Hebrew/English

    // Post-process: strip any filter the LLM hallucinated for purely generic queries
    // e.g. "תציג 5 אזורים" / "תציג 5 איזורים" → no filter at all
    const hasExplicitType = /circle|מעגל|עיגול|point|נקודה|polygon|פוליגון|מצולע|corridor|מסדרון|ellipse|אליפסה/i.test(question);
    const hasExplicitColor = /red|אדום|blue|כחול|green|ירוק|orange|כתום|yellow|צהוב|purple|סגול|pink|ורוד|indigo/i.test(question);
    const hasExplicitName = /named|שם|בשם/i.test(question);

    if (!hasExplicitType) delete filters.type;
    if (!hasExplicitColor) delete filters.color;
    if (!hasExplicitName) delete filters.name;

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

    // Extract radius (default to 5km if near is mentioned but no radius)
    let radiusKm = 5;
    const radiusMatch = question.match(/(\d+)\s*(km|קילומטר|ק"מ)/i);
    if (radiusMatch) {
      radiusKm = parseInt(radiusMatch[1]);
    }

    if (isGeneralQuery) {
      let totalCount = 0;
      let filteredCount = 0;
      let spatialFilteredCount = 0;
      
      const totalRes = await this.prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int as count FROM "Area"`;
      totalCount = totalRes[0]?.count ?? 0;

      // Build dynamic WHERE clause based on extracted filters
      const whereClauses = ['1=1'];
      if (filters.type) whereClauses.push(`type LIKE '%${filters.type}%'`);
      if (filters.color) whereClauses.push(`color = '${filters.color}'`);
      if (filters.name) whereClauses.push(`name ILIKE '%${filters.name}%'`);
      const whereSql = whereClauses.join(' AND ');

      const filteredRes = await this.prisma.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int as count FROM "Area" WHERE ${whereSql}`);
      filteredCount = filteredRes[0]?.count ?? 0;

      if (targetCity) {
        const [lon, lat] = targetCity.coords;
        const spatialRes = await this.prisma.$queryRawUnsafe<{ count: number }[]>(`
          SELECT count(*)::int as count 
          FROM "Area" a 
          WHERE ${whereSql} AND ST_Distance(a.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) <= ${radiusKm * 1000}
        `);
        spatialFilteredCount = spatialRes[0]?.count ?? 0;
      }

      const prompt = `המשתמש שואל שאלה כמותית על המערכת.
נתון כללי: ישנם סה"כ ${totalCount} אזורים במסד הנתונים.
${whereSql !== '1=1' ? `נתון מסונן (לפי הקריטריונים שצוינו): נמצאו ${filteredCount} אזורים מתאימים.` : ''}
${targetCity ? `באזור ${targetCity.name} (רדיוס ${radiusKm} ק"מ), נמצאו ${spatialFilteredCount} אזורים.` : ''}

ענה למשתמש בעברית ובצורה תמציתית ומדויקת על השאלה: ${question}
השתמש בנתונים המספריים המדויקים שסופקו לעיל. אל תמציא פילטרים שלא הוזכרו בשאלה.`;
      
      yield { status: 'מחשב כמות מורכבת...' };
      const stream = await this.llm.stream(prompt);
      for await (const chunk of stream) {
        if (chunk.content) yield { content: chunk.content as string };
      }
      return;
    }
    // Detect if this is a "Show me" query (visual only)
    const isShowQuery = /show|הצג|תראה|תציג/i.test(question) && !/count|how many|כמה/i.test(question);

    // Build dynamic WHERE clause
    let whereSql = '1=1';
    if (filters.type) whereSql += ` AND type LIKE '%${filters.type}%'`;
    if (filters.color) whereSql += ` AND color = '${filters.color}'`;
    if (filters.name) whereSql += ` AND name ILIKE '%${filters.name}%'`;

    // 2. Query Postgres for closest areas
    let areas: EntitySearchResult[] = [];
    
    if (targetCity) {
      this.logger.log(`Performing Spatial Search for city: ${targetCity.name}`);
      const [lon, lat] = targetCity.coords;
      // Spatial KNN search using PostGIS <-> operator
      areas = await this.prisma.$queryRawUnsafe<EntitySearchResult[]>(`
        SELECT a.id, a.name, a.content, a.type, a.color, ST_AsText(a.geom) as wkt, 
               ST_Distance(a.geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography) / 1000 as distance
        FROM "Area" a
        WHERE ${whereSql}
        ORDER BY a.geom <-> ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        LIMIT ${requestedLimit};
      `);
    } else {
      // Fallback to Semantic Vector Search
      const questionEmbedding = await this.embeddings.embedQuery(question);
      const vectorString = `[${questionEmbedding.join(',')}]`;
      
      areas = await this.prisma.$queryRawUnsafe<EntitySearchResult[]>(`
        SELECT a.id, a.name, a.content, a.type, a.color, ST_AsText(a.geom) as wkt, a.embedding <=> '${vectorString}'::vector as distance
        FROM "Area" a
        WHERE ${whereSql}
        ORDER BY distance ASC
        LIMIT ${requestedLimit};
      `);
    }

    const contextText = areas.map((e, i) => `[Document ${i+1}]: Name: ${e.name}. Type: ${e.type}. Content: ${e.content} ${targetCity ? `(Distance: ${e.distance.toFixed(2)} km)` : ''}`).join('\n\n');
    
    // Yield sources to the client
    yield { sources: areas, mode };

    if (isShowQuery) {
      this.logger.log(`Show query detected, returning map confirmation.`);
      const filterDesc = [
        filters.color ? `צבע ${filters.color}` : '',
        filters.type ? `סוג "${filters.type}"` : '',
        filters.name ? `שם "${filters.name}"` : '',
      ].filter(Boolean).join(', ');
      const mapMsg = `מציג **${areas.length}** אזורים על המפה${filterDesc ? ` (${filterDesc})` : ''}.`;
      yield { content: mapMsg };
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
