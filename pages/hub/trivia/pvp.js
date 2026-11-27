import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import FriendChallengePanel from '../../../src/components/trivia/FriendChallengePanel';
import PvpCompetitiveExperience from '../../../src/components/trivia/pvp/PvpCompetitiveExperience';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import useTriviaRealtimeSync from '../../../src/hooks/useTriviaRealtimeSync';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { eloTierInk } from '../../../src/lib/trivia/integrityAndElo.mjs';
import { triviaPvpPageReleaseResult } from '../../../src/lib/trivia/pvpReleaseControl.mjs';
import { VALID_CHALLENGE_STAKES } from '../../../src/lib/trivia/socialGrowthHelpers.mjs';

const CHALLENGE_CODE_RE = /^[A-Z0-9]{6,16}$/;
const PVP_REALTIME_EVENTS = ['match_update', 'ticket_update', 'state_update', 'settlement_update'];

// The route remains private until both the Phase 5 database contract and its
// server release flag are enabled. Horse eligibility has its own independent
// flag and is shown exactly as the server exposes it.
export function getServerSideProps() {
    return triviaPvpPageReleaseResult(process.env);
}

function formatExactElo(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num).toLocaleString('en-US') : '1,200';
}

function formatExactCount(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(0, Math.round(num)).toLocaleString('en-US') : '0';
}

function PvpEloHeaderBadge({ rating, loading, realtimeActive = false, realtimeConnected = false }) {
    if (loading && !rating) {
        return (
            <section className="trivia-pvp-elo-banner" aria-label="Your PvP Elo Rating">
                <div className="trivia-pvp-elo-banner__meta">
                    <span className="tc-label">Ranked PvP Elo</span>
                    {' '}
                    <strong className="trivia-pvp-elo-banner__score">Loading Rating</strong>
                </div>
            </section>
        );
    }
    if (!rating) return null;
    const rawTierInk = eloTierInk(rating.tier);
    const tierInk = rawTierInk === 'gold' ? 'blue' : rawTierInk;
    const recordLabel = rating.gamesPlayed > 0
        ? `${formatExactCount(rating.wins)}W / ${formatExactCount(rating.losses)}L / ${formatExactCount(rating.ties)}T`
        : 'Unrated';

    return (
        <section className="trivia-pvp-elo-banner" aria-label="Your PvP Elo Rating" data-elo-tier={rating.tier}>
            <div className="trivia-pvp-elo-banner__meta">
                <span className="tc-label trivia-pvp-elo-banner__label">Ranked PvP Elo</span>
                {' '}
                <span className={`trivia-pvp-elo-badge tc-ink--${tierInk}`}>{rating.tier}</span>
                {' '}
                <strong className="trivia-pvp-elo-banner__score">{formatExactElo(rating.elo)} Elo</strong>
                {' '}
                <span className="trivia-pvp-elo-banner__detail">Peak {formatExactElo(rating.peakElo)}</span>
                {' '}
                <span className="trivia-pvp-elo-banner__detail">Record {recordLabel}</span>
                {realtimeActive ? (
                    <>
                        {' '}
                        <span
                            className={`trivia-pvp-elo-badge ${realtimeConnected ? 'tc-ink--green' : 'tc-ink--silver'}`}
                            data-realtime-sync={realtimeConnected ? 'connected' : 'fallback'}
                        >
                            {realtimeConnected ? 'Realtime Live' : 'Polling Sync'}
                        </span>
                    </>
                ) : null}
            </div>
            {' '}
            <Link href="/hub/trivia/leaderboard" className="tc-word trivia-pvp-elo-link">
                PvP Elo Leaderboard
            </Link>
        </section>
    );
}

