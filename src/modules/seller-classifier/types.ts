export type SellerType = "owner" | "agent" | "unknown";

export interface SellerClassifierInput {
  listing_id: string;
  title?: string | null;
  description?: string | null;
  author_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface SellerClassificationResult {
  seller_type: SellerType;
  confidence: number;
  reasoning: string;
}

export interface HeuristicSignal {
  field: "author_name" | "description" | "title" | "email" | "phone";
  weight: number;
  marker: string;
  description: string;
}

export interface HeuristicAnalysis {
  score: number;
  confidence: number;
  signals: HeuristicSignal[];
  immediateAgent: boolean;
}

export interface SellerClassifierPrompt {
  system: string;
  user: string;
}

export interface LanguageModelClient {
  classify(prompt: SellerClassifierPrompt): Promise<string>;
}

export interface SellerClassifierOptions {
  agentShortcutConfidence?: number;
  agentOverrideConfidence?: number;
}
