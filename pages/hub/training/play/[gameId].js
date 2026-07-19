/**
 * Training Play Page — Level Selector
 * ====================================
 * Shows the 10-level map for a specific game.
 * User selects which level to play, then navigates to the Game Arena.
 */

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import SEOHead from '../../../../src/components/seo/SEOHead';
import LevelSelector from '../../../../src/components/training/LevelSelector';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';

export default function TrainingPlayPage() {
    const bus = useTrainingBus('training-play');
    const router = useRouter();
    const { gameId } = router.query;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

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
                minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
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
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />
            <div className="training-play-page">
                <UniversalHeader pageDepth={2} />
                <LevelSelector
                    userId={userId}
                    gameId={gameId}
                />
            </div>
        </>
    );
}
