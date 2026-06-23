import { HeuristicAnalysis, HeuristicSignal, SellerClassifierInput } from "./types";

const AGENT_NAME_MARKERS = [
  "агентство",
  "агенство",
  "риелтор",
  "риэлтор",
  "realtor",
  "real estate",
  "недвижимость",
  "ан ",
  " ан",
  "ооо",
  "ип ",
  "broker",
  "брокер",
];

const AGENT_TEXT_MARKERS = [
  "комиссия",
  "агентское вознаграждение",
  "услуги агентства",
  "показ в удобное время",
  "юридическое сопровождение",
  "сопровождение сделки",
  "база объектов",
  "подберем",
  "подберём",
  "поможем одобрить ипотеку",
];

const OWNER_TEXT_MARKERS = [
  "я собственник",
  "собственник",
  "без комиссии",
  "без посредников",
  "агентов не беспокоить",
  "риелторов не беспокоить",
  "риэлторов не беспокоить",
];

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "mail.ru",
  "yandex.ru",
  "ya.ru",
  "icloud.com",
  "bk.ru",
  "inbox.ru",
  "list.ru",
  "rambler.ru",
  "outlook.com",
  "hotmail.com",
]);

function normalize(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function addMarkerSignals(
  signals: HeuristicSignal[],
  field: HeuristicSignal["field"],
  value: string,
  markers: string[],
  weight: number,
  description: string,
) {
  for (const marker of markers) {
    if (value.includes(marker)) {
      signals.push({ field, marker, weight, description });
    }
  }
}

function getEmailDomain(email: string): string | undefined {
  const [, domain] = email.split("@");
  return domain?.trim().toLowerCase();
}

function hasRepeatingPhonePattern(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return false;

  return /(\d)\1{4,}/.test(digits) || /(000|111|222|333|444|555|666|777|888|999)/.test(digits);
}

export function analyzeSellerHeuristics(input: SellerClassifierInput): HeuristicAnalysis {
  const signals: HeuristicSignal[] = [];
  const authorName = normalize(input.author_name);
  const title = normalize(input.title);
  const description = normalize(input.description);
  const email = normalize(input.email);
  const phone = normalize(input.phone);

  addMarkerSignals(signals, "author_name", authorName, AGENT_NAME_MARKERS, 0.45, "Имя автора похоже на агента или агентство");
  addMarkerSignals(signals, "title", title, AGENT_TEXT_MARKERS, 0.2, "Заголовок содержит агентские формулировки");
  addMarkerSignals(signals, "description", description, AGENT_TEXT_MARKERS, 0.25, "Описание содержит агентские формулировки");
  addMarkerSignals(signals, "description", description, OWNER_TEXT_MARKERS, -0.2, "Описание содержит признаки собственника");

  const emailDomain = getEmailDomain(email);
  if (emailDomain && !PUBLIC_EMAIL_DOMAINS.has(emailDomain)) {
    signals.push({
      field: "email",
      marker: emailDomain,
      weight: 0.25,
      description: "Почта использует непубличный домен, что чаще встречается у агентств",
    });
  }

  if (hasRepeatingPhonePattern(phone)) {
    signals.push({
      field: "phone",
      marker: phone,
      weight: 0.1,
      description: "Номер телефона содержит легко запоминающийся повторяющийся паттерн",
    });
  }

  const score = Math.max(0, Math.min(1, signals.reduce((sum, signal) => sum + signal.weight, 0)));
  const confidence = Math.max(0.1, Math.min(0.95, score));

  return {
    score,
    confidence,
    signals,
    immediateAgent: confidence >= 0.9,
  };
}
