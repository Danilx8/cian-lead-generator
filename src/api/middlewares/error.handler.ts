import { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/api.error";
import { logger } from "../../config";

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Internal Server Error" });
    logger.error(err.stack);
  }
}
