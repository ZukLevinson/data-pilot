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
    const isAddQuery = /add|keep|also|בנוסף|תתקדם|תשאיר|וכן|תצרף|תוסיף/i.test(question);
    const mode: 'replace' | 'append' = isAddQuery ? 'append' : 'replace';

    yield { status: 'מנתח את הדרישה המורכבת...' };

    // 1. Generate Structured Query Plan
    let queryPlan: any = null;
    try {
      const planPrompt = `You are a SQL Query Planner for a Rare Earth Mining database.
Question: "${question}"

Schema:
- Mine: name
- Cluster: stoneType, quantity
- Drill: name, supportedStoneTypes
- DrillMission: stoneType, date

Generate a JSON Query Plan.
Structure:
{
  "target": "Mine" | "Cluster" | "Drill" | "DrillMission",
  "conditions": {
    "fieldName": { "operator": "contains" | "gt" | "lt" | "after" | "before", "value": any }
  },
  "mineConditions": { "name": { "operator": "contains", "value": string } },
  "clusterConditions": { "stoneType": { "operator": "contains", "value": string } }
}

Important:
1. For "Mines containing [Stone]", target "Mine" and use "clusterConditions" with field "stoneType".
2. Use "stoneType" (exactly) for mineral names. 
3. ALWAYS use the English technical name for minerals (e.g., "Neodymium", "Dysprosium", "Europium") even if the user asks in Hebrew.
4. Use "contains" for all string/name filters.
5. Output ONLY valid JSON.`;

      const planRes = await this.llm.invoke(planPrompt);
      const match = planRes.content.toString().match(/\{[\s\S]*\}/);
      if (match) {
        queryPlan = JSON.parse(match[0]);
        this.logger.log(`Generated Query Plan: ${JSON.stringify(queryPlan)}`);
      }
    } catch (e) {
      this.logger.error('Failed to generate query plan', e);
      yield { content: 'מצטער, לא הצלחתי לנתח את השאילתה המורכבת.' };
      return;
    }

    if (!queryPlan) {
      yield { content: 'לא הצלחתי ליצור תוכנית שאילתה עבור השאלה הזו.' };
      return;
    }

    yield { status: 'מריץ שאילתה מובנית...', queryPlan };

    // 2. Execute the Plan (Mapping JSON to Prisma/SQL)
    let entities: EntitySearchResult[] = [];
    try {
      if (queryPlan.target === 'Mine') {
        const where: any = {};
        if (queryPlan.conditions?.name) {
          where.name = { contains: queryPlan.conditions.name.value, mode: 'insensitive' };
        }
        if (queryPlan.conditions?.stoneType || queryPlan.clusterConditions?.stoneType || queryPlan.stoneType) {
          let stoneType = '';
          const rawType = queryPlan.clusterConditions?.stoneType || queryPlan.conditions?.stoneType || queryPlan.stoneType;
          
          if (typeof rawType === 'string') {
            stoneType = rawType;
          } else if (typeof rawType === 'object' && rawType !== null) {
            stoneType = rawType.value || rawType.contains || rawType.equals || '';
          }

          if (stoneType) {
            this.logger.log(`Filtering mines by stoneType: ${stoneType}`);
            where.clusters = {
              some: { stoneType: { contains: stoneType, mode: 'insensitive' } }
            };
          }
        }
        this.logger.log(`Executing Mine findMany with where: ${JSON.stringify(where)}`);
        const mines = await this.prisma.mine.findMany({ where, take: 1000 });
        const totalCount = await this.prisma.mine.count({ where });
        
        // Fetch WKTs separately since Prisma doesn't support them in findMany
        const ids = mines.map(m => m.id);
        if (ids.length > 0) {
          const wkts = await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT id::text, ST_AsText(geom) as wkt FROM "Mine" WHERE id::text IN (${ids.map(id => `'${id}'`).join(',')})`
          );
          entities = mines.map(m => ({
            id: m.id,
            name: m.name,
            type: 'Mine',
            content: `Global Mine site: ${m.name}`,
            color: '#3b82f6',
            wkt: wkts.find(w => w.id === String(m.id))?.wkt,
            distance: 0
          }));
        }
        (queryPlan as any).totalCount = totalCount;
      } else if (queryPlan.target === 'Cluster') {
        const where: any = {};
        if (queryPlan.conditions?.stoneType) {
          where.stoneType = { contains: queryPlan.conditions.stoneType.value, mode: 'insensitive' };
        }
        if (queryPlan.conditions?.quantity) {
          const op = queryPlan.conditions.quantity.operator;
          const val = queryPlan.conditions.quantity.value;
          if (op === 'gt') where.quantity = { gt: val };
          if (op === 'lt') where.quantity = { lt: val };
        }
        
        const clusters = await this.prisma.cluster.findMany({ 
          where, 
          include: { mine: true },
          take: 1000 
        });
        const totalCount = await this.prisma.cluster.count({ where });
        
        const ids = clusters.map(c => c.id);
        if (ids.length > 0) {
          const wkts = await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT id::text, ST_AsText(geom) as wkt FROM "Cluster" WHERE id::text IN (${ids.map(id => `'${id}'`).join(',')})`
          );
          entities = clusters.map(c => ({
            id: c.id,
            name: c.stoneType,
            type: 'Cluster',
            content: `Type: ${c.stoneType}, Quantity: ${c.quantity.toLocaleString()}kg, Location: ${c.mine.name}`,
            color: '#f59e0b',
            wkt: wkts.find(w => w.id === String(c.id))?.wkt,
            distance: 0
          }));
        }
        (queryPlan as any).totalCount = totalCount;
      } else if (queryPlan.target === 'DrillMission') {
        const where: any = {};
        if (queryPlan.conditions?.date) {
          const op = queryPlan.conditions.date.operator;
          const val = new Date(queryPlan.conditions.date.value);
          if (op === 'after') where.date = { gt: val };
          if (op === 'before') where.date = { lt: val };
        }
        if (queryPlan.mineConditions?.name) {
          where.mine = { name: { contains: queryPlan.mineConditions.name.value, mode: 'insensitive' } };
        }

        const missions = await this.prisma.drillMission.findMany({
          where,
          include: { mine: true, drill: true },
          take: 1000
        });
        const totalCount = await this.prisma.drillMission.count({ where });

        // Missions are points on the mine location for visualization
        const mineIds = missions.map(m => m.mine.id);
        const mineWkts = mineIds.length > 0 ? await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT id::text, ST_AsText(geom) as wkt FROM "Mine" WHERE id::text IN (${Array.from(new Set(mineIds)).map(id => `'${id}'`).join(',')})`
        ) : [];

        entities = missions.map(m => ({
          id: m.id,
          name: `Mission: ${m.stoneType}`,
          type: 'Mission',
          content: `Planned: ${m.date.toLocaleDateString()}, Drill: ${m.drill.name}, Mine: ${m.mine.name}`,
          color: '#8b5cf6',
          wkt: mineWkts.find(w => w.id === String(m.mine.id))?.wkt,
          distance: 0
        }));
        (queryPlan as any).totalCount = totalCount;
      }

      // 3. Persist the Query for future use
      await this.prisma.savedQuery.create({
        data: {
          name: question,
          query: queryPlan,
          sql: `Generated for: ${queryPlan.target}`
        }
      });

    } catch (e) {
      this.logger.error('Query execution failed', e);
      yield { content: 'אירעה שגיאה בעת הרצת השאילתה המובנית.' };
      return;
    }

    yield { sources: entities, mode };

    yield { status: 'מנסח תשובה סופית...' };

    const displayEntities = entities.slice(0, 3);
    const moreCount = entities.length > 3 ? entities.length - 3 : 0;

    const contextText = displayEntities.length > 0 
      ? displayEntities.map((e, i) => `[Item ${i+1}]: ${e.name} (${e.type}). Details: ${e.content}`).join('\n\n')
      : 'No results found in the database for this specific query plan.';

    const prompt = `You are a Rare Earth Mining Virtualization Expert.
Question: "${question}"
Results Shown in Details: ${displayEntities.length}
Remaining Results in List: ${moreCount}
Total Count in Database: ${queryPlan.totalCount || entities.length}

Context:
${contextText}

Instructions:
1. Answer in Hebrew professionally.
2. If results were found:
   - Summarize the first few results.
   - Explicitly mention that there are ${moreCount} more entities of this type found and they are all displayed on the map.
   - Mention the total count in the database (${queryPlan.totalCount || entities.length}).
3. If NO results were found, inform the user clearly. Do NOT invent reasons.
4. Mention that the query plan has been saved.
5. Keep the response concise and focused on the spatial results.`;

    const stream = await this.llm.stream(prompt);
    for await (const chunk of stream) {
      if (chunk.content) yield { content: chunk.content as string };
    }
  }

  async getInitialData(): Promise<EntitySearchResult[]> {
    // 1. Fetch a sample of Mines
    const mines = await this.prisma.mine.findMany({ take: 200 });
    const mineIds = mines.map(m => m.id);
    
    // 2. Fetch WKTs for these Mines
    const mineWkts = mineIds.length > 0 ? await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id::text, ST_AsText(geom) as wkt FROM "Mine" WHERE id::text IN (${mineIds.map(id => `'${id}'`).join(',')})`
    ) : [];

    const mineEntities: EntitySearchResult[] = mines.map(m => ({
      id: m.id,
      name: m.name,
      type: 'Mine',
      content: `French Mine site: ${m.name}`,
      color: '#3b82f6',
      wkt: mineWkts.find(w => w.id === String(m.id))?.wkt,
      distance: 0
    }));

    // 3. Fetch ONLY clusters belonging to the loaded Mines to ensure they appear "inside"
    const clusters = await this.prisma.cluster.findMany({ 
      where: { mineId: { in: mineIds } },
      take: 2000, // Limit to avoid browser lag
      include: { mine: true } 
    });
    
    const clusterIds = clusters.map(c => c.id);
    const clusterWkts = clusterIds.length > 0 ? await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id::text, ST_AsText(geom) as wkt FROM "Cluster" WHERE id::text IN (${clusterIds.map(id => `'${id}'`).join(',')})`
    ) : [];

    const clusterEntities: EntitySearchResult[] = clusters.map(c => ({
      id: c.id,
      name: c.stoneType,
      type: 'Cluster',
      content: `Type: ${c.stoneType}, Quantity: ${c.quantity.toLocaleString()}kg, Location: ${c.mine.name}`,
      color: '#f59e0b',
      wkt: clusterWkts.find(w => w.id === String(c.id))?.wkt,
      distance: 0
    }));

    return [...mineEntities, ...clusterEntities];
  }
}
