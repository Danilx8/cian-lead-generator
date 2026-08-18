import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { User, Template, Dialog, Message } from '../api/types';

// Аккаунт cian.ru (заменяет прежние cookies).
export interface Account {
  id: number;
  name?: string;
  login: string;
  password: string;
  userId?: number;
  proxyId?: number;
}

// Схлопывает сообщения с одинаковым id (сравнение по Number, т.к. id может
// прийти строкой из HTTP и числом из сокета). При дубле оставляем последнее
// вхождение — у сокет-версии обычно полнее данные. Порядок сохраняем.
const dedupeMessagesById = (messages: Message[]): Message[] => {
  const indexById = new Map<number, number>();
  const result: Message[] = [];
  for (const m of messages) {
    const key = Number(m.id);
    const existing = indexById.get(key);
    if (existing !== undefined) {
      result[existing] = m;
    } else {
      indexById.set(key, result.length);
      result.push(m);
    }
  }
  return result;
};

// Убирает оптимистичные (pending, отрицательный id) сообщения, для которых уже
// пришла серверная версия: то же направление и тот же текст. Иначе отправленное
// юзером сообщение задваивается — фейковый id не совпадает с настоящим, и
// дедупликация по id его не ловит. Каждое реальное сообщение гасит не более
// одного pending.
const collapsePendingDuplicates = (messages: Message[]): Message[] => {
  if (!messages.some((m) => m.pending)) return messages;
  const removed = new Set<number>();
  for (const real of messages) {
    if (real.pending || !real.isSentByUser) continue;
    const idx = messages.findIndex(
      (m, i) =>
        m.pending && m.isSentByUser && !removed.has(i) && m.text.trim() === real.text.trim()
    );
    if (idx !== -1) removed.add(idx);
  }
  return removed.size ? messages.filter((_, i) => !removed.has(i)) : messages;
};

interface AppNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timestamp: number;
}

export interface MessageToast {
  id: string;
  dialogId: number;
  title: string;
  text: string;
  image?: string;
  timestamp: number;
}

interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  chatId: string | null;
  templates: Template[];
  dialogs: Dialog[];
  currentDialog: Dialog | null;
  messages: { [dialogId: number]: Message[] };
  translatingMessages: Set<number>;
  translatedMessages: { [messageId: number]: string };
  notifications: AppNotification[];
  accounts: Account[];
  isLoading: boolean;
  error: string | null;
  activeTab: string;
  safeAreaTop: number;
  safeAreaBottom: number;
  isSocketConnected: boolean;
  messageToasts: MessageToast[];
  hideNavbar: boolean;
}

interface AppActions {
  setUser: (user: User | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setChatId: (chatId: string | null) => void;

  setTemplates: (templates: Template[]) => void;
  addTemplate: (template: Template) => void;
  updateTemplate: (index: number, template: Partial<Template>) => void;
  removeTemplate: (index: number) => void;

  setDialogs: (dialogs: Dialog[]) => void;
  setCurrentDialog: (dialog: Dialog | null) => void;

  setMessages: (dialogId: number, messages: Message[]) => void;
  addMessage: (message: Message) => void;

  setTranslating: (messageId: number, isTranslating: boolean) => void;
  setTranslatedText: (messageId: number, translatedText: string) => void;

  addNotification: (notification: AppNotification) => void;
  notify: (message: string, type?: AppNotification['type']) => void;
  removeNotification: (id: string) => void;

  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: number) => void;

  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;

  setActiveTab: (tab: string) => void;

  setSafeAreas: (top: number, bottom: number) => void;

  setSocketConnected: (connected: boolean) => void;

  pushMessageToast: (toast: Omit<MessageToast, 'id' | 'timestamp'> & { id?: string }) => void;
  removeMessageToast: (id: string) => void;
  clearDialogToasts: (dialogId: number) => void;
  clearAllToasts: () => void;

  setHideNavbar: (hide: boolean) => void;

  cn: (...classes: (string | undefined | null | boolean)[]) => string;
}

type AppStore = AppState & AppActions;

const MAX_GLOBAL_NOTIFICATIONS = 3;

const MAX_TOASTS = 4;

