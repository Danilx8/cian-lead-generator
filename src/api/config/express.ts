import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { logger } from "../../config";
import { errorHandler } from "../middlewares/error.handler";

// ROUTES
import userRouter from "../routes/user.route";
import categoryRouter from "../routes/category.route";
import workerRouter from "../routes/worker.route";
import filterRouter from "../routes/filter.route";
import accountRouter from "../routes/account.route";
import templateRouter from "../routes/template.route";
import uploadPictureRouter from "../routes/upload.route";
import dialogRouter from "../routes/dialog.route";
import authRouter from "../routes/auth.route";
import translateRouter from "../routes/translate.route";
import locationRouter from "../routes/location.route";
import adminRouter from "../routes/admin.route";
import analyticsRouter from "../routes/analytics.route";

dotenv.config();

export const createApp = () => {
  const app = express();

  app.set("trust proxy", 1);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
  }));

  const corsOptions = {
    origin: process.env.NODE_ENV === "production"
      ? process.env.CORS_ORIGIN
      : function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        callback(null, true);
      },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    optionsSuccessStatus: 204,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Admin-Key", "x-admin-key"]
  };
  app.use(cors(corsOptions));

  app.use(compression());

  const limiter = rateLimit({
    windowMs: 10 * 1000,
    limit: 300,
    message: "Too many requests, please try again later.",
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);

  const FIXED_BODY_LIMIT_MB = 200;
  app.use(express.json({ limit: `${FIXED_BODY_LIMIT_MB}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${FIXED_BODY_LIMIT_MB}mb` }));
  app.use(cookieParser());

  app.use(
    morgan("combined", {
      stream: { write: (message: string) => logger.info(message.trim()) }
    })
  );

  app.use("/images", express.static(path.join(process.cwd(), "storage", "pictures")));

  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ status: "OK" });
  });

  // ROUTES
  app.use("/api/auth", authRouter);
  app.use("/api/user", userRouter);
  app.use("/api/categories", categoryRouter);
  app.use("/api/worker", workerRouter);
  app.use("/api/filter", filterRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/templates", templateRouter);
  app.use("/api/dialogs", dialogRouter);
  app.use("/api/translate", translateRouter);
  app.use("/api/location", locationRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api", uploadPictureRouter);

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
};
