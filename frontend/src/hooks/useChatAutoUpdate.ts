import { useEffect, useRef } from 'react';
import { dialogService } from '../api';
import { useAppStore } from '../store/appStore';
import type { Message } from '../api/types';

const POLL_MS = 2500;

const safeParseTime = (iso?: string) => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

export const useChatAutoUpdate = (dialogId: number) => {
  const isSocketConnected = useAppStore((s) => s.isSocketConnected);

  const lastSeenKeyRef = useRef<string>('');
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!dialogId || !Number.isFinite(dialogId)) return;

    if (isSocketConnected) return;

    const tick = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const state = useAppStore.getState();
        const current = state.messages[dialogId] || [];
        const last = current[current.length - 1];
        const tailKey = last ? `${last.id}:${last.createdAt}` : 'empty';

        if (lastSeenKeyRef.current === tailKey) { /*всё равно надо иногда опрашивать, поэтому не return*/ }

        const fresh = await dialogService.getMessages(dialogId);

        // Сравнение по Number(id): HTTP и сокет могут отдавать id разного типа.
        const existingIds = new Set(current.map((m) => Number(m.id)));
        const merged: Message[] = [...current];

        let addedIncoming = 0;

        for (const m of fresh) {
          const id = Number(m.id);
          if (existingIds.has(id)) continue;
          merged.push(m);
          existingIds.add(id);
          if (!m.isSentByUser) addedIncoming++;
        }

        merged.sort((a, b) => safeParseTime(a.createdAt) - safeParseTime(b.createdAt));

        if (merged.length !== current.length) {
          useAppStore.getState().setMessages(dialogId, merged);

          const st = useAppStore.getState();
          const nextDialogs = (st.dialogs || []).map((d) =>
            d.id === dialogId ? { ...d, newMessagesAmount: 0 } : d
          );
          st.setDialogs(nextDialogs);
        }

        const mergedLast = merged[merged.length - 1];
        lastSeenKeyRef.current = mergedLast ? `${mergedLast.id}:${mergedLast.createdAt}` : 'empty';
      } catch (e) {

      } finally {
        inFlightRef.current = false;
      }
    };

    tick();

    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [dialogId, isSocketConnected]);
};
