import { Request, Response, NextFunction } from "express";
import UserService from "../services/user.service";
import { ApiError } from "../errors/api.error";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { isAdminRequest } from "../middlewares/admin.middleware";

const handleGetUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
  serviceFn: (id: number) => Promise<any>
) => {
  try {
    const { id } = req.params;
    if (!id) return next(new ApiError(400, "Missing field: id"));
    const user = await serviceFn(Number(id));
    if (!user) return next(new ApiError(404, "User not found"));
    const userData = user.get ? user.get({ plain: true }) : user;
    const { passwordHash, ...safeData } = userData;
    res.status(200).json(safeData);
  } catch (error) {
    next(error);
  }
};

export const getUserById = (req: Request, res: Response, next: NextFunction) =>
  handleGetUser(req, res, next, UserService.getUserById);

export const updateUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { id } = req.params;
  if (!id) return next(new ApiError(400, "Missing field: id"));

  // passwordHash и email менять через этот эндпоинт нельзя в принципе.
  const { passwordHash, email, ...safeUpdate } = req.body;

  // Разграничение прав (ВКР §1.8): обычный пользователь может менять только свой профиль
  // и не может менять привилегированные поля (role, status). Это доступно только администратору.
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    if (!req.userId || Number(id) !== req.userId) {
      return next(new ApiError(403, "You can only update your own profile"));
    }
    delete (safeUpdate as Record<string, unknown>).role;
    delete (safeUpdate as Record<string, unknown>).status;
  }

  if (Object.keys(safeUpdate).length === 0) {
    return next(new ApiError(400, "No update fields provided"));
  }

  try {
    const user = await UserService.updateUser(Number(id), safeUpdate);
    res.status(200).json({ ...user });
  } catch (error) {
    next(error);
  }
};

export const getUserByWorkerId = async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  if (!id) return next(new ApiError(400, "Missing field: id"));

  const userId = await UserService.getUserIdByWorkerId(Number(id));
  if (!userId) return next(new ApiError(403, `User not found by worker id ${id}`));

  const user = await UserService.getUserById(userId);
  if (!user) return next(new ApiError(403, "User not found by id " + userId));

  res.status(200).json(user);
};

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json(await UserService.getAllUsers());
};
