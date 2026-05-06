import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { QueryPlan } from '@org/models';

@Injectable()
export class ChatPlanner {
  private readonly logger = new Logger(ChatPlanner.name);

  async generatePlan(llm: ChatOpenAI, question: string): Promise<QueryPlan | null> {
    const target = this.identifyTarget(question);
    this.logger.log(`Identified target: ${target} for question: "${question}"`);

    const planPrompt = `You are a SQL Query Planner for a Rare Earth Mining database.
Question: "${question}"
Target Entity: ${target} (This has been pre-identified, please stick to it)

Schema:
- Mine (Hebrew: מכרה): name
- Cluster (Hebrew: מקבץ): stoneType, quantity
- Drill: name, supportedStoneTypes
- DrillMission: stoneType, date

Generate a JSON Query Plan for the target "${target}".
Structure:
{
  "target": "${target}",
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

- Relational filtering: If target is "DrillMission", "mineConditions" filters the mine it's in, and "clusterConditions" filters the clusters of that specific mine.
- Hebrew mappings: מכרה = Mine, מקבץ = Cluster, משימה = DrillMission.

Important:
1. Minerals (Neodymium, Dysprosium, etc.) are ONLY found in Clusters. 
2. If the user asks for "Mines containing [Stone]", target is "Mine" and put the stone filter in "clusterConditions". NEVER put the stone name in Mine:name.
3. Use "stoneType" (exactly) for mineral names. 
4. ALWAYS use the English technical name for minerals even if the user asks in Hebrew.
5. Output ONLY valid JSON.
6. Example: "משימות קידוח במכרות עם Neodymium" -> target: "DrillMission", clusterConditions: [{ "stoneType": "Neodymium" }]
7. Multi-Condition: For "Both A and B", use TWO objects in the clusterConditions array.
8. Counts: If asking "How many" (כמה), use count aggregation.`;

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

  private identifyTarget(question: string): QueryPlan['target'] {
    const q = question.toLowerCase();

    // 1. Drill Missions (משימות קידוח / משימות)
    if (q.includes('משימ') || q.includes('mission')) {
      return 'DrillMission';
    }

    // 2. Drills (מקדחים)
    if (q.includes('מקדח') || q.includes('drill')) {
      return 'Drill';
    }

    // 3. Clusters (מקבצים)
    // Priority to Cluster if they ask about quantities directly or "clusters"
    if (q.includes('מקבץ') || q.includes('cluster')) {
      return 'Cluster';
    }

    // 4. Mines (מכרות)
    if (q.includes('מכרה') || q.includes('מכרות') || q.includes('mine')) {
      return 'Mine';
    }

    // 5. Implicit heuristics
    // If asking about "how many" without a clear noun, or asking about stone types directly
    // "כמה יש מניאודימיום" -> usually asking about clusters or mines. 
    // Defaulting to Mine is safer for "where" questions, but "how many" might be Cluster.
    if (q.includes('כמה') || q.includes('how many') || q.includes('count')) {
      // If it mentions stone types but not 'mine', it's likely clusters
      const stoneTypes = ['neodymium', 'dysprosium', 'praseodymium', 'terbium', 'ניאודימיום', 'דיספרוזיום', 'פרסיאודימיום', 'טרביום'];
      if (stoneTypes.some(s => q.includes(s)) && !q.includes('מכרה') && !q.includes('mine')) {
        return 'Cluster';
      }
    }

    // Default fallback
    return 'Mine';
  }
}
