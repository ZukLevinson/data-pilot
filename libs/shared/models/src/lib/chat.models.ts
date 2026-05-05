export type MessageSender = 'user' | 'bot' | 'system';

export interface ChatMessage {
  id: number;
  text: string;
  thought?: string;
  sender: MessageSender;
  timestamp: Date;
  isError?: boolean;
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
  data: string;
}

export interface AppConfig {
  modelName: string;
  embeddingModel: string;
}

export interface EntitySearchResult {
  id: string;
  content: string;
  type: string;
  distance: number;
}
