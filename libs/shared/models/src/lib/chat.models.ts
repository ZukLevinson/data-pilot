export type MessageSender = 'user' | 'bot' | 'system';

export type LogicalOperator = 'AND' | 'OR' | 'NOT';

export interface FieldFilter {
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'notIn' | 'after' | 'before' | 'year' | 'month' | 'day' | 'equals';
  value: unknown;
}

export interface RelatedQueryFilter {
  query: QueryPlan;
  relationType?: 'some' | 'every' | 'none' | 'is' | 'isNot';
  having?: {
    field: string; // '*' for count
    type: 'count' | 'sum' | 'avg' | 'min' | 'max';
    operator: 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'equals';
    value: number;
  };
}

export type WhereClauseValue = FieldFilter | RelatedQueryFilter | unknown;

export interface Aggregation {
  field: string;
  type: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
  type?: 'sum' | 'avg' | 'min' | 'max' | 'count'; // If ordering by aggregation
}

export interface WhereClause {
  AND?: WhereClause[];
  OR?: WhereClause[];
  NOT?: WhereClause;
  [field: string]: WhereClauseValue | WhereClause[] | WhereClause | undefined;
}

export interface QueryPlan {
  target: string;
  conditions: {
    AND?: WhereClause[];
    OR?: WhereClause[];
    NOT?: WhereClause;
  };
  limit?: number;
  aggregations?: Aggregation[];
  groupBy?: string[];
  orderBy?: OrderBy[];
  
  // Metadata and results
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
  contextQueryPlan?: QueryPlan;
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

export interface HealthStatus {
  database: 'online' | 'offline';
  llm: 'online' | 'offline';
}

export interface AppConfig {
  modelName: string;
  embeddingModel: string;
  health: HealthStatus;
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
