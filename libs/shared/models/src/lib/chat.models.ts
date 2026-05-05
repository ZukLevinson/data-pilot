export type MessageSender = 'user' | 'bot' | 'system';

export interface ChatMessage {
  id: number;
  text: string;
  thought?: string;
  sender: MessageSender;
  timestamp: Date;
  isError?: boolean;
  sources?: EntitySearchResult[];
  status?: string;
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
