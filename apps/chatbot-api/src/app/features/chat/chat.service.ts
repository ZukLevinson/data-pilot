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

  constructor(
    private planner: ChatPlanner,
    private executor: ChatExecutor
  ) {
    const baseURL = process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1';
    this.modelName = process.env['LOCAL_LLM_MODEL'] || 'qwen3-coder';

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

    let entities: EntitySearchResult[] = [];
    try {
      entities = await this.executor.executePlan(queryPlan, question);
    } catch (e) {
      this.logger.error('Query execution failed', e);
      yield { content: 'אירעה שגיאה בעת הרצת השאילתה המובנית.' };
      return;
    }

    yield { sources: entities, mode };

    yield { status: 'מנסח תשובה סופית...' };

    const prompt = `You are a Rare Earth Mining Virtualization Expert.
Question: "${question}"
Query Plan Used: ${JSON.stringify(queryPlan)}
Results Found: ${entities.length}

Instructions:
1. Respond ONLY based on the results found. 
2. DO NOT mention total records in the database or other unrelated entities.
3. Keep the answer professional and focused on the identified ${queryPlan.target}s.
4. If results were found:
   - Mention the total count found (${entities.length}) and that they are displayed on the map.
5. If NO results were found, inform the user briefly.
6. Mention that the query plan has been saved.
7. Focus strictly on the results and the map.
Answer in Hebrew.`;

    const stream = await this.llm.stream(prompt);
    for await (const chunk of stream) {
      if (chunk.content) yield { content: chunk.content as string };
    }
  }

  async getInitialData(): Promise<EntitySearchResult[]> {
    return this.executor.getInitialData();
  }

  async getHistory() {
    return this.executor.getHistory();
  }
}
