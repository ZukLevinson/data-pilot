import { Component, ElementRef, ViewChild, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';
import { ChatMessage, EntitySearchResult } from '@org/models';
import { helloMessage } from '@org/portal/shared-ui';
import { Textarea } from 'primeng/textarea';
import { Button } from 'primeng/button';
import { Badge } from 'primeng/badge';
import { Avatar } from 'primeng/avatar';
import { MapWidgetComponent } from './map-widget/map-widget.component';
import { MarkdownPipe } from './markdown.pipe';

@Component({
  selector: 'app-chat-bot',
  standalone: true,
  imports: [CommonModule, FormsModule, Textarea, Button, Badge, Avatar, MapWidgetComponent, MarkdownPipe],
  templateUrl: './chat-bot.component.html',
  styleUrls: ['./chat-bot.component.css']
})
export class ChatBotComponent {
  private chatService = inject(ChatService);
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  messages = signal<ChatMessage[]>([{
    id: 0,
    sender: 'bot',
    timestamp: new Date(),
    text: helloMessage
  }]);
  inputText = signal<string>('');
  isWaiting = signal<boolean>(false);
  currentSources = signal<EntitySearchResult[]>([]);
  currentModel = signal<string | null>(null);
  statusText = signal<string | null>(null);

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
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
    this.scrollToBottom();

    const botMessageId = Date.now() + 1;
    this.messages.update(msgs => [...msgs, {
      id: botMessageId,
      text: '',
      sender: 'bot',
      timestamp: new Date()
    }]);

    try {
      const stream = this.chatService.streamChat({ userId: 'user-1', question: text });
      let fullContent = '';

      for await (const chunk of stream) {
        if (chunk.status) {
          this.statusText.set(chunk.status);
          this.messages.update(msgs => msgs.map(m => 
            m.id === botMessageId ? { ...m, status: chunk.status } : m
          ));
        }

        if (chunk.sources) {
          this.messages.update(msgs => msgs.map(m => 
            m.id === botMessageId ? { ...m, sources: chunk.sources } : m
          ));
          
          if (chunk.mode === 'append') {
            this.currentSources.update(existing => [...existing, ...chunk.sources!]);
          } else {
            this.currentSources.set(chunk.sources);
          }
        }

        if (chunk.content) {
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
        
        this.scrollToBottom();
      }
    } catch (error) {
      console.error('Chat error:', error);
      this.messages.update(msgs => msgs.map(m => 
        m.id === botMessageId ? { ...m, text: 'מצטער, אירעה שגיאה בתקשורת.', isError: true } : m
      ));
    } finally {
      this.isWaiting.set(false);
      this.scrollToBottom();
      this.focusInput();
    }
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.scrollContainer) {
        const element = this.scrollContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 50);
  }

  focusInput() {
    setTimeout(() => {
      if (this.messageInput) {
        this.messageInput.nativeElement.focus();
      }
    }, 100);
  }
}
