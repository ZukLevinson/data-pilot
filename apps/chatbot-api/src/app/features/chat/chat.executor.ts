import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EntitySearchResult, QueryPlan } from '@org/models';

@Injectable()
export class ChatExecutor {
  private readonly logger = new Logger(ChatExecutor.name);

  constructor(private prisma: PrismaService) {}

  async executePlan(queryPlan: QueryPlan, question: string): Promise<EntitySearchResult[]> {
    let entities: EntitySearchResult[] = [];
    let activeWhere: any = {};
    const resultLimit = queryPlan.limit || 5000;

    if (queryPlan.target === 'Mine') {
      const where: any = {};
      activeWhere = where;
      if (queryPlan.conditions?.name) {
        where.name = { contains: queryPlan.conditions.name.value, mode: 'insensitive' };
      }
      const clusterConds = Array.isArray(queryPlan.clusterConditions) 
        ? queryPlan.clusterConditions 
        : (queryPlan.clusterConditions ? [queryPlan.clusterConditions] : []);

      if (clusterConds.length > 0) {
        const andFilters: any[] = [];
        for (const cond of clusterConds) {
          const filter: any = {};
          let stoneType = '';
          const rawType = cond.stoneType;
          if (typeof rawType === 'string') stoneType = rawType;
          else if (rawType?.value) stoneType = rawType.value;

          if (stoneType) {
            const op = rawType?.operator === 'notContains' ? 'none' : 'some';
            filter.clusters = { [op]: { stoneType: { contains: stoneType, mode: 'insensitive' } } };
          }

          if (cond.quantity) {
            if (!filter.clusters) filter.clusters = { some: {} };
            const q = cond.quantity;
            const op = q.operator === 'gt' ? 'gt' : 'lt';
            filter.clusters.some.quantity = { [op]: q.value };
          }

          if (Object.keys(filter).length > 0) andFilters.push(filter);

          if (cond.minCount) {
            const minCount = cond.minCount;
            const matchingMineIds = await this.prisma.$queryRawUnsafe<{mine_id: string}[]>(
              `SELECT mine_id FROM "Cluster" 
               ${stoneType ? `WHERE stone_type ILIKE '%${stoneType}%'` : ''}
               GROUP BY mine_id 
               HAVING COUNT(*) >= ${minCount}
               LIMIT ${resultLimit}`
            );
            const ids = matchingMineIds.map(m => m.mine_id);
            if (!where.id) where.id = { in: ids };
            else {
               where.id.in = where.id.in.filter((id: string) => ids.includes(id));
            }
          }
        }
        if (andFilters.length > 0) where.AND = andFilters;
      }

      const mines = await this.prisma.mine.findMany({ where, take: resultLimit });
      const totalCount = await this.prisma.mine.count({ where });
      
      // Build Dynamic SQL string for transparency
      let sql = `SELECT count(*) FROM "Mine"`;
      const joinClauses: string[] = [];
      const whereClauses: string[] = [];

      if (queryPlan.conditions?.name) {
        whereClauses.push(`"Mine".name ILIKE '%${queryPlan.conditions.name.value}%'`);
      }

      if (clusterConds.length > 0) {
        clusterConds.forEach((cond: any, idx: number) => {
          const alias = `c${idx}`;
          joinClauses.push(`INNER JOIN "Cluster" ${alias} ON ${alias}.mine_id = "Mine".id`);
          const stoneType = typeof cond.stoneType === 'string' ? cond.stoneType : cond.stoneType?.value;
          if (stoneType) {
            whereClauses.push(`${alias}.stone_type ILIKE '%${stoneType}%'`);
          }
        });
      }

      if (joinClauses.length > 0) sql += ` ${joinClauses.join(' ')}`;
      if (whereClauses.length > 0) sql += ` WHERE ${whereClauses.join(' AND ')}`;
      queryPlan.generatedSql = sql;
      queryPlan.totalCount = totalCount;
      
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
      activeWhere = where;
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
      queryPlan.totalCount = totalCount;
      queryPlan.generatedSql = `SELECT count(*) FROM "Cluster" ${queryPlan.conditions?.stoneType ? `WHERE stone_type ILIKE '%${queryPlan.conditions.stoneType.value}%'` : ''}`;
    } else if (queryPlan.target === 'DrillMission') {
      const where: any = {};
      activeWhere = where;
      if (queryPlan.conditions?.date) {
        const op = queryPlan.conditions.date.operator;
        const val = new Date(queryPlan.conditions.date.value);
        if (op === 'after') where.date = { gt: val };
        if (op === 'before') where.date = { lt: val };
      }
      if (queryPlan.mineConditions?.name) {
        where.mine = { name: { contains: queryPlan.mineConditions.name.value, mode: 'insensitive' } };
      }
      
      const clusterConds = Array.isArray(queryPlan.clusterConditions) 
        ? queryPlan.clusterConditions 
        : (queryPlan.clusterConditions ? [queryPlan.clusterConditions] : []);

      if (clusterConds.length > 0) {
        if (!where.mine) where.mine = {};
        const andFilters: any[] = [];
        for (const cond of clusterConds) {
          const stoneType = typeof cond.stoneType === 'string' ? cond.stoneType : cond.stoneType?.value;
          if (stoneType) {
            const op = cond.stoneType?.operator === 'notContains' ? 'none' : 'some';
            andFilters.push({
              clusters: { [op]: { stoneType: { contains: stoneType, mode: 'insensitive' } } }
            });
          }
        }
        if (andFilters.length > 0) where.mine.AND = andFilters;
      }

      const missions = await this.prisma.drillMission.findMany({
        where,
        include: { mine: true, drill: true },
        take: resultLimit
      });
      const totalCount = await this.prisma.drillMission.count({ where });

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
      queryPlan.totalCount = totalCount;
      queryPlan.generatedSql = `SELECT count(*) FROM "DrillMission" INNER JOIN "Mine" ON "DrillMission".mine_id = "Mine".id ${queryPlan.mineConditions?.name ? `WHERE "Mine".name ILIKE '%${queryPlan.mineConditions.name.value}%'` : ''}`;
    }

    // Handle Aggregations
    if (queryPlan.aggregations && queryPlan.aggregations.length > 0) {
      const aggregationResults: Record<string, number> = {};
      for (const agg of queryPlan.aggregations) {
        if (queryPlan.target === 'Cluster' || (queryPlan.target === 'Mine' && agg.field === 'quantity')) {
          const aggWhere = queryPlan.target === 'Mine' ? { mine: activeWhere } : activeWhere;
          const result = await (this.prisma.cluster.aggregate as any)({
            where: aggWhere,
            [`_${agg.type}`]: { [agg.field]: true }
          });
          aggregationResults[`${agg.type}_${agg.field}`] = (result as any)[`_${agg.type}`][agg.field];
        }
      }
      queryPlan.aggregationResults = aggregationResults;
    }

    // Persist Query
    await this.prisma.savedQuery.create({
      data: { name: question, query: queryPlan as any, sql: `Generated for: ${queryPlan.target}` }
    });

    return entities;
  }

  async getInitialData(): Promise<EntitySearchResult[]> {
    const mines = await this.prisma.mine.findMany({ take: 1000 });
    const mineIds = mines.map(m => m.id);
    const mineWkts = mineIds.length > 0 ? await this.prisma.$queryRawUnsafe<any[]>(
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
    const clusterWkts = clusterIds.length > 0 ? await this.prisma.$queryRawUnsafe<any[]>(
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
