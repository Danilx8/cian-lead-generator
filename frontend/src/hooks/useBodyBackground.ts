import { useLayoutEffect } from 'react';

export function useBodyBackground(className: string) {
  useLayoutEffect(() => {
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }, [className]);
}
