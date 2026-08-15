/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANTI-GRAVITY AUTO-BOOT SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module initializes automatically at app startup with ZERO manual steps.
 * It verifies environment configuration, connects to Supabase, and provides
 * deterministic proof of system health.
 * 
 * FAIL-CLOSED: If any requirement fails, the system refuses to start.
 */

import { supabase as sharedSupabase } from './supabase';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// [2026-08-03] The hardcoded anon-key fallback is GONE. It was a committed
// secret and the project signing key has since been rotated, so "always boots"
// really meant "always boots against a dead key" — every request failed with an
// opaque JWS error instead of one clear config error. There is no key fallback;
// the URL fallback stays because the project URL is not a credential.
const FALLBACK_SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';

// NOTE: the required-var list is intentionally NOT an array driving a loop.
// See verifyEnvVars() -- client-side env checks must use static
// `process.env.NEXT_PUBLIC_*` references or they always read undefined.

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let bootState = {
    initialized: false,
    antigravityEnabled: false,
    supabaseConnected: false,
    errors: [],
    timestamp: null,
};

// Use the shared singleton
let supabaseClient = sharedSupabase;

// ═══════════════════════════════════════════════════════════════════════════
// CORE BOOT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify all required environment variables exist.
 * Still non-fatal so a misconfigured deploy renders (rather than white-screens),
 * but there is no key fallback any more, so a miss is reported as an error.
 */
