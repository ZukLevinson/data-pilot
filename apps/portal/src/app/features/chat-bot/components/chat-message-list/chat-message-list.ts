import { Component, ElementRef, ViewChild, inject, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../../../core/services/chat.service';
import { MarkdownPipe } from '../../../../shared/pipes/markdown.pipe';
import { QueryPlanViewerComponent } from '../query-plan-viewer/query-plan-viewer';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [CommonModule, MarkdownPipe, QueryPlanViewerComponent, DatePipe],
  templateUrl: './chat-message-list.html',
  styleUrl: './chat-message-list.css'
})
export class ChatMessageListComponent implements AfterViewChecked {
  public chatService = inject(ChatService);
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom() {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }
}
