import { Component, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ChatService } from '../../core/services/chat.service';
import { BadgeModule } from 'primeng/badge';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { MapWidgetComponent } from '../../shared/components/map-widget/map-widget.component';
import { ChatHeaderComponent } from './components/chat-header/chat-header';
import { ChatMessageListComponent } from './components/chat-message-list/chat-message-list';
import { ChatInputComponent } from './components/chat-input/chat-input';
import { DialogModule } from 'primeng/dialog';
import { QueryPlanViewerComponent } from './components/query-plan-viewer/query-plan-viewer';

@Component({
  selector: 'app-chat-bot',
  standalone: true,
  imports: [
    CommonModule, 
    BadgeModule, 
    TagModule, 
    ButtonModule, 
    TooltipModule, 
    TableModule, 
    MapWidgetComponent,
    ChatHeaderComponent,
    ChatMessageListComponent,
    ChatInputComponent,
    DialogModule,
    QueryPlanViewerComponent
  ],
  providers: [DecimalPipe],
  templateUrl: './chat-bot.component.html',
  styleUrls: ['./chat-bot.component.css']
})
export class ChatBotComponent implements OnInit {
  public chatService = inject(ChatService);
  
  @ViewChild(MapWidgetComponent) private mapWidget!: MapWidgetComponent;

  async ngOnInit() {
    this.chatService.getConfig().subscribe(config => {
      this.chatService.currentModel.set(config.modelName);
      if (config.health) {
        this.chatService.healthStatus.set(config.health);
      }
    });
    this.chatService.loadHistory();
  }

  zoomTo(id: string) {
    if (this.mapWidget) {
      this.mapWidget.zoomToEntity(id);
    }
  }

  getReadableTarget(target: string): string {
    const targetMap: Record<string, string> = {
      'Mine': 'מכרה',
      'Cluster': 'מקבץ',
      'Drill': 'מקדח',
      'DrillMission': 'משימת קידוח'
    };
    return targetMap[target] || target;
  }
}