const TOAST_DEDUP_MS = 2500;

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set) => ({
    user: null,
    isAuthenticated: false,
    chatId: null,

    templates: [],

    dialogs: [],
    currentDialog: null,

    messages: {},

    translatingMessages: new Set<number>(),
    translatedMessages: {},

    notifications: [],

    accounts: [],

    isLoading: false,
    error: null,

    activeTab: '',

    safeAreaTop: 0,
    safeAreaBottom: 0,

    isSocketConnected: false,

    messageToasts: [],

    hideNavbar: false,

    setUser: (user) => set({ user }),
    setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
    setChatId: (chatId) => set({ chatId }),

    setTemplates: (templates) => set({ templates }),
    addTemplate: (template) =>
      set((state) => ({
        templates: [template, ...state.templates],
      })),
    updateTemplate: (index, updatedTemplate) =>
      set((state) => ({
        templates: state.templates.map((t, i) => (i === index ? { ...t, ...updatedTemplate } : t)),
      })),
    removeTemplate: (index) =>
      set((state) => ({
        templates: state.templates.filter((_, i) => i !== index),
      })),

    setDialogs: (dialogs) => set({ dialogs }),
    setCurrentDialog: (currentDialog) => set({ currentDialog }),

    setMessages: (dialogId, messages) =>
      set((state) => ({
        messages: {
          ...state.messages,
          [dialogId]: collapsePendingDuplicates(dedupeMessagesById(messages)),
        },
      })),

    addMessage: (message) =>
      set((state) => {
        const dialogMessages = state.messages[message.dialogId] || [];
        // Сравниваем по Number(id): API может отдавать id строкой, а сокет —
        // числом, и строгий === пропускал бы дубликат одного и того же сообщения.
        const incomingId = Number(message.id);
        if (dialogMessages.some((m) => Number(m.id) === incomingId)) return state;

        return {
          messages: {
            ...state.messages,
            [message.dialogId]: collapsePendingDuplicates([...dialogMessages, message]),
          },
        };
      }),

    setTranslating: (messageId, isTranslating) =>
      set((state) => {
        const next = new Set(state.translatingMessages);
        if (isTranslating) next.add(messageId);
        else next.delete(messageId);
        return { translatingMessages: next };
      }),

    setTranslatedText: (messageId, translatedText) =>
      set((state) => ({
        translatedMessages: { ...state.translatedMessages, [messageId]: translatedText },
      })),

    addNotification: (notification) =>
      set((state) => {
        const exists = state.notifications.find(
          (n) => n.message === notification.message && n.type === notification.type
        );
        if (exists) return state;

        const list = [...state.notifications, notification];
        if (list.length > MAX_GLOBAL_NOTIFICATIONS) list.shift();
        return { notifications: list };
      }),

    notify: (message, type = 'info') =>
      set((state) => {
        const exists = state.notifications.find((n) => n.message === message && n.type === type);
        if (exists) return state;

        const notification: AppNotification = {
          id: Date.now().toString(),
          message,
          type,
          timestamp: Date.now(),
        };

        const list = [...state.notifications, notification];
        if (list.length > MAX_GLOBAL_NOTIFICATIONS) list.shift();
        return { notifications: list };
      }),

    removeNotification: (id) =>
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),

    setAccounts: (accounts) => set({ accounts }),
    addAccount: (account) => set((state) => ({ accounts: [...state.accounts, account] })),
    removeAccount: (id) =>
      set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) })),

    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    setActiveTab: (activeTab) => set({ activeTab }),

    setSafeAreas: (safeAreaTop, safeAreaBottom) => set({ safeAreaTop, safeAreaBottom }),

    setSocketConnected: (isSocketConnected) => set({ isSocketConnected }),

    pushMessageToast: (toast) =>
      set((state) => {
        const now = Date.now();
        const id = toast.id || `${toast.dialogId}-${now}`;

        if (typeof window !== 'undefined') {
          const isActiveChat = window.location.pathname.startsWith(`/messages/chat/${toast.dialogId}`);
          if (isActiveChat) return state;
        }

        const lastSameDialog = state.messageToasts.find((t) => t.dialogId === toast.dialogId);
        if (
          lastSameDialog &&
          lastSameDialog.text === toast.text &&
          now - lastSameDialog.timestamp < TOAST_DEDUP_MS
        ) {
          return state;
        }

        const idx = state.messageToasts.findIndex((t) => t.dialogId === toast.dialogId);
        let next = [...state.messageToasts];

        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            id,
            title: toast.title || next[idx].title,
            text: toast.text,
            image: toast.image ?? next[idx].image,
            timestamp: now,
          };
        } else {
          next.unshift({
            id,
            dialogId: toast.dialogId,
            title: toast.title,
            text: toast.text,
            image: toast.image,
            timestamp: now,
          });
        }

        next.sort((a, b) => b.timestamp - a.timestamp);
        if (next.length > MAX_TOASTS) next = next.slice(0, MAX_TOASTS);

        return { messageToasts: next };
      }),

    removeMessageToast: (id) =>
      set((state) => ({
        messageToasts: state.messageToasts.filter((t) => t.id !== id),
      })),

    clearDialogToasts: (dialogId) =>
      set((state) => ({
        messageToasts: state.messageToasts.filter((t) => t.dialogId !== dialogId),
      })),

    clearAllToasts: () => set({ messageToasts: [] }),

    setHideNavbar: (hideNavbar) => set({ hideNavbar }),

    cn: (...classes) => classes.filter(Boolean).join(' '),
  }))
);
