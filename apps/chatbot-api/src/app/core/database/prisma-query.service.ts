import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { QueryPlan, WhereClause, FieldFilter, RelatedQueryFilter, Aggregation, OrderBy } from '@org/models';

@Injectable()
export class PrismaQueryService {
  private readonly logger = new Logger(PrismaQueryService.name);

  constructor(private prisma: PrismaService) {}

  async executeQuery(plan: QueryPlan) {
    const { target, conditions, limit, aggregations, groupBy, orderBy } = plan;
    const model = (target.charAt(0).toLowerCase() + target.slice(1)) as keyof PrismaService;
    
    // 1. Build the where clause
    const prismaWhere = await this.buildWhere(conditions, target);

    // 2. Handle Aggregations / GroupBy
    if (aggregations && aggregations.length > 0) {
      if (groupBy && groupBy.length > 0) {
        const { groupedResults } = await this.executeGroupedAggregation(model, prismaWhere, aggregations, groupBy, limit, orderBy);
        return { results: [], count: 0, aggregationResults: {}, groupedResults };
      } else {
        const { aggregationResults } = await this.executeGlobalAggregation(model, prismaWhere, aggregations);
        return { results: [], count: 0, aggregationResults, groupedResults: [] };
      }
    }

    // 3. Handle standard findMany
    const findArgs: Record<string, unknown> = {
      where: prismaWhere,
      take: limit || 100,
    };

    if (orderBy && orderBy.length > 0) {
      findArgs['orderBy'] = orderBy.map(o => ({ [o.field]: o.direction }));
    }

    // Generic findMany with some dynamic inclusion could be added here if needed
    if (target === 'Cluster') findArgs['include'] = { mine: true };
    if (target === 'DrillMission') findArgs['include'] = { mine: true, drill: true };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelDelegate = (this.prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<unknown[]>; count: (args: unknown) => Promise<number> }>)[model as string];
    if (!modelDelegate) {
        throw new Error(`Model ${String(model)} not found on PrismaService`);
    }

    const results = await modelDelegate.findMany(findArgs);
    const count = await modelDelegate.count({ where: prismaWhere });

