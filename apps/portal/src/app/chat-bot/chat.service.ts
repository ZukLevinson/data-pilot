import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfig, ChatRequest, ChatStreamChunk } from '@org/models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);

  getConfig() {
    return this.http.get<AppConfig>('/api/chat/config');
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

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.replace('data: ', '')) as ChatStreamChunk;
            yield data;
          } catch (e) {
            console.error('Failed to parse stream chunk', e);
          }
        }
      }
    }
  }
}
