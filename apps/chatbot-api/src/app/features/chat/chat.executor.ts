import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { PrismaQueryService } from '../../core/database/prisma-query.service';
import { EntitySearchResult, QueryPlan } from '@org/models';
import { Prisma } from '@prisma/client';

@Injectable()
export class ChatExecutor {
  private readonly logger = new Logger(ChatExecutor.name);

  constructor(private prisma: PrismaService, private queryService: PrismaQueryService) {}

  async *executePlan(queryPlan: QueryPlan, question: string): AsyncGenerator<EntitySearchResult[]> {
    // Use the generic PrismaQueryService
    const { results: rawResults = [], count: totalCount = 0, aggregationResults, groupedResults } = 
      await this.queryService.executeQuery(queryPlan);
    
    queryPlan.totalCount = totalCount;
    queryPlan.aggregationResults = aggregationResults;
    queryPlan.groupedResults = groupedResults;
    queryPlan.generatedSql = `Generic Prisma Query on ${queryPlan.target}`;

    // Resolve IDs to names for Grouped Results (UI Friendly)
    if (queryPlan.groupedResults && queryPlan.groupedResults.length > 0) {
      if (queryPlan.groupBy && queryPlan.groupBy.includes('mineId')) {
        const mineIds = queryPlan.groupedResults.map(r => r.group);
        const mines = await this.prisma.mine.findMany({
          where: { id: { in: mineIds } },
          select: { id: true, name: true }
        });
        queryPlan.groupedResults.forEach(r => {
          const m = mines.find(m => m.id === String(r.group));
          if (m) r.group = m.name;
        });
      } else if (queryPlan.groupBy && queryPlan.groupBy.includes('drillId')) {
        const drillIds = queryPlan.groupedResults.map(r => r.group);
        const drills = await this.prisma.drill.findMany({
          where: { id: { in: drillIds } },
          select: { id: true, name: true }
        });
        queryPlan.groupedResults.forEach(r => {
          const d = drills.find(d => d.id === String(r.group));
          if (d) r.group = d.name;
        });
      }
    }

    if (rawResults.length === 0 && !queryPlan.isStatsOnly) {
      yield [];
      return;
    }

    // First batch: Quick yield without WKTs for immediate UI feedback
    const initialBatch: EntitySearchResult[] = (rawResults as Record<string, unknown>[]).map((r) => ({
      id: String(r['id']),
      name: queryPlan.target === 'Mine' ? String(r['name']) : (queryPlan.target === 'Cluster' ? String(r['stoneType']) : `Mission: ${String(r['stoneType'])}`),
      type: queryPlan.target as EntitySearchResult['type'],
      content: '',
      color: queryPlan.target === 'Mine' ? '#3b82f6' : (queryPlan.target === 'Cluster' ? '#f59e0b' : '#8b5cf6'),
      distance: 0
    }));
    yield initialBatch;

    // Second batch: Hydrate with WKTs in chunks for the map
    const batchSize = 500;
    const typedRawResults = rawResults as Record<string, unknown>[];
    for (let i = 0; i < typedRawResults.length; i += batchSize) {
      const chunk = typedRawResults.slice(i, i + batchSize);
      const ids = chunk.map((r) => String(r['id']));
      
      // Target table for geometry
      const table = queryPlan.target === 'Mine' ? 'Mine' : (queryPlan.target === 'Cluster' ? 'Cluster' : 'Mine');
      
      const idSource = queryPlan.target === 'DrillMission' 
        ? chunk.map((m) => String((m['mine'] as Record<string, unknown>)?.['id'])) 
        : ids;
        
      const wkts = await this.prisma.$queryRawUnsafe<{id: string, wkt: string}[]>(
        `SELECT id::text, ST_AsText(geom) as wkt FROM "${table}" WHERE id::text IN (${Array.from(new Set(idSource)).map(id => `'${id}'`).join(',')})`
      );

      const hydratedChunk: EntitySearchResult[] = chunk.map((r) => {
        const id = String(r['id']);
        const name = queryPlan.target === 'Mine' ? String(r['name']) : (queryPlan.target === 'Cluster' ? String(r['stoneType']) : `Mission: ${String(r['stoneType'])}`);
        const type = queryPlan.target as EntitySearchResult['type'];
        const content = queryPlan.target === 'Mine' 
          ? `Mine: ${String(r['name'])}` 
          : (queryPlan.target === 'Cluster' 
              ? `Type: ${String(r['stoneType'])}, Quantity: ${Number(r['quantity'])}kg` 
              : `Planned: ${r['date'] instanceof Date ? r['date'].toLocaleDateString() : String(r['date'])}`);
        
        const wktSourceId = queryPlan.target === 'DrillMission' ? String((r['mine'] as Record<string, unknown>)?.['id']) : id;

        return {
          id,
          name,
          type,
          content,
          color: queryPlan.target === 'Mine' ? '#3b82f6' : (queryPlan.target === 'Cluster' ? '#f59e0b' : '#8b5cf6'),
          wkt: wkts.find(w => w.id === wktSourceId)?.wkt,
          distance: 0
        };
      });
      
      yield hydratedChunk;
    }

    // Persist Query
    await this.prisma.savedQuery.create({
      data: { name: question, query: queryPlan as unknown as Prisma.InputJsonValue, sql: `Generated for: ${queryPlan.target}` }
    });
  }

  async getInitialData(): Promise<EntitySearchResult[]> {
    const mines = await this.prisma.mine.findMany({ take: 1000 });
    const mineIds = mines.map(m => m.id);
    const mineWkts = mineIds.length > 0 ? await this.prisma.$queryRawUnsafe<{id: string, wkt: string}[]>(
      `SELECT id::text, ST_AsText(geom) as wkt FROM "Mine" WHERE id::text IN (${mineIds.map(id => `'${id}'`).join(',')})`
    ) : [];

    const mineEntities: EntitySearchResult[] = mines.map(m => ({
      id: m.id, name: m.name, type: 'Mine', content: `Mine site: ${m.name}`,
      color: '#3b82f6', wkt: mineWkts.find(w => w.id === String(m.id))?.wkt, distance: 0
    }));

    const clusters = await this.prisma.cluster.findMany({ 
      where: { mineId: { in: mineIds } }, take: 4000, include: { mine: true } 
    });
    const clusterIds = clusters.map(c => c.id);
    const clusterWkts = clusterIds.length > 0 ? await this.prisma.$queryRawUnsafe<{id: string, wkt: string}[]>(
      `SELECT id::text, ST_AsText(geom) as wkt FROM "Cluster" WHERE id::text IN (${clusterIds.map(id => `'${id}'`).join(',')})`
    ) : [];

    const clusterEntities: EntitySearchResult[] = clusters.map(c => ({
      id: c.id, name: c.stoneType, type: 'Cluster',
      content: `Type: ${c.stoneType}, Quantity: ${c.quantity.toLocaleString()}kg`,
      color: '#f59e0b', wkt: clusterWkts.find(w => w.id === String(c.id))?.wkt, distance: 0
    }));

    return [...mineEntities, ...clusterEntities];
  }

  async getHistory() {
    return this.prisma.savedQuery.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  }

  async checkDbHealth(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (e) {
      this.logger.error('Database health check failed', e);
      return false;
    }
  }
}
