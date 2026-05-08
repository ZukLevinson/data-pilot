import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfig, ChatRequest, ChatStreamChunk, SavedQuery } from '@org/models';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ChatApiService {
  private http = inject(HttpClient);

  getConfig(): Observable<AppConfig> {
    return this.http.get<AppConfig>('/api/chat/config');
  }

  getHistory(): Observable<SavedQuery[]> {
    return this.http.get<SavedQuery[]>('/api/chat/history');
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    yield* this.stream('/api/chat/stream', request);
  }

  async *executePlan(plan: any): AsyncIterable<ChatStreamChunk> {
    yield* this.stream('/api/chat/execute', plan);
  }

  private async *stream(url: string, body: any): AsyncIterable<ChatStreamChunk> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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
