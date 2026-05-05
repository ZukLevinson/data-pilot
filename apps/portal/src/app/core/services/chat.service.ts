import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfig, ChatMessage, ChatRequest, ChatStreamChunk, EntitySearchResult } from '@org/models';
import { firstValueFrom } from 'rxjs';

import { helloMessage } from '@org/portal/shared-ui';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);

  // --- State Management (Signals) ---
  messages = signal<ChatMessage[]>([{
    id: 0,
    sender: 'bot',
    timestamp: new Date(),
    text: helloMessage
  }]);
  currentSources = signal<EntitySearchResult[]>([]);
  currentQueryPlan = signal<any | null>(null);
  currentModel = signal<string | null>(null);
  statusText = signal<string | null>(null);
  history = signal<any[]>([]);
  isWaiting = signal<boolean>(false);
  showHistory = signal<boolean>(false);

  getConfig() {
    return this.http.get<AppConfig>('/api/chat/config');
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
      const stream = this.streamChat({ userId: 'user-1', question: text });
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
            this.currentSources.update(existing => [...existing, ...chunk.sources!]);
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

  async *streamChat(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error('Server unavailable');
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // The last element might be a partial line, keep it in the buffer
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        
        try {
          const data = JSON.parse(trimmed.replace('data: ', '')) as ChatStreamChunk;
          yield data;
        } catch (e) {
          console.error('Failed to parse stream chunk. Buffer size:', trimmed.length, e);
        }
      }
    }
  }
}
