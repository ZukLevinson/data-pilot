import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EntitySearchResult, QueryPlan } from '@org/models';
import { Prisma } from '@prisma/client';

@Injectable()
export class ChatExecutor {
  private readonly logger = new Logger(ChatExecutor.name);

  constructor(private prisma: PrismaService) {}

  async *executePlan(queryPlan: QueryPlan, question: string): AsyncGenerator<EntitySearchResult[]> {
    const resultLimit = queryPlan.limit || 5000;
    const where = this.mapConditionsToPrisma(queryPlan.conditions || {});

    // Handle minCount constraints (e.g., "Mines with at least 10 Neodymium clusters")
    if (queryPlan.conditions) {
      for (const [relation, filterVal] of Object.entries(queryPlan.conditions)) {
        const filter = filterVal as any;
        if (typeof filter === 'object' && filter?.minCount) {
          if (relation === 'clusters' && queryPlan.target === 'Mine') {
            const subWhere = this.mapConditionsToPrisma(filter.some || {});
            const groups = await (this.prisma.cluster as any).groupBy({
              by: ['mineId'],
              where: subWhere,
              _count: { mineId: true },
              having: { mineId: { _count: { gte: filter.minCount } } }
            });
            const matchingIds = groups.map((g: any) => g.mineId);
            where.id = where.id ? { AND: [where.id, { in: matchingIds }] } : { in: matchingIds };
          } else if (relation === 'missions' && queryPlan.target === 'Mine') {
            const subWhere = this.mapConditionsToPrisma(filter.some || {});
            const groups = await (this.prisma.drillMission as any).groupBy({
              by: ['mineId'],
              where: subWhere,
              _count: { mineId: true },
              having: { mineId: { _count: { gte: filter.minCount } } }
            });
            const matchingIds = groups.map((g: any) => g.mineId);
            where.id = where.id ? { AND: [where.id, { in: matchingIds }] } : { in: matchingIds };
          }
        }
      }
    }

    let rawResults: any[] = [];
    let totalCount = 0;

    if (queryPlan.target === 'Mine') {
      rawResults = await this.prisma.mine.findMany({ where, take: resultLimit });
      totalCount = await this.prisma.mine.count({ where });
      queryPlan.generatedSql = `SELECT count(*) FROM "Mine" (Complex Filter)`;
    } else if (queryPlan.target === 'Cluster') {
      rawResults = await this.prisma.cluster.findMany({ where, include: { mine: true }, take: resultLimit });
      totalCount = await this.prisma.cluster.count({ where });
      queryPlan.generatedSql = `SELECT count(*) FROM "Cluster" (Complex Filter)`;
    } else if (queryPlan.target === 'DrillMission') {
      rawResults = await this.prisma.drillMission.findMany({ where, include: { mine: true, drill: true }, take: resultLimit });
      totalCount = await this.prisma.drillMission.count({ where });
      queryPlan.generatedSql = `SELECT count(*) FROM "DrillMission" (Complex Filter)`;
    }

    queryPlan.totalCount = totalCount;

    // Handle Aggregations in parallel
    if (queryPlan.aggregations?.length) {
      const aggregationResults: Record<string, number> = {};
      for (const agg of queryPlan.aggregations) {
        if (queryPlan.target === 'Cluster' || (queryPlan.target === 'Mine' && agg.field === 'quantity')) {
          const aggWhere = queryPlan.target === 'Mine' ? ({ mine: where } as Prisma.ClusterWhereInput) : (where as Prisma.ClusterWhereInput);
          const result = await this.prisma.cluster.aggregate({
            where: aggWhere,
            [`_${agg.type}`]: { [agg.field]: true }
          } as unknown as Prisma.ClusterAggregateArgs);
          const resultObj = result as any;
          const val = resultObj[`_${agg.type}`]?.[agg.field];
          aggregationResults[`${agg.type}_${agg.field}`] = typeof val === 'number' ? val : 0;
        }
      }
      queryPlan.aggregationResults = aggregationResults;
    }

    if (rawResults.length === 0) {
      yield [];
      return;
    }

    // First batch: Quick yield without WKTs for immediate UI feedback (names/counts)
    const initialBatch = rawResults.map(r => ({
      id: r.id,
      name: queryPlan.target === 'Mine' ? r.name : (queryPlan.target === 'Cluster' ? r.stoneType : `Mission: ${r.stoneType}`),
      type: queryPlan.target as any,
      content: '',
      color: queryPlan.target === 'Mine' ? '#3b82f6' : (queryPlan.target === 'Cluster' ? '#f59e0b' : '#8b5cf6'),
      distance: 0
    }));
    yield initialBatch;

    // Second batch: Hydrate with WKTs in chunks for the map
    const batchSize = 500;
    for (let i = 0; i < rawResults.length; i += batchSize) {
      const chunk = rawResults.slice(i, i + batchSize);
      const ids = chunk.map(r => r.id);
      const table = queryPlan.target === 'Mine' ? 'Mine' : (queryPlan.target === 'Cluster' ? 'Cluster' : 'Mine'); // Missions use Mine geom
      
      const idSource = queryPlan.target === 'DrillMission' ? chunk.map(m => m.mine.id) : ids;
      const wkts = await this.prisma.$queryRawUnsafe<{id: string, wkt: string}[]>(
        `SELECT id::text, ST_AsText(geom) as wkt FROM "${table}" WHERE id::text IN (${Array.from(new Set(idSource)).map(id => `'${id}'`).join(',')})`
      );

      const hydratedChunk = chunk.map(r => ({
        id: r.id,
        name: queryPlan.target === 'Mine' ? r.name : (queryPlan.target === 'Cluster' ? r.stoneType : `Mission: ${r.stoneType}`),
        type: queryPlan.target as any,
        content: queryPlan.target === 'Mine' ? `Mine: ${r.name}` : (queryPlan.target === 'Cluster' ? `Type: ${r.stoneType}, Quantity: ${r.quantity}kg` : `Planned: ${r.date.toLocaleDateString()}`),
        color: queryPlan.target === 'Mine' ? '#3b82f6' : (queryPlan.target === 'Cluster' ? '#f59e0b' : '#8b5cf6'),
        wkt: wkts.find(w => w.id === String(queryPlan.target === 'DrillMission' ? r.mine.id : r.id))?.wkt,
        distance: 0
      }));
      
      yield hydratedChunk;
    }

    // Persist Query
    await this.prisma.savedQuery.create({
      data: { name: question, query: queryPlan as unknown as Prisma.InputJsonValue, sql: `Generated for: ${queryPlan.target}` }
    });
  }

