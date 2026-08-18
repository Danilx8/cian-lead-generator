import { useEffect, useRef } from 'react';
import { dialogService } from '../api';
import { useAppStore } from '../store/appStore';
import type { Dialog } from '../api/types';

const POLL_MS = 3000;
const PAGE_SIZE = 200;

const LS_KEY = 'toast_last_signature_v1';

type SigMap = Record<number, string>;

const safeTime = (iso?: string) => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

const isActiveChatPath = (dialogId: number) => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith(`/messages/chat/${dialogId}`);
};

const isIncomingByLastMessage = (lastMessage?: string) => {
  const s = (lastMessage || '').trim();
  if (!s) return false;
  return !/^вы:/i.test(s);
};

const stripYouPrefix = (s: string) => s.replace(/^Вы:\s*/i, '').trim();

const makeSignature = (d: Dialog) => {
  const msg = stripYouPrefix((d.lastMessage || '').trim());
  const ts = d.updatedAt || '';

  return `${ts}|${msg}`;
};

const loadSigMap = (): SigMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as SigMap;
    return {};
  } catch {
    return {};
  }
};

const saveSigMap = (m: SigMap) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {

  }
};

export const useGlobalDialogsFallback = () => {
  const isSocketConnected = useAppStore((s) => s.isSocketConnected);

  const prevMapRef = useRef<Map<number, Dialog>>(new Map());
  const inFlightRef = useRef(false);

  const bootstrappedRef = useRef(false);

  const sigMapRef = useRef<SigMap>(loadSigMap());

  useEffect(() => {
    if (isSocketConnected) return;

    const tick = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const store = useAppStore.getState();
        const prevDialogs = store.dialogs || [];

        const prevMap =
          prevMapRef.current.size > 0
            ? prevMapRef.current
            : new Map(prevDialogs.map((d) => [d.id, d]));

        const fresh = await dialogService.getDialogs({ page: 1, limit: PAGE_SIZE });
        const freshArr: Dialog[] = Array.isArray(fresh) ? fresh : [];

        const byId = new Map<number, Dialog>();
        prevDialogs.forEach((d) => byId.set(d.id, d));
        freshArr.forEach((d) => {
          const old = byId.get(d.id);
          const takeFresh = safeTime(d.updatedAt) >= safeTime(old?.updatedAt);
          byId.set(d.id, takeFresh ? { ...old, ...d } : old!);
        });

        const merged = Array.from(byId.values()).sort(
          (a, b) => safeTime(b.updatedAt) - safeTime(a.updatedAt)
        );

        store.setDialogs(merged);

        if (!bootstrappedRef.current) {
          const m = sigMapRef.current;
          merged.forEach((d) => {
            m[d.id] = makeSignature(d);
          });
          sigMapRef.current = m;
          saveSigMap(m);

          prevMapRef.current = new Map(merged.map((d) => [d.id, d]));
          bootstrappedRef.current = true;
          return;
        }

        for (const d of freshArr) {
          const prev = prevMap.get(d.id);

          const unread = d.newMessagesAmount ?? 0;
          if (unread <= 0) continue;

          const incoming =
            typeof (d as any).isLastByUser === 'boolean'
              ? !(d as any).isLastByUser
              : isIncomingByLastMessage(d.lastMessage);

          if (!incoming) continue;

          if (isActiveChatPath(d.id)) {
            continue;
          }

          const sig = makeSignature(d);
          const lastSig = sigMapRef.current[d.id];
          if (lastSig === sig) continue;

          const updatedIncreased = safeTime(d.updatedAt) > safeTime(prev?.updatedAt);
          const lastChanged = stripYouPrefix((d.lastMessage || '').trim()) !== stripYouPrefix((prev?.lastMessage || '').trim());
          const unreadIncreased = (d.newMessagesAmount ?? 0) > (prev?.newMessagesAmount ?? 0);

          if (!updatedIncreased && !lastChanged && !unreadIncreased) {
            continue;
          }

          const toastText = stripYouPrefix((d.lastMessage || '').trim()) || 'Новое сообщение';
          store.pushMessageToast({
            dialogId: d.id,
            title: d.title || `Dialog #${d.id}`,
            text: toastText,
            image: d.dialogImage || undefined,
          });

          sigMapRef.current = { ...sigMapRef.current, [d.id]: sig };
          saveSigMap(sigMapRef.current);
        }

        prevMapRef.current = new Map(merged.map((d) => [d.id, d]));
      } catch {

      } finally {
        inFlightRef.current = false;
      }
    };

    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [isSocketConnected]);
};
