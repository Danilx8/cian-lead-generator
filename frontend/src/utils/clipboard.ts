function legacyCopy(text: string): boolean {
  const el = document.createElement('textarea');
  el.value = text;
  // contentEditable + range selection is what iOS WebView needs to allow the
  // copy; keep it editable (not readonly) so the selection sticks.
  (el as HTMLElement & { contentEditable: string }).contentEditable = 'true';
  // Off-screen but rendered — an opacity:0 / pointer-events:none node is not
  // reliably selectable, and font-size:16px avoids iOS auto-zoom on focus.
  el.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;font-size:16px;background:transparent;';
  document.body.appendChild(el);

  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  el.focus();
  el.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  document.body.removeChild(el);
  return ok;
}

export async function copyToClipboard(text: string): Promise<void> {
  // Modern async clipboard works on iOS/Android WebView in a secure context as
  // long as it's the first await inside the click handler (gesture is intact).
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to the execCommand fallback
    }
  }

  if (!legacyCopy(text)) {
    throw new Error('Не удалось скопировать');
  }
}
