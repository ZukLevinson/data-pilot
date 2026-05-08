import { inject, Injectable, signal } from '@angular/core';
import { ChatMessage, ChatRequest, EntitySearchResult, QueryPlan, SavedQuery } from '@org/models';
import { helloMessage } from '@org/portal/shared-ui';
import { ChatApiService } from './chat-api.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private api = inject(ChatApiService);

  // --- State Management (Signals) ---
  messages = signal<ChatMessage[]>([{
    id: 0,
    sender: 'bot',
    timestamp: new Date(),
    text: helloMessage
  }]);
  currentSources = signal<EntitySearchResult[]>([]);
  currentQueryPlan = signal<QueryPlan | null>(null);
  currentModel = signal<string | null>(null);
  statusText = signal<string | null>(null);
  history = signal<SavedQuery[]>([]);
  isWaiting = signal<boolean>(false);
  showHistory = signal<boolean>(false);
  editingPlan = signal<QueryPlan | null>(null);
  healthStatus = signal<{ database: 'online' | 'offline'; llm: 'online' | 'offline' }>({
    database: 'online',
    llm: 'online'
  });

  getConfig() {
    return this.api.getConfig();
  }

  loadHistory() {
    this.api.getHistory().subscribe(h => this.history.set(h));
  }

  async sendMessage(text: string) {
    if (!text.trim() || this.isWaiting()) return;

    const userMessageId = Date.now();
    this.messages.update(msgs => [...msgs, {
      id: userMessageId,
      text,
      sender: 'user',
      timestamp: new Date()
    }]);

    this.isWaiting.set(true);
    this.currentSources.set([]);
    this.currentQueryPlan.set(null);

    const botMessageId = Date.now() + 1;
    this.messages.update(msgs => [...msgs, {
      id: botMessageId,
      text: '',
      sender: 'bot',
      timestamp: new Date()
    }]);

    try {
      const stream = this.api.streamChat({ 
        userId: 'user-1', 
        question: text, 
        contextQueryPlan: this.currentQueryPlan() || undefined 
      });
      let fullContent = '';

      for await (const chunk of stream) {
        if (chunk.status) {
          this.statusText.set(chunk.status);
          this.updateBotMessage(botMessageId, { status: chunk.status });
        }

        if (chunk.queryPlan) {
          this.currentQueryPlan.set(chunk.queryPlan);
          this.updateBotMessage(botMessageId, { queryPlan: chunk.queryPlan });
        }

        if (chunk.sources) {
          this.updateBotMessage(botMessageId, { sources: chunk.sources });
          if (chunk.mode === 'append') {
            this.currentSources.update(existing => [...existing, ...(chunk.sources || [])]);
          } else {
            this.currentSources.set(chunk.sources);
          }
        }

        if (chunk.content) {
          fullContent += chunk.content;
          const { thought, answer } = this.parseThinking(fullContent);
          this.updateBotMessage(botMessageId, { text: answer, thought });
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      this.updateBotMessage(botMessageId, { text: 'מצטער, אירעה שגיאה בתקשורת.', isError: true });
    } finally {
      this.isWaiting.set(false);
    }
  }

  private updateBotMessage(id: number, patch: Partial<ChatMessage>) {
    this.messages.update(msgs => msgs.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  private parseThinking(content: string) {
    let thought = '';
    let answer = content;
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      thought = thinkMatch[1];
      answer = content.replace(/<think>[\s\S]*?<\/think>/, '').trim();
    } else if (content.includes('<think>')) {
      thought = content.split('<think>')[1];
      answer = '';
    }
    return { thought, answer };
  }

  clear() {
    this.messages.set([{
      id: 0,
      sender: 'bot',
      timestamp: new Date(),
      text: helloMessage
    }]);
    this.currentSources.set([]);
    this.currentQueryPlan.set(null);
    this.statusText.set(null);
  }

  startManualQuery() {
    const emptyPlan: QueryPlan = {
      target: 'Mine',
      conditions: {
        AND: []
      }
    };
    
    this.currentQueryPlan.set(emptyPlan);
    
    this.messages.update(msgs => [...msgs, {
      id: Date.now(),
      text: 'בניית שאילתה ידנית התחילה. השתמש בלחצנים למטה כדי להוסיף תנאים.',
      sender: 'bot',
      timestamp: new Date(),
      queryPlan: emptyPlan
    }]);
  }

  async runPlan(plan: QueryPlan) {
    if (this.isWaiting()) return;

    this.isWaiting.set(true);
    this.currentSources.set([]);
    
    const botMessageId = Date.now();
    this.messages.update(msgs => [...msgs, {
      id: botMessageId,
      text: '',
      sender: 'bot',
      timestamp: new Date(),
      status: 'מריץ שאילתה מעודכנת...'
    }]);

    try {
      const stream = this.api.executePlan(plan);
      let fullContent = '';

      for await (const chunk of stream) {
        if (chunk.status) {
          this.statusText.set(chunk.status);
          this.updateBotMessage(botMessageId, { status: chunk.status });
        }

        if (chunk.queryPlan) {
          this.currentQueryPlan.set(chunk.queryPlan);
          this.updateBotMessage(botMessageId, { queryPlan: chunk.queryPlan });
        }

        if (chunk.sources) {
          this.currentSources.update(existing => [...existing, ...(chunk.sources || [])]);
          this.updateBotMessage(botMessageId, { sources: this.currentSources() });
        }

        if (chunk.content) {
          fullContent += chunk.content;
          this.updateBotMessage(botMessageId, { text: fullContent });
        }
      }
    } catch (error) {
      console.error('Plan execution error:', error);
      this.updateBotMessage(botMessageId, { text: 'אירעה שגיאה בהרצת השאילתה.', isError: true });
    } finally {
      this.isWaiting.set(false);
    }
  }
}
