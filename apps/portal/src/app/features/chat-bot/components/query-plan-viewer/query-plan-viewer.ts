import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QueryPlan } from '@org/models';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChatService } from '../../../../core/services/chat.service';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-query-plan-viewer',
  standalone: true,
  imports: [CommonModule, ChipModule, TagModule, TooltipModule, DecimalPipe, QueryPlanViewerComponent],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './query-plan-viewer.html',
  styleUrl: './query-plan-viewer.css'
})
export class QueryPlanViewerComponent {
  @Input({ required: true }) plan!: QueryPlan;
  @Input() isRoot = true;

  private chatService = inject(ChatService);
  private datePipe = inject(DatePipe);

  getReadableField(field: string): string {
    const fieldMap: Record<string, string> = {
      'stoneType': 'סוג חומר',
      'quantity': 'כמות',
      'name': 'שם',
      'date': 'תאריך',
      'supportedStoneTypes': 'חומרים נתמכים',
      'clusters': 'מקבצים',
      'mine': 'מכרה',
      'drill': 'מקדח',
      'missions': 'משימות',
      'material': 'חומר',
      'id': 'מזהה',
      'is': 'מתאים ל-',
      'some': 'לחלק מ-',
      'every': 'לכולם',
      'none': 'אף אחד'
    };
    return fieldMap[field] || field;
  }

  getReadableOperator(operator: string): string {
    const opMap: Record<string, string> = {
      'eq': 'שווה ל-',
      'neq': 'לא שווה ל-',
      'gt': 'גדול מ-',
      'gte': 'לפחות',
      'lt': 'קטן מ-',
      'lte': 'לכל היותר',
      'contains': 'מכיל',
      'startsWith': 'מתחיל ב-',
      'endsWith': 'מסתיים ב-',
      'in': 'אחד מתוך',
      'notIn': 'לא מתוך',
      'equals': 'שווה ל-',
      'after': 'אחרי',
      'before': 'לפני',
      'year': 'בשנת',
      'month': 'בחודש',
      'day': 'בתאריך'
    };
    return opMap[operator] || operator;
  }

  getReadableLogicOp(op: string): string {
    const opMap: Record<string, string> = {
      'AND': 'כל התנאים הבאים:',
      'OR': 'לפחות אחד מהתנאים הבאים:',
      'NOT': 'אף אחד מהתנאים הבאים:'
    };
    return opMap[op] || op;
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

  getReadableAggType(key: string): string {
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

  isCountAgg(key: string): boolean {
    return String(key).startsWith('count');
  }

  isLogicGroup(key: string): boolean {
    return ['AND', 'OR', 'NOT'].includes(key);
  }

  hasLogicGroup(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    return Object.keys(obj as object).some(key => this.isLogicGroup(key));
  }
  isObject(value: unknown): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value) && !this.isFieldFilter(value) && !this.isRelatedFilter(value);
  }

  isFieldFilter(value: unknown): boolean {
    return !!value && typeof value === 'object' && 'operator' in value && 'value' in value;
  }

  isRelatedFilter(value: unknown): boolean {
    return !!value && typeof value === 'object' && 'query' in value;
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined) return '-';
    if (Array.isArray(value)) return value.map(v => this.formatValue(v)).join(', ');
    if (typeof value === 'string' && value.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return this.datePipe.transform(date, 'dd/MM/yyyy') || value;
      }
    }
    return String(value);
  }
}
