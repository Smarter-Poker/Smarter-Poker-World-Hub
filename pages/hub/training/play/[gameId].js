/**
 * Training Play Page · Level Selector
 * ====================================
 * Shows the 12-level map for a specific game.
 * User selects which level to play, then navigates to the Game Arena.
 */

import { useRouter } from 'next/router';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import SEOHead from '../../../../src/components/seo/SEOHead';
import LevelSelector from '../../../../src/components/training/LevelSelector';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';

function formatGameTitle(rawGameId) {
    if (!rawGameId || typeof rawGameId !== 'string') return 'GTO Poker Training Arena';
    const cleaned = rawGameId
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .split(/[-_]+/)
        .filter(Boolean)
        .map((part) => (/^(gto|icm|mtt|nlh|plo|ev|sb|bb|utg|btn|co|hj|mp|adv)$/i.test(part)
            ? part.toUpperCase()
            : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
        .join(' ');
    return cleaned ? `GTO Poker Training Arena: ${cleaned}` : 'GTO Poker Training Arena';
}

export default function TrainingPlayPage() {
    const bus = useTrainingBus('training-play');
    const router = useRouter();
    const { gameId } = router.query;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    const safeGameId = typeof gameId === 'string' && /^[a-zA-Z0-9_-]+$/.test(gameId) ? gameId : '';
    const headingTitle = formatGameTitle(safeGameId);
    const redirectTarget = safeGameId ? `/hub/training/play/${safeGameId}` : '/hub/training';
    const signupHref = `/auth/signup?redirect=${encodeURIComponent(redirectTarget)}&src=training-play`;
    const loginHref = `/auth/login?redirect=${encodeURIComponent(redirectTarget)}`;


    // Fetch current user from Supabase auth.
    // 2026-07-19 AUDIT FIX: this page previously minted `anon-<ts>` user ids
    // for logged-out visitors, but every training question API requires a
    // Bearer token (401 otherwise) -- so anonymous sessions dead-ended on an
    // error screen in the arena. Send logged-out users to login and bring
    // them straight back here afterwards (login.js honors ?redirect=).
    useEffect(() => {
        if (!router.isReady) return;
        const fetchUser = async () => {
            try {
                const { getAuthUser } = await import('../../../../src/lib/authUtils');
                const authUser = getAuthUser();
                if (authUser?.id) {
                    setUserId(authUser.id);
                    setLoading(false);
                    return;
                }
            } catch (e) {
                console.warn('Error fetching user:', e);
            }
            router.replace(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
        };
        fetchUser();
    }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading || !gameId) {
        return (
            <>
                <SEOHead
                    title="Play Training Game"
                    description="Interactive Smarter.Poker GTO Training Level Selector."
                    noindex={true}
                />
                <main style={{
                    minHeight: '100dvh',
                    padding: '24px 16px 70px',
                    width: '100%',
                    maxWidth: '100vw',
                    overflowX: 'clip',
                    boxSizing: 'border-box',
                    background: 'linear-gradient(180deg, #060d1a 0%, #081121 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif",
                }}>
                    <section style={{
                        width: '100%',
                        maxWidth: 480,
                        background: '#081121',
                        border: '1px solid rgba(148, 184, 224, 0.28)',
                        borderRadius: 14,
                        padding: '28px 24px',
                        textAlign: 'center',
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
                    }}>
                        <div style={{
                            display: 'inline-block',
                            padding: '5px 12px',
                            borderRadius: 999,
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(148, 184, 224, 0.28)',
                            color: '#38bdf8',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            marginBottom: 14,
                        }}>
                            Smarter.Poker GTO Training
                        </div>
                        <h1 style={{
                            margin: '0 0 10px',
                            fontSize: 'clamp(22px, 4vw, 28px)',
                            fontWeight: 800,
                            lineHeight: 1.25,
                            color: '#ffffff',
                            fontFamily: "var(--font-orbitron), sans-serif",
                        }}>
                            {headingTitle}
                        </h1>
                        <p style={{
                            margin: '0 0 22px',
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: '#cbd5e1',
                        }}>
                            Loading Level Selector. Sign In Or Create A Free Account To Play 107 Solver-Graded GTO Poker Training Games And Save Your Progress.
                        </p>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            gap: 12,
                        }}>
                            <Link
                                href={signupHref}
                                rel="nofollow"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: 44,
                                    padding: '10px 22px',
                                    borderRadius: 8,
                                    background: 'linear-gradient(135deg, #1d4ed8 0%, #0284c7 100%)',
                                    border: '1px solid rgba(148, 184, 224, 0.36)',
                                    color: '#ffffff',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                }}
                            >
                                Create Free Account
                            </Link>
                            <Link
                                href={loginHref}
                                rel="nofollow"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: 44,
                                    padding: '10px 20px',
                                    borderRadius: 8,
                                    background: '#060d1a',
                                    border: '1px solid rgba(148, 184, 224, 0.28)',
                                    color: '#38bdf8',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                }}
                            >
                                Sign In
                            </Link>
                        </div>
                    </section>
                </main>
            </>
        );
    }

    return (
        <>
            <SEOHead
                title="Play Training Game"
                description="Smarter.Poker - The Future Of The Game."
                noindex={true}
            />
            <div className="training-play-page" style={{ background: '#040d18', minHeight: '100dvh' }}>
                <UniversalHeader pageDepth={2} />
                <LevelSelector
                    userId={userId}
                    gameId={gameId}
                />
            </div>
        </>
    );
}
