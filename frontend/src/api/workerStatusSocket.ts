import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./config";
import { getJwtToken } from "./client";

/**
 * Сокет статусов слотов.
 *
 * Отдельного namespace под статусы на бэке нет — они едут по логовому сокету:
 * namespace `/logs`, событие `"log"`
 * (SocketManager.broadcastStatusToUser → logsNamespace.to(userId).emit("log", StatusChangeBox)).
 * В том же событии приходят строки логов пода, поэтому смену статуса отличаем по типу:
 * лог-строка = string, статус = объект `{ workerId, payload: { state, previousState } }`.
 *
 * `join` шлём ТОЛЬКО с userId (без workerId) — так попадаем в комнату статусов,
 * не запуская стрим логов пода.
 *
 * Соединение одно на приложение и живёт, пока есть подписчики (список слотов,
 * счётчик на главной и т.д.), — см. subscribeWorkerStatus.
 */
export interface WorkerStatusEvent {
  workerId: number;
  state: string;
  previousState?: string;
  /** Текст ошибки запуска — приходит только в событии "worker-status". */
  error?: string;
}

export interface WorkerStatusSubscriber {
  onStatus?: (event: WorkerStatusEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
}

const subscribers = new Set<WorkerStatusSubscriber>();

let socket: Socket | null = null;
let connected = false;
let connectErrorLogged = false;
let closeTimer: number | null = null;

// Один статус приходит дважды («log» + «worker-status») — второй в том же тике отбрасываем.
const DUPLICATE_WINDOW_MS = 100;
let lastEventKey = "";
let lastEventAt = 0;

export const isWorkerStatusSocketConnected = () => connected;

const setConnected = (value: boolean) => {
  connected = value;
  subscribers.forEach((s) => s.onConnectionChange?.(value));
};

const openSocket = () => {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (socket) return;

  const userId = localStorage.getItem("userId");
  if (!userId) return;

  // Тот же origin, что и API (API_BASE_URL = '' → относительный namespace /logs).
  const socketBase = API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/i, "");

  // Авторизуемся JWT через auth/query, как сокет сообщений (socketService).
  const token = getJwtToken() ?? localStorage.getItem("jwt_token") ?? undefined;
  const handshake: Record<string, string> = { userId: String(userId) };
  if (token) handshake.token = token;

  try {
    const s = io(`${socketBase}/logs`, {
      path: "/socket.io",
      timeout: 10000,
      transports: ["polling"],
      upgrade: false,
      forceNew: true,
      // В окружениях, где сокет недоступен (ngrok/WebView), не долбимся бесконечно —
      // статус несёт поллинг. В проде (тот же origin) подключение проходит с первой попытки.
      reconnectionAttempts: 5,
      auth: handshake,
      query: handshake,
    });
    socket = s;

    s.on("connect", () => {
      console.log("✅ Подключен к сокету статусов слотов");
      connectErrorLogged = false;
      // join строго строкой: сервер джойнит ровно то, что прислали (socket.join(userId)),
      // а рассылает всегда по worker.userId.toString(). Число создало бы комнату под
      // ключом 123, гвард adapter.rooms.has("123") дал бы false — и статусы молча терялись бы.
      s.emit("join", String(userId));
      setConnected(true);
    });

    // Один и тот же payload сервер шлёт двумя событиями: "log" (там же строки логов пода)
    // и "worker-status". Слушаем оба, потому что ошибки запуска (broadcastWorkerErrorToUser)
    // уходят ТОЛЬКО в "worker-status" — по "log" мы бы их не увидели.
    const handleStatusEvent = (data: unknown) => {
      // Лог-строки (string) и всё без payload.state — не наше.
      if (!data || typeof data !== "object") return;

      const box = data as {
        workerId?: number | string;
        payload?: { state?: string; previousState?: string; error?: string };
      };
      const workerId = Number(box.workerId);
      const state = box.payload?.state;
      if (!Number.isFinite(workerId) || typeof state !== "string") return;

      // Дубль из парного события гасим: оба emit'а идут подряд в одном тике сервера.
      const key = `${workerId}:${state}`;
      const now = performance.now();
      if (key === lastEventKey && now - lastEventAt < DUPLICATE_WINDOW_MS) return;
      lastEventKey = key;
      lastEventAt = now;

      console.log("📡 Статус слота обновлён:", workerId, state, box.payload?.error ?? "");
      const event: WorkerStatusEvent = {
        workerId,
        state,
        previousState: box.payload?.previousState,
        error: box.payload?.error,
      };
      subscribers.forEach((sub) => sub.onStatus?.(event));
    };

    s.on("log", handleStatusEvent);
    s.on("worker-status", handleStatusEvent);

    // Логируем ошибку подключения только один раз — без спама на каждой ретрай-попытке.
    // Статус всё равно обновляется поллингом, так что это не критично.
    s.on("connect_error", (error) => {
      setConnected(false);
      if (connectErrorLogged) return;
      connectErrorLogged = true;
      console.warn("⚠️ Статус-сокет недоступен, статус обновляется поллингом:", error?.message ?? error);
    });

    s.on("disconnect", (reason) => {
      setConnected(false);
      console.log("🔌 Сокет статусов отключён:", reason);
    });
  } catch (e) {
    console.error("💥 Критическая ошибка сокета статусов:", e);
  }
};

const closeSocket = () => {
  if (!socket) return;
  try {
    socket.disconnect();
  } catch {
    /* noop */
  }
  socket = null;
  connectErrorLogged = false;
  setConnected(false);
};

/**
 * Подписаться на смены статусов слотов. Первый подписчик поднимает соединение,
 * уход последнего — гасит его (с небольшой задержкой, чтобы переход между
 * экранами не дёргал реконнект).
 */
export function subscribeWorkerStatus(subscriber: WorkerStatusSubscriber): () => void {
  subscribers.add(subscriber);
  openSocket();
  if (connected) subscriber.onConnectionChange?.(true);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size > 0) return;
    if (closeTimer !== null) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      if (subscribers.size === 0) closeSocket();
    }, 1000);
  };
}
