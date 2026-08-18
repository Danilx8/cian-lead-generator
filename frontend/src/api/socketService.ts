import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client';
import type { Message, Dialog } from './types';
import { getJwtToken } from './client';

const withTimeout = <T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(label)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });

export interface MerchantMessageBox {
  dialogId: number;
  message: Message;
  dialog?: Dialog;
}

type IoOpts = Partial<ManagerOptions & SocketOptions>;

/**
 * Сокет входящих сообщений: namespace /messages на том же origin, что и API.
 * Авторизация — JWT из localStorage (тот же ключ, что у client.ts) через auth/query,
 * плюс httpOnly-cookie самого хендшейка.
 */
class SocketService {
  private messagesSocket: Socket | null = null;
  private isConnected = false;

  private userId: number | null = null;

  private bufferFlushedOnce = false;
  private onNewMessage: ((data: unknown) => void) | null = null;
  private onConnectionChange: ((connected: boolean) => void) | null = null;

  private messageBuffer: unknown[] = [];
  private isBuffering = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('userId');
      this.userId = raw ? Number(raw) : null;
    }
  }

  setCredentials(userId: number) {
    this.userId = userId;
    if (typeof window !== 'undefined') localStorage.setItem('userId', String(userId));
  }

  onMessage(callback: (data: unknown) => void) {
    this.onNewMessage = callback;
  }

  onConnectionStateChange(callback: (connected: boolean) => void) {
    this.onConnectionChange = callback;
  }

  flushMessageBuffer() {
    if (this.bufferFlushedOnce) return;

    if (this.messageBuffer.length > 0 && this.onNewMessage) {
      const batch = this.messageBuffer;
      this.messageBuffer = [];
      batch.forEach((d) => this.onNewMessage!(d));
    }

    this.isBuffering = false;
    this.bufferFlushedOnce = true;
  }

  get isBufferingActive(): boolean {
    return this.isBuffering;
  }

  private handleIncomingMessage(data: unknown) {
    if (this.isBuffering) {
      this.messageBuffer.push(data);
      return;
    }
    if (this.onNewMessage) this.onNewMessage(data);
  }

  async connect(): Promise<void> {
    const token = getJwtToken();

    if (!this.userId) {
      console.warn('no userId → WS disabled');
      this.isConnected = false;
      this.onConnectionChange?.(false);
      return;
    }

    if (this.messagesSocket && !this.messagesSocket.connected) {
      try { this.messagesSocket.disconnect(); } catch { }
      this.messagesSocket = null;
    }

    const userId = String(this.userId);
    const handshake: Record<string, string> = { userId };
    if (token) handshake.token = token;

    const opts: IoOpts = {
      transports: ['polling'],
      upgrade: false,
      forceNew: true,
      timeout: 15000,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      withCredentials: true,
      auth: handshake,
      query: handshake,
      ...(token
        ? {
          extraHeaders: {
            Authorization: token.startsWith('Bearer') ? token : `Bearer ${token}`,
          },
        }
        : {}),
    };

    const socket = io('/messages', opts);
    const ok = await this.waitForConnectOrFail(socket);

    if (ok) {
      this.attachSocket(socket);
    } else {
      try { socket.disconnect(); } catch { }
      this.isConnected = false;
      this.onConnectionChange?.(false);
    }
  }

  private waitForConnectOrFail(socket: Socket): Promise<boolean> {
    return withTimeout(
      new Promise<boolean>((resolve) => {
        const cleanup = () => {
          socket.off('connect', onConnect);
          socket.off('connect_error', onErr);
          socket.off('error', onErr);
        };

        const onConnect = () => {
          cleanup();
          resolve(true);
        };

        const onErr = (e: unknown) => {
          console.error('socket connect_error:', e);
          cleanup();
          resolve(false);
        };

        socket.once('connect', onConnect);
        socket.once('connect_error', onErr);
        socket.once('error', onErr);
      }),
      12000,
      'WS connect timeout'
    ).catch(() => false);
  }

  private attachSocket(socket: Socket) {
    this.messagesSocket = socket;

    socket.on('connect', () => {
      this.isConnected = true;
      this.onConnectionChange?.(true);
      socket.emit('join', Number(this.userId));
      socket.emit('join', String(this.userId));
    });

    const incoming = (data: unknown) => this.handleIncomingMessage(data);

    socket.on('message', incoming);
    socket.on('newMessage', incoming);
    socket.on('new-message', incoming);

    socket.on('disconnect', () => {
      this.isConnected = false;
      this.onConnectionChange?.(false);
      this.isBuffering = true;
      this.bufferFlushedOnce = false;
    });
  }

  disconnect() {
    if (this.messagesSocket) {
      try { this.messagesSocket.disconnect(); } catch { }
      this.messagesSocket = null;
    }
    this.isConnected = false;
    this.isBuffering = true;
    this.messageBuffer = [];
    this.bufferFlushedOnce = false;
    this.onConnectionChange?.(false);
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get messagesConnected(): boolean {
    return this.messagesSocket?.connected || false;
  }
}

export const socketService = new SocketService();
