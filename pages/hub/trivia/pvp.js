import { useCallback, useEffect, useMemo, useState } from 'react';
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
import useTriviaIntegrityTelemetry from '../../../src/hooks/useTriviaIntegrityTelemetry';
import useTriviaRealtimeSync from '../../../src/hooks/useTriviaRealtimeSync';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
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

function PvpEloHeaderBadge({ rating, loading, realtimeActive = false, realtimeConnected = false }) {
    if (loading && !rating) {
        return (
            <section className="trivia-pvp-elo-banner" aria-label="Your PvP Elo Rating">
                <div className="trivia-pvp-elo-banner__meta">
                    <span className="tc-label">Ranked PvP Elo</span>
                    <strong className="trivia-pvp-elo-banner__score">Loading Rating</strong>
                </div>
            </section>
        );
    }
    if (!rating) return null;
    const tierInk = eloTierInk(rating.tier);
    const recordLabel = rating.gamesPlayed > 0
        ? `${formatTriviaDisplayNumber(rating.wins)}W / ${formatTriviaDisplayNumber(rating.losses)}L / ${formatTriviaDisplayNumber(rating.ties)}T`
        : 'Unrated';

    return (
        <section className="trivia-pvp-elo-banner" aria-label="Your PvP Elo Rating" data-elo-tier={rating.tier}>
            <div className="trivia-pvp-elo-banner__meta">
                <span className="tc-label">Ranked PvP Elo</span>
                <span className={`trivia-pvp-elo-badge tc-ink--${tierInk}`}>{rating.tier}</span>
                <strong className="trivia-pvp-elo-banner__score">{formatTriviaDisplayNumber(rating.elo)} Elo</strong>
                <span className="trivia-pvp-elo-banner__detail">Peak {formatTriviaDisplayNumber(rating.peakElo)}</span>
                <span className="trivia-pvp-elo-banner__detail">Record {recordLabel}</span>
                {realtimeActive ? (
                    <span
                        className={`trivia-pvp-elo-badge ${realtimeConnected ? 'tc-ink--green' : 'tc-ink--silver'}`}
                        data-realtime-sync={realtimeConnected ? 'connected' : 'fallback'}
                    >
                        {realtimeConnected ? 'Realtime Live' : 'Polling Sync'}
                    </span>
                ) : null}
            </div>
            <Link href="/hub/trivia/leaderboard" className="tc-word">
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
    const [settledMatch, setSettledMatch] = useState(null);
    const [settledSessionId, setSettledSessionId] = useState('');

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

    const preferredStake = activeChallenge?.stakeAmount ?? queryStake ?? null;

    useTriviaIntegrityTelemetry({
        active: matchActive,
        accessTokenProvider: getFreshAccessToken,
    });

    const handleRealtimePush = useCallback(() => {
        setRealtimeEventCount((count) => count + 1);
    }, []);

    const realtimeChannelName = useMemo(() => {
        if (!user?.id || !syncContext.active) return null;
        if (syncContext.matchId) return `trivia:pvp:match:${syncContext.matchId}`;
        if (syncContext.ticketId) return `trivia:pvp:ticket:${syncContext.ticketId}`;
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
        enabled: Boolean(user?.id && syncContext.active && realtimeChannelName),
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

    const handleChallengeLoaded = useCallback(({ challenge } = {}) => {
        if (!challenge) return;
        setActiveChallenge((prev) => {
            if (prev?.challengeCode === challenge.challengeCode && prev?.status === challenge.status) {
                return prev;
            }
            return challenge;
        });
    }, []);

    const handleChallengeAccepted = useCallback(({ challenge, stakeAmount, challengeCode: acceptedCode } = {}) => {
        if (challenge) {
            setActiveChallenge({
                ...challenge,
                challengeCode: acceptedCode || challenge.challengeCode,
                stakeAmount: stakeAmount ?? challenge.stakeAmount,
            });
        }
    }, []);

    const handleChallengeSignIn = useCallback(() => {
        const target = challengeCode
            ? `/hub/trivia/pvp?challenge=${encodeURIComponent(challengeCode)}`
            : '/hub/trivia/pvp';
        void router.push(`/auth/login?redirect=${encodeURIComponent(target)}`);
    }, [challengeCode, router]);

    useEffect(() => {
        if (!user?.id) {
            setSettledMatch(null);
            setSettledSessionId('');
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
                className="trivia-console-standalone trivia-pvp-page"
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
                        <div className="trivia-pvp-challenge-dock" data-challenge-priority="incoming">
                            <FriendChallengePanel
                                signedIn={Boolean(user?.id)}
                                onSignIn={handleChallengeSignIn}
                                initialCode={challengeCode}
                                shareBasePath="/hub/trivia/pvp"
                                onChallengeLoaded={handleChallengeLoaded}
                                onChallengeAccepted={handleChallengeAccepted}
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
                        realtimeConnected={realtimeSync.connected}
                        realtimePollMs={realtimeSync.effectivePollMs}
                        realtimeEventCount={realtimeEventCount}
                        preferredStake={preferredStake}
                        activeChallenge={activeChallenge}
                        settledSessionId={settledSessionId}
                        settledMatch={settledMatch}
                    />
                    {!challengeCode && !matchActive ? (
                        <div className="trivia-pvp-challenge-dock" data-challenge-priority="standard">
                            <FriendChallengePanel
                                signedIn={Boolean(user?.id)}
                                onSignIn={handleChallengeSignIn}
                                initialCode={challengeCode}
                                shareBasePath="/hub/trivia/pvp"
                                onChallengeLoaded={handleChallengeLoaded}
                                onChallengeAccepted={handleChallengeAccepted}
                            />
                        </div>
                    ) : null}
                </main>
                <HubPageSummary page="trivia-pvp" />
            </div>
            <style jsx>{`
                .trivia-pvp-elo-banner {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 14px;
                    padding: 12px 16px;
                    border-radius: 12px;
                    border: 1px solid var(--tc-bevel);
                    background: var(--tc-chassis-black);
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
                    text-transform: uppercase;
                }
                .trivia-pvp-elo-banner__score {
                    font-size: 1rem;
                    color: var(--tc-ink-white);
                }
                .trivia-pvp-elo-banner__detail {
                    font-size: 0.85rem;
                    color: var(--tc-ink-silver);
                }
                .trivia-pvp-challenge-dock {
                    margin: 14px 0;
                    padding: 14px 16px;
                    border-radius: 12px;
                    border: 1px solid var(--tc-bevel);
                    background: var(--tc-chassis-black);
                }
            `}</style>
        </TriviaErrorBoundary>
    );
}
