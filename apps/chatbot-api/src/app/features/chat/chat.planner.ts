import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { QueryPlan } from '@org/models';

@Injectable()
export class ChatPlanner {
  private readonly logger = new Logger(ChatPlanner.name);

  async generatePlan(
    llm: ChatOpenAI,
    question: string,
    contextQueryPlan?: QueryPlan,
  ): Promise<QueryPlan | null> {
    const target = await this.identifyTarget(llm, question);
    this.logger.log(`Identified target: ${target} for question: "${question}"`);

    const contextPart = contextQueryPlan
      ? `\nCURRENT QUERY PLAN (being modified): ${JSON.stringify(contextQueryPlan)}\n`
      : '';

    const planPrompt = `You are an expert SQL Query Planner for a Rare Earth Mining database.
Question: "${question}"
Target Entity: ${target}${contextPart}

Database Schema & Relations:
- Mine: id, name, geom (location). Relations: [clusters (many), missions (many)]
- Cluster: id, mineId, stone_type (name), quantity, geom (location). Relations: [mine (one), missions (many)]
- Drill: id, name, supportedStoneTypes. Relations: [missions (many)]
- DrillMission: id, drillId, mineId, clusterId, stoneType, date. Relations: [mine (one), drill (one), cluster (one)]

Available Query Plan Structure:
{
  "target": "${target}",
  "limit": number (default 5000),
  "conditions": {
    "fieldName": { "operator": "contains" | "notContains" | "gt" | "lt" | "after" | "before" | "equals" | "year" | "month" | "day", "value": any },
    "relationName": { 
      "some" | "every" | "none" | "is": { ... },
      "query": { "target": "RelatedEntity", "conditions": { ... } },
      "count": { "operator": "eq" | "gt" | "gte" | "lt" | "lte", "value": number } (optional)
    },
    "OR": [ { ... }, { ... } ],
    "AND": [ { ... }, { ... } ]
  },
  "aggregations": [
    { "field": string, "type": "sum" | "avg" | "min" | "max" | "count" }
  ],
  "groupBy": "fieldName" (optional),
  "orderBy": { "field": string, "direction": "asc" | "desc", "type": "sum" | "avg" | "min" | "max" | "count" (optional) }
}

Current Date & Time: ${new Date().toISOString()}

Instructions:
1. Use "conditions" for ALL filters.
2. **Explicit Logic**: ALWAYS wrap the root conditions in an "AND" or "OR" array, even if there is only one condition. Never use siblings for multiple filters at the same level.
   - WRONG: { "field1": {...}, "field2": {...} }
   - RIGHT: { "AND": [ { "field1": {...} }, { "field2": {...} } ] }
3. **Recursion**: Support complex logical nesting, e.g., (X AND (Y OR Z)).
   - If the user asks for a specific date or time, use "operator": "equals" and provide an ISO string.
   - If the user asks for a specific YEAR, MONTH, or DAY (e.g. "missions in 2024"), use the corresponding operator.
   - **Time Formats**: 
      - "year": provide "YYYY" (e.g. "2024")
      - "month": provide "YYYY-MM" (e.g. "2024-05")
      - "day": provide "YYYY-MM-DD" (e.g. "2024-05-20")
   - Use "after" or "before" ONLY if explicitly requested.
4. **Relation Filtering**: 
   - Use "some", "every", "none", or "is" for standard existence/matching.
   - Use "query" + "count" ONLY when a specific number of related items is required (e.g. "at least 3").
   - "Mines with at least 3 Graphite clusters" -> { "target": "Mine", "conditions": { "AND": [ { "clusters": { "query": { "target": "Cluster", "conditions": { "AND": [ { "stoneType": { "operator": "equals", "value": "Graphite" } } ] } }, "count": { "operator": "gte", "value": 3 } } } ] } }
   - "Missions in North Mine" -> { "target": "DrillMission", "conditions": { "AND": [ { "mine": { "is": { "name": { "operator": "equals", "value": "North Mine" } } } } ] } }
5. **Field Inference & Targets**: If a user asks for statistics (sum, avg, count) on a field, the 'target' MUST be the entity that actually contains that field.
   - "Top 10 mines by quantity" -> Target: **Cluster** (quantity is on Cluster), GroupBy: **mineId**, Aggregations: sum(quantity).
   - "Mines of type X" (Mine has no 'type', but Cluster does) -> { "target": "Mine", "conditions": { "clusters": { "some": { "stoneType": { "operator": "equals", "value": "X" } } } } }
6. **Grouping**: If the user asks for stats "per X" or "for each Y", use "groupBy": "Y" (e.g., "mineId", "stoneType").
7. **Ranking & Sorting**: Use "orderBy" for "top X", "biggest", "smallest", "most", "highest", etc.
8. **Chaining vs. Siblings**:
   - If relations are described as a chain (e.g., "Mines with clusters that have missions"), NEST them: Mine -> clusters -> missions.
   - If relations are described as parallel (e.g., "Mines with clusters and missions"), ALWAYS use an "AND" array.
9. **Attribute Attribution**: Carefully determine which entity each condition applies to.
10. **Stats Only**: If the user asks ONLY for statistics (e.g., "what is the average...", "how many..."), set "isStatsOnly": true.
11. Translate Hebrew terms to their English technical equivalents based on the schema.
12. Output ONLY the valid JSON object.
13. Example (Complex Logic): "Mines in North with Neodymium or Lithium" -> { "target": "Mine", "conditions": { "AND": [ { "name": { "operator": "contains", "value": "North" } }, { "OR": [ { "clusters": { "query": { "target": "Cluster", "conditions": { "AND": [ { "stoneType": { "operator": "equals", "value": "Neodymium" } } ] } } } }, { "clusters": { "query": { "target": "Cluster", "conditions": { "AND": [ { "stoneType": { "operator": "equals", "value": "Lithium" } } ] } } } } ] } ] } }
14. Example (Statistics): "Average quantity per mine" -> { "target": "Cluster", "aggregations": [{ "field": "quantity", "type": "avg" }], "groupBy": "mineId", "isStatsOnly": true }
15. Example (Time Granularity): "Mines in May 2024" -> { "target": "Mine", "conditions": { "AND": [ { "createdAt": { "operator": "month", "value": "2024-05" } } ] } }
16. Example (Chaining): "Mines with clusters that have missions" -> { "target": "Mine", "conditions": { "AND": [ { "clusters": { "query": { "target": "Cluster", "conditions": { "AND": [ { "missions": { "query": { "target": "DrillMission", "conditions": {} } } } ] } } } } ] } }
17. **Modification Mode**: If a "CURRENT QUERY PLAN" is provided, the user's question might be a request to modify it (e.g., "add another condition...", "remove the filter on...", "change the date to..."). In this case, you should return a NEW plan that is based on the current one but with the requested changes applied.
18. **Complexity**: Be prepared to handle dozens of conditions. Keep the logic clean and nested correctly according to the user's intent. If modifying, preserve as much of the existing structure as possible unless the user asks for a reset.`;

    const planRes = await llm.invoke(planPrompt);
    const match = planRes.content.toString().match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const plan = JSON.parse(match[0]);
        // Ensure the target is what we identified
        plan.target = target;
        this.logger.log(`Generated Query Plan: ${JSON.stringify(plan)}`);
        return plan;
      } catch {
        this.logger.error(`Failed to parse plan JSON: ${match[0]}`);
      }
    }
    return null;
  }

  private async identifyTarget(
    llm: ChatOpenAI,
    question: string,
  ): Promise<QueryPlan['target']> {
    const identificationPrompt = `Identify the primary subject entity requested in the user's question.
Even if the question mentions other entities for filtering purposes, identify the main entity the user wants to SEE or LIST.

Entities:
- Mine: A physical mining site.
- Cluster: A specific mineral deposit. Target this ONLY if the user wants to list the deposits themselves (e.g., "list all neodymium clusters").
- Drill: Mining machinery. Target this if the user wants to see equipment.
- DrillMission: A scheduled operation. Target this if the user asks about tasks, plans, or missions.

If the user asks for "<Entity> containing X" or "<Entity> with Y <Other Entities>", the target is still <Entity>. Also, in this type of questions, the other entities are just for filtering purposes and should be handled with "conditions" and "relationName" in the query plan.
If the user asks for "how many <Entity> ...", the target is still the <Entity> and should be handled with "aggregations".

Question: "${question}"

Respond with ONLY the entity name: Mine, Cluster, Drill, or DrillMission.`;

    try {
      const res = await llm.invoke(identificationPrompt);
      const content = res.content.toString().toLowerCase();

      if (content.includes('drillmission')) return 'DrillMission';
      if (content.includes('drill')) return 'Drill';
      if (content.includes('cluster')) return 'Cluster';
      if (content.includes('mine')) return 'Mine';
    } catch (e) {
      this.logger.warn(
        `Failed to identify target via LLM, falling back to Mine: ${e.message}`,
      );
    }

    return 'Mine';
  }
}
