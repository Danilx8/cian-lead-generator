import { SellerClassificationResult, SellerType } from "./types";

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isSellerType(value: unknown): value is Exclude<SellerType, "unknown"> {
  return value === "owner" || value === "agent";
}

function extractJson(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

  return undefined;
}

export function parseSellerClassifierResponse(raw: string): SellerClassificationResult {
  const json = extractJson(raw);

  if (!json) {
    return {
      seller_type: "unknown",
      confidence: 0,
      reasoning: "Ответ языковой модели не содержит JSON-структуру.",
    };
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const sellerType = parsed.seller_type;

    if (!isSellerType(sellerType)) {
      return {
        seller_type: "unknown",
        confidence: 0,
        reasoning: "Ответ языковой модели содержит некорректный seller_type.",
      };
    }

    return {
      seller_type: sellerType,
      confidence: clampConfidence(parsed.confidence),
      reasoning:
        typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
          ? parsed.reasoning.trim()
          : "Модель не вернула текстовое обоснование.",
    };
  } catch {
    return {
      seller_type: "unknown",
      confidence: 0,
      reasoning: "Не удалось разобрать JSON-ответ языковой модели.",
    };
  }
}
