import { Component, ChangeDetectionStrategy, signal, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { AvatarModule } from 'primeng/avatar';
import { HttpClient } from '@angular/common/http';

interface Message {
  id: number;
  text: string;
  thought?: string; // New: stores the reasoning/thinking process
  sender: 'user' | 'bot';
  timestamp: Date;
}

@Component({
  selector: 'app-chat-bot',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TextareaModule, AvatarModule],
  templateUrl: './chat-bot.component.html',
  styleUrls: ['./chat-bot.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatBotComponent {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  messages = signal<Message[]>([
    {
      id: 1,
      text: 'שלום! איך אני יכול לעזור לך היום?',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  
  inputText = signal('');
  isWaiting = signal(false);

  async sendMessage() {
    const text = this.inputText().trim();
    if (!text || this.isWaiting()) return;

    const userMessageId = Date.now();
    this.messages.update(msgs => [...msgs, {
      id: userMessageId,
      text,
      sender: 'user',
      timestamp: new Date()
    }]);

    this.inputText.set('');
    this.isWaiting.set(true);

    const botMessageId = Date.now() + 1;
    this.messages.update(msgs => [...msgs, {
      id: botMessageId,
      text: '',
      thought: '',
      sender: 'bot',
      timestamp: new Date()
    }]);

    try {
      // Using fetch for POST streaming
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '00000000-0000-0000-0000-000000000000',
          question: text
        })
      });

      if (!response.body) throw new Error('No response body');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        // SSE chunks start with "data: "
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = line.replace('data: ', '');
              if (!data && line !== 'data: ') continue;
              
              fullContent += data;
              
              // Parse <think> tags
              let thought = '';
              let answer = fullContent;
              
              const thinkMatch = fullContent.match(/<think>([\s\S]*?)<\/think>/);
              if (thinkMatch) {
                thought = thinkMatch[1];
                answer = fullContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
              } else if (fullContent.includes('<think>')) {
                // Currently thinking (tag not closed yet)
                thought = fullContent.split('<think>')[1];
                answer = '';
              }

              this.messages.update(msgs => msgs.map(m => 
                m.id === botMessageId ? { ...m, text: answer, thought: thought } : m
              ));
              this.cdr.detectChanges();
            } catch (e) { /* skip partial JSON */ }
          }
        }
      }
    } catch (err) {
      console.error('Streaming Error:', err);
      this.messages.update(msgs => msgs.map(m => 
        m.id === botMessageId ? { ...m, text: 'מצטער, אירעה שגיאה בחיבור לשרת.' } : m
      ));
    } finally {
      this.isWaiting.set(false);
      this.cdr.detectChanges();
    }
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
