export type Settings = {
  apiKey: string;
  model: string;
  vectorStoreId: string;
};

export type KnowledgeFile = {
  id: string;
  filename: string;
  bytes: number;
  status: string;
  created_at: number;
  metadata?: Record<string, string>;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
};
