export type MessageSender = 'user' | 'bot' | 'system';

export interface QueryCondition {
  operator: 'contains' | 'notContains' | 'gt' | 'lt' | 'after' | 'before' | 'equals' | 'year' | 'month' | 'day';
  value: string | number | boolean;
}

export type ConditionValue = string | number | boolean | QueryCondition | RelationFilter;

export interface RelationFilter {
  some?: Record<string, ConditionValue>;
  every?: Record<string, ConditionValue>;
  none?: Record<string, ConditionValue>;
  is?: Record<string, ConditionValue>;
  minCount?: number;
}

export interface Aggregation {
  field: string;
  type: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
  type?: 'sum' | 'avg' | 'min' | 'max' | 'count'; // If ordering by aggregation
}

export interface QueryPlan {
  target: 'Mine' | 'Cluster' | 'Drill' | 'DrillMission';
  limit?: number;
  conditions?: Record<string, ConditionValue>;
  aggregations?: Aggregation[];
  groupBy?: string;
  orderBy?: OrderBy;
  generatedSql?: string;
  totalCount?: number;
  aggregationResults?: Record<string, number>;
  groupedResults?: { group: string; results: Record<string, number> }[];
  isStatsOnly?: boolean;
}

export interface SavedQuery {
  id: string;
  name: string;
  query: QueryPlan;
  sql: string;
  createdAt: string | Date;
}

export interface ChatMessage {
  id: number;
  text: string;
  thought?: string;
  sender: MessageSender;
  timestamp: Date;
  isError?: boolean;
  sources?: EntitySearchResult[];
  status?: string;
  queryPlan?: QueryPlan;
}

export interface ChatRequest {
  userId: string;
  question: string;
}

export interface ChatResponse {
  reply?: string;
  error?: string;
}

export interface ChatStreamChunk {
  content?: string;
  status?: string;
  sources?: EntitySearchResult[];
  mode?: 'replace' | 'append';
  queryPlan?: QueryPlan;
}

export interface AppConfig {
  modelName: string;
  embeddingModel: string;
}

export interface EntitySearchResult {
  id: string;
  name: string;
  content: string;
  type: string;
  color: string;
  distance: number;
  wkt?: string;
}
