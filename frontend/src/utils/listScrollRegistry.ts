let flushMessagesList: (() => void) | null = null;
let flushSlotsList: (() => void) | null = null;

export function registerMessagesListFlush(fn: () => void): () => void {
  flushMessagesList = fn;
  return () => {
    flushMessagesList = null;
  };
}

export function registerSlotsListFlush(fn: () => void): () => void {
  flushSlotsList = fn;
  return () => {
    flushSlotsList = null;
  };
}

export function flushMessagesListScrollIfRegistered(): void {
  flushMessagesList?.();
}

export function flushSlotsListScrollIfRegistered(): void {
  flushSlotsList?.();
}
