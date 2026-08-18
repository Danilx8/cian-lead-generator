/**
 * Логи цепочки верификации телефона слота (префикс консоли: [slot-verify]).
 *
 * - В dev (vite) логи включены всегда.
 * - В production: localStorage.setItem('DEBUG_SLOT_VERIFY','1') → обновить страницу.
 * - Выключить: localStorage.removeItem('DEBUG_SLOT_VERIFY')
 *
 * Фильтр в Chrome DevTools: slot-verify
 */
export function slotVerifyDebugEnabled(): boolean {
    if (import.meta.env.DEV) return true;
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_SLOT_VERIFY') === '1';
    } catch {
        return false;
    }
}

export function slotVerifyLog(...args: unknown[]): void {
    if (!slotVerifyDebugEnabled()) return;
    console.log('[slot-verify]', ...args);
}
