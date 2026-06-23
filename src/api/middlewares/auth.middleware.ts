import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../utils/jwt.utils";
import { ApiError } from "../errors/api.error";
import { ENV } from "../../config";

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;

  if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (authHeader) {
      token = authHeader;
    }
  }

  const adminKey = req.headers["x-admin-key"];
  const adminVerified = adminKey && adminKey === ENV.ADMIN_API_KEY;

  if (!token && !adminVerified) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (token) {
    const decoded = verifyToken(token);

    if (!decoded) {
      return next(new ApiError(401, "Invalid or expired token"));
    }

    // Refresh-токен нельзя использовать для доступа к API — только для /api/auth/refresh.
    if (decoded.type === "refresh") {
      return next(new ApiError(401, "Refresh token cannot be used for API access"));
    }

    req.userId = decoded.userId;
    if (!req.userId) {
      return next(new ApiError(400, "Token does not contain userId"));
    }
  }
  next();
};
