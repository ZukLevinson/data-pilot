import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
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

    // Extract requested result count
    const isAllQuery = /\ball\b|כל\s+ה|את\s+כל|הכל|הצג\s+הכל/i.test(question);
    const countMatch = question.match(/\b(\d+)\b/);
    const requestedLimit = isAllQuery ? 10000 : (countMatch ? Math.min(parseInt(countMatch[1], 10), 1000) : 10);

    yield { status: 'מנתח את השאלה...' };

    // 1. Determine the intent and filters using LLM
    let analysis: { 
      targetTable: 'Mine' | 'Cluster' | 'Drill' | 'DrillMission',
      filters: Record<string, any>,
      spatialCity?: string
    } = { targetTable: 'Cluster', filters: {} };

    try {
      const intentPrompt = `Analyze the GIS question: "${question}".
Determine which table to query and what filters to apply.
Tables:
- Mine: Geographic boundaries of mining areas. Fields: name.
- Cluster: Groups of stones at a location. Fields: stoneType, quantity.
- Drill: Mining equipment. Fields: name, supportedStoneTypes (array).
- DrillMission: Planned drilling tasks. Fields: stoneType, date.

Return ONLY a JSON object: 
{
  "targetTable": "Mine" | "Cluster" | "Drill" | "DrillMission",
  "filters": { "field": "value" },
  "spatialCity": "city name if mentioned"
}

Rules:
1. Use "Cluster" if they ask about stones or locations of materials.
2. Use "Mine" if they ask about areas or boundaries.
3. Use "Drill" if they ask about equipment or what can drill what.
4. Use "DrillMission" if they ask about schedules or missions.
5. If the user mentions a city, put it in "spatialCity".`;

      const intentRes = await this.llm.invoke(intentPrompt);
      const match = intentRes.content.toString().match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
        this.logger.log(`Intent Analysis: ${JSON.stringify(analysis)}`);
      }
    } catch (e) {
      this.logger.warn('Failed to analyze intent, defaulting to Cluster.');
    }

    // Spatial Resolver for major cities
    const cities: Record<string, [number, number]> = {
      'tel aviv': [34.7818, 32.0853],
      'תל אביב': [34.7818, 32.0853],
      'jerusalem': [35.2137, 31.7683],
      'ירושלים': [35.2137, 31.7683],
      'beer sheva': [34.7913, 31.2518],
      'באר שבע': [34.7913, 31.2518],
      'eilat': [34.9512, 29.5577],
      'אילת': [34.9512, 29.5577],
    };

    let targetCity = null;
    const cityKey = analysis.spatialCity?.toLowerCase();
    if (cityKey && cities[cityKey]) {
      targetCity = { name: analysis.spatialCity, coords: cities[cityKey] };
    }

    yield { status: 'מחפש במאגר הנתונים...' };

    let results: any[] = [];
    let entities: EntitySearchResult[] = [];

    // Construct Query based on Target Table
    if (analysis.targetTable === 'Mine') {
      results = await this.prisma.mine.findMany({
        where: analysis.filters,
        take: requestedLimit,
      });
      // Get WKT for geometry
      const rawResults = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT id, name, ST_AsText(geom) as wkt FROM "Mine" 
        WHERE name ILIKE $1 LIMIT $2
      `, `%${analysis.filters.name || ''}%`, requestedLimit);
      
      entities = rawResults.map(r => ({
        id: r.id,
        name: r.name,
        type: 'Mine',
        content: `Mine boundary for ${r.name}`,
        color: '#3b82f6',
        wkt: r.wkt,
        distance: 0
      }));
    } else if (analysis.targetTable === 'Cluster') {
      let whereSql = '1=1';
      if (analysis.filters.stoneType) whereSql += ` AND stone_type ILIKE '%${analysis.filters.stoneType}%'`;
      
      const rawResults = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT c.id, c.stone_type as "stoneType", c.quantity, ST_AsText(c.geom) as wkt, m.name as "mineName"
        FROM "Cluster" c
        JOIN "Mine" m ON c.mine_id = m.id
        WHERE ${whereSql}
        LIMIT ${requestedLimit}
      `);

      entities = rawResults.map(r => ({
        id: r.id,
        name: r.stoneType,
        type: 'Cluster',
        content: `Stone Type: ${r.stoneType}, Quantity: ${r.quantity}kg, Mine: ${r.mineName}`,
        color: '#f59e0b',
        wkt: r.wkt,
        distance: 0
      }));
    } else if (analysis.targetTable === 'Drill') {
      const drills = await this.prisma.drill.findMany({
        where: analysis.filters.name ? { name: { contains: analysis.filters.name, mode: 'insensitive' } } : {},
        take: requestedLimit
      });
      entities = drills.map(d => ({
        id: d.id,
        name: d.name,
        type: 'Drill',
        content: `Supported: ${d.supportedStoneTypes.join(', ')}`,
        color: '#ef4444',
        distance: 0
      }));
    } else if (analysis.targetTable === 'DrillMission') {
      const missions = await this.prisma.drillMission.findMany({
        include: { mine: true, drill: true },
        take: requestedLimit
      });
      entities = missions.map(m => ({
        id: m.id,
        name: `Mission: ${m.stoneType}`,
        type: 'Mission',
        content: `Date: ${m.date.toDateString()}, Mine: ${m.mine.name}, Drill: ${m.drill.name}`,
        color: '#8b5cf6',
        distance: 0
      }));
    }

    yield { sources: entities, mode };

    yield { status: 'מנסח תשובה...' };

    const contextText = entities.map((e, i) => `[Item ${i+1}]: ${e.name} (${e.type}). Details: ${e.content}`).join('\n\n');

    const prompt = `You are a Virtualization Expert for Rare Earth Materials. 
The user is asking: "${question}"

Current Database Context:
${contextText}

Guidelines:
1. Answer in Hebrew professionally and concisely.
2. If the user asked for a count, provide it based on the results.
3. If the user asked about locations, mention that they are displayed on the map.
4. If no results were found, suggest what they can ask about (Mines, Clusters, Drills).

Answer:`;

    const stream = await this.llm.stream(prompt);
    for await (const chunk of stream) {
      if (chunk.content) yield { content: chunk.content as string };
    }
  }
}
