import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../../../../core/services/chat.service';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { DrawerModule } from 'primeng/drawer';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { DatePipe } from '@angular/common';
import { SavedQuery } from '@org/models';

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [CommonModule, ButtonModule, TooltipModule, DrawerModule, ScrollPanelModule, DatePipe],
  templateUrl: './chat-header.html',
  styleUrl: './chat-header.css'
})
export class ChatHeaderComponent {
  public chatService = inject(ChatService);

  createNewQuery() {
    this.chatService.startManualQuery();
  }

  selectHistory(item: SavedQuery) {
    this.chatService.sendMessage(item.name);
    this.chatService.showHistory.set(false);
  }
}
