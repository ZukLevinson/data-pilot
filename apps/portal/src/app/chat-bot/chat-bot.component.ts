import { Component, ChangeDetectionStrategy, signal, inject, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface Message {
  id: number;
  text: string;
  thought?: string;
  sender: 'user' | 'bot' | 'system';
  timestamp: Date;
  isError?: boolean; // New: flag for error messages in conversation
}

@Component({
  selector: 'app-chat-bot',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TextareaModule, AvatarModule, BadgeModule],
  templateUrl: './chat-bot.component.html',
  styleUrls: ['./chat-bot.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatBotComponent implements AfterViewInit, OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('messageInput') messageInput!: ElementRef<HTMLTextAreaElement>;

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
  currentModel = signal<string | null>(null);

  async ngOnInit() {
    try {
      const config = await firstValueFrom(this.http.get<{ modelName: string }>('/api/config'));
      this.currentModel.set(config.modelName);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Failed to fetch model config:', err);
    }
  }

  ngAfterViewInit() {
    this.focusInput();
  }

  private focusInput() {
    setTimeout(() => {
      this.messageInput?.nativeElement?.focus();
    }, 100);
  }

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
    this.focusInput();

    const botMessageId = Date.now() + 1;
    this.messages.update(msgs => [...msgs, {
      id: botMessageId,
      text: '',
      thought: '',
      sender: 'bot',
      timestamp: new Date()
    }]);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: '00000000-0000-0000-0000-000000000000',
          question: text
        })
      });

      if (!response.ok) {
        throw new Error('השרת אינו זמין כרגע.');
      }

      if (!response.body) throw new Error('No response body');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.replace('data: ', '');
            if (!data && line !== 'data: ') continue;
            fullContent += data;
            
            let thought = '';
            let answer = fullContent;
            const thinkMatch = fullContent.match(/<think>([\s\S]*?)<\/think>/);
            if (thinkMatch) {
              thought = thinkMatch[1];
              answer = fullContent.replace(/<think>[\s\S]*?<\/think>/, '').trim();
            } else if (fullContent.includes('<think>')) {
              thought = fullContent.split('<think>')[1];
              answer = '';
            }

            this.messages.update(msgs => msgs.map(m => 
              m.id === botMessageId ? { ...m, text: answer, thought: thought } : m
            ));
            this.cdr.detectChanges();
          }
        }
      }
    } catch (err) {
      console.error('Streaming Error:', err);
      this.messages.update(msgs => msgs.map(m => 
        m.id === botMessageId ? { 
          ...m, 
          text: 'אופס! נראה שיש לי תקלה קלה בחיבור. אנא נסו שוב בעוד רגע.',
          isError: true 
        } : m
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