  private mapConditionsToPrisma(conditions: Record<string, any>): any {
    if (!conditions) return {};
    const prismaWhere: any = {};
    for (const [key, value] of Object.entries(conditions)) {
      if (key === 'minCount') continue; // Handled separately in executePlan

      if (typeof value === 'object' && value !== null) {
        if ('operator' in value && 'value' in value) {
          const { operator, value: val } = value;
          switch (operator) {
            case 'contains': prismaWhere[key] = { contains: val, mode: 'insensitive' }; break;
            case 'notContains': 
              prismaWhere.NOT = prismaWhere.NOT || [];
              prismaWhere.NOT.push({ [key]: { contains: val, mode: 'insensitive' } });
              break;
            case 'gt': prismaWhere[key] = { gt: val }; break;
            case 'lt': prismaWhere[key] = { lt: val }; break;
            case 'after': prismaWhere[key] = { gt: val }; break;
            case 'before': prismaWhere[key] = { lt: val }; break;
            case 'equals': prismaWhere[key] = { equals: val }; break;
            default: prismaWhere[key] = val;
          }
        } else {
          // Check for relational operators
          const relOps = ['some', 'every', 'none', 'is'];
          const foundOp = relOps.find(op => op in (value as any));
          
          if (foundOp) {
            prismaWhere[key] = { [foundOp]: this.mapConditionsToPrisma((value as any)[foundOp]) };
          } else {
            // Regular nested object (like field: { equals: val } if not using our Condition structure)
            prismaWhere[key] = this.mapConditionsToPrisma(value);
          }
        }
      } else {
        prismaWhere[key] = value;
      }
    }
    return prismaWhere;
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
}
