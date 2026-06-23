import { MerchantMessageData, UserMessageData } from "./redis.service";
import Message from "../../database/message.model";
import { DialogService } from "./dialog.service";

export class MessageService {
  public static async createMessageFromUserMessageData(
    data: UserMessageData,
    dialogId: number,
    opts?: { createdAt?: Date }
  ): Promise<Message> {
    const at = opts?.createdAt;
    return await Message.create({
      isRead: false,
      text: data.text,
      attachment: data.attachment,
      isSentByUser: true,
      dialogId: dialogId,
      ...(at ? { createdAt: at, updatedAt: at } : {})
    });
  }

  public static async registerMessageFromRedis(message: MerchantMessageData) {
    const dialog = await DialogService.createOrFindDialogFromWorkerMessageData(message);

    await Message.update(
      { isRead: true },
      {
        where: { dialogId: dialog.id, isSentByUser: true }
      });

    return await Message.create({
      isRead: false,
      isSentByUser: false,
      dialogId: dialog.id,
      text: message.payload.text,
      attachment: message.payload.attachment
    });
  }

  public static async getLastMessageInDialog(dialogId: number): Promise<Message | null> {
    return await Message.findOne({
      where: { dialogId },
      order: [["createdAt", "DESC"]]
    });
  }

  public static async countUnreadMessagesInDialog(dialogId: number): Promise<number> {
    return await Message.count({
      where: {
        isSentByUser: false,
        dialogId: dialogId,
        isRead: false
      }
    });
  }
}