import { analyzeSellerHeuristics } from "./heuristics";
import { buildSellerClassifierPrompt } from "./promptBuilder";
import { parseSellerClassifierResponse } from "./responseParser";
import {
  HeuristicAnalysis,
  LanguageModelClient,
  SellerClassificationResult,
  SellerClassifierInput,
  SellerClassifierOptions,
} from "./types";

const DEFAULT_OPTIONS: Required<SellerClassifierOptions> = {
  agentShortcutConfidence: 0.9,
  agentOverrideConfidence: 0.65,
};

function summarizeSignals(heuristics: HeuristicAnalysis): string {
  if (heuristics.signals.length === 0) return "Эвристики не нашли сильных признаков агента.";

  return heuristics.signals.map(signal => `${signal.description} (${signal.marker})`).join("; ");
}

function fallbackUnknown(reasoning: string): SellerClassificationResult {
  return {
    seller_type: "unknown",
    confidence: 0,
    reasoning,
  };
}

export class SellerClassifier {
  private readonly modelClient: LanguageModelClient;
  private readonly options: Required<SellerClassifierOptions>;

  constructor(modelClient: LanguageModelClient, options: SellerClassifierOptions = {}) {
    this.modelClient = modelClient;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async classify(input: SellerClassifierInput): Promise<SellerClassificationResult> {
    const heuristics = analyzeSellerHeuristics(input);

    if (heuristics.confidence >= this.options.agentShortcutConfidence && heuristics.score > 0) {
      return {
        seller_type: "agent",
        confidence: heuristics.confidence,
        reasoning: `Решение принято эвристически без обращения к LLM: ${summarizeSignals(heuristics)}`,
      };
    }

    try {
      const prompt = buildSellerClassifierPrompt(input, heuristics);
      const rawResponse = await this.modelClient.classify(prompt);
      const modelResult = parseSellerClassifierResponse(rawResponse);

      return this.postProcess(modelResult, heuristics);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return fallbackUnknown(`Классификация не выполнена из-за ошибки языковой модели: ${message}`);
    }
  }

  private postProcess(
    modelResult: SellerClassificationResult,
    heuristics: HeuristicAnalysis,
  ): SellerClassificationResult {
    if (
      modelResult.seller_type === "owner" &&
      modelResult.confidence < this.options.agentOverrideConfidence &&
      heuristics.score >= this.options.agentOverrideConfidence
    ) {
      return {
        seller_type: "agent",
        confidence: this.options.agentOverrideConfidence,
        reasoning: `Результат скорректирован в пользу agent: модель дала owner с низкой уверенностью, но эвристики нашли агентские признаки. ${summarizeSignals(heuristics)}`,
      };
    }

    return modelResult;
  }
}
