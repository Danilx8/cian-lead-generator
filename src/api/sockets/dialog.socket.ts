import { Namespace, Socket } from "socket.io";
import { logger } from "../../config";

export const setUpMessageSockets = (messagesNamespace: Namespace) => {
  messagesNamespace.on("connection", (socket: Socket) => {
    socket.on("join", (userId: string, dialogId: string) => {
      socket.join(userId + (dialogId ? `:${dialogId}` : ""));
    });

    socket.on("leave", (userId: string, dialogId: string) => {
      if (!userId || !dialogId) {
        logger.error(`Insufficient data. UserId: ${userId}, DialogId: ${dialogId}`);
        return;
      }

      socket.leave(`${userId}:${dialogId}`);
    });

    socket.on("disconnect", () => {
      socket.disconnect();
    });
  });
};