/**
 * RED TEAM Validation Utilities — Club Arena
 * 
 * Centralized input sanitization and hostile payload rejection.
 * Every chip-moving or state-mutating API endpoint MUST use these guards
 * before any database interaction.
 * 
 * MANDATE: Reject 100% of garbage data with 400 Bad Request before it touches Postgres.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reject oversized request bodies.
 * @returns {string|null} Error message if invalid, null if OK.
 */
function validatePayloadSize(body, maxBytes = 1024) {
    const bodyStr = JSON.stringify(body || {});
    if (bodyStr.length > maxBytes) {
        return `Request body too large (${bodyStr.length} bytes, max ${maxBytes})`;
    }
    return null;
}

/**
 * Reject unknown fields not in the allowlist.
 * @returns {string|null} Error message if invalid, null if OK.
 */
function validateAllowedFields(body, allowedSet) {
    const unknown = Object.keys(body || {}).filter(k => !allowedSet.has(k));
    if (unknown.length > 0) {
        return `Unknown fields: ${unknown.join(', ')}`;
    }
    return null;
}

/**
 * Validate UUID format — blocks SQL injection and garbage IDs.
 * @returns {string|null} Error message if invalid, null if OK.
 */
function validateUUID(value, fieldName = 'id') {
    if (!value || typeof value !== 'string' || !UUID_RE.test(value)) {
        return `Invalid ${fieldName} format (must be UUID)`;
    }
    return null;
}

/**
 * Safe integer parsing with strict bounds.
 * Returns { value, error }. Error is non-null if input is hostile.
 */
function sanitizeInt(raw, { min = 1, max = 100_000_000, fallback = null, fieldName = 'value' } = {}) {
    if (raw === undefined || raw === null) {
        return { value: fallback, error: fallback === null ? `${fieldName} is required` : null };
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
        return { value: null, error: `${fieldName} must be a finite number` };
    }
    const int = Math.floor(num);
    if (int < min || int > max) {
        return { value: null, error: `${fieldName} must be between ${min.toLocaleString()} and ${max.toLocaleString()}` };
    }
    return { value: int, error: null };
}

/**
 * Safe float parsing with strict bounds.
 * Returns { value, error }.
 */
function sanitizeFloat(raw, { min = 0, max = 100_000_000, fallback = null, fieldName = 'value' } = {}) {
    if (raw === undefined || raw === null) {
        return { value: fallback, error: fallback === null ? `${fieldName} is required` : null };
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) {
        return { value: null, error: `${fieldName} must be a finite number` };
    }
    if (num < min || num > max) {
        return { value: null, error: `${fieldName} must be between ${min} and ${max.toLocaleString()}` };
    }
    return { value: num, error: null };
}

/**
 * Reject spoofed user identity in body — NEVER trust req.body for auth.
 * @returns {string|null} Error message if spoofing detected, null if OK.
 */
function rejectBodyUserId(body) {
    if (body?.user_id || body?.userId) {
        return 'user_id/userId in request body is forbidden. Identity is derived from JWT.';
    }
    return null;
}

/**
 * Validate a string field — max length, no control characters.
 * @returns {string|null} Error message if invalid, null if OK.
 */
function validateString(value, fieldName, maxLength = 500) {
    if (value !== undefined && value !== null) {
        if (typeof value !== 'string') return `${fieldName} must be a string`;
        if (value.length > maxLength) return `${fieldName} too long (max ${maxLength} chars)`;
        // Block control characters (except newline/tab for notes)
        if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) return `${fieldName} contains invalid characters`;
    }
    return null;
}

/**
 * Run all standard guards in sequence. Returns first error or null.
 * @param {object} req - The request object
 * @param {object} opts - { maxBodySize, allowedFields, uuids: { fieldName: value, ... } }
 * @returns {string|null}
 */
function runStandardGuards(body, { maxBodySize = 1024, allowedFields, uuids } = {}) {
    // 1. Payload size
    const sizeErr = validatePayloadSize(body, maxBodySize);
    if (sizeErr) return { error: sizeErr, status: 413 };

    // 2. Field allowlist
    if (allowedFields) {
        const fieldErr = validateAllowedFields(body, allowedFields);
        if (fieldErr) return { error: fieldErr, status: 400 };
    }

    // 3. Body user_id spoofing
    const spoofErr = rejectBodyUserId(body);
    if (spoofErr) return { error: spoofErr, status: 400 };

    // 4. UUID validation
    if (uuids) {
        for (const [name, value] of Object.entries(uuids)) {
            if (value !== undefined && value !== null) {
                const uuidErr = validateUUID(value, name);
                if (uuidErr) return { error: uuidErr, status: 400 };
            }
        }
    }

    return null; // All clear
}

module.exports = {
    validatePayloadSize,
    validateAllowedFields,
    validateUUID,
    sanitizeInt,
    sanitizeFloat,
    rejectBodyUserId,
    validateString,
    runStandardGuards,
    UUID_RE,
};
