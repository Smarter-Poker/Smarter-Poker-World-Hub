/**
 * XSS Neutralizer — shared across messenger API routes
 * Strips <script> tags and inline event handlers from message content
 */
export function sanitizeMessage(text) {
    if (!text) return text;
    // Strip <script> tags and their contents
    let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[Removed Malicious Code]');
    // Strip inline event handlers like onerror=
    clean = clean.replace(/on\w+\s*=/gi, 'data-blocked=');
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
