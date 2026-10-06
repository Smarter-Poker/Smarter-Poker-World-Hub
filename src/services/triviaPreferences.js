import { supabase } from '../lib/supabase';
import { derivePreferenceSyncState } from '../lib/trivia/progressAccount.mjs';

const STORAGE_KEY = 'sp-trivia-prefs';
const SYNC_SUFFIX = ':sync';
const CLOUD_META_KEY = '_sync';
const CAS_CONTRACT = 'trivia-preferences-cas/1';
const CAS_VERSION = 1;

export const DEFAULT_TRIVIA_PREFERENCES = Object.freeze({
    soundEffects: true,
    timerEnabled: true,
    hintsEnabled: false,
    difficulty: 'medium',
    haptics: true,
    screenShake: true,
    intensity: 'high',
    reducedMotion: false,
    highContrast: false,
    largerText: false,
});

const BOOLEAN_KEYS = Object.freeze([
    'soundEffects', 'timerEnabled', 'hintsEnabled', 'haptics', 'screenShake',
    'reducedMotion', 'highContrast', 'largerText',
]);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const INTENSITIES = new Set(['low', 'medium', 'high']);

function plainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function storageKey(userId) {
    return userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY;
}

function syncKey(userId) {
    return `${storageKey(userId)}${SYNC_SUFFIX}`;
}

function managedPreferences(value) {
    const source = plainObject(value);
    const normalized = { ...DEFAULT_TRIVIA_PREFERENCES };
    for (const key of BOOLEAN_KEYS) {
        if (typeof source[key] === 'boolean') normalized[key] = source[key];
    }
    if (DIFFICULTIES.has(source.difficulty)) normalized.difficulty = source.difficulty;
    if (INTENSITIES.has(source.intensity)) normalized.intensity = source.intensity;
    return normalized;
}

export function normalizeTriviaPreferences(value) {
    const { [CLOUD_META_KEY]: _legacySync, ...source } = plainObject(value);
    return { ...source, ...managedPreferences(source) };
}

export function deriveTriviaPreferenceSync({
    localPreferences,
    pending = false,
    baseRevision = 0,
    cloudPreferences,
    cloudRevision: revision = 0,
} = {}) {
    const cloudRevisionValue = Math.max(0, Number(revision) || 0);
    const localRevisionValue = Math.max(0, Number(baseRevision) || 0);
    return derivePreferenceSyncState({
        pending,
        baseRevision: localRevisionValue,
        cloudRevision: cloudRevisionValue,
        localFingerprint: JSON.stringify(managedPreferences(localPreferences)),
        cloudFingerprint: JSON.stringify(managedPreferences(cloudPreferences)),
    });
}

function readLocalRecord(userId) {
    if (typeof window === 'undefined') {
        return { preferences: { ...DEFAULT_TRIVIA_PREFERENCES }, meta: { pending: false, baseRevision: 0 } };
    }
    let preferences = { ...DEFAULT_TRIVIA_PREFERENCES };
    let meta = { pending: false, baseRevision: 0 };
    try {
        const raw = localStorage.getItem(storageKey(userId));
        if (raw) preferences = managedPreferences(JSON.parse(raw));
    } catch (error) {
        console.warn('[TriviaPrefs] Could not read local preferences:', error?.message || error);
        preferences = { ...DEFAULT_TRIVIA_PREFERENCES };
    }
    try {
        const raw = localStorage.getItem(syncKey(userId));
        if (raw) meta = { ...meta, ...plainObject(JSON.parse(raw)) };
    } catch (error) {
        console.warn('[TriviaPrefs] Could not read local sync state:', error?.message || error);
        meta = { pending: false, baseRevision: 0 };
    }
    return {
        preferences,
        meta: {
            pending: meta.pending === true,
            baseRevision: Math.max(0, Number(meta.baseRevision) || 0),
            updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : null,
        },
    };
}

function writeLocalRecord(userId, preferences, meta = {}) {
    const normalized = managedPreferences(preferences);
    if (typeof window === 'undefined') return normalized;
    localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
    localStorage.setItem(syncKey(userId), JSON.stringify({
        pending: meta.pending === true,
        baseRevision: Math.max(0, Number(meta.baseRevision) || 0),
        updatedAt: meta.updatedAt || new Date().toISOString(),
    }));
    return normalized;
}