export default function PvPPage({ pvpHorsesEnabled = false }) {
    useTrainingBus('trivia-pvp');
    const router = useRouter();
    const { user, loading } = useAvatar();
    const [matchActive, setMatchActive] = useState(false);
    const [ratingVersion, setRatingVersion] = useState(0);
    const [viewerRating, setViewerRating] = useState(null);
    const [ratingLoading, setRatingLoading] = useState(false);
    const [syncContext, setSyncContext] = useState({
        active: false,
        state: 'idle',
        ticketId: null,
        matchId: null,
        basePollMs: null,
        heartbeatSeconds: null,
    });
    const [realtimeEventCount, setRealtimeEventCount] = useState(0);
    const [activeChallenge, setActiveChallenge] = useState(null);
    const [pairedMatchId, setPairedMatchId] = useState(null);
    const [settledMatch, setSettledMatch] = useState(null);
    const [settledSessionId, setSettledSessionId] = useState('');
    const [rematchDraft, setRematchDraft] = useState(null);
    const [rematchStake, setRematchStake] = useState(null);
    const friendChallengeDockRef = useRef(null);

    const challengeCode = useMemo(() => {
        const raw = typeof router.query?.challenge === 'string'
            ? router.query.challenge.trim().toUpperCase()
            : '';
        return CHALLENGE_CODE_RE.test(raw) ? raw : '';
    }, [router.query?.challenge]);

    const queryStake = useMemo(() => {
        const parsed = Number(router.query?.stake);
        return Number.isInteger(parsed) && VALID_CHALLENGE_STAKES.includes(parsed) ? parsed : null;
    }, [router.query?.stake]);

    const preferredStake = activeChallenge?.stakeAmount ?? rematchStake ?? queryStake ?? null;

    const handleRealtimePush = useCallback(() => {
        setRealtimeEventCount((count) => count + 1);
    }, []);

    // Keep trivia:pvp:user:${user.id} subscribed whenever signed in on /hub/trivia/pvp
    // (including idle) so a waiting challenger immediately wakes when their friend accepts.
    const realtimeChannelName = useMemo(() => {
        if (!user?.id) return null;
        if (syncContext.active && syncContext.matchId) return `trivia:pvp:match:${syncContext.matchId}`;
        if (syncContext.active && syncContext.ticketId) return `trivia:pvp:ticket:${syncContext.ticketId}`;
        return `trivia:pvp:user:${user.id}`;
    }, [syncContext.active, syncContext.matchId, syncContext.ticketId, user?.id]);

    const fallbackPollMs = syncContext.basePollMs || 2000;
    const connectedPollMs = useMemo(() => {
        if (syncContext.state === 'searching') {
            const heartbeatMs = (syncContext.heartbeatSeconds || 5) * 1000;
            return Math.min(Math.max(fallbackPollMs * 2, 4000), Math.max(heartbeatMs, 4000), 10000);
        }
        return Math.min(Math.max(fallbackPollMs * 3, 6000), 10000);
    }, [fallbackPollMs, syncContext.heartbeatSeconds, syncContext.state]);

    const realtimeSync = useTriviaRealtimeSync({
        channelName: realtimeChannelName,
        enabled: Boolean(user?.id && realtimeChannelName),
        broadcastEvents: PVP_REALTIME_EVENTS,
        fallbackPollMs,
        connectedPollMs,
        onSync: handleRealtimePush,
    });

    const handleMatchActiveChange = useCallback((isActive) => {
        const active = Boolean(isActive);
        setMatchActive(active);
        if (active) {
            setSettledMatch(null);
            setSettledSessionId('');
            setRematchDraft(null);
        }
    }, []);

    const handleClearRematchDraft = useCallback(() => {
        setRematchDraft(null);
    }, []);

    const handleRequestRematch = useCallback((request = null) => {
        if (!request || typeof request !== 'object') return;
        const parsedStake = Number(request.stake);
        const validStake = Number.isInteger(parsedStake) && VALID_CHALLENGE_STAKES.includes(parsedStake)
            ? parsedStake
            : null;
        if (validStake) {
            setRematchStake(validStake);
        }
        // Smarter Horse opponents never receive a direct Friend Challenge rematch draft.
        if (request.isHorse) {
            setRematchDraft(null);
            return;
        }
        const opponentName = typeof request.opponentName === 'string' ? request.opponentName.trim() : '';
        if (!opponentName || opponentName.toLowerCase() === 'smarter horse') {
            setRematchDraft(null);
            return;
        }
        setRematchDraft({
            stake: validStake ?? 25,
            opponentId: typeof request.opponentId === 'string' && request.opponentId.trim() ? request.opponentId.trim() : null,
            opponentName,
            requestedAt: Date.now(),
        });
        if (typeof window !== 'undefined') {
            window.requestAnimationFrame(() => {
                friendChallengeDockRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            });
        }
    }, []);

    const handleMatchSettled = useCallback((settledInfo = null) => {
        setRatingVersion((count) => count + 1);
        if (settledInfo && typeof settledInfo === 'object') {
            setSettledMatch(settledInfo.match || null);
            setSettledSessionId(settledInfo.sessionId || settledInfo.match?.mySessionId || '');
        }
    }, []);

    const handleSyncContextChange = useCallback((nextContext) => {
        setSyncContext((prev) => {
            if (
                prev.active === nextContext.active
                && prev.state === nextContext.state
                && prev.ticketId === nextContext.ticketId
                && prev.matchId === nextContext.matchId
                && prev.basePollMs === nextContext.basePollMs
                && prev.heartbeatSeconds === nextContext.heartbeatSeconds
            ) {
                return prev;
            }
            return nextContext;
        });
    }, []);

    const handleChallengeLoaded = useCallback(({ challenge, pvpHandoff } = {}) => {
        if (!challenge) return;
        const resolvedMatchId = pvpHandoff?.matchId || challenge.matchId || null;
        const nextChallenge = {
            ...challenge,
            matchId: resolvedMatchId,
            pvpHandoff: pvpHandoff || challenge.pvpHandoff || null,
        };
        setActiveChallenge((prev) => {
            if (
                prev?.challengeCode === nextChallenge.challengeCode
                && prev?.status === nextChallenge.status
                && prev?.matchId === nextChallenge.matchId
            ) {
                return prev;
            }
            return nextChallenge;
        });
        if (resolvedMatchId) {
            setPairedMatchId(resolvedMatchId);
        }
        if (resolvedMatchId || pvpHandoff?.paired) {
            setRealtimeEventCount((count) => count + 1);
        }
    }, []);

    const handleChallengeAccepted = useCallback(({ challenge, pvpHandoff, stakeAmount, challengeCode: acceptedCode, matchId } = {}) => {
        if (challenge || pvpHandoff) {
            const resolvedMatchId = matchId || pvpHandoff?.matchId || challenge?.matchId || null;
            const isPaired = Boolean(pvpHandoff?.paired || resolvedMatchId);
            setActiveChallenge({
                ...(challenge || {}),
                challengeCode: acceptedCode || challenge?.challengeCode || pvpHandoff?.challengeCode || '',
                stakeAmount: stakeAmount ?? challenge?.stakeAmount ?? pvpHandoff?.stakeAmount ?? null,
                matchId: resolvedMatchId,
                pvpHandoff: pvpHandoff || challenge?.pvpHandoff || null,
            });
            if (resolvedMatchId) {
                setPairedMatchId(resolvedMatchId);
            }
            if (isPaired) {
                setRealtimeEventCount((count) => count + 1);
            }
        }
    }, []);

    const handleChallengeSignIn = useCallback(() => {
        const target = typeof router.asPath === 'string' && router.asPath.startsWith('/hub/trivia/pvp')
            ? router.asPath
            : (challengeCode
                ? `/hub/trivia/pvp?challenge=${encodeURIComponent(challengeCode)}`
                : '/hub/trivia/pvp');
        void router.push(`/auth/login?redirect=${encodeURIComponent(target)}`);
    }, [challengeCode, router]);

    useEffect(() => {
        if (!user?.id) {
            setPairedMatchId(null);
            setSettledMatch(null);
            setSettledSessionId('');
            setRematchDraft(null);
            setRematchStake(null);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) {
            setViewerRating(null);
            setRatingLoading(false);
            return undefined;
        }
        let cancelled = false;
        const controller = new AbortController();
        setRatingLoading(true);
        (async () => {
            try {
                const headers = { Accept: 'application/json' };
                try {
                    const token = await getFreshAccessToken();
                    if (token) headers.Authorization = `Bearer ${token}`;
                } catch (_tokenError) {
                    // Fallback to session cookie when token helper is unavailable.
                }
                const response = await fetch('/api/trivia/pvp/ratings?limit=1', {
                    method: 'GET',
                    headers,
                    credentials: 'include',
                    cache: 'no-store',
                    signal: controller.signal,
                });
                const payload = await response.json().catch(() => null);
                if (cancelled) return;
                if (response.ok && payload?.success === true && payload.viewer) {
                    setViewerRating(payload.viewer);
                }
            } catch (_error) {
                // Rating badge is non-blocking; never disrupt match lobby or gameplay.
            } finally {
                if (!cancelled) setRatingLoading(false);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [ratingVersion, user?.id]);

    return (
        <TriviaErrorBoundary pageName="Head To Head Trivia">
            <SEOHead
                title="Head To Head Poker Trivia"
                description="Play Server-Graded Head To Head Poker Trivia With A Server-Quoted Diamond Stake, Human-First Matchmaking, Shared Questions And A Durable Settlement Record."
                canonical="/hub/trivia/pvp"
            />
            <div
                className="smarterdesign trivia-console-standalone trivia-pvp-page"
                data-trivia-surface="pvp"
            >
                <UniversalHeader pageDepth={2} />
                <main className="trivia-pvp-shell" aria-labelledby="pvp-title">
                    {user?.id ? (
                        <PvpEloHeaderBadge
                            rating={viewerRating}
                            loading={ratingLoading}
                            realtimeActive={syncContext.active}
                            realtimeConnected={realtimeSync.connected}
                        />
                    ) : null}
                    {challengeCode && !matchActive ? (
                        <div ref={friendChallengeDockRef} className="sd-panel trivia-pvp-challenge-dock" data-challenge-priority="incoming">
                            <FriendChallengePanel
                                signedIn={Boolean(user?.id)}
                                onSignIn={handleChallengeSignIn}
                                initialCode={challengeCode}
                                shareBasePath="/hub/trivia/pvp"
                                onChallengeLoaded={handleChallengeLoaded}
                                onChallengeAccepted={handleChallengeAccepted}
                                rematchDraft={rematchDraft}
                                onClearRematchDraft={handleClearRematchDraft}
                            />
                        </div>
                    ) : null}
                    <PvpCompetitiveExperience
                        key={user?.id || 'signed-out'}
                        user={user}
                        authLoading={loading}
                        pvpHorsesEnabled={pvpHorsesEnabled}
                        onMatchActiveChange={handleMatchActiveChange}
                        onMatchSettled={handleMatchSettled}
                        onSyncContextChange={handleSyncContextChange}
                        onRequestRematch={handleRequestRematch}
                        realtimeConnected={realtimeSync.connected}
                        realtimePollMs={realtimeSync.effectivePollMs}
                        realtimeEventCount={realtimeEventCount}
                        preferredStake={preferredStake}
                        activeChallenge={activeChallenge}
                        pairedMatchId={pairedMatchId}
                        settledSessionId={settledSessionId}
                        settledMatch={settledMatch}
                        friendChallengeSlot={!challengeCode && !matchActive ? (
                            <div ref={friendChallengeDockRef} className="sd-panel trivia-pvp-challenge-dock" data-challenge-priority="standard">
                                <FriendChallengePanel
                                    signedIn={Boolean(user?.id)}
                                    onSignIn={handleChallengeSignIn}
                                    initialCode={challengeCode}
                                    shareBasePath="/hub/trivia/pvp"
                                    onChallengeLoaded={handleChallengeLoaded}
                                    onChallengeAccepted={handleChallengeAccepted}
                                    rematchDraft={rematchDraft}
                                    onClearRematchDraft={handleClearRematchDraft}
                                />
                            </div>
                        ) : null}
                    />
                </main>
                <HubPageSummary page="trivia-pvp" />
            </div>
            <style jsx>{`
                .trivia-pvp-shell {
                    min-height: 540px;
                }
                .trivia-pvp-elo-banner {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    min-height: 54px;
                    margin-bottom: 14px;
                    padding: 12px 16px;
                    border-radius: 12px;
                    border: 1px solid var(--sd-line, var(--tc-bevel));
                    background: var(--sd-surface, var(--tc-chassis-black));
                }
                .trivia-pvp-elo-banner__meta {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 10px 14px;
                }
                .trivia-pvp-elo-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 2px 10px;
                    border-radius: 999px;
                    border: 1px solid currentColor;
                    font-size: 0.78rem;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                }
                .trivia-pvp-elo-banner__score {
                    font-size: 1rem;
                    color: var(--sd-text, var(--tc-ink-white));
                }
                .trivia-pvp-elo-banner__detail {
                    font-size: 0.85rem;
                    color: var(--sd-silver, var(--tc-ink-silver));
                }
                .trivia-pvp-elo-link {
                    display: inline-flex;
                    align-items: center;
                    min-height: 44px;
                }
                .trivia-pvp-challenge-dock {
                    margin: 14px 0;
                    padding: 14px 16px;
                    border-radius: 12px;
                }
            `}</style>
        </TriviaErrorBoundary>
    );
}
