import { useEffect, useRef } from 'react';
import { dialogService } from '../api';
import { useAppStore } from '../store/appStore';
import type { Dialog } from '../api/types';

const POLL_MS = 6000;

export const useDialogsAutoUpdate = () => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = async () => {
      const state = useAppStore.getState();
      const { isSocketConnected, dialogs, setDialogs, pushMessageToast } = state;

      if (isSocketConnected) return;

      try {
        const fresh = await dialogService.getDialogs({ page: 1, limit: 200 });
        const freshArr: Dialog[] = Array.isArray(fresh) ? fresh : [];
        const prevMap = new Map((dialogs || []).map((d) => [d.id, d]));
        const nextMap = new Map(freshArr.map((d) => [d.id, d]));

        for (const d of freshArr) {
          const prev = prevMap.get(d.id);
          if (!prev) continue;

          const prevCount = prev.newMessagesAmount ?? 0;
          const nextCount = d.newMessagesAmount ?? 0;

          const lastChanged = (prev.lastMessage ?? '') !== (d.lastMessage ?? '');
          const countIncreased = nextCount > prevCount;

          if (countIncreased || (lastChanged && nextCount > 0)) {
            const pathname = window.location.pathname;
            const isActiveChat = pathname.startsWith(`/messages/chat/${d.id}`);
            if (!isActiveChat) {
              const cleanText = (d.lastMessage || '').replace(/^Вы:\s?/, '');
              pushMessageToast({
                dialogId: d.id,
                title: d.title || `Dialog #${d.id}`,
                text: cleanText || 'Новое сообщение',
                image: d.dialogImage || undefined,
              });
            }
          }
        }

        const merged: Dialog[] = [...freshArr];
        for (const old of dialogs || []) {
          if (!nextMap.has(old.id)) merged.push(old);
        }

        merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setDialogs(merged);
      } catch (e) {
        console.warn('poll dialogs failed:', e);
      }
    };

    timerRef.current = window.setInterval(tick, POLL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, []);
};