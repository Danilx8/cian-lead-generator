import { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/api.error";
import { ENV } from "../../config";
import { verifyToken } from "../../utils/jwt.utils";
import UserService from "../services/user.service";
import { UserRole } from "../../database/user.model";
import { AuthenticatedRequest } from "./auth.middleware";

/** Достаёт JWT из cookie 'jwt' или заголовка Authorization. */
function extractToken(req: Request): string | undefined {
  if (req.cookies?.jwt) return req.cookies.jwt;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return authHeader || undefined;
}

/** Валиден ли статический админ-ключ (легаси/сервисный доступ между компонентами). */
function hasValidAdminKey(req: Request): boolean {
  const headerName = "x-admin-key";
  const provided = (req.headers[headerName] || req.headers[headerName.toUpperCase()]) as
    | string
    | undefined;
  return !!ENV.ADMIN_API_KEY && !!provided && provided === ENV.ADMIN_API_KEY;
}

/**
 * Возвращает true, если запрос исходит от администратора:
 * либо предъявлен валидный x-admin-key, либо JWT принадлежит пользователю с ролью admin.
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  if (hasValidAdminKey(req)) return true;
  const token = extractToken(req);
  if (!token) return false;
  const decoded = verifyToken(token);
  if (!decoded || decoded.type === "refresh") return false;
  const user = await UserService.getUserById(decoded.userId);
  return user?.role === UserRole.admin;
}

/**
 * Доступ к админ-ресурсам (ВКР: ролевая модель «агент / администратор»).
 * Разрешает, если предъявлен валидный x-admin-key ИЛИ JWT пользователя с ролью admin.
 * Заодно проставляет req.userId для администратора, авторизованного по JWT.
 */
export const adminAuthMiddleware = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  if (hasValidAdminKey(req)) return next();

  const token = extractToken(req);
  if (!token) {
    return next(new ApiError(401, "Admin key or admin token is required"));
  }
  const decoded = verifyToken(token);
  if (!decoded || decoded.type === "refresh") {
    return next(new ApiError(401, "Invalid or expired token"));
  }

  const user = await UserService.getUserById(decoded.userId);
  if (!user || user.role !== UserRole.admin) {
    return next(new ApiError(403, "Administrator role required"));
  }

  req.userId = user.id;
  next();
};
