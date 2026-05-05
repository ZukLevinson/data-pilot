import { Component, ChangeDetectionStrategy, signal, inject, ElementRef, AfterViewInit, OnInit, viewChild, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { ChatMessage } from '@org/models';
import { ChatService } from './chat.service';
import { firstValueFrom } from 'rxjs';
import { EntitySearchResult } from '@org/models';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  thought?: string;
  sources?: EntitySearchResult[];
  isError?: boolean;
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
  private chatService = inject(ChatService);
  private platformId = inject(PLATFORM_ID);

  messageInput = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');

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
  statusText = signal<string | null>(null);
  currentModel = signal<string | null>(null);

  async ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const config = await firstValueFrom(this.chatService.getConfig());
        this.currentModel.set(config.modelName);
      } catch (err) {
        console.error('Failed to fetch model config:', err);
      }
    }
  }

  ngAfterViewInit() {
    this.focusInput();
  }

  private focusInput() {
    setTimeout(() => {
      this.messageInput()?.nativeElement?.focus();
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
    this.statusText.set('מעבד...');
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
      let fullContent = '';
      const stream = this.chatService.streamChat({
        userId: '00000000-0000-0000-0000-000000000000',
        question: text
      });

      for await (const chunk of stream) {
        if (chunk.status) {
          this.statusText.set(chunk.status);
          continue;
        }

        if (chunk.sources) {
          this.messages.update(msgs => msgs.map(m => 
            m.id === botMessageId ? { ...m, sources: chunk.sources } : m
          ));
          continue;
        }

        if (!chunk.content) continue;
        this.statusText.set(null);
        fullContent += chunk.content;
        
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
      this.statusText.set(null);
    }
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}

