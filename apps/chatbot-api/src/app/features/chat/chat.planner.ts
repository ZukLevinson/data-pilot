import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { QueryPlan } from '@org/models';

@Injectable()
export class ChatPlanner {
  private readonly logger = new Logger(ChatPlanner.name);

  async generatePlan(llm: ChatOpenAI, question: string): Promise<QueryPlan | null> {
    const target = await this.identifyTarget(llm, question);
    this.logger.log(`Identified target: ${target} for question: "${question}"`);

    const planPrompt = `You are an expert SQL Query Planner for a Rare Earth Mining database.
Question: "${question}"
Target Entity: ${target}

Database Schema & Relations:
- Mine: id, name, geom (location). Relations: [clusters (many), missions (many)]
- Cluster: id, mineId, stoneType, quantity, geom (location). Relations: [mine (one), missions (many)]
- Drill: id, name, supportedStoneTypes. Relations: [missions (many)]
- DrillMission: id, drillId, mineId, clusterId, stoneType, date. Relations: [mine (one), drill (one), cluster (one)]

Available Query Plan Structure:
{
  "target": "${target}",
  "limit": number (default 5000),
  "conditions": {
    "fieldName": { "operator": "contains" | "notContains" | "gt" | "lt" | "after" | "before" | "equals" | "year" | "month" | "day", "value": any },
    "relationName": { 
      "some" | "every" | "none" | "is": { 
        "subFieldName": { "operator": "...", "value": "..." },
        "subRelationName": { ... }
      }
    }
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
2. For filters on related entities, use the relation name with a relational operator ("some", "every", "none", "is").
3. **Time Strictness**: 
   - If the user asks for a specific date or time, use "operator": "equals".
   - If the user asks for a specific YEAR, MONTH, or DAY (e.g. "missions in 2024"), use the corresponding operator.
   - Use "after" or "before" ONLY if explicitly requested.
4. **Relation Counts**: If a minimum number of related items is specified, add "minCount": X inside that relation object.
5. **Field Inference & Targets**: If a user asks for statistics (sum, avg, count) on a field, the 'target' MUST be the entity that actually contains that field.
   - "Top 10 mines by quantity" -> Target: **Cluster** (quantity is on Cluster), GroupBy: **mineId**, Aggregations: sum(quantity).
   - "Mines of type X" (Mine has no 'type', but Cluster does) -> { "target": "Mine", "conditions": { "clusters": { "some": { "stoneType": { "operator": "equals", "value": "X" } } } } }
6. **Grouping**: If the user asks for stats "per X" or "for each Y", use "groupBy": "Y" (e.g., "mineId", "stoneType").
   - IMPORTANT: If the target is Cluster but you want results "per mine", use 'groupBy: "mineId"'.
7. **Ranking & Sorting**: Use "orderBy" for "top X", "biggest", "smallest", "most", "highest", etc.
    - "Top 10 mines with biggest quantity" -> { "target": "Cluster", "aggregations": [{ "field": "quantity", "type": "sum" }], "groupBy": "mineId", "orderBy": { "field": "quantity", "direction": "desc", "type": "sum" }, "limit": 10 }
8. **Relational Filtering**: If the user filters by a name or property of a related entity, use the relation name as a key and an "is" filter.
   - "Missions in North Mine" -> { "target": "DrillMission", "conditions": { "mine": { "is": { "name": { "operator": "equals", "value": "North Mine" } } } } }
9. **Chaining vs. Siblings**:
   - If relations are described as a chain (e.g., "Mines with clusters that have missions"), NEST them: Mine -> clusters -> missions.
   - If relations are described as parallel (e.g., "Mines with clusters and missions"), keep them as siblings in the parent "conditions".
9. **Attribute Attribution**: Carefully determine which entity each condition applies to.
10. **Stats Only**: If the user asks ONLY for statistics (e.g., "what is the average...", "how many..."), set "isStatsOnly": true.
11. Translate Hebrew terms to their English technical equivalents based on the schema.
12. Output ONLY the valid JSON object.
13. Example (Statistics): "Average quantity per mine" -> { "target": "Cluster", "aggregations": [{ "field": "quantity", "type": "avg" }], "groupBy": "mineId", "isStatsOnly": true }
14. Example (Time Granularity): "Mines in May 2024" -> { "target": "Mine", "conditions": { "createdAt": { "operator": "month", "value": "2024-05" } } }
15. Example (Chaining): "Mines with clusters that have missions" -> { "target": "Mine", "conditions": { "clusters": { "some": { "missions": { "some": {} } } } } }
16. Example (Siblings): "Mines with Neodymium clusters and Drill-1 missions" -> { "target": "Mine", "conditions": { "clusters": { "some": { "stoneType": { "operator": "equals", "value": "Neodymium" } } }, "missions": { "some": { "drill": { "is": { "name": { "operator": "equals", "value": "Drill-1" } } } } } } }`;

    const planRes = await llm.invoke(planPrompt);
    const match = planRes.content.toString().match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const plan = JSON.parse(match[0]);
        // Ensure the target is what we identified
        plan.target = target;
        this.logger.log(`Generated Query Plan: ${JSON.stringify(plan)}`);
        return plan;
      } catch (e) {
        this.logger.error(`Failed to parse plan JSON: ${match[0]}`);
      }
    }
    return null;
  }

  private async identifyTarget(llm: ChatOpenAI, question: string): Promise<QueryPlan['target']> {
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
      this.logger.warn(`Failed to identify target via LLM, falling back to Mine: ${e.message}`);
    }

    return 'Mine';
  }
}
