/**
 * Training Arena Page — GodModeArena Host
 * ====================================================
 * Hosts the GodModeArena component for all 100+ training games.
 * Receives gameId, level, and session from URL query params
 * (set by LevelSelector after user selects a level).
 *
 * Route: /hub/training/arena/[gameId]?level=X&session=Y
 */

import { useRouter } from 'next/router';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import { getAuthUser, getFreshAccessToken } from '../../../../src/lib/authUtils';
import { getGameById } from '../../../../src/data/TRAINING_LIBRARY';
import ErrorBanner from '../../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../../src/components/training/ConnectionToast';
import { clearBodyScrollLockIfUnheld } from '../../../../src/lib/scrollLock';
import {
    customTrainingConfigFromQuery,
    isCanonicalTrainingGameId,
    normalizeTrainingVariant,
    normalizeLaunchBettingStructure,
    normalizeLaunchFormat,
} from '../../../../src/lib/training/customTrainingLaunchContract.mjs';

function sanitizeHubReturnTo(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('/hub/') || trimmed.startsWith('//') || trimmed.includes('://')) return null;
    return trimmed;
}
import {
    resolvePresetForGame,
    saveResumableTrainingSession,
    decodeSharedDrillPack,
    decodeCoopStudyRoom,
    decodeClubCoachAssignment,
} from '../../../../src/lib/training/trainingPresets.mjs';

