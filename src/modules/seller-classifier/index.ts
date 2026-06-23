import { AnthropicSellerClassifierClient, AnthropicSellerClassifierClientOptions } from "./anthropicClient";
import { SellerClassifier } from "./SellerClassifier";
import { SellerClassifierOptions } from "./types";

export { AnthropicSellerClassifierClient } from "./anthropicClient";
export { SellerClassifier } from "./SellerClassifier";
export { analyzeSellerHeuristics } from "./heuristics";
export { buildSellerClassifierPrompt } from "./promptBuilder";
export { parseSellerClassifierResponse } from "./responseParser";
export type {
  HeuristicAnalysis,
  HeuristicSignal,
  LanguageModelClient,
  SellerClassificationResult,
  SellerClassifierInput,
  SellerClassifierOptions,
  SellerClassifierPrompt,
  SellerType,
} from "./types";

export function createAnthropicSellerClassifier(
  options: SellerClassifierOptions & AnthropicSellerClassifierClientOptions = {},
): SellerClassifier {
  const client = new AnthropicSellerClassifierClient({
    apiKey: options.apiKey,
    model: options.model,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    retryAttempts: options.retryAttempts,
    retryBaseDelayMs: options.retryBaseDelayMs,
  });

  return new SellerClassifier(client, options);
}
