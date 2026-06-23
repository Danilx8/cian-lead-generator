import { HeartbeatMonitor } from "./api/services/heartbeat/heartbeat.monitor";

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
import app from "./api/app";
import { ENV, logger } from "./config";
import { SocketManager } from "./api/sockets/socket";
import { setSocket } from "./socket-holder";
import cron from "node-cron";
import { deleteOlderDialogs } from "./database/dialog.model";
import { redisClient, initRedisSubscriptions } from "./redis/redis";
import { RedisClientType } from "redis";
import { BatchManagerService } from "./api/services/parsing/batch.service";
import { ParserManager } from "./api/services/parsing/parser-manager";

async function startApp() {
  try {
    const server = app.listen(ENV.PORT, () => {
      logger.info(`Server started on port ${ENV.PORT}`);
    });

    const heartbeat = new HeartbeatMonitor(redisClient as RedisClientType);
    BatchManagerService.initialize();

    const socket = new SocketManager(server);
    setSocket(socket);

    await initRedisSubscriptions();

    cron.schedule("0 */2 * * *", deleteOlderDialogs);

    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down...`);

      try {
        ParserManager.getInstance().shutdown();
      } catch (_) {}

      server.close(() => {
        logger.info("HTTP server closed.");
        process.exit(0);
      });

      setTimeout(() => {
        logger.warn("Forced shutdown...");
        process.exit(1);
      }, 10000);
    };

    process.once("SIGINT", () => gracefulShutdown("SIGINT"));
    process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

    return { server, socket, heartbeat };
  } catch (error) {
    logger.error("Startup error:", error);
    process.exit(1);
  }
}

export const { server, socket, heartbeat } = await startApp();
