/**
 * Password Strength + HIBP Breach Check — Phase 6.1.20
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Policy (informed by NIST SP 800-63B §5.1.1.2):
 *
 * 1. **Minimum length 10.** 8 is the NIST floor; we pick 10 because the
 *    poker domain is a high-value target (real money adjacent). Max length
 *    is not enforced client-side — we accept anything up to 256 chars so
 *    passphrases work. Supabase caps at 72 (bcrypt limit) — we flag
 *    >72 on submit so users know to trim.
 *
 * 2. **Entropy floor.** Rather than the usual "1 upper, 1 number, 1 symbol"
 *    ruleset (which NIST explicitly recommends against — it biases users
 *    toward predictable substitutions like Password1!), we score the
 *    password by estimated entropy using Shannon + character-class expansion
 *    + a small dictionary of common words. Users must hit 40 bits.
 *
 * 3. **Breach list check (HIBP k-anonymity).** Client computes SHA-1 of the
 *    password, sends the first 5 hex chars to api.pwnedpasswords.com, and
 *    checks if the remaining 35-char suffix appears in the returned list.
 *    The full password never leaves the browser. Matches at any
 *    breach-count threshold are rejected — once a password appears in a
 *    breach corpus it's permanently compromised for credential-stuffing.
 *
 * All three checks also run server-side to prevent client bypass. The
 * server-side HIBP hit is best-effort (falls back to strength check only
 * if HIBP is unreachable — we don't want signup to break if a third party
 * is down).
 */

const MIN_LENGTH = 10;
const MAX_LENGTH = 72; // bcrypt truncates, we refuse for clarity
const MIN_ENTROPY_BITS = 40;

// Tiny dictionary of the top abusive password bases. We don't need the full
// HIBP list here — that's handled by the k-anonymity call. This list just
// catches the cases where someone picks "password" or "qwerty" before we
// even round-trip to HIBP, for instant feedback.
const COMMON_BASES = new Set([
    'password', 'passw0rd', 'qwerty', 'qwertyuiop', '123456', '12345678',
    '123456789', 'letmein', 'welcome', 'admin', 'administrator', 'iloveyou',
    'monkey', 'dragon', 'abc123', 'football', 'baseball', 'mustang',
    'shadow', 'superman', 'batman', 'trustno1', 'princess', 'sunshine',
    'master', 'hottie', 'loveme', 'zaq12wsx', 'poker', 'smarter'
]);

/**
 * Classify the character set used and estimate a rough entropy.
 * This is deliberately conservative — real entropy is hard, but this gives
 * a meaningful floor that blocks obviously weak passwords.
 */
