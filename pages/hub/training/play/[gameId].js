import { useRouter } from 'next/router';
import { useEffect } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAINING GAME PLACEHOLDER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * The game UI/engine has been removed for a complete rebuild.
 * This page now redirects back to the training lobby.
 */
export default function TrainingGamePage() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to training lobby
        router.push('/hub/training');
    }, [router]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: 32, marginBottom: 16 }}>🔄 Redirecting to Training Lobby...</h1>
                <p style={{ color: '#94a3b8' }}>Game engine is being rebuilt</p>
            </div>
        </div>
    );
}
