import { useEffect, useState } from 'react';

export function useKeyboardOpen(threshold = 120) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let t: number | undefined;
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;

    const check = () => {
      const winH = window.innerHeight || 0;
      const vvh = vv?.height ?? winH;
      const shrunk = winH - vvh > threshold;
      const ae = document.activeElement as HTMLElement | null;
      const focused =
        !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      setOpen(shrunk || focused);
    };

    const onFocusIn = () => check();
    const onFocusOut = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(check, 80);
    };
    const onResize = () => check();
    const onVVResize = () => check();
    const onVVScroll = () => check();

    vv?.addEventListener('resize', onVVResize);
    vv?.addEventListener('scroll', onVVScroll);
    window.addEventListener('focusin', onFocusIn);
    window.addEventListener('focusout', onFocusOut);
    window.addEventListener('resize', onResize);
    check();

    return () => {
      vv?.removeEventListener('resize', onVVResize);
      vv?.removeEventListener('scroll', onVVScroll);
      window.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('resize', onResize);
      if (t) window.clearTimeout(t);
    };
  }, [threshold]);

  return open;
}
