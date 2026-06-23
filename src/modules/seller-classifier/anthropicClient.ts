import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { LanguageModelClient, SellerClassifierPrompt } from "./types";
import { withRetry } from "./retry";

export interface AnthropicSellerClassifierClientOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
}

function isRetryableAnthropicError(error: unknown): boolean {
  if (
    error instanceof RateLimitError ||
    error instanceof InternalServerError ||
    error instanceof APIConnectionError ||
    error instanceof APIConnectionTimeoutError
  ) {
    return true;
  }

  return error instanceof APIError && error.status != null && error.status >= 500;
}

export class AnthropicSellerClassifierClient implements LanguageModelClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: AnthropicSellerClassifierClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? process.env.SELLER_CLASSIFIER_MODEL ?? "claude-sonnet-4-5-20250929";
    this.maxTokens = options.maxTokens ?? 700;
    this.temperature = options.temperature ?? 0;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
  }

  async classify(prompt: SellerClassifierPrompt): Promise<string> {
    return withRetry(
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        });

        const textBlocks = response.content
          .filter(block => block.type === "text")
          .map(block => block.text)
          .join("\n")
          .trim();

        if (!textBlocks) {
          throw new Error("Anthropic response does not contain text content");
        }

        return textBlocks;
      },
      this.retryAttempts,
      this.retryBaseDelayMs,
      isRetryableAnthropicError,
    );
  }
}
