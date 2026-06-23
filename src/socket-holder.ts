import type { SocketManager } from "./api/sockets/socket";

let _socket: SocketManager | undefined;

export function setSocket(s: SocketManager): void {
  _socket = s;
}

export function getSocket(): SocketManager {
  if (!_socket) throw new Error("Socket not initialized — this code must run in the main process");
  return _socket;
}

export function hasSocket(): boolean {
  return _socket !== undefined;
}
