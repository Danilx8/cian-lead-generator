// analytics.service.ts
// Подсистема аналитики и отчётов (ВКР §1.6 L399, §1.7 L963-975): метрики собранных
// объявлений, распределение по типу продавца и воронка «лид → диалог → ответ продавца».
//
// Примечание: сущности «договор» в модели данных нет, поэтому конверсия считается до
// этапа ответа продавца (диалога). Метрика accuracy классификатора требует размеченной
// выборки (см. модуль seller-classifier) и здесь не вычисляется.
import Item from "../../database/item.model";
import Merchant, { MerchantType } from "../../database/merchant.model";
import Dialog from "../../database/dialog.model";
import Message from "../../database/message.model";

export interface AnalyticsSummary {
  scope: "global" | "user";
  userId?: number;
  items: { total: number };
  merchants: { total: number; private: number; commercial: number; privateShare: number };
  dialogs: { total: number; withSellerReply: number };
  messages: { total: number; fromUser: number; fromSeller: number };
  funnel: {
    leads: number; // собранные объявления (диалоги)
    replied: number; // диалоги с ответом продавца
    leadToReplyRate: number; // конверсия лид → ответ
  };
}

class AnalyticsServiceImpl {
  async getSummary(userId?: number): Promise<AnalyticsSummary> {
    const dialogWhere = userId !== undefined ? { userId } : {};

    // Объявления и продавцы — глобальные метрики базы.
    const [itemsTotal, merchantsTotal, merchantsPrivate, merchantsCommercial] = await Promise.all([
      Item.count(),
      Merchant.count(),
      Merchant.count({ where: { type: MerchantType.PRIVATE } }),
      Merchant.count({ where: { type: MerchantType.COMMERCIAL } }),
    ]);

    // Диалоги (опционально по пользователю).
    const dialogsTotal = await Dialog.count({ where: dialogWhere });

    // Идентификаторы диалогов в области видимости (для скоупа сообщений по пользователю).
    let dialogIds: number[] | undefined;
    if (userId !== undefined) {
      const rows = (await Dialog.findAll({
        where: dialogWhere,
        attributes: ["id"],
        raw: true,
      })) as unknown as Array<{ id: number }>;
      dialogIds = rows.map((r) => r.id);
    }
    const msgScope = dialogIds ? { dialogId: dialogIds } : {};

    const [messagesTotal, messagesFromUser] = await Promise.all([
      Message.count({ where: { ...msgScope } }),
      Message.count({ where: { ...msgScope, isSentByUser: true } }),
    ]);
    const messagesFromSeller = messagesTotal - messagesFromUser;

    // Диалоги, в которых есть хотя бы один ответ продавца (isSentByUser = false).
    const repliedRows = (await Message.findAll({
      where: { ...msgScope, isSentByUser: false },
      attributes: ["dialogId"],
      group: ["dialogId"],
      raw: true,
    })) as unknown as Array<{ dialogId: number }>;
    const dialogsWithReply = repliedRows.length;

    const round = (n: number) => Math.round(n * 1000) / 1000;

    return {
      scope: userId !== undefined ? "user" : "global",
      userId,
      items: { total: itemsTotal },
      merchants: {
        total: merchantsTotal,
        private: merchantsPrivate,
        commercial: merchantsCommercial,
        privateShare: merchantsTotal ? round(merchantsPrivate / merchantsTotal) : 0,
      },
      dialogs: { total: dialogsTotal, withSellerReply: dialogsWithReply },
      messages: { total: messagesTotal, fromUser: messagesFromUser, fromSeller: messagesFromSeller },
      funnel: {
        leads: dialogsTotal,
        replied: dialogsWithReply,
        leadToReplyRate: dialogsTotal ? round(dialogsWithReply / dialogsTotal) : 0,
      },
    };
  }

  /** Плоский отчёт «метрика;значение» для экспорта в CSV. */
  summaryToCsvRows(s: AnalyticsSummary): Array<[string, string | number]> {
    return [
      ["scope", s.scope],
      ["userId", s.userId ?? ""],
      ["items_total", s.items.total],
      ["merchants_total", s.merchants.total],
      ["merchants_private", s.merchants.private],
      ["merchants_commercial", s.merchants.commercial],
      ["merchants_private_share", s.merchants.privateShare],
      ["dialogs_total", s.dialogs.total],
      ["dialogs_with_seller_reply", s.dialogs.withSellerReply],
      ["messages_total", s.messages.total],
      ["messages_from_user", s.messages.fromUser],
      ["messages_from_seller", s.messages.fromSeller],
      ["funnel_leads", s.funnel.leads],
      ["funnel_replied", s.funnel.replied],
      ["funnel_lead_to_reply_rate", s.funnel.leadToReplyRate],
    ];
  }
}

export const AnalyticsService = new AnalyticsServiceImpl();
export default AnalyticsService;
