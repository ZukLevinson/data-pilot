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
- Mine (Hebrew: מכרה): name
- Cluster (Hebrew: מקבץ): stoneType, quantity
- Drill: name, supportedStoneTypes
- DrillMission: stoneType, date

Generate a JSON Query Plan.
Structure:
{
  "target": "Mine" | "Cluster" | "Drill" | "DrillMission",
  "limit": number (optional, default to 5000 if not specified),
  "conditions": {
    "fieldName": { "operator": "contains" | "notContains" | "gt" | "lt" | "after" | "before", "value": any }
  },
  "mineConditions": { "name": { "operator": "contains" | "notContains", "value": string } },
  "clusterConditions": { 
    "stoneType": { "operator": "contains" | "notContains", "value": string },
    "quantity": { "operator": "gt" | "lt", "value": number },
    "minCount": number
  }
}

Important:
1. Minerals (Neodymium, Dysprosium, etc.) are ONLY found in Clusters. 
2. If the user asks for "Mines containing [Stone]", target "Mine" and put the stone filter in "clusterConditions" (or conditions.stoneType). NEVER put the stone name in Mine:name.
3. Use "stoneType" (exactly) for mineral names. 
4. ALWAYS use the English technical name for minerals even if the user asks in Hebrew.
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
        let stoneTypeForSql = '';
        if (queryPlan.conditions?.stoneType || queryPlan.clusterConditions?.stoneType || queryPlan.stoneType) {
          let stoneType = '';
          const rawType = queryPlan.clusterConditions?.stoneType || queryPlan.conditions?.stoneType || queryPlan.stoneType;
          
          if (typeof rawType === 'string') {
            stoneType = rawType;
          } else if (typeof rawType === 'object' && rawType !== null) {
            stoneType = rawType.value || rawType.contains || rawType.equals || '';
          }

          if (stoneType) {
            stoneTypeForSql = stoneType;
            const op = rawType.operator === 'notContains' ? 'none' : 'some';
            this.logger.log(`Filtering mines by stoneType: ${stoneType} with operator: ${op}`);
            where.clusters = {
              [op]: { stoneType: { contains: stoneType, mode: 'insensitive' } }
            };
          }
        }

        const resultLimit = queryPlan.limit || 5000;

        // Aggregate Filter: at least X clusters
        if (queryPlan.clusterConditions?.minCount) {
          const minCount = queryPlan.clusterConditions.minCount;
          this.logger.log(`Filtering mines with at least ${minCount} clusters`);
          const matchingMineIds = await this.prisma.$queryRawUnsafe<{mine_id: string}[]>(
            `SELECT mine_id FROM "Cluster" 
             ${stoneTypeForSql ? `WHERE stone_type ILIKE '%${stoneTypeForSql}%'` : ''}
             GROUP BY mine_id 
             HAVING COUNT(*) >= ${minCount}
             LIMIT ${resultLimit}`
          );
          const ids = matchingMineIds.map(m => m.mine_id);
          where.id = { in: ids };
        }

        this.logger.log(`Executing Mine findMany for ${queryPlan.target}`);
        const mines = await this.prisma.mine.findMany({ where, take: resultLimit });
        const totalCount = await this.prisma.mine.count({ where });
        
        // Build Dynamic SQL string for transparency
        let sql = `SELECT count(*) FROM "Mine"`;
        const joinClauses: string[] = [];
        const whereClauses: string[] = [];

        if (queryPlan.conditions?.name) {
          whereClauses.push(`"Mine".name ILIKE '%${queryPlan.conditions.name.value}%'`);
        }

        if (stoneTypeForSql || queryPlan.clusterConditions) {
          joinClauses.push(`INNER JOIN "Cluster" ON "Cluster".mine_id = "Mine".id`);
          if (stoneTypeForSql) {
            whereClauses.push(`"Cluster".stone_type ILIKE '%${stoneTypeForSql}%'`);
          }
          if (queryPlan.clusterConditions?.quantity) {
            const q = queryPlan.clusterConditions.quantity;
            const op = q.operator === 'gt' ? '>' : q.operator === 'lt' ? '<' : '=';
            whereClauses.push(`"Cluster".quantity ${op} ${q.value}`);
          }
          if (queryPlan.clusterConditions?.minCount) {
            whereClauses.push(`(SELECT COUNT(*) FROM "Cluster" c WHERE c.mine_id = "Mine".id ${stoneTypeForSql ? `AND c.stone_type ILIKE '%${stoneTypeForSql}%'` : ''}) >= ${queryPlan.clusterConditions.minCount}`);
          }
        }

        if (joinClauses.length > 0) sql += ` ${joinClauses.join(' ')}`;
        if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(' AND ')}`;
        (queryPlan as any).generatedSql = sql;
        (queryPlan as any).totalCount = totalCount;
        
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
        
        const resultLimit = queryPlan.limit || 5000;
        const clusters = await this.prisma.cluster.findMany({ 
          where, 
          include: { mine: true },
          take: resultLimit 
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
        (queryPlan as any).generatedSql = `SELECT count(*) FROM "Cluster" ${queryPlan.conditions?.stoneType ? `WHERE stone_type ILIKE '%${queryPlan.conditions.stoneType.value}%'` : ''}`;
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
        
        if (queryPlan.clusterConditions?.stoneType) {
          if (!where.mine) where.mine = {};
          const stoneType = typeof queryPlan.clusterConditions.stoneType === 'string' 
            ? queryPlan.clusterConditions.stoneType 
            : (queryPlan.clusterConditions.stoneType.value || queryPlan.clusterConditions.stoneType.contains);
          
          where.mine.clusters = {
            some: { stoneType: { contains: stoneType, mode: 'insensitive' } }
          };
        }

        const resultLimit = queryPlan.limit || 5000;
        const missions = await this.prisma.drillMission.findMany({
          where,
          include: { mine: true, drill: true },
          take: resultLimit
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
        (queryPlan as any).generatedSql = `SELECT count(*) FROM "DrillMission" INNER JOIN "Mine" ON "DrillMission".mine_id = "Mine".id ${queryPlan.mineConditions?.name ? `WHERE "Mine".name ILIKE '%${queryPlan.mineConditions.name.value}%'` : ''}`;
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
Query Plan Used: ${JSON.stringify(queryPlan)}
Results Shown in Details: ${displayEntities.length}
Remaining Results in List: ${moreCount}
Total Count in Database: ${queryPlan.totalCount || entities.length}

Context:
${contextText}

Instructions:
1. Answer in Hebrew professionally.
2. Keep the response VERY brief (1-2 sentences max).
3. Do NOT explain the search logic, filters, or criteria in this text response (the user can see them in the "מפרט חיפוש מבנה" GUI).
4. If results were found:
   - Mention the total count found (${queryPlan.totalCount || entities.length}) and that they are displayed on the map.
5. If NO results were found, inform the user briefly.
6. Mention that the query plan has been saved.
7. Focus strictly on the results and the map.`;

    const stream = await this.llm.stream(prompt);
    for await (const chunk of stream) {
      if (chunk.content) yield { content: chunk.content as string };
    }
  }

  async getInitialData(): Promise<EntitySearchResult[]> {
    // 1. Fetch a sample of Mines (up to 1000 for initial dense view)
    const mines = await this.prisma.mine.findMany({ take: 1000 });
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

    // 3. Fetch clusters belonging to these Mines (up to 4000)
    const clusters = await this.prisma.cluster.findMany({ 
      where: { mineId: { in: mineIds } },
      take: 4000, 
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
