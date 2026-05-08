import { Component, Input, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QueryPlan, WhereClause, FieldFilter } from '@org/models';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ChatService } from '../../../../core/services/chat.service';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-query-plan-viewer',
  standalone: true,
  imports: [CommonModule, ChipModule, TagModule, TooltipModule, ButtonModule, InputTextModule, SelectModule, FormsModule, DecimalPipe, QueryPlanViewerComponent],
  providers: [DatePipe, DecimalPipe],
  templateUrl: './query-plan-viewer.html',
  styleUrl: './query-plan-viewer.css'
})
export class QueryPlanViewerComponent {
  @Input({ required: true }) plan!: QueryPlan;
  @Input() isRoot = true;
  @Input() isExpanded = false;
  @Output() planChanged = new EventEmitter<void>();

  public chatService = inject(ChatService);
  private datePipe = inject(DatePipe);

  editingField: { parent: any, key: string, index?: number } | null = null;

  availableFields = [
    { label: 'שם', value: 'name' },
    { label: 'סוג חומר', value: 'stoneType' },
    { label: 'כמות', value: 'quantity' },
    { label: 'תאריך', value: 'date' },
    { label: 'מכרה', value: 'mine' },
    { label: 'מקבצים', value: 'clusters' },
    { label: 'משימות', value: 'missions' }
  ];

  targetOptions = [
    { label: 'מכרה', value: 'Mine' },
    { label: 'מקבץ', value: 'Cluster' },
    { label: 'מקדח', value: 'Drill' },
    { label: 'משימת קידוח', value: 'DrillMission' }
  ];

  relationTypeOptions = [
    { label: 'לחלק מ-', value: 'some' },
    { label: 'לכולם', value: 'every' },
    { label: 'אף אחד', value: 'none' },
    { label: 'הוא', value: 'is' },
    { label: 'הוא לא', value: 'isNot' }
  ];

  countOpOptions = [
    { label: '=', value: 'eq' },
    { label: '>', value: 'gt' },
    { label: '>=', value: 'gte' },
    { label: '<', value: 'lt' },
    { label: '<=', value: 'lte' }
  ];

  aggTypeOptions = [
    { label: 'כמות', value: 'count' },
    { label: 'סכום', value: 'sum' },
    { label: 'ממוצע', value: 'avg' },
    { label: 'מינימום', value: 'min' },
    { label: 'מקסימום', value: 'max' }
  ];

  getAvailableFields(target: string) {
    const common = [
      { label: 'שם', value: 'name', isRelation: false },
      { label: 'תאריך יצירה', value: 'createdAt', isRelation: false }
    ];
    
    switch (target) {
      case 'Mine':
        return [...common, { label: 'מקבצים', value: 'clusters', isRelation: true }, { label: 'משימות', value: 'missions', isRelation: true }];
      case 'Cluster':
        return [
          { label: 'סוג חומר', value: 'stone_type', isRelation: false },
          { label: 'כמות', value: 'quantity', isRelation: false },
          { label: 'מכרה', value: 'mine', isRelation: true },
          { label: 'משימות', value: 'missions', isRelation: true }
        ];
      case 'Drill':
        return [...common, { label: 'סוגי חומר נתמכים', value: 'supportedStoneTypes', isRelation: false }];
      case 'DrillMission':
        return [
          { label: 'תאריך', value: 'date', isRelation: false },
          { label: 'סוג חומר', value: 'stoneType', isRelation: false },
          { label: 'מכרה', value: 'mine', isRelation: true },
          { label: 'מקדח', value: 'drill', isRelation: true },
          { label: 'מקבץ', value: 'cluster', isRelation: true }
        ];
      default:
        return common;
    }
  }

  getAvailableOperators(field: string) {
    const numericFields = ['quantity', 'limit', 'totalCount'];
    const dateFields = ['date', 'createdAt', 'updatedAt'];
    
    if (numericFields.includes(field)) {
      return [
        { label: 'שווה ל-', value: 'equals' },
        { label: 'גדול מ-', value: 'gt' },
        { label: 'קטן מ-', value: 'lt' },
        { label: 'לפחות', value: 'gte' },
        { label: 'לכל היותר', value: 'lte' }
      ];
    }
    
    if (dateFields.includes(field)) {
      return [
        { label: 'אחרי', value: 'after' },
        { label: 'לפני', value: 'before' },
        { label: 'בשנת', value: 'year' },
        { label: 'בחודש', value: 'month' },
        { label: 'ביום', value: 'day' }
      ];
    }

    return [
      { label: 'מכיל', value: 'contains' },
      { label: 'שווה ל-', value: 'equals' },
      { label: 'מתחיל ב-', value: 'startsWith' },
      { label: 'מסתיים ב-', value: 'endsWith' }
    ];
  }

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

