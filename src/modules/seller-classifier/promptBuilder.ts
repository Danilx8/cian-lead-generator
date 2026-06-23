import { HeuristicAnalysis, SellerClassifierInput, SellerClassifierPrompt } from "./types";

function safeValue(value?: string | null): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : "не указано";
}

function formatHeuristicSummary(heuristics: HeuristicAnalysis): string {
  if (heuristics.signals.length === 0) {
    return "Эвристические признаки агента не обнаружены.";
  }

  return heuristics.signals
    .map(signal => `- ${signal.field}: ${signal.description}; маркер: "${signal.marker}"; вес: ${signal.weight}`)
    .join("\n");
}

export function buildSellerClassifierPrompt(
  input: SellerClassifierInput,
  heuristics: HeuristicAnalysis,
): SellerClassifierPrompt {
  const system = `Ты эксперт по классификации объявлений недвижимости.

Определи, кто разместил объявление: собственник или агент/агентство.

Собственник обычно пишет от первого лица, подчёркивает "без комиссии", "без посредников", "я собственник".
Агент или агентство часто использует слова "агентство", "риелтор", "АН", "комиссия", "сопровождение сделки",
имеет корпоративное имя автора или корпоративный домен электронной почты.

Верни только валидный JSON без markdown и пояснений вне JSON:
{
  "seller_type": "owner" | "agent",
  "confidence": число от 0 до 1,
  "reasoning": "краткое объяснение на русском"
}

Примеры:
Вход: "Продаю свою квартиру, я собственник, без комиссии"
Ответ: {"seller_type":"owner","confidence":0.93,"reasoning":"Автор прямо указывает, что он собственник, и пишет без комиссии."}

Вход: "АН Город, юридическое сопровождение сделки, комиссия обсуждается"
Ответ: {"seller_type":"agent","confidence":0.96,"reasoning":"Есть признаки агентства: АН, сопровождение сделки и упоминание комиссии."}

Если данных мало, выбери наиболее вероятный тип и снизь confidence.`;

  const user = `Проанализируй объявление.

listing_id: ${safeValue(input.listing_id)}
title: ${safeValue(input.title)}
description: ${safeValue(input.description)}
author_name: ${safeValue(input.author_name)}
phone: ${safeValue(input.phone)}
email: ${safeValue(input.email)}

Эвристический анализ:
score: ${heuristics.score}
confidence: ${heuristics.confidence}
signals:
${formatHeuristicSummary(heuristics)}`;

  return { system, user };
}
