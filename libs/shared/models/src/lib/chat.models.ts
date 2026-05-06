export type MessageSender = 'user' | 'bot' | 'system';

export interface QueryCondition {
  operator: 'contains' | 'notContains' | 'gt' | 'lt' | 'after' | 'before' | 'equals';
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

export interface QueryPlan {
  target: 'Mine' | 'Cluster' | 'Drill' | 'DrillMission';
  limit?: number;
  conditions?: Record<string, ConditionValue>;
  aggregations?: Aggregation[];
  generatedSql?: string;
  totalCount?: number;
  aggregationResults?: Record<string, number>;
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
