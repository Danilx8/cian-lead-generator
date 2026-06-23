import { Namespace, Socket } from "socket.io";
import { Writable } from "stream";
import { SocketManager } from "./socket";
import { streamPodLogs } from "../services/k8s.service";

export class SocketIOStream extends Writable {
  private socketManager: SocketManager;
  private room: string;

  constructor(socketManager: SocketManager, room: string) {
    super();
    this.socketManager = socketManager;
    this.room = room;
  }

  _write(chunk: Buffer, encoding: string, callback: (error?: Error | null) => void): void {
    const logData = chunk.toString(); // Convert buffer to string
    this.socketManager.broadcastLogToUser(this.room, logData); // Send to user room
    callback();
  }

  // Override the end method to match the base class signature
  end(): this;
  end(chunk: any): this;
  end(chunk: any, encoding: BufferEncoding): this;
  end(chunk: any, encoding: BufferEncoding, cb: () => void): this;
  end(cb: () => void): this;
  end(chunk?: any, encoding?: BufferEncoding | (() => void), cb?: () => void): this {
    // Handle the different overload cases
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = undefined;
    }

    // Call the parent's end method with appropriate parameters
    if (chunk !== undefined) {
      if (encoding && typeof encoding !== "function") {
        super.end(chunk, encoding, cb);
      } else {
        super.end(chunk, cb);
      }
    } else if (cb) {
      super.end(cb);
    } else {
      super.end();
    }

    return this;
  }
}

export const setUpLogSockets = (logsNamespace: Namespace) => {
  const controllerMap = new WeakMap<object, AbortController>();

  logsNamespace.on("connection", (socket: Socket) => {
    socket.on("join", async (userId: string, workerId?: string) => {
      socket.join(userId);

      if (!workerId) return;
      try {
        const controller = await streamPodLogs(workerId, userId);
        controllerMap.set(socket, controller);
      } catch (error: any) {
        socket.emit("error", `Failed to start logs: ${error.message}`);
      }
    });

    socket.on("disconnect", (reason, description) => {
      const controller = controllerMap.get(socket);
      if (controller) {
        controller.abort(); // Прерываем поток
        controllerMap.delete(socket); // Удаляем из WeakMap
      }
      socket.disconnect();
    });
  });
};