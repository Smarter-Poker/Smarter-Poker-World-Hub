/**
 * 🛡️ AUTH GUARD UTILITY
 * Ensures user is authenticated before proceeding with any operation.
 * Works seamlessly across all devices/sessions.
 * 
 * Multi-device resilient - all sessions share the same user_id,
 * so this utility works correctly regardless of which device logged in first.
 */

/**
 * Wait for authentication to be ready with timeout
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
 * @param {number} maxWaitMs - Maximum time to wait for auth (default 5s)
 * @returns {Promise<{id: string, email: string} | null>} User object or null if timeout
 */
export async function ensureAuth(supabase, maxWaitMs = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                console.warn('[AUTH_GUARD] Session error:', error.message);
                await new Promise(r => setTimeout(r, 200));
                continue;
            }

            if (session?.user?.id) {
                return session.user;
            }
        } catch (e) {
            console.warn('[AUTH_GUARD] Exception:', e.message);
        }

        await new Promise(r => setTimeout(r, 100));
    }

    console.warn('[AUTH_GUARD] Auth timeout after', maxWaitMs, 'ms');
    return null;
}

/**
 * Execute a function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {number} maxAttempts - Maximum retry attempts (default 3)
 * @param {number} baseDelayMs - Base delay between retries (default 500ms, doubles each retry)
 * @returns {Promise<any>} Result of the function
 */
export async function withRetry(fn, maxAttempts = 3, baseDelayMs = 500) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await fn();
            return result;
        } catch (error) {
            lastError = error;
            console.warn(`[AUTH_GUARD] Attempt ${attempt}/${maxAttempts} failed:`, error.message);

            if (attempt < maxAttempts) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    throw lastError;
}

/**
 * Execute an operation only if authenticated, with fallback
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
 * @param {Function} authenticatedFn - Function to run if authenticated
 * @param {Function} fallbackFn - Optional fallback if not authenticated
 * @returns {Promise<any>}
 */
export async function withAuth(supabase, authenticatedFn, fallbackFn = null) {
    const user = await ensureAuth(supabase);

    if (user) {
        return authenticatedFn(user);
    }

    if (fallbackFn) {
        return fallbackFn();
    }

    throw new Error('Authentication required');
}

/**
 * Create a debounced auth listener that handles multi-device scenarios
 * Consolidates rapid auth events (common when multiple devices sync)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Function} onAuthReady - Callback when auth is confirmed ready
 * @param {number} debounceMs - Debounce time (default 300ms)
 * @returns {Function} Cleanup function
 */
export function createMultiDeviceAuthListener(supabase, onAuthReady, debounceMs = 300) {
    let debounceTimer = null;
    let lastUserId = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('[AUTH_GUARD] Auth event:', event, 'User:', session?.user?.id?.slice(0, 8) || 'none');

        // Clear any pending debounce
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        // Handle sign out immediately
        if (event === 'SIGNED_OUT') {
            lastUserId = null;
            onAuthReady(null, event);
            return;
        }

        // For other events, debounce to handle rapid token refreshes
        debounceTimer = setTimeout(() => {
            const userId = session?.user?.id;

            // Only trigger if we have a valid user and it's different or a fresh login
            if (userId && (userId !== lastUserId || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
                lastUserId = userId;
                onAuthReady(session.user, event);
            }
        }, debounceMs);
    });

    // Return cleanup function
    return () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        subscription?.unsubscribe();
    };
}

export default {
    ensureAuth,
    withRetry,
    withAuth,
    createMultiDeviceAuthListener
};
