import { useEffect, type RefObject } from 'react';

/**
 * Плавное сопровождение клавиатуры в Telegram WebView.
 *
 * Архитектура «высоты покоя»: страница верстается от --viewport-rest-height
 * (высота вьюпорта без клавиатуры, в px). Ресайз WebView под клавиатуру
 * НИЧЕГО не репозиционирует: контейнер ленты и футер привязаны к холсту
 * фиксированной высоты, вьюпорт лишь обрезает его снизу. Поэтому в момент
 * коммита ресайза не происходит ни перекладки, ни перерисовки — источник
 * мерцаний устранён, а не замаскирован.
 *
 * Движение при появлении/скрытии клавиатуры — исключительно наше:
 * - футер поднимается transform'ом на высоту клавиатуры;
 * - в конец ленты добавляется распорка той же высоты, и при положении
 *   «у низа» скролл прижимается к низу — сообщения едут вместе с футером.
 *
 * Сигналы (замерено логами с устройства):
 * - window.innerHeight — единственный источник истины о фактическом ресайзе;
 *   visualViewport протухает на сотни мс и в модели не участвует.
 * - viewport_changed от Telegram объявляет будущую высоту на ~400 мс раньше
 *   ресайза — ранний точный сигнал в обе стороны.
 * - iOS не блюрит textarea при тапе по диву — blur делаем сами (pointerdown
 *   на ленте), тап по таблетке перевода blur не вызывает (preventDefault).
 * - expand() торопит Telegram вернуть высоту после ухода клавиатуры.
 */

// Высота клавиатуры, замеренная в прошлые открытия. Живёт между страницами
// и запусками, чтобы предсказание работало уже с первого фокуса.
let rememberedKb = 0;
try {
  rememberedKb = Number(localStorage.getItem('cian-kb-height')) || 0;
} catch { /* localStorage недоступен — просто без памяти между запусками */ }

const rememberKb = (h: number) => {
  rememberedKb = h;
  try {
    localStorage.setItem('cian-kb-height', String(Math.round(h)));
  } catch { /* ignore */ }
};

const isEditable = (el: EventTarget | null): boolean => {
  const n = el as HTMLElement | null;
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable);
};

// Диагностика в DevConsole (только dev-сборка): тайминги событий вьюпорта.
const DEBUG = import.meta.env.DEV;
const dbgT0 = typeof performance !== 'undefined' ? performance.now() : 0;
const dbg = (...args: unknown[]) => {
  if (DEBUG) console.log(`[kb ${Math.round(performance.now() - dbgT0)}]`, ...args);
};

// Просим Telegram вернуть высоту WebView сразу после ухода клавиатуры.
// Вне Telegram (или в fullscreen) это безопасный no-op.
type TgWebApp = {
  expand?: () => void;
  viewportHeight?: number;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
};
type TgWindow = Window & { Telegram?: { WebApp?: TgWebApp } };
const getTgWebApp = (): TgWebApp | undefined => (window as TgWindow).Telegram?.WebApp;
const nudgeExpand = () => {
  try {
    getTgWebApp()?.expand?.();
  } catch { /* ignore */ }
};

