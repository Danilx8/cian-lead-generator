import crypto from "node:crypto";
import "../../database/associations";
import { logger } from "../../config";
import Category from "../../database/category.model";
import Dialog from "../../database/dialog.model";
import Item from "../../database/item.model";
import Merchant, { MerchantType } from "../../database/merchant.model";
import Message from "../../database/message.model";
import { MessageService } from "./message.service";
import { TemplateService } from "./template.service";
import { prepareMessage } from "../utils/prepare.message";
import type { ITemplateItem } from "../../database/template.model";

const MOCK_ITEM_AVITO_PREFIX = "mock-seed-dialog";
const MOCK_DIALOGS_PER_USER = 2;
/** Пауза между исходящими сообщениями пользователя (мс). Ответ продавца ставится сразу после каждого. */
const MOCK_USER_MESSAGE_GAP_MS = 30_000;

/** Читается при каждом /start (не только при старте процесса). */
function isMockSeedEnabledForWorkerStart(): boolean {
  const raw = (process.env.SEED_MOCK_DIALOGS || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return (process.env.NODE_ENV || "development") !== "production";
}

function mockItemCianId(userId: number, slot: number): string {
  return `${MOCK_ITEM_AVITO_PREFIX}-u${userId}-s${slot}`;
}

function uniqueIncomingSuffix(): string {
  return ` \u2060#${crypto.randomBytes(6).toString("hex")}`;
}

/** Все непустые тексты шаблонов пользователя по порядку записей и полей texts[]. */
async function buildOrderedUserMessageTexts(userId: number): Promise<string[]> {
  const pushTexts = (collector: string[], item: ITemplateItem) => {
    for (const text of item.texts || []) {
      if (typeof text === "string" && text.trim()) collector.push(text);
    }
  };

  const ordered: string[] = [];
  for (const t of await TemplateService.getUserTemplates(userId)) {
    pushTexts(ordered, t);
  }
  if (ordered.length === 0) {
    return ["Здравствуйте, {{seller_name}}! Интересует {{product_name}}."];
  }
  return ordered;
}

async function appendIncoming(dialogId: number, text: string, createdAt: Date): Promise<void> {
  await Message.create({
    dialogId,
    isSentByUser: false,
    isRead: false,
    text: text + uniqueIncomingSuffix(),
    createdAt,
    updatedAt: createdAt
  });
}

async function appendUserFromTemplate(
  rawText: string,
  dialogId: number,
  userId: number,
  seller: Merchant,
  item: Item,
  createdAt: Date
): Promise<void> {
  const prepared = await prepareMessage(rawText, seller, item, userId);
  await MessageService.createMessageFromUserMessageData({ text: prepared }, dialogId, { createdAt });
}

/** Ответы продавца/арендодателя (собеседника) — тематика недвижимости, аренда и покупка. */
function sellerReplyLine(itemName: string, sellerName: string, turnIndex: number): string {
  const lines = [
    `Здравствуйте! По объявлению «${itemName}» объект ещё доступен. Я ${sellerName}, уточню интерес — рассматриваете аренду или покупку?`,
    `Спасибо за сообщение. Площадь, этаж и правоустанавливающие документы соответствуют тексту объявления. Когда удобно обсудить условия сделки или договора найма?`,
    `Понял. Могу согласовать показ квартиры / жилого помещения или выслать актуальные фото и выписку из ЕГРН — как вам комфортнее.`,
    `По аренде: залог, коммунальные и сроки — как в объявлении; при покупке готовы обсудить цену и форму расчёта (наличные / ипотека).`,
    `Хорошо, зафиксировали ваш запрос. Напишите, если нужна бронь на просмотр или резерв до подписания договора аренды / задатка по купле-продаже.`,
    `Юридически объект чистый, обременений не заявлено. Если планируете ипотеку — подскажу, с какими банками уже согласовывали сделки по этому дому.`,
    `По срокам: заселение при аренде или передача ключей при покупке — ориентируемся на ваш график, главное заранее предупредите.`,
    `Спасибо за интерес к недвижимости. Если появятся вопросы по КУ, коммуналке или соседям — пишите, ${sellerName} на связи.`
  ];
  return lines[turnIndex % lines.length];
}

async function removeMockSlotIfExists(userId: number, slot: number): Promise<void> {
  const cianId = mockItemCianId(userId, slot);
  const item = await Item.findOne({ where: { cianId } });
  if (!item) return;

  const dialogs = await Dialog.findAll({
    where: { itemId: item.id },
    paranoid: false
  });
  for (const d of dialogs) {
    await Message.destroy({ where: { dialogId: d.id }, force: true });
    await d.destroy({ force: true });
  }
  const merchantId = item.merchantId;
  await item.destroy({ force: true });
  await Merchant.destroy({ where: { id: merchantId }, force: true });
}

async function ensureMockDialogForUserSlot(
  userId: number,
  slot: number,
  categoryId: number,
  userMessageTexts: string[]
): Promise<void> {
  await removeMockSlotIfExists(userId, slot);

  const cianId = mockItemCianId(userId, slot);
  const merchantCianId = `mock-seed-merchant-u${userId}-s${slot}-${crypto.randomBytes(4).toString("hex")}`;
  const seller = await Merchant.create({
    name: `Продавец (демо ${slot})`,
    cianId: merchantCianId,
    type: MerchantType.PRIVATE
  });

  const itemName = `Демо‑товар ${slot} для переписок`;
  const item = await Item.create({
    cianId,
    name: itemName,
    price: 1500 * slot + 500,
    categoryId,
    merchantId: seller.id
  });

  const dialog = await Dialog.create({
    userId,
    itemId: item.id,
    isActive: true,
    isAutomatic: false
  });

  const n = userMessageTexts.length;
  const threadStartMs = Date.now() - n * MOCK_USER_MESSAGE_GAP_MS;

  for (let i = 0; i < n; i++) {
    const userAt = new Date(threadStartMs + i * MOCK_USER_MESSAGE_GAP_MS);
    await appendUserFromTemplate(userMessageTexts[i], dialog.id, userId, seller, item, userAt);
    const partnerAt = new Date(userAt.getTime() + 1);
    await appendIncoming(dialog.id, sellerReplyLine(itemName, seller.name, i), partnerAt);
  }
}

/**
 * Демо‑диалоги: пользователь (покупатель) пишет первым, подряд все тексты из всех шаблонов;
 * между его сообщениями 30 с, ответ продавца сразу после каждого;
 * собеседник — продавец по объявлению, ответы генерируются.
 * Включение: SEED_MOCK_DIALOGS=1|true|yes|on, выключение: 0|false|no|off; если не задано — как в NODE_ENV (в production по умолчанию выкл.).
 * Вызывается с POST /api/worker/start.
 */
export async function seedMockDialogsForUser(userId: number): Promise<void> {
  if (!isMockSeedEnabledForWorkerStart()) {
    return;
  }

  try {
    const category = await Category.findOne({ order: [["id", "ASC"]] });
    if (!category) {
      logger.warn("Mock dialogs: нет категорий в БД, пропуск сидирования");
      return;
    }

    const userMessageTexts = await buildOrderedUserMessageTexts(userId);
    if (!userMessageTexts.length) {
      return;
    }

    for (let slot = 1; slot <= MOCK_DIALOGS_PER_USER; slot++) {
      await ensureMockDialogForUserSlot(userId, slot, category.id, userMessageTexts);
    }

    logger.info(`Mock dialogs: демо‑переписки для user ${userId} созданы заново (${MOCK_DIALOGS_PER_USER} диалога)`);
  } catch (error) {
    logger.error(`Mock dialogs: ошибка сидирования для user ${userId}`, error);
  }
}
