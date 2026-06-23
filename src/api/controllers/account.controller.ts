import { NextFunction, Response } from "express";
import { AccountService } from "../services/account.service";
import { ApiError } from "../errors/api.error";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";

export const getAccounts = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.userId;
  if (!userId) return next(new ApiError(401, "Authentication required"));
  res.status(200).send(await AccountService.getAllAccounts(userId));
};

export const createAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { login, password, name } = req.body;
  const userId = req.userId;

  if (!userId) return next(new ApiError(401, "Authentication required"));
  if (!login) return next(new ApiError(400, "Missing field: login"));
  if (!password) return next(new ApiError(400, "Missing field: password"));

  res.status(200).send(await AccountService.createAccount(login, password, userId, name));
};

export const deleteAccount = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const userId = req.userId;
  if (!id) return next(new ApiError(400, "Missing field: id"));
  if (!userId) return next(new ApiError(401, "Authentication required"));
  const ok = await AccountService.deleteAccountById(Number(id), userId);
  if (!ok) return next(new ApiError(404, "Account not found"));
  res.status(200).json({ success: true, id: Number(id) });
};
