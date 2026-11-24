/**
 * Fail-safe server-side Supabase Realtime HTTP Broadcast emitter for Trivia
 * PvP, Direct Friend Challenges, and Nightly Tournaments.
 *
 * Security contract:
 *  - Uses Supabase Realtime HTTP Broadcast API (`POST ${SUPABASE_URL}/realtime/v1/api/broadcast`)
 *    authenticated with the server-side `SUPABASE_SERVICE_ROLE_KEY`.
 *  - Emits ONLY sanitized, answer-free state-change signals:
 *    `{ type: 'state_change', seq, entityId, state, updatedAt, ...allowlistedScalars }`.
 *  - Explicitly strips and refuses any answer key, correct_index, permutation,
 *    horse plan, explanation, or private opponent/credential field.
 *  - Short 1500 ms timeout; never throws or blocks API responses.
 */

const DEFAULT_TIMEOUT_MS = 1500;
const CHANNEL_RE = /^trivia:[a-z0-9:_-]{3,160}$/i;
const EVENT_RE = /^[a-z0-9_:-]{2,64}$/i;

export const FORBIDDEN_BROADCAST_KEYS = Object.freeze([
    'correct_index',
    'correctIndex',
    'chosen_original_index',
    'chosenOriginalIndex',
    'planned_correct',
    'plannedCorrect',
    'horse_plan',
    'horsePlan',
    'horse_plan_key',
    'horsePlanKey',
    'permutations',
    'revision_id',
    'revisionId',
    'seed_secret',
    'seedSecret',
    'secret',
    'answer',
    'answers',
    'correct_answer',
    'correctAnswer',
    'explanation',
    'opponent_score',
    'opponentScore',
    'opponent_answers',
    'opponentAnswers',
    'token',
    'access_token',
    'accessToken',
    'password',
    'email',
    'service_role_key',
    'serviceRoleKey',
    'apikey',
    'apiKey',
]);

const FORBIDDEN_KEY_SET = new Set(FORBIDDEN_BROADCAST_KEYS.map((key) => key.toLowerCase()));

const ALLOWLISTED_PAYLOAD_KEYS = Object.freeze([
    'type',
    'seq',
    'entityId',
    'state',
    'updatedAt',
    'action',
    'matchId',
    'challengeCode',
    'tournamentId',
]);

let lastEmittedSeq = 0;

export function nextBroadcastSeq(nowMs = Date.now()) {
    const candidate = Number.isFinite(nowMs) ? Math.trunc(nowMs) : Date.now();
    lastEmittedSeq = candidate > lastEmittedSeq ? candidate : lastEmittedSeq + 1;
    return lastEmittedSeq;
}

export function findForbiddenBroadcastKeys(value, prefix = '', depth = 0) {
    if (depth > 8 || value === null || value === undefined || typeof value !== 'object') {
        return [];
    }
    if (Array.isArray(value)) {
        const hits = [];
        for (let i = 0; i < value.length; i += 1) {
            hits.push(...findForbiddenBroadcastKeys(value[i], `${prefix}[${i}]`, depth + 1));
        }
        return hits;
    }
    const hits = [];
    for (const [key, nested] of Object.entries(value)) {
        const normalized = String(key).toLowerCase();
        const path = prefix ? `${prefix}.${key}` : key;
        if (FORBIDDEN_KEY_SET.has(normalized)) {
            hits.push(path);
        }
        if (nested && typeof nested === 'object') {
            hits.push(...findForbiddenBroadcastKeys(nested, path, depth + 1));
        }
    }
    return hits;
}

function toSafeScalar(value, maxLen = 128) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed.slice(0, maxLen) : null;
    }
    return null;
}

/**
 * Builds a strictly sanitized, answer-free broadcast payload.
 * Returns null if the input contains forbidden answer/secret keys so a
 * programming bug can never accidentally leak private state over Realtime.
 */
