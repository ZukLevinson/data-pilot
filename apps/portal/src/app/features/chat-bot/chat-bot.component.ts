import { Component, ElementRef, ViewChild, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import { ChatMessage, EntitySearchResult } from '@org/models';
import { helloMessage } from '@org/portal/shared-ui';
import { Textarea } from 'primeng/textarea';
import { Button } from 'primeng/button';
import { Badge } from 'primeng/badge';
import { Avatar } from 'primeng/avatar';
import { Chip } from 'primeng/chip';
import { Drawer } from 'primeng/drawer';
import { ScrollPanel } from 'primeng/scrollpanel';
import { MapWidgetComponent } from '../../shared/components/map-widget/map-widget.component';
import { MarkdownPipe } from '../../shared/pipes/markdown.pipe';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-chat-bot',
  standalone: true,
  imports: [CommonModule, FormsModule, Textarea, Button, Badge, Avatar, Chip, Drawer, ScrollPanel, MapWidgetComponent, MarkdownPipe],
  templateUrl: './chat-bot.component.html',
  styleUrls: ['./chat-bot.component.css']
})
export class ChatBotComponent implements OnInit {
  public chatService = inject(ChatService);
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  inputText = signal<string>('');

  constructor() {
    this.chatService.loadHistory();
  }

  async ngOnInit() {
    this.chatService.getConfig().subscribe(config => this.chatService.currentModel.set(config.modelName));
  }

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
    this.scrollToBottom();

    await this.chatService.sendMessage(text);
    
    this.scrollToBottom();
    this.focusInput();
  }

  selectHistory(item: any) {
    this.inputText.set(item.name);
    this.sendMessage();
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

  getReadableField(field: any): string {
    const fieldMap: Record<string, string> = {
      'stoneType': 'סוג חומר',
      'quantity': 'כמות',
      'name': 'שם',
      'date': 'תאריך',
      'supportedStoneTypes': 'חומרים נתמכים',
      'minCount': 'כמות מינימלית של מקבצים'
    };
    return fieldMap[field] || field;
  }

  getReadableOperator(op: any): string {
    const opMap: Record<string, string> = {
      'contains': 'מכיל',
      'notContains': 'לא מכיל',
      'gt': 'גדול מ-',
      'lt': 'קטן מ-',
      'after': 'אחרי',
      'before': 'לפני',
      'equals': 'שווה ל-',
      'in': 'נמצא בתוך'
    };
    return opMap[op] || op;
  }

  getReadableTarget(target: any): string {
    const targetMap: Record<string, string> = {
      'Mine': 'מכרה',
      'Cluster': 'מקבץ',
      'Drill': 'מקדח',
      'DrillMission': 'משימת קידוח'
    };
    return targetMap[target] || target;
  }

  getReadableAggType(key: any): string {
    const parts = key.split('_');
    const type = parts[0];
    const field = parts[1];
    
    const typeMap: Record<string, string> = {
      'sum': 'סה״כ',
      'avg': 'ממוצע',
      'min': 'מינימום',
      'max': 'מקסימום',
      'count': 'ספירה'
    };
    
    const fieldLabel = this.getReadableField(field);
    return `${typeMap[type] || type} ${fieldLabel}`;
  }

  isCountAgg(key: any): boolean {
    return String(key).startsWith('count');
  }

  getClusterConditions(plan: any): any[] {
    if (!plan.clusterConditions) return [];
    return Array.isArray(plan.clusterConditions) ? plan.clusterConditions : [plan.clusterConditions];
  }
}
