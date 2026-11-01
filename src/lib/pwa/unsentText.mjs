/**
 * Whether the page holds text the person typed and has not sent (2026-10-31).
 * ServiceWorkerUpdater waits for this to clear before reloading onto a new
 * build, so an update never wipes a half-written message, comment or post.
 *
 * Counted: a textarea, a contenteditable region, or a text-like input with
 * non-blank content. A search box is not a draft. An element can opt out with
 * data-sp-reload-safe (for example a field the page restores itself).
 */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'email', 'url', 'tel', 'number']);

export function hasUnsentText(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return false;
    for (const el of doc.querySelectorAll('textarea, input, [contenteditable=""], [contenteditable="true"]')) {
        if (el.closest && el.closest('[data-sp-reload-safe]')) continue;
        if (el.disabled || el.readOnly) continue;
        const tag = String(el.tagName || '').toLowerCase();
        if (tag === 'input' && !TEXT_INPUT_TYPES.has(String(el.getAttribute('type') || '').toLowerCase())) continue;
        const text = tag === 'textarea' || tag === 'input' ? el.value : el.textContent;
        if (typeof text === 'string' && text.trim() !== '') return true;
    }
    return false;
}