const GodModeArena = dynamic(() => import('../../../../src/components/training/GodModeArena'), {
    ssr: false,
    loading: () => (
        <div style={{
            minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
            background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: 40, height: 40, border: '3px solid rgba(0,212,255,0.2)',
                    borderTopColor: '#00d4ff', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    margin: '0 auto 16px',
                }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>Loading Arena...</div>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    ),
});

// ●●● DEBUG ERROR BOUNDARY — captures exact crash message ●●●
class ArenaErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.warn('[ArenaErrorBoundary] Crash:', error?.message, error?.stack);
    }
    render() {
        if (this.state.hasError) {
            const err = this.state.error;
            return (
                <div style={{
                    minHeight: '100dvh',
                    background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', fontFamily: "'Inter', sans-serif", padding: 24,
                }}>
                    <div style={{ maxWidth: 600, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>▲</div>
                        <h2 style={{ color: '#ef4444', fontSize: 22, marginBottom: 12 }}>Arena Crash Detected</h2>
                        <div style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 8, padding: 16, textAlign: 'left', fontSize: 13,
                            fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                            maxHeight: 300, overflow: 'auto', marginBottom: 16,
                        }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: 8 }}>
                                {err?.message || 'Unknown error'}
                            </div>
                            <div style={{ color: '#64748b', fontSize: 12 }}>
                                {err?.stack?.substring(0, 800) || 'No stack trace'}
                            </div>
                            {this.state.errorInfo?.componentStack && (
                                <div style={{ color: '#475569', fontSize: 12, marginTop: 8 }}>
                                    {this.state.errorInfo.componentStack.substring(0, 500)}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                background: '#00d4ff', color: '#000', border: 'none',
                                padding: '10px 24px', borderRadius: 20, fontSize: 14,
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Reload Arena
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId, level: queryLevel, session: querySession, sessionId: querySessionId } = router.query;
    const sessionId = querySession || querySessionId;
    useTrainingBus('training-arena', { gameId });

    const [userId, setUserId] = useState(null);
    const [ready, setReady] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [resolvedSessionId, setResolvedSessionId] = useState(null);
    const [serverSyncedHand, setServerSyncedHand] = useState(null);
    const [leakReviewSync, setLeakReviewSync] = useState({
        status: 'idle',
        message: null,
        lastResults: null,
    });
    const submittedLeakOpsRef = useRef(new Set());
    const pendingSyncPromiseRef = useRef(null);
    const pendingSyncKeyRef = useRef(null);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onSyncedHand = (event) => {
            if (event?.detail && event.detail.handId) {
                setServerSyncedHand(event.detail);
            }
        };
        window.addEventListener('sp-training-synced-hand', onSyncedHand);
        return () => window.removeEventListener('sp-training-synced-hand', onSyncedHand);
    }, []);

    const sharedDrillPack = useMemo(() => {
        if (!router.isReady) return null;
        const rawPack = typeof router.query.pack === 'string' ? router.query.pack.trim() : '';
        return rawPack ? decodeSharedDrillPack(rawPack) : null;
    }, [router.isReady, router.query.pack]);

    const coopStudyRoom = useMemo(() => {
        if (!router.isReady) return null;
        const rawCoop = typeof router.query.coopRoom === 'string' ? router.query.coopRoom.trim() : '';
        return rawCoop ? decodeCoopStudyRoom(rawCoop) : null;
    }, [router.isReady, router.query.coopRoom]);

    const clubCoachAssignment = useMemo(() => {
        if (!router.isReady) return null;
        const rawAssign = typeof router.query.assignment === 'string' ? router.query.assignment.trim() : '';
        return rawAssign ? decodeClubCoachAssignment(rawAssign) : null;
    }, [router.isReady, router.query.assignment]);

    const customLaunch = useMemo(() => {
        if (!router.isReady) return { config: null, error: null };
        try {
            const syncedHandId = typeof router.query.syncedHandId === 'string' && router.query.syncedHandId.trim()
                ? router.query.syncedHandId.trim()
                : null;
            const baseConfig = syncedHandId ? null : customTrainingConfigFromQuery(router.query);
            const rawVariant = typeof router.query.variant === 'string'
                ? router.query.variant.trim().toLowerCase()
                : (sharedDrillPack?.variant || coopStudyRoom?.variant || clubCoachAssignment?.variant || '');
            const variant = normalizeTrainingVariant(rawVariant);
            const rawBettingStructure = typeof router.query.bettingStructure === 'string'
                ? router.query.bettingStructure.trim().toLowerCase()
                : (sharedDrillPack?.bettingStructure || coopStudyRoom?.bettingStructure || clubCoachAssignment?.bettingStructure || '');
            const bettingStructure = normalizeLaunchBettingStructure(rawBettingStructure, variant || rawVariant);
            const rawFormatInput = typeof router.query.format === 'string'
                ? router.query.format.trim().toLowerCase()
                : (sharedDrillPack?.format || coopStudyRoom?.format || clubCoachAssignment?.format || '');
            const rawFormat = normalizeLaunchFormat(rawFormatInput) || rawFormatInput;
            const format = ['cash', 'mtt', 'spins', 'hu', '9max'].includes(rawFormat) ? rawFormat : null;
            const rawStreet = typeof (router.query.street || router.query.targetStreet) === 'string'
                ? String(router.query.street || router.query.targetStreet).trim().toLowerCase()
                : (sharedDrillPack?.targetStreet || coopStudyRoom?.targetStreet || clubCoachAssignment?.targetStreet || '');
            const targetStreet = ['preflop', 'flop', 'turn', 'river'].includes(rawStreet) ? rawStreet : null;
            const rawPosition = typeof (router.query.position || router.query.targetPositions) === 'string'
                ? String(router.query.position || router.query.targetPositions).trim().toUpperCase()
                : (sharedDrillPack?.heroPosition || coopStudyRoom?.heroPosition || clubCoachAssignment?.heroPosition || '');
            const allowedPosSet = new Set(['UTG', 'UTG+1', 'UTG+2', 'MP', 'MP+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
            const parsedPositions = rawPosition
                ? rawPosition.split(',').map((p) => p.trim().toUpperCase()).filter((p) => allowedPosSet.has(p))
                : [];
            const targetPosition = parsedPositions.length > 0 ? parsedPositions.join(',') : null;
            const primaryHeroPosition = parsedPositions[0] || null;
            const duelToken = typeof router.query.duelToken === 'string' && router.query.duelToken.trim()
                ? router.query.duelToken.trim()
                : null;
            const duelRole = router.query.duelRole === 'opponent'
                ? 'opponent'
                : router.query.duelRole === 'challenger'
                    ? 'challenger'
                    : null;
            if (!baseConfig && !variant && !bettingStructure && !format && !targetStreet && !targetPosition && !duelToken && !duelRole && !syncedHandId && !sharedDrillPack && !coopStudyRoom && !clubCoachAssignment) {
                return { config: null, error: null };
            }
            return {
                config: {
                    ...(baseConfig || {}),
                    ...(sharedDrillPack ? {
                        stackDepthBb: sharedDrillPack.stackDepthBb,
                        questionsCount: sharedDrillPack.questionsCount,
                        sharedPackTitle: sharedDrillPack.title,
                    } : {}),
                    ...(coopStudyRoom ? {
                        stackDepthBb: coopStudyRoom.stackDepthBb,
                        coopRoomId: coopStudyRoom.roomId,
                        coopCoachName: coopStudyRoom.coachName,
                        coopRoomTitle: coopStudyRoom.title,
                    } : {}),
                    ...(clubCoachAssignment ? {
                        stackDepthBb: clubCoachAssignment.stackDepthBb,
                        clubAssignmentId: clubCoachAssignment.assignmentId,
                        clubAssignmentTitle: clubCoachAssignment.title,
                        clubTargetAccuracyPct: clubCoachAssignment.targetAccuracyPct,
                    } : {}),
                    ...(variant ? { variant } : {}),
                    ...(bettingStructure ? { bettingStructure } : {}),
                    ...(format ? { format } : {}),
                    ...(targetStreet ? { targetStreet, gameMode: 'street' } : {}),
                    ...(targetPosition ? {
                        targetPositions: targetPosition,
                        heroPosition: primaryHeroPosition,
                    } : {}),
                    ...(duelToken ? { duelToken } : {}),
                    ...(duelRole ? { duelRole } : {}),
                    ...(syncedHandId ? { syncedHandId } : {}),
                },
                error: null,
            };
        } catch (error) {
            return {
                config: null,
                error: error?.message || 'This Focused Training Configuration Is Invalid.',
            };
        }
    }, [router.isReady, router.asPath, sharedDrillPack, coopStudyRoom, clubCoachAssignment]);

    useEffect(() => {
        if (!router.isReady || !gameId) return;
        setResolvedSessionId(
            sessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        );
    }, [router.isReady, gameId, sessionId]);

    // Resolve user ID.
    // 2026-07-19 AUDIT FIX: previously minted `anon-<ts>` ids for logged-out
    // visitors, but useGTOTrainer's question APIs all require a Bearer token
    // (401 otherwise) — anonymous arenas could never load a single question.
    // Redirect to login and return here afterwards (login.js honors ?redirect=).
    useEffect(() => {
        if (!router.isReady) return;
        try {
            const authUser = getAuthUser();
            if (authUser?.id) {
                setUserId(authUser.id);
                setReady(true);
                return;
            }
        } catch (e) {
            // fall through to redirect
        }
        router.replace(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
    }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear a stale body lock on exit when no arena owns it.
    useEffect(() => () => { clearBodyScrollLockIfUnheld(); }, []);

    // Resolve game name from TRAINING_LIBRARY
    const game = typeof gameId === 'string' && isCanonicalTrainingGameId(gameId)
        ? getGameById(gameId)
        : null;
    const gameName = game?.name || 'Training Game';
    const presetLaunch = !['custom', 'pack', 'coopRoom', 'assignment', 'duelToken', 'duelRole', 'syncedHandId']
            .some((key) => router.query[key] !== undefined);
    const homeHands = /^[1-9][0-9]?$/.test(String(router.query.hands || ''))
        ? Number(router.query.hands)
        : null;
    const startsWithPreset = Boolean(game && !customLaunch.error && (presetLaunch || !customLaunch.config));
    const initialConfig = useMemo(() => {
        if (!startsWithPreset) return customLaunch.config;
        return {
            ...resolvePresetForGame(game),
            ...customLaunch.config,
            configType: 'catalog-preset',
            ...(homeHands && homeHands <= 50 ? { questionsCount: homeHands } : {}),
        };
    }, [customLaunch.config, game, startsWithPreset, homeHands]);
    const level = parseInt(queryLevel, 10) || 1;
    useEffect(() => {
        if (!startsWithPreset || !userId || !resolvedSessionId) return;
        saveResumableTrainingSession({ ...initialConfig, gameId, gameName, level }, userId);
    }, [startsWithPreset, userId, resolvedSessionId, initialConfig, gameId, gameName, level]);
    // Handle arena exit — await any in-flight mastery sync, then return preserving active context
    const handleExit = useCallback(async () => {
        if (pendingSyncPromiseRef.current) {
            try {
                await Promise.race([
                    pendingSyncPromiseRef.current,
                    new Promise((r) => setTimeout(r, 3500)),
                ]);
            } catch (_) {
                // Best-effort flush before navigation
            }
        }
        const safeReturnTo = sanitizeHubReturnTo(router.query?.returnTo);
        if (safeReturnTo) {
            router.push(safeReturnTo);
            return;
        }
        const fromParam = typeof router.query?.from === 'string' ? router.query.from.trim() : '';
        const sourceParam = typeof router.query?.source === 'string' ? router.query.source.trim() : '';
        if (fromParam === 'leak-finder' || sourceParam === 'leak-finder' || sourceParam.startsWith('personal-assistant') || fromParam.startsWith('personal-assistant')) {
            const leakParam = typeof router.query?.leak === 'string' && router.query.leak.trim()
                ? router.query.leak.trim()
                : (typeof router.query?.leakSlug === 'string' ? router.query.leakSlug.trim() : '');
            router.push(leakParam ? `/hub/personal-assistant/leaks?leak=${encodeURIComponent(leakParam)}` : '/hub/personal-assistant/leaks');
            return;
        }
        if (startsWithPreset && router.query.source === 'training-home') {
            router.push('/hub/training');
            return;
        }
        if (startsWithPreset && router.query.source === 'training-category') {
            router.push(`/hub/training/category/${game.category.toLowerCase()}`);
            return;
        }
        const exitParams = new URLSearchParams();
        for (const key of ['variant', 'bettingStructure', 'format', 'street', 'position', 'source']) {
            const val = router.query?.[key];
            if (typeof val === 'string' && val.trim()) {
                exitParams.set(key, val.trim());
            }
        }
        if (!exitParams.get('street') && typeof router.query?.targetStreet === 'string' && router.query.targetStreet.trim()) {
            exitParams.set('targetStreet', router.query.targetStreet.trim());
        }
        for (const extraKey of ['targetStreet', 'targetPositions', 'hands']) {
            const val = router.query?.[extraKey];
            if (typeof val === 'string' && val.trim()) {
                exitParams.set(extraKey, val.trim());
            }
        }
        const qs = exitParams.toString();
        router.push(qs ? `/hub/training/play/${gameId}?${qs}` : `/hub/training/play/${gameId}`);
    }, [router, gameId, game, startsWithPreset]);

    // Handle session complete
    const handleComplete = useCallback(async (results) => {
        const leakId = typeof router.query?.leak === 'string' && router.query.leak.trim()
            ? router.query.leak.trim()
            : (typeof router.query?.leakSlug === 'string' ? router.query.leakSlug.trim() : '');
        if (!leakId || !results || typeof results !== 'object') return null;

        const questionsAnswered = Number(results.questionsAnswered);
        if (!Number.isFinite(questionsAnswered) || questionsAnswered <= 0) return null;

        const operationId = `arena:${resolvedSessionId || gameId}:${results.level || level}:${results.questionsAnswered}:${results.questionsCorrect}`;
        if (pendingSyncKeyRef.current === operationId && pendingSyncPromiseRef.current) {
            return pendingSyncPromiseRef.current;
        }
        if (submittedLeakOpsRef.current.has(operationId)) return null;

        const syncPromise = (async () => {
            const accessToken = await getFreshAccessToken();
            if (!accessToken) return null;
            if (submittedLeakOpsRef.current.has(operationId)) return null;
            submittedLeakOpsRef.current.add(operationId);

            setLeakReviewSync({
                status: 'saving',
                message: 'Saving Leak Progress...',
                lastResults: results,
            });

            try {
                const res = await fetch('/api/assistant/leaks/review', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({
                        leakId,
                        correct: Number(results.questionsCorrect),
                        total: Number(results.questionsAnswered),
                        operationId: `arena:${resolvedSessionId || gameId}:${results.level || level}:${results.questionsAnswered}:${results.questionsCorrect}`,
                        source: 'training_arena',
                        gameId,
                        sessionId: resolvedSessionId,
                    }),
                });
                const json = await res.json().catch(() => null);
                if (res.status === 403 || json?.blocked === true) {
                    submittedLeakOpsRef.current.delete(operationId);
                    setLeakReviewSync({
                        status: 'rta_blocked',
                        message: 'Leak Progress Paused During Live Play Or Cooldown',
                        lastResults: results,
                    });
                    return json;
                }
                if (res.ok && json?.persisted === true) {
                    const reviewState = json?.state || json?.record || null;
                    const accuracy = Number.isFinite(Number(results.accuracy))
                        ? Math.round(Number(results.accuracy))
                        : Math.round((Number(results.questionsCorrect || 0) / questionsAnswered) * 100);
                    const newStatus = json?.newStatus
                        || (reviewState?.retired === true
                            ? 'retired'
                            : (Number(reviewState?.strongStreak) > 0 ? 'improving' : 'reviewing'));
                    const nextReviewAt = json?.nextReviewAt || reviewState?.dueAt || null;
                    setLeakReviewSync({
                        status: 'saved',
                        message: 'Leak Mastery Synced',
                        lastResults: results,
                    });
                    if (typeof window !== 'undefined') {
                        try {
                            window.sessionStorage?.setItem(
                                'pa_arena_review_receipt_v1',
                                JSON.stringify({
                                    leakId,
                                    gameId,
                                    accuracy,
                                    masterySynced: true,
                                    newStatus,
                                    nextReviewAt,
                                    savedAt: Date.now(),
                                }),
                            );
                        } catch (_) {
                            // Ignore storage write errors in restricted browsing modes
                        }
                        window.dispatchEvent(new Event('pa-leak-review-updated'));
                        window.dispatchEvent(new Event('pa-data-updated'));
                    }
                    return json;
                }
                submittedLeakOpsRef.current.delete(operationId);
                setLeakReviewSync({
                    status: 'error',
                    message: 'Leak Sync Failed',
                    lastResults: results,
                });
                return json;
            } catch (err) {
                submittedLeakOpsRef.current.delete(operationId);
                setLeakReviewSync({
                    status: 'error',
                    message: 'Leak Sync Failed',
                    lastResults: results,
                });
                return null;
            } finally {
                if (pendingSyncKeyRef.current === operationId) {
                    pendingSyncKeyRef.current = null;
                    pendingSyncPromiseRef.current = null;
                }
            }
        })();

        pendingSyncKeyRef.current = operationId;
        pendingSyncPromiseRef.current = syncPromise;
        return syncPromise;
    }, [router.query?.leak, router.query?.leakSlug, resolvedSessionId, gameId, level]);

    if (router.isReady && gameId && (!game || customLaunch.error)) {
        return (
            <main className="sp-training-state">
                <section className="sd-panel" role="alert">
                    <h1 className="sd-section-title">Training Launch Unavailable</h1>
                    <p>{customLaunch.error || 'This Training Game Could Not Be Found.'}</p>
                    <button
                        type="button"
                        className="sd-button sd-primary"
                        onClick={() => router.replace('/hub/training')}
                    >
                        Return To Training
                    </button>
                </section>
            </main>
        );
    }

    if (!router.isReady || !gameId || !ready || !resolvedSessionId) {
        return (
            <main className="sp-training-state">
                <div className="sd-panel" role="status">
                    <p className="sd-section-title">Preparing Your Training Session…</p>
                </div>
            </main>
        );
    }

    const syncedHandId = typeof router.query.syncedHandId === 'string' ? router.query.syncedHandId.trim() : '';
    const duelToken = typeof router.query.duelToken === 'string' ? router.query.duelToken.trim() : '';
    const validatedReturnTo = sanitizeHubReturnTo(router.query.returnTo);
    const queryFrom = typeof router.query.from === 'string' ? router.query.from.trim() : '';
    const querySource = typeof router.query.source === 'string' ? router.query.source.trim() : '';
    const queryLeak = typeof router.query.leak === 'string' && router.query.leak.trim()
        ? router.query.leak.trim()
        : (typeof router.query.leakSlug === 'string' ? router.query.leakSlug.trim() : '');
    const isPersonalAssistantOrigin = queryFrom === 'leak-finder'
        || queryFrom.startsWith('personal-assistant')
        || querySource === 'leak-finder'
        || querySource.startsWith('personal-assistant')
        || Boolean(queryLeak);
    const isFromPersonalAssistant = isPersonalAssistantOrigin;
    const personalAssistantReturnHref = validatedReturnTo || (
        queryLeak
            ? `/hub/personal-assistant/leaks?leak=${encodeURIComponent(queryLeak)}`
            : '/hub/personal-assistant/leaks'
    );
    const syncedHandReturnHref = validatedReturnTo || (
        querySource === 'personal-assistant-live-spot' || isPersonalAssistantOrigin
            ? personalAssistantReturnHref
            : querySource === 'hand-history-upload'
                ? '/hub/training/hand-history-upload'
                : '/hub/training/live-hud-sync'
    );
    const syncedHandReturnLabel = (querySource === 'personal-assistant-live-spot' || isPersonalAssistantOrigin)
        ? '← Return To Personal Assistant'
        : querySource === 'hand-history-upload'
            ? '← Return To Hand History Review'
            : '← Return To Live Hand Sync';
    const resolvedHeroCards = Array.isArray(serverSyncedHand?.heroCards)
        ? serverSyncedHand.heroCards.join('')
        : '';
    const resolvedBoard = typeof serverSyncedHand?.board === 'string' ? serverSyncedHand.board : '';

    return (
        <>
            <Head>
                <title>{gameName} - Level {level} | Smarter.Poker GTO Training</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            </Head>
            {isPersonalAssistantOrigin && !syncedHandId && (
                <div
                    data-pa-return-banner="true"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '8px 16px',
                        background: 'linear-gradient(180deg, #091727 0%, #030b14 100%)',
                        borderBottom: '1px solid rgba(103, 232, 249, 0.35)',
                        color: '#e6f3ff',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "'Inter', -apple-system, sans-serif",
                        zIndex: 50,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span>
                            ◆ Focused Personal Assistant Leak Drill Active
                        </span>
                        {leakReviewSync.status !== 'idle' && (
                            <span
                                data-testid="pa-leak-review-sync-pill"
                                data-sync-status={leakReviewSync.status}
                                role="status"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '3px 10px',
                                    borderRadius: 999,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: leakReviewSync.status === 'saved'
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : leakReviewSync.status === 'error' || leakReviewSync.status === 'rta_blocked'
                                            ? 'rgba(239, 68, 68, 0.2)'
                                            : 'rgba(14, 165, 233, 0.2)',
                                    border: leakReviewSync.status === 'saved'
                                        ? '1px solid rgba(52, 211, 153, 0.5)'
                                        : leakReviewSync.status === 'error' || leakReviewSync.status === 'rta_blocked'
                                            ? '1px solid rgba(248, 113, 113, 0.5)'
                                            : '1px solid rgba(103, 232, 249, 0.45)',
                                    color: leakReviewSync.status === 'saved'
                                        ? '#6ee7b7'
                                        : leakReviewSync.status === 'error' || leakReviewSync.status === 'rta_blocked'
                                            ? '#fca5a5'
                                            : '#bae6fd',
                                }}
                            >
                                <span>{leakReviewSync.message}</span>
                                {leakReviewSync.status === 'error' && leakReviewSync.lastResults && (
                                    <button
                                        type="button"
                                        data-testid="pa-leak-review-retry-btn"
                                        onClick={() => {
                                            void handleComplete(leakReviewSync.lastResults);
                                        }}
                                        style={{
                                            background: 'rgba(248, 113, 113, 0.22)',
                                            color: '#fecaca',
                                            border: '1px solid rgba(248, 113, 113, 0.6)',
                                            borderRadius: 999,
                                            minHeight: 44,
                                            padding: '10px 14px',
                                            fontSize: 12,
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Retry Save
                                    </button>
                                )}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        data-testid="pa-return-banner-btn"
                        onClick={handleExit}
                        style={{
                            background: 'rgba(131, 222, 255, 0.1)',
                            border: '1px solid rgba(131, 222, 255, 0.35)',
                            borderRadius: 8,
                            color: '#83deff',
                            fontWeight: 800,
                            fontSize: 12,
                            minHeight: 44,
                            padding: '10px 14px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                        }}
                    >
                        ← Return To Personal Assistant
                    </button>
                </div>
            )}
            {syncedHandId && (
                <div
                    data-synced-hand-banner="true"
                    data-synced-hand-id={syncedHandId}
                    data-synced-hand-verified={serverSyncedHand?.participantVerified ? 'true' : 'pending'}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '8px 16px',
                        background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.2), rgba(6, 78, 59, 0.35))',
                        borderBottom: '1px solid rgba(52, 211, 153, 0.45)',
                        color: '#ecfdf5',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "'Inter', -apple-system, sans-serif",
                        zIndex: 50,
                    }}
                >
                    <span>
                        ★ Drilling Authenticated Hand #{syncedHandId}
                        {resolvedHeroCards ? ` · Hero: ${resolvedHeroCards}` : ''}
                        {resolvedBoard ? ` · Board: ${resolvedBoard}` : ''}
                        {serverSyncedHand?.heroPosition ? ` · Position: ${String(serverSyncedHand.heroPosition).toUpperCase()}` : ''}
                        {serverSyncedHand?.street ? ` · Street: ${String(serverSyncedHand.street).toUpperCase()}` : ''}
                        {serverSyncedHand?.engineModule ? ` · Brain: ${serverSyncedHand.engineModule}` : ''}
                    </span>
                    <a
                        href={syncedHandReturnHref}
                        style={{
                            color: '#6ee7b7',
                            textDecoration: 'none',
                            fontWeight: 800,
                            fontSize: 12,
                        }}
                    >
                        {syncedHandReturnLabel}
                    </a>
                </div>
            )}
            {sharedDrillPack && (
                <div
                    data-shared-drill-pack-banner="true"
                    data-shared-pack-title={sharedDrillPack.title}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '8px 16px',
                        background: 'linear-gradient(180deg, #091727 0%, #030b14 100%)',
                        borderBottom: '1px solid #688299',
                        color: '#e6f3ff',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "'Inter', -apple-system, sans-serif",
                        zIndex: 50,
                    }}
                >
                    <span>
                        ◆ Shared Study Group Drill Pack Active · {sharedDrillPack.title} ({sharedDrillPack.summary})
                    </span>
                    <a
                        href="/hub/training/drill-builder"
                        style={{
                            color: '#83deff',
                            textDecoration: 'none',
                            fontWeight: 800,
                            fontSize: 12,
                        }}
                    >
                        Customize Pack In Drill Builder →
                    </a>
                </div>
            )}
            {coopStudyRoom && (
                <div
                    data-coop-study-room-banner="true"
                    data-coop-room-id={coopStudyRoom.roomId}
                    data-coop-coach-name={coopStudyRoom.coachName}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '8px 16px',
                        background: 'linear-gradient(180deg, #13253a 0%, #091727 55%, #060e18 100%)',
                        borderBottom: '1px solid #56d8ff',
                        color: '#f4fbff',
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: "'Inter', -apple-system, sans-serif",
                        zIndex: 50,
                    }}
                >
                    <span>
                        ★ Real-Time CO-Op Study Room Active · Host: {coopStudyRoom.coachName} · {coopStudyRoom.title} ({coopStudyRoom.summary})
                    </span>
                    <a
                        href="/hub/training/coach-mode"
                        style={{
                            color: '#83deff',
                            textDecoration: 'none',
                            fontWeight: 800,
                            fontSize: 12,
                        }}
                    >
                        Return To Coach Broadcast →
                    </a>
                </div>
            )}
            {clubCoachAssignment && (
                <div
                    data-club-assignment-banner="true"
                    data-club-assignment-id={clubCoachAssignment.assignmentId}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '8px 16px',
                        background: 'linear-gradient(180deg, #13253a 0%, #091727 55%, #060e18 100%)',
                        borderBottom: '1px solid #688299',
                        color: '#f4fbff',
                        fontSize: 12,
                        fontWeight: 800,
                        fontFamily: "'Inter', -apple-system, sans-serif",
                        zIndex: 50,
                    }}
                >
                    <span>
                        ◆ Club Coach Weekly Assignment · {clubCoachAssignment.clubName} ({clubCoachAssignment.coachName}) · Target: {clubCoachAssignment.targetAccuracyPct}% Accuracy
                    </span>
                    <a
                        href="/hub/training/leaderboard"
                        style={{
                            color: '#83deff',
                            textDecoration: 'none',
                            fontWeight: 800,
                            fontSize: 12,
                        }}
                    >
                        View Club Leaderboard →
                    </a>
                </div>
            )}
            {duelToken && (
                <div
                    data-arena-duel-bar="true"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: '8px 16px',
                        background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.22), rgba(30, 58, 138, 0.35))',
                        borderBottom: '1px solid rgba(103, 232, 249, 0.45)',
                        color: '#f0f9ff',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "'Inter', -apple-system, sans-serif",
                        zIndex: 50,
                    }}
                >
                    <span>
                        ◆ Signed Asynchronous Duel Active · Identical Canonical Scenario Sequence & Server Grading
                    </span>
                    <a
                        href={`/hub/training/pvp-lobby?duelToken=${encodeURIComponent(duelToken)}`}
                        style={{
                            color: '#7dd3fc',
                            textDecoration: 'none',
                            fontWeight: 800,
                            fontSize: 12,
                        }}
                    >
                        View Verified Two-Player Scoreboard →
                    </a>
                </div>
            )}
            <ArenaErrorBoundary>
                <GodModeArena
                    userId={userId}
                    gameId={gameId}
                    gameName={gameName}
                    level={level}
                    sessionId={resolvedSessionId}
                    initialConfig={initialConfig}
                    presetOnly={startsWithPreset}
                    onComplete={handleComplete}
                    onExit={handleExit}
                    exitLabel={isFromPersonalAssistant ? '← Return To Personal Assistant' : undefined}
                />
            </ArenaErrorBoundary>
            {fetchError && <ErrorBanner message={fetchError} onRetry={() => setFetchError(null)} />}
            <ConnectionToast />
        </>
    );
}
