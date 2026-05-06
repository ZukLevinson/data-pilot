import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ChatStreamChunk, EntitySearchResult } from '@org/models';
import { ChatPlanner } from './chat.planner';
import { ChatExecutor } from './chat.executor';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private llm: ChatOpenAI;

  public readonly modelName: string;
  public readonly embeddingModel: string;

  constructor(
    private planner: ChatPlanner,
    private executor: ChatExecutor
  ) {
    const baseURL = process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1';
    this.modelName = process.env['LOCAL_LLM_MODEL'] || 'qwen3-coder';
    this.embeddingModel = process.env['LOCAL_EMBEDDING_MODEL'] || 'nomic-embed-text';

    this.llm = new ChatOpenAI({
      modelName: this.modelName,
      apiKey: 'local-key',
      configuration: { baseURL },
      temperature: 0.1,
    });
  }

  async *processChatStream(userId: string, question: string): AsyncGenerator<ChatStreamChunk> {
    const isAddQuery = /add|keep|also|בנוסף|תתקדם|תשאיר|וכן|תצרף|תוסיף/i.test(question);
    const mode: 'replace' | 'append' = isAddQuery ? 'append' : 'replace';

    yield { status: 'מנתח את הדרישה המורכבת...' };

    const queryPlan = await this.planner.generatePlan(this.llm, question);
    if (!queryPlan) {
      yield { content: 'לא הצלחתי ליצור תוכנית שאילתה עבור השאלה הזו.' };
      return;
    }

    yield { status: 'מריץ שאילתה מובנית...', queryPlan };

    try {
      const executorStream = this.executor.executePlan(queryPlan, question);
      
      // Get the first batch (names/counts) to show results on map immediately
      const firstBatch = await executorStream.next();
      if (!firstBatch.done && firstBatch.value.length > 0) {
        yield { sources: firstBatch.value, mode };
      }

      yield { status: 'מנסח תשובה סופית...' };

      const totalCount = queryPlan.totalCount || 0;
      const isDisplayOnly = /show|display|list|view|תראה|תציג|מפה|רשימה|תפרוס|הצג/i.test(question) && !queryPlan.aggregations?.length;

      if (isDisplayOnly) {
        const targetMap: Record<string, string> = { 'Mine': 'מכרות', 'Cluster': 'מקבצים', 'DrillMission': 'משימות', 'Drill': 'מקדחים' };
        const label = targetMap[queryPlan.target] || queryPlan.target;
        yield { content: `זיהיתי ${totalCount} ${label} העונים על דרישת הסינון שלך. הממצאים מוצגים כעת על המפה.` };
        
        // Just stream the rest of the entities without LLM
        for await (const nextEntities of executorStream) {
          yield { sources: nextEntities, mode: 'append' };
        }
        return;
      }

      const prompt = `You are a Rare Earth Mining Virtualization Expert.
Question: "${question}"
Query Plan Used: ${JSON.stringify(queryPlan)}
Results Found: ${totalCount}

Instructions:
1. Respond ONLY based on the results found. 
2. DO NOT mention total records in the database or other unrelated entities.
3. Keep the answer professional and focused on the identified ${queryPlan.target}s.
4. If results were found, mention that ${totalCount} items were identified and are displayed on the map.
5. If NO results were found, inform the user briefly.
6. Mention that the query plan has been saved.
7. Answer in Hebrew.`;

      // Start the LLM stream
      const llmStream = await this.llm.stream(prompt);

      // Consume the rest of the executor stream and the LLM stream
      const llmIterator = llmStream[Symbol.asyncIterator]();
      
      let llmDone = false;
      let executorDone = false;

      while (!llmDone || !executorDone) {
        if (!executorDone) {
          const nextExecutor = await executorStream.next();
          if (!nextExecutor.done) {
            yield { sources: nextExecutor.value, mode: 'append' };
          } else {
            executorDone = true;
          }
        }

        if (!llmDone) {
          const nextLlm = await llmIterator.next();
          if (!nextLlm.done) {
            if (nextLlm.value.content) yield { content: nextLlm.value.content as string };
          } else {
            llmDone = true;
          }
        }
      }
    } catch (e) {
      this.logger.error('Stream processing failed', e);
      yield { content: 'אירעה שגיאה בעת עיבוד הבקשה.' };
    }
  }

  async getInitialData(): Promise<EntitySearchResult[]> {
    return this.executor.getInitialData();
  }

  async getHistory() {
    return this.executor.getHistory();
  }
}
