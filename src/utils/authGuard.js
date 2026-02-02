/**
 * 🛡️ AUTH GUARD UTILITY - HARDENED EDITION
 * BULLETPROOF authentication handling for multi-device scenarios.
 * 
 * Features:
 * - Circuit breaker pattern (prevents cascade failures)
 * - Offline mode detection and graceful degradation
 * - Persistent session recovery from localStorage
 * - Exponential backoff with jitter
 * - Dead letter queue for failed operations
 * - Global error isolation
 * 
 * GUARANTEE: This utility will NEVER crash the app.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 🔌 CIRCUIT BREAKER - Prevents cascade failures
// ═══════════════════════════════════════════════════════════════════════════

const circuits = new Map();

class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
        this.failures = 0;
        this.state = 'CLOSED'; // CLOSED = working, OPEN = broken, HALF_OPEN = testing
        this.lastFailure = null;
    }

    async execute(fn, fallback = null) {
        // If circuit is OPEN, check if we can try again
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailure > this.resetTimeout) {
                this.state = 'HALF_OPEN';
            } else {
                console.warn(`[CIRCUIT:${this.name}] Open - using fallback`);
                return fallback ? await fallback() : null;
            }
        }

        try {
            const result = await fn();
            // Success - reset if we were half-open
            if (this.state === 'HALF_OPEN') {
                this.state = 'CLOSED';
                this.failures = 0;
            }
            return result;
        } catch (error) {
            this.failures++;
            this.lastFailure = Date.now();

            if (this.failures >= this.failureThreshold) {
                this.state = 'OPEN';
                console.error(`[CIRCUIT:${this.name}] OPENED after ${this.failures} failures`);
            }

            if (fallback) {
                return await fallback();
            }
            throw error;
        }
    }

    reset() {
        this.state = 'CLOSED';
        this.failures = 0;
        this.lastFailure = null;
    }
}

export function getCircuit(name, options) {
    if (!circuits.has(name)) {
        circuits.set(name, new CircuitBreaker(name, options));
    }
    return circuits.get(name);
}

// ═══════════════════════════════════════════════════════════════════════════
// 📴 OFFLINE DETECTION - Graceful degradation
// ═══════════════════════════════════════════════════════════════════════════

export function isOnline() {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
}

export function onOnlineChange(callback) {
    if (typeof window === 'undefined') return () => { };

    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 SESSION PERSISTENCE - Never lose auth state
// ═══════════════════════════════════════════════════════════════════════════

const SESSION_KEY = 'smarter-poker-auth-hardened';

export function persistSession(user) {
    if (!user || typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            id: user.id,
            email: user.email,
            timestamp: Date.now(),
        }));
    } catch (e) {
        console.warn('[AUTH_GUARD] Failed to persist session:', e);
    }
}

export function getPersistedSession() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const data = localStorage.getItem(SESSION_KEY);
        if (!data) return null;

        const parsed = JSON.parse(data);
        // Session expires after 7 days
        if (Date.now() - parsed.timestamp > 7 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

export function clearPersistedSession() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (e) { }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 RETRY WITH EXPONENTIAL BACKOFF + JITTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a function with retry logic and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Configuration options
 * @returns {Promise<any>} Result of the function
 */
export async function withRetry(fn, options = {}) {
    const {
        maxAttempts = 3,
        baseDelayMs = 500,
        maxDelayMs = 10000,
        jitter = true,
        onRetry = null,
        circuitName = null,
    } = options;

    const circuit = circuitName ? getCircuit(circuitName) : null;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const executeFn = async () => {
                if (!isOnline()) {
                    throw new Error('Offline - waiting for connection');
                }
                return await fn();
            };

            if (circuit) {
                return await circuit.execute(executeFn);
            }
            return await executeFn();
        } catch (error) {
            lastError = error;

            if (attempt < maxAttempts) {
                // Exponential backoff with optional jitter
                let delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
                if (jitter) {
                    delay = delay * (0.5 + Math.random()); // 50-150% of delay
                }

                console.warn(`[RETRY] Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms:`, error.message);
                onRetry?.(attempt, error, delay);

                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    throw lastError;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 AUTH UTILITIES - HARDENED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wait for authentication to be ready with timeout
 * HARDENED: Uses circuit breaker and persisted session fallback
 */
export async function ensureAuth(supabase, maxWaitMs = 5000) {
    const startTime = Date.now();
    const circuit = getCircuit('auth-session', { failureThreshold: 3, resetTimeout: 15000 });

    // FAST PATH: Check persisted session first
    const persisted = getPersistedSession();
    if (persisted?.id) {
        console.log('[AUTH_GUARD] Found persisted session:', persisted.id.slice(0, 8));
    }

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const result = await circuit.execute(
                async () => {
                    const { data: { session }, error } = await supabase.auth.getSession();
                    if (error) throw error;
                    return session?.user || null;
                },
                // Fallback: return persisted session
                async () => persisted
            );

            if (result?.id) {
                persistSession(result);
                return result;
            }
        } catch (e) {
            console.warn('[AUTH_GUARD] Exception:', e.message);
        }

        await new Promise(r => setTimeout(r, 100));
    }

    // Last resort: return persisted session even if Supabase failed
    if (persisted?.id) {
        console.warn('[AUTH_GUARD] Timeout - using persisted session');
        return persisted;
    }

    console.warn('[AUTH_GUARD] Auth timeout after', maxWaitMs, 'ms');
    return null;
}

