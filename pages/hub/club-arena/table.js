/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Table View (Poker Table)
   Embeds the Club Arena React table via iframe for full poker experience
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';

export default function ClubTable() {
    const router = useRouter();
    const { table: tableId, club: clubIdParam } = router.query;

    const [isLoading, setIsLoading] = useState(true);

    // Build the Club Arena table URL
    const clubArenaUrl = tableId
        ? `https://club-arena.vercel.app/table/${tableId}`
        : null;

    useEffect(() => {
        if (clubArenaUrl) {
            // Let the iframe load
            const timer = setTimeout(() => setIsLoading(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [clubArenaUrl]);

    if (!tableId) {
        return (
            <div style={{ minHeight: '100vh', background: '#18191A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#B0B3B8', textAlign: 'center' }}>
                    <p style={{ fontSize: '18px', marginBottom: '16px' }}>No table selected</p>
                    <button
                        onClick={() => router.push(`/hub/club-arena/lobby${clubIdParam ? `?club=${clubIdParam}` : ''}`)}
                        style={{ padding: '12px 24px', background: '#2374E1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}
                    >
                        Back to Lobby
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <SEOHead
                title="Club Arena — Table"
                description="Play poker at your Club Arena table."
                canonical="/hub/club-arena/table"
                noindex={true}
            />

            <div style={{ position: 'fixed', inset: 0, background: '#0d1117' }}>
                {/* Loading overlay */}
                {isLoading && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#0d1117',
                    }}>
                        <div style={{ textAlign: 'center', color: '#B0B3B8' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>♠♥♦♣</div>
                            <p style={{ fontSize: '16px' }}>Loading Table...</p>
                        </div>
                    </div>
                )}

                {/* Club Arena iframe */}
                <iframe
                    src={clubArenaUrl}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        display: isLoading ? 'none' : 'block',
                    }}
                    allow="microphone; camera; fullscreen"
                    title="Club Arena Poker Table"
                    onLoad={() => setIsLoading(false)}
                />
            </div>
        </>
    );
}
