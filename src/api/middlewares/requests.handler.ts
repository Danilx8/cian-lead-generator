import { Request, Response, NextFunction } from "express";
import { instanceToPlain } from "class-transformer";
import { validate } from "class-validator";
import { ApiError } from "../errors/api.error";

export async function requestHandler<T>(req: Request, res: Response, next: NextFunction, classType: new (...args: any[]) => T) {
  try {
    // Transform JSON to class instance
    const instance = instanceToPlain(classType, req.body);
    // Validate the instance
    validate(instance).then(errors => {
      if (errors.length > 0) {
        const errorMessages = errors
          .map((err) => Object.values(err.constraints || {}).join(", "))
          .join("; ");
        next(new ApiError(400, `Validation failed: ${errorMessages}`));
      }
    });
    // Attach validated instance to request for use in route handler
    (req as any).validated = instance;
    next();
  } catch (error) {
    next(error);
  }
}