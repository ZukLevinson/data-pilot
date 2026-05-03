import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { AvatarModule } from 'primeng/avatar';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

@Component({
  selector: 'portal-chat-bot',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TextareaModule, AvatarModule],
  templateUrl: './chat-bot.component.html',
  styleUrls: ['./chat-bot.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatBotComponent {
  messages = signal<Message[]>([
    {
      id: 1,
      text: 'שלום! איך אני יכול לעזור לך היום?',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  
  inputText = signal('');

  sendMessage() {
    const text = this.inputText().trim();
    if (!text) return;

    // Add user message
    this.messages.update(msgs => [...msgs, {
      id: Date.now(),
      text,
      sender: 'user',
      timestamp: new Date()
    }]);

    this.inputText.set('');

    // Simulate bot response
    setTimeout(() => {
      this.messages.update(msgs => [...msgs, {
        id: Date.now(),
        text: 'אני תגובת בוט מדומה. העיצוב נראה מעולה!',
        sender: 'bot',
        timestamp: new Date()
      }]);
    }, 1000);
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
