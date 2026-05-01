/**
 * XSS Neutralizer — shared across messenger API routes
 * Strips dangerous HTML patterns from message content before DB storage.
 * React auto-escapes content on render, but defense-in-depth prevents
 * future regressions if render paths change (e.g. dangerouslySetInnerHTML).
 */
export function sanitizeMessage(text) {
    if (!text || typeof text !== 'string') return text;

    // Strip <script> tags and their contents
    let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[Removed Malicious Code]');

    // Strip dangerous embedding tags that could load external content
    clean = clean.replace(/<(iframe|object|embed|frame|frameset)\b[^>]*>[\s\S]*?<\/\1>/gi, '[Removed]');
    clean = clean.replace(/<(iframe|object|embed|frame|frameset)\b[^>]*\/?>/gi, '[Removed]');

    // Strip inline event handlers (e.g. onerror=, onload=, onclick=)
    clean = clean.replace(/on\w+\s*=/gi, 'data-blocked=');

    // Strip javascript: and vbscript: protocol URIs (dangerous in href/src attributes)
    clean = clean.replace(/javascript\s*:/gi, 'blocked:');
    clean = clean.replace(/vbscript\s*:/gi, 'blocked:');

    // Strip data: URIs (can encode executable payloads)
    clean = clean.replace(/data\s*:/gi, 'blocked:');

    return clean;
}

/**
 * Escape special LIKE/ILIKE characters in user input
 * Prevents % and _ from being treated as wildcards
 */
export function escapeLikeQuery(query) {
    if (!query) return query;
    return query.replace(/[%_\\]/g, '\\$&');
}
