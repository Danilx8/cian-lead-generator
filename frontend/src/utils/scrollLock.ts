let lockCount = 0;
let savedScrollY = 0;
let prevBodyStyles: { position?: string; top?: string; width?: string; paddingRight?: string } | null = null;
let prevDocOverflow: string | null = null;
// The app scrolls inside #app-scroll-root (its `overflow-x: hidden` makes
// overflow-y compute to auto), NOT on <body>. When that container exists we
// lock IT and leave <body> alone — touching <body> shifts layout and moves the
// content to the top, which knocks floating popups out of place.
let rootLocked = false;
let prevRootOverflow: string | null = null;
let savedRootScrollTop = 0;
const getScrollRoot = () => document.getElementById('app-scroll-root');

const isScrollable = (el: Element) => {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
};

// Allow the gesture when the finger is inside a scrollable container so
// popovers/modals with their own scroll areas keep working while the page is locked.
const touchAllowed = (target: EventTarget | null) => {
    let node = target as Element | null;
    while (node && node !== document.body) {
        if (node.nodeType === 1 && isScrollable(node)) return true;
        node = node.parentElement;
    }
    return false;
};

const touchHandler = (e: TouchEvent) => {
    if (touchAllowed(e.target)) return;
    if (e.cancelable) e.preventDefault();
};

export function lockScroll() {
    try {
        lockCount += 1;
        if (lockCount > 1) return;

        // Prevent touchmove on iOS (except inside scrollable areas).
        document.addEventListener('touchmove', touchHandler, { passive: false });

        const scrollRoot = getScrollRoot();
        if (scrollRoot) {
            rootLocked = true;
            prevRootOverflow = scrollRoot.style.overflow;
            savedRootScrollTop = scrollRoot.scrollTop;
            scrollRoot.style.overflow = 'hidden';
            // overflow:hidden can drop scrollTop — pin it back so nothing jumps.
            scrollRoot.scrollTop = savedRootScrollTop;
            return;
        }

        // Fallback: <body> is the scroller.
        const body = document.body;
        const docEl = document.documentElement;
        savedScrollY = window.scrollY || window.pageYOffset || 0;
        prevBodyStyles = {
            position: body.style.position,
            top: body.style.top,
            width: body.style.width,
            paddingRight: body.style.paddingRight,
        };
        prevDocOverflow = docEl.style.overflow;

        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
        if (scrollBarWidth > 0) body.style.paddingRight = `${scrollBarWidth}px`;

        body.style.position = 'fixed';
        body.style.top = `-${savedScrollY}px`;
        body.style.width = '100%';
        docEl.style.overflow = 'hidden';
    } catch {
        // fail silently
    }
}

export function unlockScroll() {
    try {
        lockCount = Math.max(0, lockCount - 1);
        if (lockCount > 0) return;

        document.removeEventListener('touchmove', touchHandler);

        if (rootLocked) {
            const scrollRoot = getScrollRoot();
            if (scrollRoot) {
                scrollRoot.style.overflow = prevRootOverflow || '';
                scrollRoot.scrollTop = savedRootScrollTop;
            }
            rootLocked = false;
            prevRootOverflow = null;
            savedRootScrollTop = 0;
            return;
        }

        const body = document.body;
        const docEl = document.documentElement;

        if (prevDocOverflow != null) docEl.style.overflow = prevDocOverflow;
        if (prevBodyStyles) {
            body.style.position = prevBodyStyles.position || '';
            body.style.top = prevBodyStyles.top || '';
            body.style.width = prevBodyStyles.width || '';
            body.style.paddingRight = prevBodyStyles.paddingRight || '';
        } else {
            body.style.position = '';
            body.style.top = '';
            body.style.width = '';
            body.style.paddingRight = '';
        }

        // restore scroll position
        window.scrollTo(0, savedScrollY || 0);
        savedScrollY = 0;
        prevBodyStyles = null;
        prevDocOverflow = null;
    } catch {
        // fail silently
    }
}

export function isScrollLocked() {
    return lockCount > 0;
}
