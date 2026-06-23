import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  ACCESS_TOKEN_EXPIRES_IN,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_MAX_AGE_MS,
} from "../../utils/jwt.utils";
import { blacklistToken, isTokenBlacklisted } from "../../utils/token-blacklist";
import { ApiError } from "../errors/api.error";
import UserService from "../services/user.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { UserStatus } from "../../database/user.model";
import { ENV } from "../../config";

const SALT_ROUNDS = 10;
const isProd = () => process.env.NODE_ENV === "production";

/** Выставляет access- и refresh-токены в httpOnly cookies (ВКР §3.3). */
function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie("jwt", accessToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie("jwt", { httpOnly: true, secure: isProd(), sameSite: "lax" });
  res.clearCookie("refreshToken", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/api/auth" });
}

export async function register(req: Request, res: Response, next: NextFunction) {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return next(new ApiError(400, "email, password, and username are required"));
  }

  const existing = await UserService.getUserByEmail(email);
  if (existing) {
    return next(new ApiError(409, "User with this email already exists"));
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Модерация регистрации (ВКР §1.6/§1.7): заявка создаётся в статусе pending и ждёт
  // одобрения администратором; токены не выдаются до одобрения.
  if (ENV.REGISTRATION_MODERATION) {
    const user = await UserService.createUser(email, passwordHash, username, UserStatus.pending);
    res.status(202).json({
      message: "Registration submitted and awaiting administrator approval",
      userId: user.id,
      status: user.status,
    });
    return;
  }

  const user = await UserService.createUser(email, passwordHash, username);
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({
    message: "Registration successful",
    userId: user.id,
    token: accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

export async function login(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ApiError(400, "email and password are required"));
  }

  const user = await UserService.getUserByEmail(email);
  if (!user) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  if (user.status === UserStatus.pending) {
    return next(new ApiError(403, "Account pending administrator approval"));
  }

  if (user.status === UserStatus.blocked) {
    return next(new ApiError(403, "Account blocked"));
  }

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json({
    message: "Login successful",
    userId: user.id,
    token: accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

/**
 * Обновление access-токена по refresh-токену (ВКР §3.3).
 * Refresh-токен берётся из cookie 'refreshToken' или тела запроса. Производится ротация:
 * старый refresh-токен отзывается (blacklist), выдаётся новая пара.
 */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  const token: string | undefined = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    return next(new ApiError(401, "Refresh token required"));
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.type !== "refresh") {
    return next(new ApiError(401, "Invalid refresh token"));
  }

  if (await isTokenBlacklisted(decoded.jti)) {
    return next(new ApiError(401, "Refresh token revoked"));
  }

  const user = await UserService.getUserById(decoded.userId);
  if (!user) {
    return next(new ApiError(401, "User not found"));
  }
  if (user.status === UserStatus.blocked) {
    return next(new ApiError(403, "Account blocked"));
  }

  // Ротация: отзываем предъявленный refresh-токен на остаток его жизни.
  if (decoded.jti && decoded.exp) {
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    await blacklistToken(decoded.jti, ttl);
  }

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);
  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json({
    message: "Token refreshed",
    token: accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

export const me = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const userId = req.userId;
  if (!userId) return next(new ApiError(401, "Authentication required"));

  const user = await UserService.getUserById(userId);
  if (!user) return next(new ApiError(404, "User not found"));

  if (user.status === UserStatus.blocked) {
    return next(new ApiError(403, "Account blocked"));
  }

  res.status(200).json({
    id: user.id,
    email: user.email,
    username: user.username,
    status: user.status,
    role: user.role,
    avatarPath: user.avatarPath,
    sendWithAngebot: user.sendWithAngebot,
    intervals: {
      itemsInterval: user.itemsInterval,
      newMessagesInterval: user.newMessagesInterval,
      repliesInterval: user.repliesInterval,
      itemsChunkSize: user.itemsChunkSize,
      chunksInterval: user.chunksInterval,
    },
  });
};

/**
 * Выход: refresh-токен заносится в чёрный список Redis с TTL = остаток времени жизни
 * (ВКР §3.3), оба cookie очищаются.
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  const token: string | undefined = req.cookies?.refreshToken || req.body?.refreshToken;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded?.jti && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      await blacklistToken(decoded.jti, ttl);
    }
  }

  clearAuthCookies(res);
  res.status(200).json({ message: "Logout successful" });
};
