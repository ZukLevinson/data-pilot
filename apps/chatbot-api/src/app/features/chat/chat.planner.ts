import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class ChatPlanner {
  private readonly logger = new Logger(ChatPlanner.name);

  async generatePlan(llm: ChatOpenAI, question: string): Promise<any> {
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
  "clusterConditions": [
    {
      "stoneType": { "operator": "contains" | "notContains", "value": string },
      "quantity": { "operator": "gt" | "lt", "value": number },
      "minCount": number
    }
  ],
  "aggregations": [
    { "field": "quantity", "type": "sum" | "avg" | "min" | "max" | "count" }
  ]
}

- If the user asks for "total", "sum", "average", "mean", "min", "max" of a numeric field (like quantity), use the "aggregations" field.
- If the user asks "how many" (כמה מקבצים, כמה מכרות) or "number of", use the "count" aggregation type.

- TARGET SELECTION RULES:
  1. If the user asks for "משימות" or "משימות קידוח" (Drill Missions), the target MUST be "DrillMission".
  2. If the user asks for "מכרות" (Mines), the target is "Mine".
  3. If the user asks for "מקבצים" (Clusters), the target is "Cluster".
  4. Relational filtering: If target is "DrillMission", "mineConditions" filters the mine it's in, and "clusterConditions" filters the clusters of that specific mine.
- Hebrew mappings: מכרה = Mine, מקבץ = Cluster, משימה = DrillMission.

Important:
1. Minerals (Neodymium, Dysprosium, etc.) are ONLY found in Clusters. 
2. If the user asks for "Mines containing [Stone]", target "Mine" and put the stone filter in "clusterConditions" (or conditions.stoneType). NEVER put the stone name in Mine:name.
3. Use "stoneType" (exactly) for mineral names. 
4. ALWAYS use the English technical name for minerals even if the user asks in Hebrew.
5. Output ONLY valid JSON.
6. Example: "משימות קידוח במכרות עם Neodymium" -> target: "DrillMission", clusterConditions: [{ "stoneType": "Neodymium" }]
7. Multi-Condition: For "Both A and B", use TWO objects in the clusterConditions array.
8. Counts: If asking "How many" (כמה), use count aggregation.`;

    const planRes = await llm.invoke(planPrompt);
    const match = planRes.content.toString().match(/\{[\s\S]*\}/);
    if (match) {
      const plan = JSON.parse(match[0]);
      this.logger.log(`Generated Query Plan: ${JSON.stringify(plan)}`);
      return plan;
    }
    return null;
  }
}
