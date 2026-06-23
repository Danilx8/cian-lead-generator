import { AuthenticatedRequest, authMiddleware } from "./auth.middleware";
import { NextFunction, Response } from "express";

export const authorizeSockets = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const isHandshake = req.query?.sid === undefined;
  if (isHandshake) await authMiddleware(req, res, next);
  else next();
};