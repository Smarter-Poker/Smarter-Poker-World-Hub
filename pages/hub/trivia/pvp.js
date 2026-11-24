import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import PvpCompetitiveExperience from '../../../src/components/trivia/pvp/PvpCompetitiveExperience';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import useTriviaIntegrityTelemetry from '../../../src/hooks/useTriviaIntegrityTelemetry';
import { getFreshAccessToken } from '../../../src/lib/authUtils';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import { eloTierInk } from '../../../src/lib/trivia/integrityAndElo.mjs';
import { triviaPvpPageReleaseResult } from '../../../src/lib/trivia/pvpReleaseControl.mjs';

// The route remains private until both the Phase 5 database contract and its
// server release flag are enabled. Horse eligibility has its own independent
// flag and is shown exactly as the server exposes it.
export function getServerSideProps() {
    return triviaPvpPageReleaseResult(process.env);
}

function PvpEloHeaderBadge({ rating, loading }) {
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
            </div>
            <Link href="/hub/trivia/leaderboard" className="tc-word">
                PvP Elo Leaderboard
            </Link>
        </section>
    );
}

export default function PvPPage({ pvpHorsesEnabled = false }) {
    useTrainingBus('trivia-pvp');
    const { user, loading } = useAvatar();
    const [matchActive, setMatchActive] = useState(false);
    const [ratingVersion, setRatingVersion] = useState(0);
    const [viewerRating, setViewerRating] = useState(null);
    const [ratingLoading, setRatingLoading] = useState(false);

    useTriviaIntegrityTelemetry({
        active: matchActive,
        accessTokenProvider: getFreshAccessToken,
    });

    const handleMatchActiveChange = useCallback((isActive) => {
        setMatchActive(Boolean(isActive));
    }, []);

    const handleMatchSettled = useCallback(() => {
        setRatingVersion((count) => count + 1);
    }, []);

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
                        <PvpEloHeaderBadge rating={viewerRating} loading={ratingLoading} />
                    ) : null}
                    <PvpCompetitiveExperience
                        key={user?.id || 'signed-out'}
                        user={user}
                        authLoading={loading}
                        pvpHorsesEnabled={pvpHorsesEnabled}
                        onMatchActiveChange={handleMatchActiveChange}
                        onMatchSettled={handleMatchSettled}
                    />
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
            `}</style>
        </TriviaErrorBoundary>
    );
}