function authoritativeRevision(value) {
    const revision = Number(value);
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function createConflictError(preferences, revision) {
    const error = new Error('Trivia settings changed on another device');
    error.code = 'trivia_preferences_conflict';
    error.cloudPreferences = normalizeTriviaPreferences(preferences);
    error.revision = authoritativeRevision(revision);
    return error;
}

function normalizeCasResult(value) {
    const body = plainObject(value);
    const revision = Number(body.revision);
    if (body.contract !== CAS_CONTRACT
        || body.version !== CAS_VERSION
        || !Number.isSafeInteger(revision)
        || revision < 0
        || !body.preferences
        || typeof body.preferences !== 'object'
        || Array.isArray(body.preferences)) {
        const error = new Error('Invalid Trivia preference authority response');
        error.code = 'trivia_preferences_contract_invalid';
        throw error;
    }
    if (body.success === false && body.conflict === true) {
        throw createConflictError(body.preferences, revision);
    }
    if (body.success !== true || body.conflict !== false) {
        const error = new Error('Trivia preference authority refused the update');
        error.code = 'trivia_preferences_write_refused';
        throw error;
    }
    return {
        preferences: normalizeTriviaPreferences(body.preferences),
        revision,
        updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null,
    };
}

async function readCloudPreferences(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('trivia_preferences, trivia_preferences_revision')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Profile not found');
    const raw = normalizeTriviaPreferences(data.trivia_preferences);
    return {
        raw,
        preferences: raw,
        revision: authoritativeRevision(data.trivia_preferences_revision),
    };
}

/**
 * Loads both stores and reports a conflict instead of silently choosing a
 * device. A conflict exists only when this device has an unsent edit based on
 * an older cloud revision and the managed values differ.
 */
export async function getTriviaPreferencesState(userId) {
    const local = readLocalRecord(userId);
    if (!userId) {
        return {
            status: 'local',
            preferences: local.preferences,
            localPreferences: local.preferences,
            cloudPreferences: null,
            revision: local.meta.baseRevision,
        };
    }

    const cloud = await readCloudPreferences(userId);
    const status = deriveTriviaPreferenceSync({
        localPreferences: local.preferences,
        pending: local.meta.pending,
        baseRevision: local.meta.baseRevision,
        cloudPreferences: cloud.preferences,
        cloudRevision: cloud.revision,
    });
    if (status === 'conflict') {
        return {
            status: 'conflict',
            preferences: local.preferences,
            localPreferences: local.preferences,
            cloudPreferences: cloud.preferences,
            revision: cloud.revision,
        };
    }
    if (status === 'pending') {
        return {
            status: 'pending',
            preferences: local.preferences,
            localPreferences: local.preferences,
            cloudPreferences: cloud.preferences,
            revision: cloud.revision,
        };
    }
    const localAlreadyMatchesCloud = local.meta.baseRevision === cloud.revision
        && JSON.stringify(managedPreferences(local.preferences))
            === JSON.stringify(managedPreferences(cloud.preferences));
    writeLocalRecord(userId, cloud.preferences, {
        pending: false,
        baseRevision: cloud.revision,
        // A cloud read must not manufacture a new sync event. Keeping the
        // stable timestamp makes an unchanged localStorage write a no-op, so
        // two open tabs cannot bounce reads back and forth forever.
        updatedAt: localAlreadyMatchesCloud ? local.meta.updatedAt : null,
    });
    return {
        status: 'cloud',
        preferences: cloud.preferences,
        localPreferences: cloud.preferences,
        cloudPreferences: cloud.preferences,
        revision: cloud.revision,
    };
}

/** Existing consumers receive the resolved values. A failed cloud read uses
 * the explicitly cached device copy; the Settings page calls the state API so
 * it can disclose that stale state rather than presenting it as synced. */
export async function getTriviaPreferences(userId) {
    try {
        return (await getTriviaPreferencesState(userId)).preferences;
    } catch (error) {
        console.warn('[TriviaPrefs] Cloud read failed:', error?.message || error);
        return readLocalRecord(userId).preferences;
    }
}

export function saveTriviaPreferencesLocally(userId, preferences, { pending = Boolean(userId), baseRevision = 0 } = {}) {
    return writeLocalRecord(userId, preferences, { pending, baseRevision });
}

export function getLocalTriviaPreferences(userId) {
    return readLocalRecord(userId).preferences;
}

async function writeCloudPreferences(userId, preferences, expectedRevision) {
    if (!userId) throw new Error('User ID is required');
    const revision = authoritativeRevision(expectedRevision);
    const requested = normalizeTriviaPreferences(preferences);
    const { data, error } = await supabase.rpc('update_trivia_preferences_cas', {
        p_expected_revision: revision,
        p_preferences: requested,
    });
    if (error) throw error;
    const saved = normalizeCasResult(data);
    writeLocalRecord(userId, saved.preferences, {
        pending: false,
        baseRevision: saved.revision,
        updatedAt: saved.updatedAt,
    });
    return {
        ...saved.preferences,
        [CLOUD_META_KEY]: {
            revision: saved.revision,
            updatedAt: saved.updatedAt,
        },
    };
}

/** Read and merge the whole document, then atomically compare-and-swap it. */
export async function updateTriviaPreferences(userId, patch) {
    if (!userId) {
        const current = readLocalRecord(null).preferences;
        return writeLocalRecord(null, { ...current, ...plainObject(patch) }, { pending: false, baseRevision: 0 });
    }
    const local = readLocalRecord(userId);
    const cloud = await readCloudPreferences(userId);
    const revisionChanged = local.meta.baseRevision !== cloud.revision;
    const valuesChanged = JSON.stringify(managedPreferences(local.preferences))
        !== JSON.stringify(managedPreferences(cloud.preferences));
    if (revisionChanged && valuesChanged) {
        throw createConflictError(cloud.preferences, cloud.revision);
    }
    const merged = {
        ...cloud.raw,
        ...managedPreferences({
            ...cloud.preferences,
            ...(local.meta.pending ? local.preferences : {}),
            ...plainObject(patch),
        }),
    };
    return writeCloudPreferences(userId, merged, cloud.revision);
}

export async function syncPendingTriviaPreferences(userId) {
    if (!userId) return getTriviaPreferencesState(null);
    const state = await getTriviaPreferencesState(userId);
    if (state.status === 'conflict' || state.status === 'cloud') return state;
    await writeCloudPreferences(userId, {
        ...state.cloudPreferences,
        ...state.localPreferences,
    }, state.revision);
    return getTriviaPreferencesState(userId);
}

export async function resolveTriviaPreferencesConflict(userId, choice) {
    if (!userId) throw new Error('User ID is required');
    const state = await getTriviaPreferencesState(userId);
    if (choice === 'cloud') {
        writeLocalRecord(userId, state.cloudPreferences || state.preferences, {
            pending: false,
            baseRevision: state.revision,
        });
        return getTriviaPreferencesState(userId);
    }
    if (choice !== 'device') throw new Error('Conflict choice must be cloud or device');
    await writeCloudPreferences(userId, {
        ...state.cloudPreferences,
        ...(state.localPreferences || state.preferences),
    }, state.revision);
    return getTriviaPreferencesState(userId);
}