  isFieldFilter(value: any): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== 1) return false;
    const inner = value[keys[0]];
    return !!(inner && typeof inner === 'object' && 'operator' in inner && 'value' in inner);
  }

  isRelatedFilter(value: any): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if (keys.length !== 1) return false;
    const inner = value[keys[0]];
    return !!(inner && typeof inner === 'object' && 'query' in inner);
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

  removeCondition(parentArray: any[], index: number) {
    parentArray.splice(index, 1);
    this.notifyChange();
  }

  addCondition(parentArray: any[]) {
    parentArray.push({ 'name': { operator: 'contains', value: '' } });
    this.notifyChange();
  }

  notifyChange() {
    this.planChanged.emit();
    if (this.isRoot) {
      this.chatService.currentQueryPlan.set({ ...this.plan });
    }
  }

  onSubPlanChanged() {
    this.notifyChange();
  }

  startEditing(parent: any, key: string, index?: number) {
    this.editingField = { parent, key, index };
  }

  stopEditing() {
    this.editingField = null;
    this.notifyChange();
  }

  executeQuery() {
    if (this.isRoot && this.plan) {
      this.chatService.runPlan(this.plan);
    }
  }

  onTargetChange(event: any) {
    const newTarget = event.target.value;
    this.plan.target = newTarget;
    this.notifyChange();
  }

  toggleLogicOp(conditions: any, currentOp: string) {
    const newOp = currentOp === 'AND' ? 'OR' : 'AND';
    if (conditions[currentOp]) {
      conditions[newOp] = conditions[currentOp];
      delete conditions[currentOp];
      this.notifyChange();
    }
  }

  onFieldChange(parent: any, oldKey: string, event: any) {
    const newKey = event.target ? event.target.value : event.value;
    if (newKey && oldKey !== newKey) {
      parent[newKey] = parent[oldKey];
      delete parent[oldKey];
      this.notifyChange();
    }
  }

  isEditing(parent: any, key: string, index?: number): boolean {
    return this.editingField?.parent === parent && 
           this.editingField?.key === key && 
           this.editingField?.index === index;
  }

  getEntries(obj: any): { key: string, value: any }[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.entries(obj).map(([key, value]) => ({ key, value }));
  }

  getFieldKey(filter: any): string {
    return Object.keys(filter).find(k => k !== 'operator' && k !== 'value') || '';
  }

  getRelationTarget(field: string): string {
    const map: Record<string, string> = {
      'clusters': 'Cluster',
      'missions': 'DrillMission',
      'mine': 'Mine',
      'drill': 'Drill',
      'cluster': 'Cluster'
    };
    return map[field] || 'Mine';
  }

  updateFilterKey(parentArray: any[], index: number, event: any) {
    const newKey = event.target ? event.target.value : event.value;
    const filter = parentArray[index];
    const oldKey = this.getFieldKey(filter);
    
    if (newKey && oldKey !== newKey) {
      const fieldDef = this.getAvailableFields(this.plan.target).find(f => f.value === newKey);
      
      if (fieldDef && (fieldDef as any).isRelation) {
        // Switch to relation
        parentArray[index] = {
          [newKey]: {
            relationType: 'some',
            query: {
              target: this.getRelationTarget(newKey),
              conditions: { AND: [] }
            }
          }
        };
      } else {
        // Standard field filter
        const val = filter[oldKey];
        delete filter[oldKey];
        filter[newKey] = {
          operator: 'equals',
          value: ''
        };
      }
      this.notifyChange();
    }
  }

  hasConditions(conditions: any): boolean {
    return conditions && Object.keys(conditions).length > 0;
  }

  hasResults(plan: QueryPlan): boolean {
    return !!(plan.totalCount || (plan.aggregationResults && Object.keys(plan.aggregationResults).length > 0));
  }

  isArray(val: any): boolean {
    return Array.isArray(val);
  }

  isWhereClause(val: any): boolean {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
    return Object.keys(val).some(key => this.isLogicGroup(key));
  }
}