function estimateEntropyBits(pw) {
    if (!pw) return 0;
    const hasLower = /[a-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasDigit = /[0-9]/.test(pw);
    const hasSymbol = /[^A-Za-z0-9]/.test(pw);

    let poolSize = 0;
    if (hasLower) poolSize += 26;
    if (hasUpper) poolSize += 26;
    if (hasDigit) poolSize += 10;
    if (hasSymbol) poolSize += 33; // approximate printable-symbol pool
    if (poolSize === 0) return 0;

    // log2(poolSize) * length — ignores character repetition and common
    // patterns. Penalise passwords where >70% of chars are one class
    // (e.g. all-lowercase passphrases are fine; "aaaaaaaa1" is not).
    let entropy = pw.length * Math.log2(poolSize);

    // Length-based diminishing penalty for identical consecutive chars
    // and for the password being a single dictionary word.
    const lower = pw.toLowerCase();
    if (COMMON_BASES.has(lower)) entropy = Math.min(entropy, 10);
    // Strip digits from end: "password1" ≈ "password" in practice.
    const stripped = lower.replace(/[0-9!@#$%^&*]+$/g, '');
    if (COMMON_BASES.has(stripped)) entropy = Math.min(entropy, 15);

    // Repeats: "aaaaaaaa" has high pool-size-based entropy but is trivial.
    const uniqueRatio = new Set(pw).size / pw.length;
    if (uniqueRatio < 0.3) entropy *= uniqueRatio / 0.3;

    return Math.round(entropy);
}

/**
 * Local checks that don't require a network call. Returns
 * { ok: true } or { ok: false, reason }.
 */
function validatePasswordLocal(pw) {
    if (!pw || typeof pw !== 'string') {
        return { ok: false, reason: 'Password is required.' };
    }
    if (pw.length < MIN_LENGTH) {
        return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters.` };
    }
    if (pw.length > MAX_LENGTH) {
        return { ok: false, reason: `Password must be ${MAX_LENGTH} characters or fewer.` };
    }
    if (COMMON_BASES.has(pw.toLowerCase())) {
        return { ok: false, reason: 'That password is too common. Please pick something unique.' };
    }
    const entropy = estimateEntropyBits(pw);
    if (entropy < MIN_ENTROPY_BITS) {
        return {
            ok: false,
            reason: `Password is too weak (strength ${entropy} / ${MIN_ENTROPY_BITS}). Try adding more characters or a passphrase.`,
            entropy
        };
    }
    return { ok: true, entropy };
}

/**
 * SHA-1 hex digest — used only for HIBP k-anonymity lookups. SHA-1 is
 * cryptographically broken but HIBP's API uses it by design (they truncate
 * to first 5 chars anyway). We never use SHA-1 for password storage.
 *
 * Uses Web Crypto on the client; on the server, falls back to Node's
 * `crypto` module.
 */
async function sha1Hex(str) {
    // Browser path
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        const buf = new TextEncoder().encode(str);
        const digest = await window.crypto.subtle.digest('SHA-1', buf);
        return Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    }
    // Node path
    // eslint-disable-next-line global-require
    const crypto = require('crypto');
    return crypto.createHash('sha1').update(str, 'utf8').digest('hex').toUpperCase();
}

/**
 * HIBP k-anonymity lookup. We send only the first 5 chars of the SHA-1
 * hash; HIBP returns all suffixes that share that prefix, along with how
 * many times each has been seen in breach corpora. We check our suffix
 * against the list locally.
 *
 * Fails-open on network error (returns { ok: true, breachCount: null })
 * — we don't want a third-party outage to block signup entirely.
 *
 * Returns { ok, breachCount, reason? }.
 */
async function checkHIBP(pw, { timeoutMs = 3000 } = {}) {
    try {
        const hash = await sha1Hex(pw);
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5);

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        // Add-Padding asks HIBP to pad responses with random-count dummy
        // entries so that response size doesn't leak information about
        // whether our password was found.
        const fetchFn = (typeof fetch !== 'undefined')
            ? fetch
            : (...args) => import('node-fetch').then((m) => m.default(...args));

        const resp = await fetchFn(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: { 'Add-Padding': 'true' },
            signal: controller.signal
        });
        clearTimeout(t);

        if (!resp.ok) {
            // HIBP unreachable or returning non-2xx — fail open.
            return { ok: true, breachCount: null, reason: 'hibp_unreachable' };
        }

        const text = await resp.text();
        // Response format: each line is "<SUFFIX>:<COUNT>"
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const [s, countStr] = line.split(':');
            if (s && s.trim().toUpperCase() === suffix) {
                const count = parseInt(countStr, 10) || 0;
                if (count > 0) {
                    return {
                        ok: false,
                        breachCount: count,
                        reason: `This password has appeared in ${count.toLocaleString()} known data breaches. Please choose a different password.`
                    };
                }
            }
        }
        return { ok: true, breachCount: 0 };
    } catch (err) { console.warn('[App] Handled exception:', err?.message || err); };
    }
}

/**
 * Full password validation — runs local checks, then HIBP if local passes.
 * Returns { ok, reason?, entropy?, breachCount? }.
 */
async function validatePassword(pw, opts = {}) {
    const local = validatePasswordLocal(pw);
    if (!local.ok) return local;

    const hibp = await checkHIBP(pw, opts);
    if (!hibp.ok) {
        return {
            ok: false,
            reason: hibp.reason,
            entropy: local.entropy,
            breachCount: hibp.breachCount
        };
    }
    return {
        ok: true,
        entropy: local.entropy,
        breachCount: hibp.breachCount
    };
}

/**
 * Convert an entropy value into a 0–4 "strength" score for UI meters.
 */
function entropyToScore(bits) {
    if (!bits || bits < 20) return 0;     // very weak
    if (bits < 30) return 1;               // weak
    if (bits < 40) return 2;               // fair
    if (bits < 60) return 3;               // strong
    return 4;                              // very strong
}

export {
    MIN_LENGTH,
    MAX_LENGTH,
    MIN_ENTROPY_BITS,
    estimateEntropyBits,
    validatePasswordLocal,
    validatePassword,
    checkHIBP,
    entropyToScore
};

export default {
    MIN_LENGTH,
    MAX_LENGTH,
    MIN_ENTROPY_BITS,
    estimateEntropyBits,
    validatePasswordLocal,
    validatePassword,
    checkHIBP,
    entropyToScore
};
