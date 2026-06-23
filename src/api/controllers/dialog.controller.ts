import { StatusChangeData } from "../services/redis.service";
import WorkerService from "../services/worker.service";
import { NextFunction, Response } from "express";
import { DialogService } from "../services/dialog.service";
import { ApiError } from "../errors/api.error";
import { ItemsService } from "../services/items.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { WorkerState } from "../../database/worker.model";

export interface DialogBox {
  id: number;
  title: string;
  cianId: string;
  merchantName: string;
  lastMessage: string;
  price?: number;
  newMessagesAmount: number;
  dialogImage: string;
  isLastByUser: boolean;
  isActive: boolean;
  isAutomatic: boolean;
  isDeleted: boolean;
  updatedAt: string;
  workerId?: number;
}

export interface MerchantMessageBox {
  id: number;
  dialogId: number;
  text: string;
  attachment?: string;
  sentAt: Date;
  itemName: string;
  merchantName: string;
  price: number;
  itemImage?: string;
  isSentByUser: boolean;
}

export interface StatusChangeBox extends StatusChangeData {
}

export const sendMessage = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { dialogId } = req.params;
  const { messageData } = req.body;
  const userId = req.userId;

  if (!dialogId || !messageData) return next(new ApiError(400, "Not all fields are filled"));

  const dialog = await DialogService.getDialogById(Number(dialogId));
  if (!dialog) return next(new ApiError(400, "Dialog not found"));
  if (dialog.userId != userId) return next(new ApiError(403, "Dialog doesn't belong to given user"));
  if (!dialog.workerId) return next(new ApiError(400, "You can't message this user anymore"));

  const worker = await WorkerService.getWorker(dialog.workerId);
  if (!worker) return next(new ApiError(417, `Couldn't find worker for dialog: ${dialog.id}`));
  if (worker.status !== WorkerState.ACTIVE) return next(new ApiError(400, `Worker ${worker.id} is not active, its status: ${worker.status?.toString()}`));

  const item = await ItemsService.getById(dialog.itemId);
  if (!item) return next(new ApiError(417, "Item not found"));

  res.status(200).send(await DialogService.sendMessageToDialog(dialog, messageData));
};

export const listDialogMessages = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { dialogId } = req.params;
  if (!dialogId) return next(new ApiError(400, "DialogId is required"));
  res.status(200).send(await DialogService.getAllDialogsMessages(Number(dialogId)));
};

export const getAllDialogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const dialogs = await DialogService.getDialogsByUserId(req.userId!, page, limit);
  res.status(200).send(dialogs);
};

export const changeDialogMode = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { dialogId } = req.params;
  const { isAutomatic } = req.body;
  const dialog = await DialogService.getDialogById(Number(dialogId));
  if (!dialog) throw new ApiError(400, "Dialog not found");

  dialog.isAutomatic = isAutomatic;
  await dialog.save();
  res.status(200).send(dialog);
};

export const deleteDialogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { dialogIds } = req.body;
  if (!dialogIds || !Array.isArray(dialogIds) || dialogIds.length === 0) {
    return next(new ApiError(400, "DialogIds array missing or empty"));
  }
  await DialogService.deleteDialogs(dialogIds.map(Number));
  res.status(200).send({ success: true });
};

export const searchDialogs = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const searchText = req.query.q as string;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  if (!searchText || searchText.trim().length === 0) {
    return next(new ApiError(400, "Search text is required"));
  }
  const dialogs = await DialogService.searchDialogs(req.userId!, searchText.trim(), page, limit);
  res.status(200).send(dialogs);
};
