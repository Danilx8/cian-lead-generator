// seller-classification.ts
// Тонкая обёртка вокруг модуля ИИ-классификации продавца (src/modules/seller-classifier).
// Подключает классификатор в конвейер парсинга (ВКР §1.2, §3.2): по тексту объявления и
// имени контакта определяет тип продавца (owner / agent), а распределитель пропускает к
// воркеру только объявления собственников.
//
// Поведение управляется окружением:
//   ANTHROPIC_API_KEY            — обязателен; без него классификация выключена (fallback на флаг ЦИАН)
//   SELLER_CLASSIFIER_ENABLED    — 0/false/no/off принудительно выключает классификацию
//   SELLER_CLASSIFIER_MODEL      — модель Claude (по умолчанию задаётся в anthropicClient)

import { ENV, logger } from "../../../config";
import {
  createAnthropicSellerClassifier,
  SellerClassificationResult,
  SellerClassifier,
} from "../../../modules/seller-classifier";
import type { ItemDto, MerchantDto } from "./parsing.types";

let classifier: SellerClassifier | null = null;
let initFailed = false;

function explicitlyDisabled(): boolean {
  const raw = (process.env.SELLER_CLASSIFIER_ENABLED || "").trim().toLowerCase();
  return ["0", "false", "no", "off"].includes(raw);
}

/** Включена ли ИИ-классификация продавца (есть ключ, не выключена явно, инициализация не падала). */
export function isSellerClassificationEnabled(): boolean {
  return !explicitlyDisabled() && !!ENV.ANTHROPIC_API_KEY && !initFailed;
}

function getClassifier(): SellerClassifier | null {
  if (!isSellerClassificationEnabled()) return null;
  if (classifier) return classifier;
  try {
    classifier = createAnthropicSellerClassifier({
      apiKey: ENV.ANTHROPIC_API_KEY,
      model: ENV.SELLER_CLASSIFIER_MODEL,
    });
    logger.info(
      `[seller-classifier] enabled (model=${ENV.SELLER_CLASSIFIER_MODEL ?? "default"})`,
    );
  } catch (e) {
    initFailed = true;
    logger.error(
      `[seller-classifier] init failed, falling back to CIAN flag: ${(e as Error).message}`,
    );
    return null;
  }
  return classifier;
}

/**
 * Классифицирует тип продавца объявления через ИИ-модуль.
 * Возвращает null, если классификация выключена/недоступна — вызывающий код тогда
 * должен использовать резервную эвристику (флаг ЦИАН ad_seller_type).
 * Внутренние ошибки LLM модуль обрабатывает сам, возвращая seller_type="unknown".
 */
export async function classifySeller(
  item: ItemDto,
  merchant: MerchantDto,
): Promise<SellerClassificationResult | null> {
  const c = getClassifier();
  if (!c) return null;

  return c.classify({
    listing_id: item.item_id,
    title: item.item_name,
    author_name: merchant.contactName || null,
  });
}
