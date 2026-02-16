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
                description="Smarter.Poker — The Future of the Game."
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
