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

export default function TrainingPlayPage() {
    const router = useRouter();
    const { gameId } = router.query;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch current user
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const { supabase } = await import('../../../../src/lib/supabase');
                const { data: { user } } = await supabase.auth.getUser();

                if (user) {
                    setUserId(user.id);
                } else {
                    // Redirect to login if not authenticated
                    router.push('/login?redirect=/hub/training');
                    return;
                }
            } catch (error) {
                console.error('Auth error:', error);
            } finally {
                setLoading(false);
            }
        };

        if (gameId) {
            fetchUser();
        }
    }, [gameId, router]);

    const handleBack = () => {
        router.push('/hub/training');
    };

    // Show loading state
    if (loading || !gameId || !userId) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontFamily: 'Inter, -apple-system, sans-serif',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎰</div>
                    <p>Loading levels...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Select Level | Smarter Poker Training</title>
                <meta name="description" content="Choose your training level" />
            </Head>

            <LevelSelector
                gameId={gameId}
                userId={userId}
                onBack={handleBack}
            />
        </>
    );
}
