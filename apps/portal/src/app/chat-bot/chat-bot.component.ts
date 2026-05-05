import { Component, ChangeDetectionStrategy, signal, inject, ElementRef, AfterViewInit, OnInit, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { ChatMessage } from '@org/shared/models';
import { ChatService } from './chat.service';
import { firstValueFrom } from 'rxjs';

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

  messageInput = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');

  messages = signal<ChatMessage[]>([
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
      const config = await firstValueFrom(this.chatService.getConfig());
      this.currentModel.set(config.modelName);
    } catch (err) {
      console.error('Failed to fetch model config:', err);
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

      for await (const data of stream) {
        if (!data) continue;
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
    }
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}

