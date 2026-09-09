/**
 * Training progress projection.
 *
 * Signed-in players always read the server-owned training_progress projection.
 * The browser cache is deliberately guest-only and is never used as an
 * authenticated fallback because doing so can show one account another
 * account's progress on a shared browser.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPlayStatus, getRankFromMastery, USER_RANKS } from '../components/training/GameBadge';
import { eventBus, EventType } from '../engine/EventBus';
import { authedFetch, getAuthUser } from '../lib/authUtils';

export const GUEST_TRAINING_PROGRESS_STORAGE_KEY = 'pokeriq_training_progress:guest:v1';
const LEGACY_UNSCOPED_STORAGE_KEY = 'pokeriq_training_progress';
const GAME_ID_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/i;

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const nonNegativeInteger = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const createEmptyProgress = () => ({
    attempts: 0,
    levelsCompleted: 0,
    mastery: 0,
    completionPercent: 0,
    percent: 0,
    bestScore: 0,
    totalDiamonds: 0,
    lastPlayed: null,
    streakBest: 0,
    currentLevel: 1,
});

function normalizeProgressRecord(record, { server = false } = {}) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;

    const numericFields = server
        ? ['hands_played', 'total_answers', 'correct_answers', 'level', 'diamonds', 'xp', 'best_streak', 'mastery_percentage']
        : ['attempts', 'levelsCompleted', 'mastery', 'completionPercent', 'percent', 'bestScore', 'totalDiamonds', 'streakBest', 'currentLevel'];
    for (const field of numericFields) {
        if (record[field] !== undefined && (
            !Number.isFinite(Number(record[field])) || Number(record[field]) < 0
        )) return null;
    }

    if (server) {
        const attempts = nonNegativeInteger(record.hands_played ?? record.total_answers);
        const totalAnswers = nonNegativeInteger(record.total_answers);
        const correctAnswers = nonNegativeInteger(record.correct_answers);
        if (correctAnswers > totalAnswers) return null;
        const mastery = totalAnswers > 0
            ? Math.round((correctAnswers / totalAnswers) * 100)
            : clampPercent(record.mastery_percentage);
        return {
            attempts,
            levelsCompleted: Math.max(0, nonNegativeInteger(record.level || 1) - 1),
            mastery,
            completionPercent: mastery,
            percent: mastery,
            bestScore: 0,
            totalDiamonds: nonNegativeInteger(record.diamonds ?? record.xp),
            lastPlayed: typeof record.last_played_at === 'string' ? record.last_played_at : null,
            streakBest: nonNegativeInteger(record.best_streak),
            currentLevel: Math.max(1, nonNegativeInteger(record.level || 1)),
        };
    }

    const mastery = clampPercent(record.mastery);
    const completionPercent = clampPercent(record.completionPercent ?? record.percent ?? mastery);
    return {
        attempts: nonNegativeInteger(record.attempts),
        levelsCompleted: nonNegativeInteger(record.levelsCompleted),
        mastery,
        completionPercent,
        percent: completionPercent,
        bestScore: clampPercent(record.bestScore),
        totalDiamonds: nonNegativeInteger(record.totalDiamonds),
        lastPlayed: typeof record.lastPlayed === 'string' && record.lastPlayed.length <= 64
            ? record.lastPlayed
            : null,
        streakBest: nonNegativeInteger(record.streakBest),
        currentLevel: Math.max(1, nonNegativeInteger(record.currentLevel || 1)),
    };
}

export function normalizeServerTrainingProgress(rows) {
    if (!Array.isArray(rows)) return {};
    const normalized = {};
    for (const row of rows) {
        const gameId = typeof row?.game_id === 'string' ? row.game_id.trim() : '';
        if (!GAME_ID_RE.test(gameId)) continue;
        const record = normalizeProgressRecord(row, { server: true });
        if (record) normalized[gameId] = record;
    }
    return normalized;
}

/** Return null for a malformed cache so callers can remove it. */
export function parseGuestTrainingProgress(raw) {
    if (raw == null || raw === '') return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const entries = Object.entries(parsed);
        if (entries.length > 500) return null;
        const normalized = {};
        for (const [gameId, record] of entries) {
            if (!GAME_ID_RE.test(gameId) || ['__proto__', 'constructor', 'prototype'].includes(gameId)) return null;
            const cleanRecord = normalizeProgressRecord(record);
            if (!cleanRecord) return null;
            normalized[gameId] = cleanRecord;
        }
        return normalized;
    } catch (_) {
        return null;
    }
}

