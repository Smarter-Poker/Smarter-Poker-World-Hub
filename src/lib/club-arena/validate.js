/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ORB-1 Input Validation — Shared Hardening Utilities
 *
 * RED TEAM hardening layer. All ORB-1 API routes MUST call these before
 * touching Postgres. Rejects hostile payloads at the gate.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_SIZE = 2048; // 2KB — no payload should ever be larger

/**
 * Validate a UUID string (prevents SQL injection via malformed IDs)
 * @param {string} val
 * @returns {boolean}
 */
function isUUID(val) {
    return typeof val === 'string' && UUID_RE.test(val);
}

/**
 * Validate a positive integer within bounds
 * @param {*} raw
 * @param {number} min
 * @param {number} max
 * @returns {{ valid: boolean, value: number, error?: string }}
 */
function validateAmount(raw, min = 1, max = 100_000_000) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return { valid: false, value: 0, error: 'Amount must be a number' };
    const floored = Math.floor(num);
    if (floored <= 0) return { valid: false, value: 0, error: 'Amount must be positive' };
    if (floored < min) return { valid: false, value: 0, error: `Amount must be at least ${min}` };
    if (floored > max) return { valid: false, value: 0, error: `Amount must be at most ${max.toLocaleString()}` };
    if (num !== floored) return { valid: false, value: 0, error: 'Fractional chips are not allowed' };
    return { valid: true, value: floored };
}

/**
 * Sanitize a free-text note field
 * @param {*} raw
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeNote(raw, maxLen = 200) {
    if (!raw || typeof raw !== 'string') return '';
    // Strip control characters, null bytes, and angle brackets (XSS)
    return raw.replace(/[\x00-\x1F<>]/g, '').trim().slice(0, maxLen);
}

/**
 * Reject oversized payloads and unknown fields.
 * Call at the top of every POST handler.
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {string[]} allowedFields
 * @returns {boolean} true if request was rejected (handler should return)
 */
function rejectBadPayload(req, res, allowedFields) {
    const body = req.body;

    // 1. Payload size gate
    const bodyStr = JSON.stringify(body || {});
    if (bodyStr.length > MAX_BODY_SIZE) {
        res.status(413).json({ success: false, error: 'Request body too large' });
        return true;
    }

    // 2. Field allowlist — reject unknown keys (prevents field injection)
    const allowed = new Set(allowedFields);
    const unknown = Object.keys(body || {}).filter(k => !allowed.has(k));
    if (unknown.length > 0) {
        res.status(400).json({ success: false, error: `Unknown fields: ${unknown.join(', ')}` });
        return true;
    }

    return false;
}

module.exports = { isUUID, validateAmount, sanitizeNote, rejectBadPayload, UUID_RE, MAX_BODY_SIZE };