    return { results, count, aggregationResults: {}, groupedResults: [] };
  }

  private async buildWhere(where: WhereClause, target: string): Promise<Record<string, unknown>> {
    if (!where) return {};

    const prismaWhere: Record<string, unknown> = {};

    if (where.AND) {
      prismaWhere['AND'] = await Promise.all(where.AND.map(w => this.buildWhere(w, target)));
    }
    if (where.OR) {
      prismaWhere['OR'] = await Promise.all(where.OR.map(w => this.buildWhere(w, target)));
    }
    if (where.NOT) {
      prismaWhere['NOT'] = await this.buildWhere(where.NOT, target);
    }

    for (const [key, value] of Object.entries(where)) {
      if (['AND', 'OR', 'NOT'].includes(key)) continue;

      if (this.isFieldFilter(value)) {
        prismaWhere[key] = this.mapFieldFilter(value);
      } else if (this.isRelatedQueryFilter(value)) {
        // Relation filter
        if (value.having) {
           prismaWhere['id'] = await this.handleRelatedQueryWithHaving(key, value, target, prismaWhere['id']);
        } else {
           const type = value.relationType || 'some';
           prismaWhere[key] = { [type]: await this.buildWhere(value.query.conditions, value.query.target) };
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested object (like relational 'is', 'some', 'every', 'none')
        prismaWhere[key] = await this.buildWhere(value as WhereClause, target);
      } else {
        // Direct value
        prismaWhere[key] = value;
      }
    }

    return prismaWhere;
  }

  private isFieldFilter(value: unknown): value is FieldFilter {
    return !!value && typeof value === 'object' && 'operator' in value && 'value' in value;
  }

  private isRelatedQueryFilter(value: unknown): value is RelatedQueryFilter {
    return !!value && typeof value === 'object' && 'query' in value;
  }

  private mapFieldFilter(filter: FieldFilter): unknown {
    const { operator, value: rawValue } = filter;
    const value = this.parseValue(rawValue);
    
    switch (operator) {
      case 'eq': 
      case 'equals': return { equals: value };
      case 'neq': return { not: value };
      case 'gt': return { gt: value };
      case 'gte': return { gte: value };
      case 'lt': return { lt: value };
      case 'lte': return { lte: value };
      case 'contains': return { contains: value, mode: 'insensitive' };
      case 'startsWith': return { startsWith: value, mode: 'insensitive' };
      case 'endsWith': return { endsWith: value, mode: 'insensitive' };
      case 'in': return Array.isArray(value) ? { in: value.map(v => this.parseValue(v)) } : { in: value };
      case 'notIn': return Array.isArray(value) ? { notIn: value.map(v => this.parseValue(v)) } : { notIn: value };
      case 'after': return { gt: value };
      case 'before': return { lt: value };
      case 'year': return this.buildYearFilter(value);
      case 'month': return this.buildMonthFilter(value);
      case 'day': return this.buildDayFilter(value);
      default: return value;
    }
  }

  private buildYearFilter(value: unknown): unknown {
    const year = Number(value);
    if (isNaN(year)) return {};
    return {
      gte: new Date(`${year}-01-01T00:00:00.000Z`),
      lt: new Date(`${year + 1}-01-01T00:00:00.000Z`)
    };
  }

  private buildMonthFilter(value: unknown): unknown {
    const valStr = String(value);
    // Expected format YYYY-MM
    const [year, month] = valStr.split('-').map(Number);
    if (isNaN(year) || isNaN(month)) return {};
    
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { gte: start, lt: end };
  }

  private buildDayFilter(value: unknown): unknown {
    const valStr = String(value);
    // Expected format YYYY-MM-DD
    const date = new Date(valStr);
    if (isNaN(date.getTime())) return {};
    
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return { gte: start, lt: end };
  }

  private parseValue(val: unknown): unknown {
    if (typeof val === 'string') {
      // Date check
      if (val.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(val)) {
        const date = new Date(val);
        if (!isNaN(date.getTime())) return date;
      }
      // Number check
      if (val.trim() !== '' && !isNaN(Number(val)) && !val.includes(' ')) {
        return Number(val);
      }
    }
    return val;
  }

  private async handleRelatedQueryWithHaving(relation: string, filter: RelatedQueryFilter, parentTarget: string, existingIdFilter: unknown): Promise<unknown> {
    const { query, having } = filter;
    if (!having) return existingIdFilter;

    const subWhere = await this.buildWhere(query.conditions, query.target);
    const relatedModel = (query.target.charAt(0).toLowerCase() + query.target.slice(1)) as keyof PrismaService;
    const foreignKey = `${parentTarget.toLowerCase()}Id`; 
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modelDelegate = (this.prisma as unknown as Record<string, { groupBy: (args: unknown) => Promise<Record<string, unknown>[]> }>)[relatedModel as string];
      
      const aggType = `_${having.type}`;
      const fieldKey = having.field === '*' ? foreignKey : having.field;
      const operator = having.operator === 'eq' ? 'equals' : having.operator;

      const groups = await modelDelegate.groupBy({
        by: [foreignKey],
        where: subWhere,
        [aggType]: { [fieldKey]: true },
        having: { 
          [foreignKey]: having.type === 'count' 
            ? { _count: { [operator]: having.value } }
            : undefined,
          [having.field]: having.type !== 'count' 
            ? { [aggType]: { [operator]: having.value } }
            : undefined
        }
      }) as Record<string, unknown>[];

      const matchingIds = groups.map((g) => g[foreignKey]).filter(Boolean);
      
      if (existingIdFilter) {
        return { AND: [existingIdFilter, { in: matchingIds }] };
      } else {
        return { in: matchingIds };
      }
    } catch (e: unknown) {
      this.logger.error(`Failed to execute HAVING relation filter for ${relation}: ${e instanceof Error ? e.message : String(e)}`);
      return existingIdFilter;
    }
  }

  private async executeGlobalAggregation(model: keyof PrismaService, where: unknown, aggregations: Aggregation[]) {
    const aggArgs: Record<string, unknown> = { where };
    for (const agg of aggregations) {
      const typeKey = `_${agg.type}`;
      if (!aggArgs[typeKey]) aggArgs[typeKey] = {};
      const typeObj = aggArgs[typeKey] as Record<string, boolean>;
      typeObj[agg.field === '*' ? '_all' : agg.field] = true;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelDelegate = (this.prisma as unknown as Record<string, { aggregate: (args: unknown) => Promise<unknown> }>)[model as string];
    const result = await modelDelegate.aggregate(aggArgs);
    
    const aggregationResults: Record<string, number> = {};
    for (const agg of aggregations) {
      const typeKey = `_${agg.type}`;
      const fieldKey = agg.field === '*' ? '_all' : agg.field;
      const typedResult = result as Record<string, Record<string, number>>;
      aggregationResults[`${agg.type}_${agg.field}`] = typedResult[typeKey]?.[fieldKey] || 0;
    }

    return { aggregationResults };
  }

  private async executeGroupedAggregation(model: keyof PrismaService, where: unknown, aggregations: Aggregation[], groupBy: string[], limit?: number, orderBy?: OrderBy[]) {
    const groupedArgs: Record<string, unknown> = {
      where,
      by: groupBy,
      take: limit,
    };

    for (const agg of aggregations) {
      const typeKey = `_${agg.type}`;
      if (!groupedArgs[typeKey]) groupedArgs[typeKey] = {};
      const typeObj = groupedArgs[typeKey] as Record<string, boolean>;
      typeObj[agg.field === '*' ? '_all' : agg.field] = true;
    }

    if (orderBy && orderBy.length > 0) {
      groupedArgs['orderBy'] = orderBy.map((o) => {
        if (o.type) return { [`_${o.type}`]: { [o.field]: o.direction } };
        return { [o.field]: o.direction };
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelDelegate = (this.prisma as unknown as Record<string, { groupBy: (args: unknown) => Promise<Record<string, unknown>[]> }>)[model as string];
    const results = await modelDelegate.groupBy(groupedArgs);

    const groupedResults = results.map((row) => {
      const res: Record<string, number> = {};
      const typedRow = row as Record<string, Record<string, number>>;
      for (const agg of aggregations) {
        const typeKey = `_${agg.type}`;
        const fieldKey = agg.field === '*' ? '_all' : agg.field;
        res[`${agg.type}_${agg.field}`] = typedRow[typeKey]?.[fieldKey] || 0;
      }
      return { group: String(row[groupBy[0]]), results: res };
    });

    return { groupedResults };
  }
}