export function resolveTrainingProgressSnapshot({ userId, serverRows, serverError, guestRaw }) {
    if (userId) {
        if (serverError || !Array.isArray(serverRows)) {
            return {
                progress: {},
                source: 'unavailable',
                error: 'Authenticated training progress is temporarily unavailable.',
                isUnavailable: true,
            };
        }
        const normalized = normalizeServerTrainingProgress(serverRows);
        if (Object.keys(normalized).length !== serverRows.length) {
            return {
                progress: {},
                source: 'unavailable',
                error: 'Authenticated training progress returned an invalid projection.',
                isUnavailable: true,
            };
        }
        return {
            progress: normalized,
            source: 'server',
            error: null,
            isUnavailable: false,
        };
    }

    const guestProgress = parseGuestTrainingProgress(guestRaw);
    if (guestProgress === null) {
        return {
            progress: {},
            source: 'guest',
            error: 'The guest progress cache was invalid and has been reset.',
            isUnavailable: false,
            cacheInvalid: true,
        };
    }
    return {
        progress: guestProgress,
        source: 'guest',
        error: null,
        isUnavailable: false,
    };
}

export default function useTrainingProgress() {
    const [progress, setProgress] = useState({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [progressSource, setProgressSource] = useState('loading');
    const [error, setError] = useState(null);
    const [isUnavailable, setIsUnavailable] = useState(false);
    const [authenticatedUserId, setAuthenticatedUserId] = useState(null);
    const requestSequenceRef = useRef(0);

    const applySnapshot = useCallback((snapshot, userId, sequence) => {
        if (sequence !== requestSequenceRef.current) return;
        setProgress(snapshot.progress);
        setProgressSource(snapshot.source);
        setError(snapshot.error);
        setIsUnavailable(snapshot.isUnavailable);
        setAuthenticatedUserId(userId || null);
        setIsLoaded(true);
    }, []);

    const loadProgress = useCallback(async () => {
        const sequence = ++requestSequenceRef.current;
        setError(null);

        let authUser;
        try {
            authUser = getAuthUser();
        } catch (authError) {
            console.warn('[useTrainingProgress] Authentication state unavailable:', authError?.message || authError);
            applySnapshot({
                progress: {},
                source: 'unavailable',
                error: 'Authentication state is temporarily unavailable.',
                isUnavailable: true,
            }, null, sequence);
            return;
        }

        const userId = authUser?.id || null;
        if (!userId && typeof window !== 'undefined') {
            try {
                const hasAuthArtifact = Boolean(window.localStorage.getItem('smarter-poker-auth'))
                    || Object.keys(window.localStorage).some((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
                if (hasAuthArtifact) {
                    applySnapshot({
                        progress: {},
                        source: 'unavailable',
                        error: 'Authentication could not be verified. Guest progress was not loaded.',
                        isUnavailable: true,
                    }, null, sequence);
                    return;
                }
            } catch (authStorageError) {
                console.warn('[useTrainingProgress] Authentication storage unavailable:', authStorageError);
                applySnapshot({
                    progress: {},
                    source: 'unavailable',
                    error: 'Authentication state is temporarily unavailable.',
                    isUnavailable: true,
                }, null, sequence);
                return;
            }
        }
        // Clear the previous identity before any async read. This prevents a
        // slow account switch from briefly exposing user A's projection to
        // user B (or a guest cache to a newly authenticated account).
        setProgress({});
        setProgressSource('loading');
        setAuthenticatedUserId(userId);
        setIsLoaded(false);
        if (userId) {
            try {
                const response = await authedFetch('/api/training/get-progress');
                if (!response.ok) throw new Error(`Progress request failed (${response.status})`);
                const data = await response.json();
                if (data?.success !== true || !Array.isArray(data.progress)) {
                    throw new Error('Progress response contract was invalid');
                }
                applySnapshot(resolveTrainingProgressSnapshot({ userId, serverRows: data.progress }), userId, sequence);
            } catch (serverError) {
                console.warn('[useTrainingProgress] Authenticated progress unavailable:', serverError?.message || serverError);
                applySnapshot(resolveTrainingProgressSnapshot({ userId, serverError }), userId, sequence);
            }
            return;
        }

        let guestRaw = null;
        try {
            guestRaw = typeof window !== 'undefined'
                ? window.localStorage.getItem(GUEST_TRAINING_PROGRESS_STORAGE_KEY)
                : null;
        } catch (storageError) {
            console.warn('[useTrainingProgress] Guest progress cache unavailable:', storageError?.message || storageError);
            applySnapshot({
                progress: {},
                source: 'guest',
                error: 'Guest training progress cannot be stored in this browser.',
                isUnavailable: true,
            }, null, sequence);
            return;
        }

        const snapshot = resolveTrainingProgressSnapshot({ userId: null, guestRaw });
        if (snapshot.cacheInvalid && typeof window !== 'undefined') {
            try { window.localStorage.removeItem(GUEST_TRAINING_PROGRESS_STORAGE_KEY); }
            catch (storageError) {
                console.warn('[useTrainingProgress] Failed to clear invalid guest cache:', storageError);
                snapshot.isUnavailable = true;
            }
        }
        applySnapshot(snapshot, null, sequence);
    }, [applySnapshot]);

    useEffect(() => {
        loadProgress();
        const handleReload = () => loadProgress();
        const unsub1 = eventBus.on('training:session-saved', handleReload);
        const unsub2 = eventBus.on(EventType?.SESSION_END || 'SESSION_END', handleReload);
        const unsub3 = eventBus.on('training:session-complete', handleReload);
        const handleStorage = (storageEvent) => {
            if (!storageEvent?.key || storageEvent.key === 'smarter-poker-auth' || storageEvent.key.endsWith('-auth-token')) {
                loadProgress();
            }
        };
        if (typeof window !== 'undefined') window.addEventListener('storage', handleStorage);
        return () => {
            requestSequenceRef.current += 1;
            if (typeof unsub1 === 'function') unsub1();
            if (typeof unsub2 === 'function') unsub2();
            if (typeof unsub3 === 'function') unsub3();
            if (typeof window !== 'undefined') window.removeEventListener('storage', handleStorage);
        };
    }, [loadProgress]);

    useEffect(() => {
        if (!isLoaded || progressSource !== 'guest' || authenticatedUserId) return;
        try {
            window.localStorage.removeItem(LEGACY_UNSCOPED_STORAGE_KEY);
            if (Object.keys(progress).length > 0) {
                window.localStorage.setItem(GUEST_TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
            }
        } catch (storageError) {
            console.warn('[useTrainingProgress] Failed to persist guest progress:', storageError);
            setError('Guest training progress cannot be stored in this browser.');
            setIsUnavailable(true);
        }
    }, [progress, isLoaded, progressSource, authenticatedUserId]);

    const getGameProgress = useCallback((gameId) => progress[gameId] || createEmptyProgress(), [progress]);
    const hasPlayed = useCallback((gameId) => {
        const value = progress[gameId];
        return Boolean(value && (value.attempts > 0 || value.lastPlayed));
    }, [progress]);
    const isMastered = useCallback((gameId) => Boolean(progress[gameId]?.mastery >= 85), [progress]);
    const getStatus = useCallback((gameId) => getPlayStatus(progress[gameId]), [progress]);
    const getRank = useCallback((gameId) => (
        progress[gameId] ? getRankFromMastery(progress[gameId].mastery) : USER_RANKS.UNRANKED
    ), [progress]);

    // Only guests may author guest progress. Authenticated progress is written
    // by the sealed attempt-completion pipeline and reloaded from the server.
    const recordSession = useCallback((gameId, sessionData = {}) => {
        if (authenticatedUserId || progressSource !== 'guest' || !GAME_ID_RE.test(String(gameId || ''))) return false;
        setProgress((previous) => {
            const existing = previous[gameId] || createEmptyProgress();
            const mastery = Math.max(existing.mastery, clampPercent(sessionData.accuracy));
            const next = {
                ...existing,
                attempts: existing.attempts + 1,
                lastPlayed: new Date().toISOString(),
                mastery,
                completionPercent: mastery,
                percent: mastery,
                bestScore: Math.max(existing.bestScore, clampPercent(sessionData.score)),
                totalDiamonds: existing.totalDiamonds + nonNegativeInteger(sessionData.diamondsEarned),
                streakBest: Math.max(existing.streakBest, nonNegativeInteger(sessionData.bestStreak)),
            };
            if (sessionData.passed && nonNegativeInteger(sessionData.level) > existing.levelsCompleted) {
                next.levelsCompleted = nonNegativeInteger(sessionData.level);
            }
            return { ...previous, [gameId]: next };
        });
        return true;
    }, [authenticatedUserId, progressSource]);

    const getOverallStats = useCallback(() => {
        const games = Object.values(progress);
        if (games.length === 0) {
            return { gamesPlayed: 0, gamesMastered: 0, totalDiamonds: 0, averageMastery: 0, overallRank: USER_RANKS.UNRANKED };
        }
        const gamesPlayed = games.filter((game) => game.attempts > 0).length;
        const gamesMastered = games.filter((game) => game.mastery >= 85).length;
        const totalDiamonds = games.reduce((sum, game) => sum + (game.totalDiamonds || 0), 0);
        const averageMastery = games.reduce((sum, game) => sum + game.mastery, 0) / games.length;
        return {
            gamesPlayed,
            gamesMastered,
            totalDiamonds,
            averageMastery: Math.round(averageMastery),
            overallRank: getRankFromMastery(averageMastery),
        };
    }, [progress]);

    const getUnplayedGames = useCallback((allGames) => allGames.filter((game) => !hasPlayed(game.id)), [hasPlayed]);
    const getLeakGames = useCallback((allGames) => allGames.filter((game) => {
        const value = progress[game.id];
        return value && value.attempts > 0 && value.mastery < 70;
    }), [progress]);
    const getRecentGames = useCallback((allGames, limit = 5) => allGames
        .filter((game) => progress[game.id]?.lastPlayed)
        .sort((a, b) => new Date(progress[b.id].lastPlayed).getTime() - new Date(progress[a.id].lastPlayed).getTime())
        .slice(0, limit), [progress]);

    const resetProgress = useCallback(() => {
        if (authenticatedUserId) return false;
        setProgress({});
        try {
            window.localStorage.removeItem(GUEST_TRAINING_PROGRESS_STORAGE_KEY);
            window.localStorage.removeItem(LEGACY_UNSCOPED_STORAGE_KEY);
        } catch (storageError) {
            console.warn('[useTrainingProgress] Failed to reset guest progress:', storageError);
            return false;
        }
        return true;
    }, [authenticatedUserId]);

    return {
        isLoaded,
        progress,
        progressSource,
        error,
        isUnavailable,
        isAuthenticated: Boolean(authenticatedUserId),
        reloadProgress: loadProgress,
        getGameProgress,
        hasPlayed,
        isMastered,
        getStatus,
        getRank,
        recordSession,
        getOverallStats,
        getUnplayedGames,
        getLeakGames,
        getRecentGames,
        resetProgress,
    };
}
