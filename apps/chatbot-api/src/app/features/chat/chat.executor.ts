import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EntitySearchResult, QueryPlan } from '@org/models';
import { Prisma } from '@prisma/client';

@Injectable()
export class ChatExecutor {
  private readonly logger = new Logger(ChatExecutor.name);

  constructor(private prisma: PrismaService) {}

  async executePlan(queryPlan: QueryPlan, question: string): Promise<EntitySearchResult[]> {
    let entities: EntitySearchResult[] = [];
    let activeWhere: Prisma.MineWhereInput | Prisma.ClusterWhereInput | Prisma.DrillMissionWhereInput = {};
    const resultLimit = queryPlan.limit || 5000;

    if (queryPlan.target === 'Mine') {
      const where: Prisma.MineWhereInput = {};
      activeWhere = where;
      if (queryPlan.conditions?.name) {
        const cond = queryPlan.conditions.name;
        const val = typeof cond === 'object' && cond !== null && 'value' in cond ? cond.value : cond;
        where.name = { contains: String(val), mode: 'insensitive' };
      }
      const clusterConds = Array.isArray(queryPlan.clusterConditions) 
        ? queryPlan.clusterConditions 
        : (queryPlan.clusterConditions ? [queryPlan.clusterConditions] : []);

      if (clusterConds.length > 0) {
        const andFilters: Prisma.MineWhereInput[] = [];
        for (const cond of clusterConds) {
          const filter: Prisma.MineWhereInput = {};
          let stoneType = '';
          const rawType = cond.stoneType;
          if (typeof rawType === 'string') stoneType = rawType;
          else if (rawType && typeof rawType === 'object' && 'value' in rawType) stoneType = String(rawType.value);

          if (stoneType) {
            const op = (rawType && typeof rawType === 'object' && 'operator' in rawType && rawType.operator === 'notContains') ? 'none' : 'some';
            filter.clusters = { [op]: { stoneType: { contains: stoneType, mode: 'insensitive' } } };
          }

          if (cond.quantity) {
            if (!filter.clusters) filter.clusters = { some: {} };
            const q = cond.quantity;
            const op = q.operator === 'gt' ? 'gt' : 'lt';
            if (filter.clusters.some) {
              filter.clusters.some.quantity = { [op]: q.value };
            }
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
            else if (typeof where.id === 'object' && where.id !== null && 'in' in where.id) {
               const currentIn = where.id.in;
               if (Array.isArray(currentIn)) {
                 where.id.in = currentIn.filter((id: string) => ids.includes(id));
               }
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
        const cond = queryPlan.conditions.name;
        const val = typeof cond === 'object' && cond !== null && 'value' in cond ? cond.value : cond;
        whereClauses.push(`"Mine".name ILIKE '%${val}%'`);
      }

      if (clusterConds.length > 0) {
        clusterConds.forEach((cond, idx) => {
          const alias = `c${idx}`;
          joinClauses.push(`INNER JOIN "Cluster" ${alias} ON ${alias}.mine_id = "Mine".id`);
          const rawType = cond.stoneType;
          const stoneType = typeof rawType === 'string' ? rawType : (rawType && typeof rawType === 'object' && 'value' in rawType ? String(rawType.value) : '');
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
        const wkts = await this.prisma.$queryRawUnsafe<{id: string, wkt: string}[]>(
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
      const where: Prisma.ClusterWhereInput = {};
      activeWhere = where;
      if (queryPlan.conditions?.stoneType) {
        const cond = queryPlan.conditions.stoneType;
        const val = typeof cond === 'object' && cond !== null && 'value' in cond ? cond.value : cond;
        where.stoneType = { contains: String(val), mode: 'insensitive' };
      }
      if (queryPlan.conditions?.quantity) {
        const q = queryPlan.conditions.quantity;
        const op = typeof q === 'object' && q !== null && 'operator' in q ? q.operator : 'equals';
        const val = Number(typeof q === 'object' && q !== null && 'value' in q ? q.value : q);
        if (op === 'gt') where.quantity = { gt: val };
        if (op === 'lt') where.quantity = { lt: val };
        if (op === 'equals') where.quantity = { equals: val };
      }
      
      const clusters = await this.prisma.cluster.findMany({ 
        where, 
        include: { mine: true },
        take: resultLimit 
      });
      const totalCount = await this.prisma.cluster.count({ where });
      
      const ids = clusters.map(c => c.id);
      if (ids.length > 0) {
        const wkts = await this.prisma.$queryRawUnsafe<{id: string, wkt: string}[]>(
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
      const stoneCond = queryPlan.conditions?.stoneType;
      const stoneVal = typeof stoneCond === 'object' && stoneCond !== null && 'value' in stoneCond ? stoneCond.value : stoneCond;
      queryPlan.generatedSql = `SELECT count(*) FROM "Cluster" ${stoneVal ? `WHERE stone_type ILIKE '%${stoneVal}%'` : ''}`;
    } else if (queryPlan.target === 'DrillMission') {
      const where: Prisma.DrillMissionWhereInput = {};
      activeWhere = where;
      if (queryPlan.conditions?.date) {
        const q = queryPlan.conditions.date;
        const op = typeof q === 'object' && q !== null && 'operator' in q ? q.operator : 'after';
        const val = new Date(String(typeof q === 'object' && q !== null && 'value' in q ? q.value : q));
        if (op === 'after') where.date = { gt: val };
        if (op === 'before') where.date = { lt: val };
      }
      if (queryPlan.mineConditions?.name) {
        const q = queryPlan.mineConditions.name;
        where.mine = { name: { contains: String(q.value), mode: 'insensitive' } };
      }
      
      const clusterConds = Array.isArray(queryPlan.clusterConditions) 
        ? queryPlan.clusterConditions 
        : (queryPlan.clusterConditions ? [queryPlan.clusterConditions] : []);

      if (clusterConds.length > 0) {
        if (!where.mine) where.mine = {};
        const andFilters: Prisma.MineWhereInput[] = [];
        for (const cond of clusterConds) {
          const rawType = cond.stoneType;
          const stoneType = typeof rawType === 'string' ? rawType : (rawType && typeof rawType === 'object' && 'value' in rawType ? String(rawType.value) : '');
          if (stoneType) {
            const op = (rawType && typeof rawType === 'object' && 'operator' in rawType && rawType.operator === 'notContains') ? 'none' : 'some';
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
      const mineWkts = mineIds.length > 0 ? await this.prisma.$queryRawUnsafe<{id: string, wkt: string}[]>(
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
      const mineNameCond = queryPlan.mineConditions?.name;
      const mineNameVal = mineNameCond ? (typeof mineNameCond === 'object' && 'value' in mineNameCond ? mineNameCond.value : mineNameCond) : '';
      queryPlan.generatedSql = `SELECT count(*) FROM "DrillMission" INNER JOIN "Mine" ON "DrillMission".mine_id = "Mine".id ${mineNameVal ? `WHERE "Mine".name ILIKE '%${mineNameVal}%'` : ''}`;
    }

    // Handle Aggregations
    if (queryPlan.aggregations && queryPlan.aggregations.length > 0) {
      const aggregationResults: Record<string, number> = {};
      for (const agg of queryPlan.aggregations) {
        if (queryPlan.target === 'Cluster' || (queryPlan.target === 'Mine' && agg.field === 'quantity')) {
          const aggWhere = queryPlan.target === 'Mine' ? ({ mine: activeWhere } as Prisma.ClusterWhereInput) : (activeWhere as Prisma.ClusterWhereInput);
          const result = await this.prisma.cluster.aggregate({
            where: aggWhere,
            [`_${agg.type}`]: { [agg.field]: true }
          } as any);
          const resultObj = result as Record<string, Record<string, unknown>>;
          const aggKey = `_${agg.type}`;
          const fieldKey = agg.field;
          const val = resultObj[aggKey]?.[fieldKey];
          aggregationResults[`${agg.type}_${agg.field}`] = typeof val === 'number' ? val : 0;
        }
      }
      queryPlan.aggregationResults = aggregationResults;
    }

    // Persist Query
    await this.prisma.savedQuery.create({
      data: { name: question, query: queryPlan as unknown as Prisma.InputJsonValue, sql: `Generated for: ${queryPlan.target}` }
    });

    return entities;
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
