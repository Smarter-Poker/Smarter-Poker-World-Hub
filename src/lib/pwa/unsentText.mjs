/**
 * Whether the page holds text the person typed and has not sent (2026-10-31).
 * ServiceWorkerUpdater waits for this to clear before reloading onto a new
 * build, so an update never wipes a half-written message, comment or post.
 *
 * Only text the person typed counts: trackTyping() records every element that
 * received an `input` event, and hasUnsentText() asks whether any of those
 * still holds non-blank text. A value a page filled in itself (a default, a
 * restored filter) never holds an update back. A search box is not a draft,
 * and an element can opt out with data-sp-reload-safe.
 */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'email', 'url', 'tel', 'number']);

export function isDraftField(el) {
    if (!el || typeof el !== 'object') return false;
    if (el.closest && el.closest('[data-sp-reload-safe]')) return false;
    if (el.disabled || el.readOnly) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') return TEXT_INPUT_TYPES.has(String(el.getAttribute?.('type') || '').toLowerCase());
    return el.isContentEditable === true;
}

export function trackTyping(doc, typed = new Set()) {
    if (!doc || typeof doc.addEventListener !== 'function') return { typed, stop: () => {} };
    const onInput = event => { const el = event?.target; if (isDraftField(el)) typed.add(el); };
    doc.addEventListener('input', onInput, true);
    return { typed, stop: () => doc.removeEventListener('input', onInput, true) };
}

export function hasUnsentText(typed) {
    if (!typed) return false;
    for (const el of [...typed]) {
        if (el.isConnected === false) { typed.delete(el); continue; }
        if (!isDraftField(el)) continue;
        const tag = String(el.tagName || '').toLowerCase();
        const text = tag === 'textarea' || tag === 'input' ? el.value : el.textContent;
        if (typeof text === 'string' && text.trim() !== '') return true;
        typed.delete(el);
    }
    return false;
}
