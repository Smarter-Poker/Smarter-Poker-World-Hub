/**
 * Training Arena Page — Redirect to Play Page
 * ====================================================
 * BUG-B FIX: This page previously had broken placeholder logic
 * (isCorrect = action !== 'FOLD'). All training games now flow
 * through /hub/training/play/[gameId] → GodModeArena to use
 * the proper useGTOTrainer hook with real GTO scoring.
 *
 * Route: /hub/training/arena/[gameId] → redirects to /hub/training/play/[gameId]
 */

import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function TrainingArenaRedirect() {
    const router = useRouter();
    const { gameId } = router.query;

    useEffect(() => {
        if (gameId) {
            // Preserve query params (level, session, etc.)
            const params = new URLSearchParams(router.query);
            params.delete('gameId'); // Already in the path
            const queryString = params.toString();
            const redirectUrl = `/hub/training/play/${gameId}${queryString ? `?${queryString}` : ''}`;
            router.replace(redirectUrl);
        }
    }, [gameId, router]);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #0a0a15, #1a1a2e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: 16,
            fontFamily: "'Inter', sans-serif",
        }}>
            Redirecting to training...
        </div>
    );
}