export function sanitizeBroadcastPayload(rawPayload = {}, { seq = null, updatedAt = null } = {}) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
        return null;
    }
    if (findForbiddenBroadcastKeys(rawPayload).length > 0) {
        return null;
    }

    const resolvedSeq = Number.isInteger(seq) && seq > 0
        ? seq
        : Number.isInteger(rawPayload.seq) && rawPayload.seq > 0
            ? rawPayload.seq
            : nextBroadcastSeq();

    const resolvedUpdatedAt = toSafeScalar(updatedAt || rawPayload.updatedAt, 48) || new Date().toISOString();
    const out = {
        type: toSafeScalar(rawPayload.type, 48) || 'state_change',
        seq: resolvedSeq,
        entityId: toSafeScalar(rawPayload.entityId, 128),
        state: toSafeScalar(rawPayload.state, 64) || 'updated',
        updatedAt: resolvedUpdatedAt,
    };

    for (const key of ALLOWLISTED_PAYLOAD_KEYS) {
        if (key in out) continue;
        if (rawPayload[key] !== undefined && rawPayload[key] !== null) {
            const safe = toSafeScalar(rawPayload[key], 128);
            if (safe !== null) out[key] = safe;
        }
    }
    return out;
}

export function normalizeBroadcastMessage({ channel, event = 'state_update', payload = {} } = {}) {
    const topic = typeof channel === 'string' ? channel.trim() : '';
    const eventName = typeof event === 'string' ? event.trim() : '';
    if (!CHANNEL_RE.test(topic) || !EVENT_RE.test(eventName)) {
        return null;
    }
    const cleanPayload = sanitizeBroadcastPayload(payload);
    if (!cleanPayload) {
        return null;
    }
    return {
        topic,
        event: eventName,
        payload: cleanPayload,
    };
}

/**
 * Emits one or more sanitized broadcast messages to Supabase Realtime.
 * Never throws; returns `{ ok, sent, status, reason }`.
 */
export async function emitTriviaRealtimeBroadcasts(
    entries,
    {
        env = process.env,
        fetchImpl = globalThis.fetch,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = {},
) {
    try {
        const list = Array.isArray(entries) ? entries : [entries];
        const messages = [];
        for (const entry of list) {
            const normalized = normalizeBroadcastMessage(entry);
            if (normalized) messages.push(normalized);
        }
        if (messages.length === 0) {
            return { ok: false, sent: 0, reason: 'no_valid_messages' };
        }

        const supabaseUrl = String(env?.NEXT_PUBLIC_SUPABASE_URL || env?.SUPABASE_URL || '').trim().replace(/\/+$/, '');
        const serviceKey = String(env?.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        if (!supabaseUrl || !serviceKey || typeof fetchImpl !== 'function') {
            return { ok: false, sent: 0, reason: 'broadcast_unconfigured' };
        }

        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const clampedTimeout = Number.isFinite(timeoutMs) ? Math.min(Math.max(Math.trunc(timeoutMs), 100), 5000) : DEFAULT_TIMEOUT_MS;
        const timer = controller ? setTimeout(() => controller.abort(), clampedTimeout) : null;

        try {
            const response = await fetchImpl(`${supabaseUrl}/realtime/v1/api/broadcast`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({ messages }),
                ...(controller ? { signal: controller.signal } : {}),
            });
            return {
                ok: Boolean(response?.ok),
                sent: response?.ok ? messages.length : 0,
                status: Number(response?.status || 0),
                reason: response?.ok ? 'sent' : 'http_error',
            };
        } finally {
            if (timer) clearTimeout(timer);
        }
    } catch (err) {
        return {
            ok: false,
            sent: 0,
            reason: err?.name === 'AbortError' ? 'timeout' : 'network_error',
        };
    }
}

export async function emitTriviaRealtimeBroadcast(entry, options = {}) {
    return emitTriviaRealtimeBroadcasts([entry], options);
}