export function useSmoothKeyboard(
  footerRef: RefObject<HTMLElement | null>,
  scrollerRef: RefObject<HTMLElement | null>,
  spacerRef: RefObject<HTMLElement | null>,
  duration = 300,
) {
  useEffect(() => {
    const root = document.documentElement;
    // Предсказываем только на тач-устройствах: с физической клавиатурой
    // экранная не появится и футер уехал бы зря.
    const canPredict = (navigator.maxTouchPoints ?? 0) > 0;
    // Анимация вниз (закрытие) короче: каждая лишняя миллисекунда — видимый лаг.
    const downDuration = Math.min(duration, 170);

    let prevInnerH = window.innerHeight;
    let prevInnerW = window.innerWidth;
    let lastScrollTop = scrollerRef.current?.scrollTop ?? 0;

    // Насколько layout-вьюпорт фактически сжат клавиатурой прямо сейчас.
    let kbShrink = 0;
    let focused = false;
    // Идёт предсказание (движение начато до фактического ресайза).
    let predicting = false;
    let predictTimer = 0;
    let watchRaf = 0;

    // Анимируемое состояние: текущий подъём UI над нижней кромкой покоя.
    let lift = 0;
    let liftTarget = 0;
    let liftFrom = 0;
    let raf = 0;
    let animStart = 0;
    let animDuration = duration;
    let pinned = false;

    const setRest = () =>
      root.style.setProperty('--viewport-rest-height', `${window.innerHeight}px`);

    // «Высота покоя»: обновляется при росте (возврат после клавиатуры даёт
    // тот же максимум) и безусловно при смене ширины (поворот экрана).
    const updateRestHeight = () => {
      if (window.innerWidth !== prevInnerW) {
        prevInnerW = window.innerWidth;
        setRest();
        return;
      }
      const prev = parseFloat(root.style.getPropertyValue('--viewport-rest-height')) || 0;
      if (window.innerHeight > prev) setRest();
    };
    updateRestHeight();

    const applyLift = (v: number) => {
      const f = footerRef.current;
      // transform держим всегда (в т.ч. нулевой): снятие transform сносит
      // GPU-слой, что даёт разовое моргание.
      if (f) f.style.transform = `translate3d(0, ${-v}px, 0)`;
      const s = spacerRef.current;
      if (s) s.style.height = `${v}px`;
      if (pinned) {
        const el = scrollerRef.current;
        if (el) el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    };

    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

    const tick = (now: number) => {
      const t = Math.min(1, (now - animStart) / animDuration);
      lift = liftFrom + (liftTarget - liftFrom) * easeOutCubic(t);
      applyLift(lift);
      raf = t < 1 ? requestAnimationFrame(tick) : 0;
    };

    // Лента у низа (или скролла нет вовсе) — тогда она едет вместе с футером.
    const nearBottom = () => {
      const el = scrollerRef.current;
      if (!el) return false;
      return (
        el.scrollHeight <= el.clientHeight + 1 ||
        el.scrollHeight - lastScrollTop - el.clientHeight < 80
      );
    };

    const setLiftTarget = (target: number) => {
      if (target === liftTarget) return;
      dbg('lift', { from: Math.round(lift), to: target });
      liftTarget = target;
      pinned = nearBottom();
      if (raf) cancelAnimationFrame(raf);
      animStart = performance.now();
      liftFrom = lift;
      animDuration = target < lift ? downDuration : duration;
      raf = requestAnimationFrame(tick);
    };

    const clearPredictTimer = () => {
      if (predictTimer) {
        clearTimeout(predictTimer);
        predictTimer = 0;
      }
    };

    // Откат предсказания к фактическому состоянию вьюпорта.
    const revert = () => {
      predicting = false;
      clearPredictTimer();
      setLiftTarget(kbShrink);
    };

    const onScroll = () => {
      const el = scrollerRef.current;
      if (el) lastScrollTop = el.scrollTop;
    };

    // Единственный источник истины о фактическом ресайзе — window.innerHeight.
    const onViewportChange = () => {
      const innerH = window.innerHeight;
      const dh = prevInnerH - innerH; // > 0 — вьюпорт сжался
      if (dh === 0) return;
      prevInnerH = innerH;
      // Страховка от нативного «доскролла» документа под клавиатуру.
      if (window.scrollY) window.scrollTo(0, 0);

      if (dh > 0) {
        if (!focused) {
          // Поворот экрана и прочие ресайзы вне клавиатуры.
          updateRestHeight();
          dbg('vp-ignored', { dh, innerH });
          return;
        }
        kbShrink += dh;
        if (kbShrink > 100) rememberKb(kbShrink);
      } else {
        kbShrink = Math.max(0, kbShrink + dh);
      }

      predicting = false;
      clearPredictTimer();
      if (kbShrink === 0) updateRestHeight();

      dbg('vp', { dh, innerH, kbShrink, lift: Math.round(lift) });
      // Если предсказание было точным, цель не меняется — коммит ресайза
      // проходит без единого движения. Иначе плавно доводим разницу.
      setLiftTarget(kbShrink);
      ensureWatcher();
    };

    // Пока клавиатура открыта (или ожидается) — опрашиваем innerHeight каждый
    // кадр: события resize в WebView приходят позже фактического изменения.
    const watchActive = () => focused || predicting || kbShrink > 0;

    const watch = () => {
      watchRaf = 0;
      if (window.innerHeight !== prevInnerH) onViewportChange();
      if (watchActive()) watchRaf = requestAnimationFrame(watch);
    };

    const ensureWatcher = () => {
      if (!watchRaf && watchActive()) watchRaf = requestAnimationFrame(watch);
    };

    // Подъём до ресайза: kb — ожидаемая высота клавиатуры.
    const predictUp = (kb: number) => {
      dbg('predictUp', { kb });
      predicting = true;
      setLiftTarget(kb);
      clearPredictTimer();
      // Страховка: клавиатура так и не появилась — откат.
      predictTimer = window.setTimeout(revert, 900);
      ensureWatcher();
    };

    // Спуск до ресайза: сразу едем вниз; коммит роста вьюпорта ничего
    // не двигает, только расширяет видимую область.
    const startDescent = () => {
      dbg('descent', { kbShrink });
      predicting = true;
      setLiftTarget(0);
      clearPredictTimer();
      predictTimer = window.setTimeout(revert, 1200);
      // Сбрасываем возможный нативный сдвиг и просим Telegram вернуть
      // высоту WebView сейчас (второй раз — если с первого не помогло).
      window.scrollTo(0, 0);
      nudgeExpand();
      window.setTimeout(() => {
        if (kbShrink > 0) nudgeExpand();
      }, 250);
      ensureWatcher();
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      dbg('focusin', { kbShrink, rememberedKb });
      focused = true;
      ensureWatcher();
      if (!canPredict) return;
      if (kbShrink > 0) {
        // Клавиатура остаётся (перефокус) — отменяем начатый спуск.
        if (predicting) revert();
        return;
      }
      if (rememberedKb > 100) predictUp(rememberedKb);
    };

    const onFocusOut = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      if (isEditable(e.relatedTarget)) return; // фокус ушёл в другое поле
      dbg('focusout', { kbShrink, predicting });
      focused = false;
      if (predicting && kbShrink === 0) {
        // Подъём предсказали, а клавиатура не успела появиться — откат.
        revert();
        return;
      }
      if (kbShrink > 0) startDescent();
    };

    // iOS не снимает фокус с textarea при тапе по обычному диву — blur не
    // происходит и спуск не стартует. Снимаем фокус сами в момент касания
    // ленты: клавиатура и футер поедут вниз синхронно (стандарт мессенджеров).
    const onScrollerPointerDown = () => {
      if (!focused) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && isEditable(ae)) {
        dbg('blur-by-tap');
        ae.blur();
      }
    };

    // Telegram объявляет новую высоту (viewport_changed) на сотни миллисекунд
    // раньше, чем WebKit применит ресайз, — ранний точный сигнал в обе стороны.
    const onTgViewportChanged = () => {
      const announced = getTgWebApp()?.viewportHeight ?? 0;
      const innerH = window.innerHeight;
      dbg('tgVp', { announced, innerH, kbShrink, predicting });
      if (!announced || !canPredict) return;
      if (kbShrink > 0 && !predicting && announced > innerH + 50) {
        // Клавиатуру закрыли без blur (жест/системная кнопка) — спуск.
        startDescent();
      } else if (focused && announced < innerH - 100) {
        // Точная высота клавиатуры известна до ресайза: запускаем подъём
        // (первое открытие без сохранённой высоты) или уточняем его цель.
        const kb = innerH - announced;
        rememberKb(kb);
        predicting = true;
        clearPredictTimer();
        predictTimer = window.setTimeout(revert, 900);
        setLiftTarget(kb);
        ensureWatcher();
      }
    };

    const scroller = scrollerRef.current;
    const footerAtSetup = footerRef.current;
    const spacerAtSetup = spacerRef.current;

    // Пока страница живёт от «высоты покоя», документ может стать выше
    // вьюпорта — запрещаем его скролл (лента скроллится сама).
    const prevBodyOverflow = document.body.style.overflow;
    const prevRootOverflow = root.style.overflow;
    document.body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';

    // Создаём GPU-слой футера заранее, а не посреди первой анимации.
    applyLift(0);

    scroller?.addEventListener('scroll', onScroll, { passive: true });
    scroller?.addEventListener('pointerdown', onScrollerPointerDown, { passive: true });
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    // visualViewport протухает и в модели не участвует — но его события
    // используем как лишний повод перепроверить innerHeight.
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
    try {
      getTgWebApp()?.onEvent?.('viewportChanged', onTgViewportChanged);
    } catch { /* ignore */ }

    return () => {
      scroller?.removeEventListener('scroll', onScroll);
      scroller?.removeEventListener('pointerdown', onScrollerPointerDown);
      try {
        getTgWebApp()?.offEvent?.('viewportChanged', onTgViewportChanged);
      } catch { /* ignore */ }
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
      if (raf) cancelAnimationFrame(raf);
      if (watchRaf) cancelAnimationFrame(watchRaf);
      clearPredictTimer();
      document.body.style.overflow = prevBodyOverflow;
      root.style.overflow = prevRootOverflow;
      if (footerAtSetup) footerAtSetup.style.transform = '';
      if (spacerAtSetup) spacerAtSetup.style.height = '';
    };
  }, [footerRef, scrollerRef, spacerRef, duration]);
}