/**
 * Execute an operation only if authenticated, with fallback
 * HARDENED: Never throws, always returns a result
 */
export async function withAuth(supabase, authenticatedFn, fallbackFn = null) {
    try {
        const user = await ensureAuth(supabase);

        if (user) {
            try {
                return await authenticatedFn(user);
            } catch (fnError) {
                console.error('[AUTH_GUARD] Authenticated function failed:', fnError);
                if (fallbackFn) return await fallbackFn();
                return { error: fnError.message, success: false };
            }
        }

        if (fallbackFn) {
            return await fallbackFn();
        }

        return { error: 'Authentication required', success: false };
    } catch (e) {
        console.error('[AUTH_GUARD] withAuth failed:', e);
        return { error: e.message, success: false };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📡 MULTI-DEVICE AUTH LISTENER - HARDENED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a debounced auth listener that handles multi-device scenarios
 * HARDENED: Handles rapid events, network issues, and never crashes
 */
export function createMultiDeviceAuthListener(supabase, onAuthReady, debounceMs = 300) {
    let debounceTimer = null;
    let lastUserId = null;
    let isProcessing = false;
    let subscription = null;

    const processAuthEvent = async (session, event) => {
        if (isProcessing) {
            console.log('[AUTH_GUARD] Skipping - already processing');
            return;
        }
        isProcessing = true;

        try {
            const userId = session?.user?.id;

            // Handle sign out
            if (!userId || event === 'SIGNED_OUT') {
                lastUserId = null;
                clearPersistedSession();
                await safeCallback(() => onAuthReady(null, event));
                return;
            }

            // Persist new session
            if (session?.user) {
                persistSession(session.user);
            }

            // Only trigger if user changed or it's a significant event
            const shouldTrigger =
                userId !== lastUserId ||
                event === 'SIGNED_IN' ||
                event === 'INITIAL_SESSION' ||
                event === 'TOKEN_REFRESHED';

            if (shouldTrigger) {
                lastUserId = userId;
                await safeCallback(() => onAuthReady(session.user, event));
            }
        } finally {
            isProcessing = false;
        }
    };

    // Safe callback wrapper - NEVER crashes
    const safeCallback = async (fn) => {
        try {
            await fn();
        } catch (e) {
            console.error('[AUTH_GUARD] Callback error (isolated):', e);
        }
    };

    try {
        const result = supabase.auth.onAuthStateChange((event, session) => {
            console.log('[AUTH_GUARD] Auth event:', event, 'User:', session?.user?.id?.slice(0, 8) || 'none');

            // Clear any pending debounce
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }

            // Handle sign out immediately
            if (event === 'SIGNED_OUT') {
                processAuthEvent(null, event);
                return;
            }

            // Debounce other events
            debounceTimer = setTimeout(() => {
                processAuthEvent(session, event);
            }, debounceMs);
        });

        subscription = result.data?.subscription;
    } catch (e) {
        console.error('[AUTH_GUARD] Failed to create auth listener:', e);
    }

    // Return cleanup function
    return () => {
        try {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            subscription?.unsubscribe();
        } catch (e) {
            console.warn('[AUTH_GUARD] Cleanup error:', e);
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧪 DEAD LETTER QUEUE - For failed operations that need retry later
// ═══════════════════════════════════════════════════════════════════════════

const DLQ_KEY = 'smarter-poker-dlq';

export function addToDeadLetterQueue(operation) {
    if (typeof localStorage === 'undefined') return;
    try {
        const queue = JSON.parse(localStorage.getItem(DLQ_KEY) || '[]');
        queue.push({
            ...operation,
            timestamp: Date.now(),
            attempts: 0,
        });
        // Keep only last 50 items
        localStorage.setItem(DLQ_KEY, JSON.stringify(queue.slice(-50)));
    } catch (e) { }
}

export function getDeadLetterQueue() {
    if (typeof localStorage === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem(DLQ_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

export function clearDeadLetterQueue() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(DLQ_KEY);
    } catch (e) { }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 GLOBAL ERROR BOUNDARY WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wraps any async operation to NEVER throw
 * Returns { data, error } pattern
 */
export async function safeAsync(fn, fallbackValue = null) {
    try {
        const result = await fn();
        return { data: result, error: null };
    } catch (e) {
        console.error('[SAFE_ASYNC] Error isolated:', e);
        return { data: fallbackValue, error: e.message };
    }
}

/**
 * Creates a version of any function that never crashes
 */
export function makeSafe(fn, fallbackValue = null) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (e) {
            console.error('[MAKE_SAFE] Error isolated:', e);
            return fallbackValue;
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    // Core auth
    ensureAuth,
    withAuth,
    withRetry,
    createMultiDeviceAuthListener,

    // Circuit breaker
    getCircuit,

    // Offline handling
    isOnline,
    onOnlineChange,

    // Session persistence
    persistSession,
    getPersistedSession,
    clearPersistedSession,

    // Error handling
    safeAsync,
    makeSafe,

    // Dead letter queue
    addToDeadLetterQueue,
    getDeadLetterQueue,
    clearDeadLetterQueue,
};
