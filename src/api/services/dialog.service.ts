import Dialog from "../../database/dialog.model";
import { MerchantMessageData, RedisService, UserMessageData } from "./redis.service";
import Item from "../../database/item.model";
import User, { AngebotOption } from "../../database/user.model";
import Worker from "../../database/worker.model";
import Merchant from "../../database/merchant.model";
import Message from "../../database/message.model";
import UserService from "./user.service";
import "../../database/associations";
import { DialogBox } from "../controllers/dialog.controller";
import { ItemsService } from "./items.service";
import { MessageService } from "./message.service";
import WorkerService from "./worker.service";
import { TemplateService } from "./template.service";
import { prepareMessage } from "../utils/prepare.message";
import { sequelize } from "../../database/database";
import { Op, QueryTypes } from "sequelize";

export class DialogService {
  public static async getDialogsByUserId(userId: number, page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;

    const dialogs = await Dialog.findAndCountAll({
      where: { userId },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Item,
          as: "item",
          include: [{ model: Merchant, as: "merchant" }]
        },
        { model: User, as: "user" }
      ],
      paranoid: false
    });

    if (dialogs.count === 0) return [];

    const dialogIds = dialogs.rows.map(d => d.id);

    const lastMessages = await Message.findAll({
      where: {
        id: {
          [Op.in]: sequelize.literal(`(
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY "dialogId" ORDER BY "createdAt" DESC) as rn
          FROM "messages"
          WHERE "dialogId" IN (${dialogIds.join(",")})
        ) sub WHERE rn = 1
      )`)
        }
      },
      attributes: ["dialogId", "text", "isSentByUser", "updatedAt"]
    });

    const unreadCounts = await Message.findAll({
      where: {
        dialogId: dialogIds,
        isSentByUser: false,
        isRead: false
      },
      attributes: [
        "dialogId",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"]
      ],
      group: ["dialogId"]
    });

    const lastMessagesMap = new Map(lastMessages.map(m => [m.dialogId, m]));
    const unreadCountsMap = new Map(unreadCounts.map(c => [c.dialogId, c.get("count")]));

    return dialogs.rows.map(dialog => ({
      id: dialog.id,
      title: dialog.item?.name,
      cianId: dialog.item?.cianId,
      merchantName: dialog.item?.merchant?.name || "Unknown",
      lastMessage: lastMessagesMap.get(dialog.id)?.text || "",
      price: dialog.item?.price,
      newMessagesAmount: unreadCountsMap.get(dialog.id) || 0,
      dialogImage: dialog.item?.merchant?.profilePicture || "",
      isLastByUser: lastMessagesMap.get(dialog.id)?.isSentByUser || false,
      isActive: dialog.isActive,
      isDeleted: dialog.isSoftDeleted(),
      updatedAt: lastMessagesMap.get(dialog.id)?.updatedAt || dialog.updatedAt,
      isAutomatic: dialog.isAutomatic,
      workerId: dialog.workerId
    }));
  }

  public static async searchDialogs(userId: number, searchText: string, page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;
    const searchPattern = `%${searchText}%`;

    const dialogsWithScore = await sequelize.query(`
        SELECT DISTINCT ON (d.id)
            d.id,
            d."userId",
            d."itemId",
            d."workerId",
            d."isActive",
            d."isAutomatic",
            d."createdAt",
            d."updatedAt",
            d."deletedAt",
            CASE
            WHEN i.name ILIKE :searchPattern THEN 1
            WHEN m.name ILIKE :searchPattern THEN 2
            ELSE 3
        END as search_priority
      FROM dialogs d
      INNER JOIN items i ON d."itemId" = i.id
      LEFT JOIN merchants m ON i."merchantId" = m.id
      LEFT JOIN messages msg ON d.id = msg."dialogId"
      WHERE d."userId" = :userId
        AND (
          i.name ILIKE :searchPattern
          OR m.name ILIKE :searchPattern
          OR msg.text ILIKE :searchPattern
        )
      ORDER BY d.id, search_priority, d."createdAt" DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { userId, searchPattern, limit, offset },
      type: QueryTypes.SELECT
    }) as any[];

    if (dialogsWithScore.length === 0) return [];

    const dialogIds = dialogsWithScore.map((d: any) => d.id);

    const dialogs = await Dialog.findAll({
      where: { id: dialogIds },
      include: [
        {
          model: Item,
          as: "item",
          include: [{ model: Merchant, as: "merchant" }]
        },
        { model: User, as: "user" }
      ],
      paranoid: false
    });

    const lastMessages = await Message.findAll({
      where: {
        id: {
          [Op.in]: sequelize.literal(`(
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY "dialogId" ORDER BY "createdAt" DESC) as rn
              FROM "messages"
              WHERE "dialogId" IN (${dialogIds.join(",")})
            ) sub WHERE rn = 1
          )`)
        }
      },
      attributes: ["dialogId", "text", "isSentByUser", "updatedAt"]
    });

    const unreadCounts = await Message.findAll({
      where: {
        dialogId: dialogIds,
        isSentByUser: false,
        isRead: false
      },
      attributes: [
        "dialogId",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"]
      ],
      group: ["dialogId"]
    });

    const lastMessagesMap = new Map(lastMessages.map(m => [m.dialogId, m]));
    const unreadCountsMap = new Map(unreadCounts.map(c => [c.dialogId, c.get("count")]));
    const dialogsMap = new Map(dialogs.map(d => [d.id, d]));
    const scoresMap = new Map(dialogsWithScore.map((d: any) => [d.id, d.search_priority]));

    return dialogIds
      .map(id => dialogsMap.get(id))
      .filter(dialog => dialog !== undefined)
      .sort((a, b) => {
        const scoreA = scoresMap.get(a!.id) || 999;
        const scoreB = scoresMap.get(b!.id) || 999;
        return scoreA - scoreB;
      })
      .map(dialog => ({
        id: dialog!.id,
        title: dialog!.item?.name,
        cianId: dialog!.item?.cianId,
        merchantName: dialog!.item?.merchant?.name || "Unknown",
        lastMessage: lastMessagesMap.get(dialog!.id)?.text || "",
        price: dialog!.item?.price,
        newMessagesAmount: unreadCountsMap.get(dialog!.id) || 0,
        dialogImage: dialog!.item?.merchant?.profilePicture || "",
        isLastByUser: lastMessagesMap.get(dialog!.id)?.isSentByUser || false,
        isActive: dialog!.isActive,
        isDeleted: dialog!.isSoftDeleted(),
        updatedAt: lastMessagesMap.get(dialog!.id)?.updatedAt || dialog!.updatedAt,
        isAutomatic: dialog!.isAutomatic,
        workerId: dialog!.workerId
      }));
  }

  public static async getDialogById(id: number) {
    return await Dialog.findOne({ where: { id } });
  }

  public static async getAllDialogsMessages(dialogId: number) {
    const messages = await Message.findAll({ where: { dialogId } });
    messages.map(async message => {
      if (!message.isSentByUser) {
        message.isRead = true;
        await message.save({ silent: true });
      }
    });
    return messages;
  }

  public static async createDialog(item: Item, worker: Worker) {
    const user = await UserService.getUserById(worker.userId);
    if (!user) throw new Error(`User for worker ${worker.id} not found`);
    return await Dialog.create({
      isActive: true,
      itemId: item.id,
      userId: user.id,
      workerId: worker.id
    });
  }

  public static async sendMessageToDialog(dialog: Dialog, message: UserMessageData) {
    const item = await ItemsService.getById(dialog.itemId);
    if (!item) throw new Error(`Item with id ${dialog.itemId} not found`);
    if (!dialog.workerId) throw new Error(`Worker is not found for dialog ${dialog.id}`);
    const merchant = await Merchant.findByPk(item.merchantId);
    if (!merchant) throw new Error(`Couldn't find merchant data for item ${item.id}`);

    const messageModel = await MessageService.createMessageFromUserMessageData(message, dialog.id);
    messageModel.text = await prepareMessage(messageModel.text, merchant, item, dialog.userId);

    await RedisService.SendMessageToWorker(dialog.workerId, item.name, messageModel);
    return messageModel;
  }

  public static async createDialogOnUserMessage(workerId: number, userId: number, item: Item) {
    const worker = await WorkerService.getWorker(workerId);
    if (!worker) throw new Error(`Worker ${workerId} not found`);

    const user = await UserService.getUserById(userId);
    if (!user) throw new Error(`User ${userId} not found`);

    const dialog = await this.createDialog(item, worker);

    const merchant = await Merchant.findByPk(item.merchantId);
    if (!merchant) throw new Error(`Merchant not found for item ${item.id}`);

    const template = await TemplateService.getTemplate(user.id, 0);
    if (!template) throw new Error(`Template for user ${user.id} not found`);

    const templateIndex = await RedisService.getTemplateIndexForItem(item.id);
    const modifiedText = await prepareMessage(template.texts[templateIndex], merchant, item, userId);

    const firstMessageOption = user.sendWithAngebot;
    const messageMap: Record<number, string[]> = {
      [AngebotOption.NONE]: [modifiedText],
      [AngebotOption.NO_CANCEL_NO_WRITE]: ["Отправлено предложение"],
      [AngebotOption.NO_CANCEL_YES_WRITE]: ["Отправлено предложение"],
      [AngebotOption.YES_CANCEL_NO_WRITE]: ["Отправлено предложение", "Предложение отменено"],
      [AngebotOption.YES_CANCEL_YES_WRITE]: ["Отправлено предложение", "Предложение отменено"]
    };

    const texts = messageMap[firstMessageOption] || [modifiedText];
    for (const text of texts) await MessageService.createMessageFromUserMessageData({ text }, dialog.id);
    return dialog;
  }

  public static async createOrFindDialogFromWorkerMessageData(data: MerchantMessageData) {
    const item = await Item.findOne({ where: { cianId: data.itemId } });
    if (!item) throw new Error(`Can't find item with cian id: ${data.itemId}`);

    const dialog = await Dialog.findOne({ where: { itemId: item.id } });
    if (!dialog) {
      const worker = await Worker.findByPk(data.workerId);
      if (!worker) throw new Error(`Can't find worker ${data.workerId}`);
      const user = await User.findByPk(worker.userId);
      if (!user) throw new Error(`Can't find user for worker: ${data.workerId}`);

      return Dialog.create({
        workerId: data.workerId,
        isActive: true,
        userId: user.id,
        itemId: item.id
      });
    }
    return dialog;
  }

  public static async formDialogBox(dialog: Dialog): Promise<DialogBox> {
    const item = await ItemsService.getById(dialog.itemId);
    if (!item) throw new Error(`Can't find item associated with dialog: ${dialog.id}`);

    const merchant = await Merchant.findByPk(item.merchantId);
    if (!merchant) throw new Error(`Can't find merchant for item: ${item.id}`);

    const lastMessage = await MessageService.getLastMessageInDialog(dialog.id);
    let date = lastMessage?.updatedAt;
    if (!date) date = new Date();

    const formattedDate = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

    const newMessagesAmount = await MessageService.countUnreadMessagesInDialog(dialog.id);

    return {
      id: dialog.id,
      title: item.name,
      cianId: item.cianId,
      merchantName: merchant.name,
      lastMessage: lastMessage?.text ?? "",
      price: item.price,
      newMessagesAmount: newMessagesAmount,
      dialogImage: merchant.profilePicture ?? "",
      isLastByUser: lastMessage?.isSentByUser ?? false,
      isActive: dialog.isActive,
      isDeleted: dialog.isSoftDeleted(),
      updatedAt: formattedDate,
      isAutomatic: dialog.isAutomatic,
      workerId: dialog.workerId
    };
  }

  public static async shutdownDialogsForWorker(workerId: number) {
    await Dialog.update({ isActive: false }, { where: { workerId } });
  }

  public static async deleteDialogs(dialogIds: number[]) {
    await Dialog.destroy({ where: { id: dialogIds } });
    await Message.destroy({ where: { dialogId: dialogIds } });
  }
}
