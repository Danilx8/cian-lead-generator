import { useCallback, useEffect, useRef } from 'react';
import { socketService, userService } from '../api';
import { useAppStore } from '../store/appStore';
import type { Message } from '../api/types';

const socketReadyResolvers: (() => void)[] = [];
let socketReady = false;

export const waitForSocketReady = () => {
  if (socketReady) return Promise.resolve();
  return new Promise<void>((res) => socketReadyResolvers.push(res));
};

const resolveSocketReady = () => {
  if (socketReady) return;
  socketReady = true;
  socketReadyResolvers.splice(0).forEach((r) => r());
};

export const useWebSocket = () => {
  const { user, setSocketConnected, addMessage, addNotification } = useAppStore();

  const socketInitialized = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  const handleNewMessage = useCallback(
    (data: unknown) => {
      const seen = seenRef.current;

      const normalizeMessage = (message: Record<string, unknown>): Message => {
        const now = new Date().toISOString();

        let createdAt: string;
        const sentAtRaw = message.sentAt;

        if (sentAtRaw instanceof Date) {
          createdAt = sentAtRaw.toISOString();
        } else if (typeof sentAtRaw === 'string' && !Number.isNaN(Date.parse(sentAtRaw))) {
          createdAt = sentAtRaw;
        } else if (typeof message.createdAt === 'string' && !Number.isNaN(Date.parse(message.createdAt))) {
          createdAt = message.createdAt;
        } else {
          createdAt = now;
        }

        const updatedAt =
          typeof message.updatedAt === 'string' && !Number.isNaN(Date.parse(message.updatedAt))
            ? message.updatedAt
            : createdAt;

        const id = Number(message.id);
        const dialogId = Number(message.dialogId);

        return {
          id,
          dialogId,
          isSentByUser: Boolean(message.isSentByUser),
          isRead: Boolean(message.isRead),
          text: typeof message.text === 'string' ? message.text : '',
          attachment: message.attachment ? String(message.attachment) : undefined,
          createdAt,
          updatedAt,
          sentAt: typeof sentAtRaw === 'string' ? sentAtRaw : undefined,
          merchantName: typeof message.merchantName === 'string' ? message.merchantName : undefined,
          itemName: typeof message.itemName === 'string' ? message.itemName : undefined,
          itemImage: typeof message.itemImage === 'string' ? message.itemImage : undefined,
          price: typeof message.price === 'number' ? message.price : undefined,
        };
      };

      try {
        if (Array.isArray(data)) {
          data.forEach((raw) => {
            if (!raw || typeof raw !== 'object') return;
            const r = raw as Record<string, unknown>;
            if (!('id' in r) || !('dialogId' in r)) return;

            const msg = normalizeMessage(r);
            if (!Number.isFinite(msg.id) || !Number.isFinite(msg.dialogId)) return;

            const key = `${msg.dialogId}:${msg.id}`;
            if (seen.has(key)) return;
            seen.add(key);

            addMessage(msg);
          });
          return;
        }

        if (data && typeof data === 'object') {
          const messageData = data as Record<string, unknown>;

          if ('message' in messageData && messageData.message && typeof messageData.message === 'object') {
            const msg = normalizeMessage(messageData.message as Record<string, unknown>);
            if (!Number.isFinite(msg.id) || !Number.isFinite(msg.dialogId)) return;

            const key = `${msg.dialogId}:${msg.id}`;
            if (seen.has(key)) return;
            seen.add(key);

            addMessage(msg);
            return;
          }

          if ('id' in messageData && 'dialogId' in messageData) {
            const msg = normalizeMessage(messageData);
            if (!Number.isFinite(msg.id) || !Number.isFinite(msg.dialogId)) return;

            const key = `${msg.dialogId}:${msg.id}`;
            if (seen.has(key)) return;
            seen.add(key);

            addMessage(msg);
            return;
          }
        }
      } catch (error) {

      }
    },
    [addMessage]
  );

  const handleConnectionChange = useCallback(
    (connected: boolean) => {
      setSocketConnected(connected);

      if (connected) {
        try {
          if (socketService.isBufferingActive) socketService.flushMessageBuffer();
        } catch (e) {
          console.warn('flush буфера не удался:', e);
        }
      } else {
        console.log('⚠️ WebSocket disconnected');
      }
    },
    [setSocketConnected]
  );

  useEffect(() => {
    const initializeWebSocket = async (): Promise<boolean> => {
      try {
        let userId: number;

        if (user?.id) {
          userId = Number(user.id);
        } else {
          try {
            // JWT уже лежит в localStorage/cookie после email-логина —
            // просто узнаём, кто мы.
            const userData = await userService.getMe();
            userId = Number(userData.id);
          } catch (error) {
            resolveSocketReady();
            return false;
          }
        }

        if (!Number.isFinite(userId)) {
          resolveSocketReady();
          return false;
        }

        socketService.setCredentials(userId);
        socketService.onMessage(handleNewMessage);
        socketService.onConnectionStateChange(handleConnectionChange);

        await socketService.connect();

        resolveSocketReady();

        if (!socketService.messagesConnected) {
          console.warn('⚠️ messages socket НЕ подключен — будем жить без него');
          return false;
        }

        addNotification({
          id: Date.now().toString(),
          message: 'WebSocket подключен',
          type: 'success',
          timestamp: Date.now(),
        });

        return true;
      } catch (error) {
        console.error('💥 Ошибка инициализации WebSocket:', error);
        resolveSocketReady();
        return false;
      }
    };

    const disconnectWebSocket = () => {
      socketService.disconnect();
      seenRef.current.clear();
      socketReady = false;
      socketReadyResolvers.splice(0);
    };

    if (!socketInitialized.current) {
      (async () => {
        const ok = await initializeWebSocket();
        socketInitialized.current = ok;
      })();
    }

    return () => {
      if (socketInitialized.current) {
        disconnectWebSocket();
        socketInitialized.current = false;
      }
    };
  }, [user, addNotification, handleNewMessage, handleConnectionChange]);

  return {
    connected: socketService.connected,
    messagesConnected: socketService.messagesConnected,
  };
};