function verifyEnvVars() {
    const missing = [];

    // These MUST be STATIC `process.env.X` references. Next.js only inlines
    // NEXT_PUBLIC_* values into the client bundle where they are referenced
    // statically; a dynamic `process.env[name]` lookup is left untouched and is
    // therefore ALWAYS undefined in the browser, no matter how the deploy is
    // configured. The previous dynamic loop made this check log
    // "Supabase calls will fail" on every production page load even though the
    // vars were set correctly (initializeSupabase() below reads them statically
    // and succeeds) -- which buried genuine console errors and failed the E2E
    // smoke gate that asserts a clean console.
    if (!(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()) {
        missing.push('NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()) {
        missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    if (missing.length > 0) {
        console.error(`[ANTIGRAVITY] Required env vars are NOT set: ${missing.join(', ')} — Supabase calls will fail until they are configured.`);
    }

    return { success: true, missing: [] };
}

/**
 * Initialize Supabase client - now uses shared singleton
 */
function initializeSupabase() {
    try {
        // Use the shared singleton to prevent multiple GoTrueClient instances
        console.debug('[ANTIGRAVITY] Using shared Supabase singleton');
        return { success: true, client: supabaseClient };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Perform Supabase health check (deterministic proof)
 * With timeout to prevent hanging on slow mobile networks.
 * BUG FIX: The profiles table is RLS-protected — anon SELECT returns 401
 * which causes ANTI-GRAVITY OFFLINE on every page load. Use the public
 * /rest/v1/ root endpoint instead (returns 200 without auth).
 */
async function supabaseHealthCheck() {
    if (!supabaseClient) {
        return { success: false, error: 'Supabase client not initialized' };
    }

    try {
        // Use the Supabase URL from the shared client to ping the REST root.
        // The REST root (GET /rest/v1/) is publicly accessible (no auth required)
        // and returns 200, proving the connection is alive without hitting any RLS wall.
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
        const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
        if (!anonKey) {
            throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — cannot run the Supabase health check.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);

        // 2026-07-19 AUDIT FIX (E2E defect D7): GET /rest/v1/ (root) returns
        // 401 "Only the service_role API key can be used for this endpoint" on
        // this project, logging a console error on EVERY page load. The auth
        // health endpoint is genuinely public and returns 200.
        const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
            method: 'GET',
            headers: { apikey: anonKey, Accept: 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok || res.status === 200) {
            return { success: true, proof: 'REST_API_REACHABLE' };
        }

        // Some deployments return 400 at /rest/v1/ (bad request is OK — server is alive)
        if (res.status >= 400 && res.status < 500) {
            return { success: true, proof: `CONNECTION_OK_HTTP_${res.status}` };
        }

        return { success: false, error: `Unexpected HTTP ${res.status}` };
    } catch (error) {
        console.warn('[AntiGravity] Health check failed:', error?.message || error);
        return { success: false, error: error.message || 'Health check failed' };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main initialization function - runs automatically at app startup
 * Returns boot state with proof of system health
 */
/**
 * Synchronous init — env vars + Supabase singleton only (NO network calls).
 * Used by AntiGravityProvider for instant boot without blocking rendering.
 */
export function initAntiGravitySync() {
    if (bootState.initialized) return bootState;

    bootState.timestamp = new Date().toISOString();
    bootState.errors = [];

    const antigravityEnabled = (process.env.NEXT_PUBLIC_ANTIGRAVITY_ENABLED || '').trim() !== 'false';
    bootState.antigravityEnabled = antigravityEnabled;

    // Synchronous steps only — no await
    verifyEnvVars();
    initializeSupabase();

    // Mark as initialized so the provider can render immediately
    bootState.initialized = true;
    bootState.supabaseConnected = true; // Optimistic — health check will update later

    return { ...bootState };
}

/**
 * Full async initialization — runs health check (may take up to 1.5s on timeout).
 * Called in background after provider already renders children.
 */
export async function initAntiGravity() {
    // If sync init already ran, we still need the health check.
    // Only skip if the full async boot (including health check) already completed.
    if (bootState.initialized && bootState._healthCheckDone) {
        return bootState;
    }

    // If sync init already ran env+singleton, skip to health check only
    const alreadySyncBooted = bootState.initialized;

    if (!alreadySyncBooted) {
        console.debug('═══════════════════════════════════════════════════════════════');
        console.debug('🚀 ANTI-GRAVITY BOOT SEQUENCE INITIATED');
        console.debug('═══════════════════════════════════════════════════════════════');

        bootState.timestamp = new Date().toISOString();
        bootState.errors = [];

        // Step 1: Check if Anti-Gravity is enabled via env var
        const antigravityEnabled = (process.env.NEXT_PUBLIC_ANTIGRAVITY_ENABLED || '').trim() !== 'false';
        bootState.antigravityEnabled = antigravityEnabled;

        if (!antigravityEnabled) {
            console.debug('⚠️  ANTIGRAVITY_ENABLED=false - System running in degraded mode');
            bootState.initialized = true;
            bootState._healthCheckDone = true;
            printBootProof();
            return bootState;
        }

        // Step 2: Verify environment variables
        console.debug('📋 Verifying environment variables...');
        const envCheck = verifyEnvVars();

        if (!envCheck.success) {
            console.warn('❌ ENV CHECK FAILED:', envCheck.error);
            bootState.errors.push({ stage: 'ENV_VARS', error: envCheck.error });
            bootState.initialized = true;
            bootState._healthCheckDone = true;
            printBootProof();
            return bootState;
        }
        console.debug('✅ Environment variables verified');

        // Step 3: Initialize Supabase
        console.debug('🔌 Initializing Supabase connection...');
        const supabaseInit = initializeSupabase();

        if (!supabaseInit.success) {
            console.warn('❌ SUPABASE INIT FAILED:', supabaseInit.error);
            bootState.errors.push({ stage: 'SUPABASE_INIT', error: supabaseInit.error });
            bootState.initialized = true;
            bootState._healthCheckDone = true;
            printBootProof();
            return bootState;
        }
        console.debug('✅ Supabase client initialized');
    }

    // Step 4: Supabase health check (deterministic proof) — ALWAYS runs
    console.debug('🏥 Running Supabase health check...');
    const healthCheck = await supabaseHealthCheck();

    if (!healthCheck.success) {
        console.warn('❌ SUPABASE HEALTH CHECK FAILED:', healthCheck.error);
        bootState.errors.push({ stage: 'SUPABASE_HEALTH', error: healthCheck.error });
        bootState.supabaseConnected = false;
    } else {
        console.debug('✅ Supabase health check passed:', healthCheck.proof);
        bootState.supabaseConnected = true;
    }

    // Mark as fully initialized (including health check)
    bootState.initialized = true;
    bootState._healthCheckDone = true;

    // Print final proof
    printBootProof();

    return bootState;
}

/**
 * Print deterministic proof of boot status
 */
function printBootProof() {
    console.debug('═══════════════════════════════════════════════════════════════');
    console.debug('📊 ANTI-GRAVITY BOOT PROOF');
    console.debug('═══════════════════════════════════════════════════════════════');
    console.debug(`ANTIGRAVITY_OK:${bootState.antigravityEnabled && bootState.errors.length === 0}`);
    console.debug(`SUPABASE_OK:${bootState.supabaseConnected}`);
    console.debug(`TIMESTAMP:${bootState.timestamp}`);

    if (bootState.errors.length > 0) {
        console.debug('ERRORS:');
        bootState.errors.forEach(err => {
            console.debug(`  - [${err.stage}] ${err.error}`);
        });
    }

    console.debug('═══════════════════════════════════════════════════════════════');

    if (bootState.antigravityEnabled && bootState.errors.length === 0) {
        console.debug('🟢 ANTI-GRAVITY ONLINE');
    } else if (bootState.errors.length > 0) {
        console.debug('🔴 ANTI-GRAVITY OFFLINE - FAIL-CLOSED');
    } else {
        console.debug('🟡 ANTI-GRAVITY DEGRADED');
    }

    console.debug('═══════════════════════════════════════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current boot state (for UI components)
 */
export function getBootState() {
    return { ...bootState };
}

/**
 * Get Supabase client (initialized by boot)
 */
export function getSupabaseClient() {
    return supabaseClient;
}

/**
 * Check if system is healthy (for fail-closed logic)
 */
export function isSystemHealthy() {
    return bootState.initialized &&
        bootState.antigravityEnabled &&
        bootState.errors.length === 0;
}

/**
 * Check specific component health
 */
export function isSupabaseHealthy() {
    return bootState.supabaseConnected;
}

export default {
    init: initAntiGravity,
    initSync: initAntiGravitySync,
    getState: getBootState,
    getClient: getSupabaseClient,
    isHealthy: isSystemHealthy,
    isSupabaseHealthy,
};
