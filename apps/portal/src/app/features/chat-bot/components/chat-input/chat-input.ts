import { Component, ElementRef, ViewChild, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../../../core/services/chat.service';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [CommonModule, FormsModule, TextareaModule, ButtonModule],
  templateUrl: './chat-input.html',
  styleUrl: './chat-input.css'
})
export class ChatInputComponent {
  public chatService = inject(ChatService);
  inputText = signal<string>('');

  @ViewChild('messageInput') private messageInput!: ElementRef;

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    const text = this.inputText().trim();
    if (!text || this.chatService.isWaiting()) return;

    this.inputText.set('');
    await this.chatService.sendMessage(text);
    this.focusInput();
  }

  focusInput() {
    setTimeout(() => {
      if (this.messageInput) {
        this.messageInput.nativeElement.focus();
      }
    }, 100);
  }
}
