/**
 * Training Play Page — Level Selector
 * ====================================
 * Shows the 10-level map for a specific game.
 * User selects which level to play, then navigates to the Game Arena.
 */

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import LevelSelector from '../../../../src/components/training/LevelSelector';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';

export default function TrainingPlayPage() {
    const router = useRouter();
    const { gameId } = router.query;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch current user
    useEffect(() => {
        const fetchUser = async () => {
            try {
                // Get user from Supabase session or local storage
                const storedUser = localStorage.getItem('sb-user-id');
                if (storedUser) {
                    setUserId(storedUser);
                } else {
                    // Generate anonymous user ID for demo
                    const anonId = `anon-${Date.now()}`;
                    localStorage.setItem('sb-user-id', anonId);
                    setUserId(anonId);
                }
            } catch (e) {
                console.error('Error fetching user:', e);
            }
            setLoading(false);
        };
        fetchUser();
    }, []);

    if (loading || !gameId) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                    <p>Loading Level Selector...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Select Level | Smarter.Poker Training</title>
                <meta name="viewport" content="width=800, user-scalable=no" />
                <style>{`
                    .training-play-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .training-play-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .training-play-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .training-play-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .training-play-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .training-play-page { zoom: 1.5; } }
                `}</style>
            </Head>
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
