/**
 * Training Play Page — Level Selector
 * ====================================
 * Shows the 12-level map for a specific game.
 * User selects which level to play, then navigates to the Game Arena.
 */

import { useRouter } from 'next/router';
import { useState, useEffect, useMemo } from 'react';
import SEOHead from '../../../../src/components/seo/SEOHead';
import LevelSelector from '../../../../src/components/training/LevelSelector';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../../src/lib/training/horseBrainTrainingAdapter';

export default function TrainingPlayPage() {
    const bus = useTrainingBus('training-play');
    const router = useRouter();
    const { gameId } = router.query;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [brainVariant, setBrainVariant] = useState('nlh');

    const brainPreview = useMemo(() => {
        return evaluateTrainingSpotWithHorseBrain({
            variant: brainVariant,
            street: 'flop',
            heroPosition: 'BTN',
            villainPosition: 'BB',
            heroCards: brainVariant === 'plo6' ? ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'] : brainVariant === 'plo5' ? ['As', 'Ks', 'Qh', 'Jh', 'Td'] : brainVariant === 'plo8' ? ['As', '2s', 'Kd', '3d'] : brainVariant === 'plo4' ? ['As', 'Ks', 'Qh', 'Jh'] : ['As', 'Kd'],
            boardCards: ['Qs', '7d', '2c'],
            potSizeBb: 12,
            facingBetBb: 4,
            effectiveStackBb: 100,
        });
    }, [brainVariant]);

    // Fetch current user from Supabase auth.
    // 2026-07-19 AUDIT FIX: this page previously minted `anon-<ts>` user ids
    // for logged-out visitors, but every training question API requires a
    // Bearer token (401 otherwise) — so anonymous sessions dead-ended on an
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
            <div style={{
                minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
                background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                    <p>Loading Level Selector...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <SEOHead
                title="Play Training Game"
                description="Smarter.Poker - The Future Of The Game."
                noindex={true}
            />
            <div className="training-play-page">
                <UniversalHeader pageDepth={2} />
                <LevelSelector
                    userId={userId}
                    gameId={gameId}
                />
                <section
                    data-specialty-brain-panel="true"
                    data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}
                    data-recommended-action={brainPreview?.recommendedAction || 'Call'}
                    style={{
                        maxWidth: 980,
                        margin: '0 auto 36px',
                        padding: 20,
                        border: '1px solid rgba(139, 234, 255, 0.35)',
                        background: 'linear-gradient(180deg, rgba(16, 36, 48, 0.96), rgba(4, 13, 21, 0.98))',
                        color: '#eefbff',
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                        <div>
                            <div style={{ color: '#7be9ff', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                Horse Brain Variant Calibration
                            </div>
                            <div style={{ marginTop: 4, color: '#f5fdff', fontSize: 15, fontWeight: 700 }}>
                                Recommended Action: {brainPreview?.recommendedAction || 'Call'} · Score: {brainPreview?.handScore ?? 50} / 100
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                            {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    data-brain-variant-tab={v}
                                    onClick={() => setBrainVariant(v)}
                                    style={{
                                        padding: '6px 12px',
                                        border: brainVariant === v ? '1px solid #7be9ff' : '1px solid rgba(255,255,255,0.2)',
                                        background: brainVariant === v ? 'rgba(8,145,178,0.45)' : 'rgba(255,255,255,0.05)',
                                        color: '#f5fdff',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {v.toUpperCase()}
                                </button>
                            ))}
                            <button
                                type="button"
                                data-launch-club-arena-cta="true"
                                onClick={() => router.push(buildCustomTrainingArenaHref({ format: 'cash', variant: brainVariant, streets: ['flop'], positions: ['BTN'], stackDepth: 100 }, 'play'))}
                                style={{
                                    padding: '8px 14px',
                                    border: '1px solid #7be9ff',
                                    background: 'linear-gradient(180deg, #078cc0, #043a54)',
                                    color: '#f5fdff',
                                    fontSize: 12,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                Launch 1:1 Club Arena Drill
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}
