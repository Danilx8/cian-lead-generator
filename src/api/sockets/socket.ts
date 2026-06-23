import { Namespace, Server } from "socket.io";
import { setUpMessageSockets } from "./dialog.socket";
import { authorizeSockets } from "../middlewares/sockets.middleware";
import * as http from "node:http";
import { MerchantMessageBox, StatusChangeBox } from "../controllers/dialog.controller";
import { setUpLogSockets } from "./log.socket";
import { logger } from "../../config";

export class SocketManager {
  private io?: Server;
  private messagesNamespace?: Namespace;
  private logsNamespace?: Namespace;

  constructor(server: http.Server) {
    try {
      this.io = new Server(server, {
        cors: { origin: "*", credentials: true },
        transports: ["polling", "websocket"]
      });
      this.io.engine.use(authorizeSockets);

      this.messagesNamespace = this.io.of("/messages");
      this.logsNamespace = this.io.of("/logs");

      setUpMessageSockets(this.messagesNamespace);
      setUpLogSockets(this.logsNamespace);
    } catch (error) {
      logger.error(error);
      this.io = undefined;
      this.messagesNamespace = undefined;
      this.logsNamespace = undefined;
    }
  }

  public broadcastMessageBoxToUser(userId: string, data: MerchantMessageBox): void {
    if (!this.messagesNamespace) {
      return;
    }
    if (this.messagesNamespace.adapter.rooms.has(userId)) {
      this.messagesNamespace.to(userId).emit("message", data);
    }
  }

  public broadcastStatusToUser(room: string, data: StatusChangeBox): void {
    if (!this.logsNamespace) {
      return;
    }
    if (this.logsNamespace.adapter.rooms.has(room)) {
      this.logsNamespace.to(room).emit("log", data);
      console.log(`sent new worker status to user ${room}`);
    }
  }

  public broadcastLogToUser(room: string, data: string): void {
    if (!this.logsNamespace) {
      return;
    }
    if (this.logsNamespace.adapter.rooms.has(room)) {
      this.logsNamespace.to(room).emit("log", data);
    }
  }
}