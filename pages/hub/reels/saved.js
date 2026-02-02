/**
 * Saved Reels Page
 * ═══════════════════════════════════════════════════════════════════════════
 * User's saved reels for later viewing
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import { savedReelsService } from '../../../src/services/preferences-service';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function SavedReels() {
    const [user, setUser] = useState(null);
    const [savedReels, setSavedReels] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSavedReels();
    }, []);

    const loadSavedReels = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            const reels = await savedReelsService.getSavedReels(authUser.id);
            setSavedReels(reels);
            setLoading(false);
        } catch (error) {
            console.error('Error loading saved reels:', error);
            setLoading(false);
        }
    };

    const unsaveReel = async (reelId) => {
        try {
            await savedReelsService.unsaveReel(user.id, reelId);
            setSavedReels(savedReels.filter(item => item.reel_id !== reelId));
        } catch (error) {
            console.error('Error unsaving reel:', error);
        }
    };

    return (
        <PageTransition>
            <Head>
                <title>Saved Reels — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>💾 Saved Reels</h1>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>💾</div>
                            <p style={styles.loadingText}>Loading saved reels...</p>
                        </div>
                    ) : savedReels.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>💾</div>
                            <h2 style={styles.emptyTitle}>No saved reels</h2>
                            <p style={styles.emptyText}>Save reels you love to watch later</p>
                        </div>
                    ) : (
                        <div style={styles.reelsGrid}>
                            {savedReels.map(item => (
                                <div key={item.id} style={styles.reelCard}>
                                    <video src={item.reel?.video_url} style={styles.video} />
                                    <p style={styles.caption}>{item.reel?.caption}</p>
                                    <button onClick={() => unsaveReel(item.reel_id)} style={styles.unsaveButton}>
                                        Unsave
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </PageTransition>
    );
}

const styles = {
    container: { minHeight: '100vh', background: '#0a0a0a', color: '#FFFFFF' },
    content: { maxWidth: '1200px', margin: '0 auto', padding: '80px 24px 40px' },
    title: { fontSize: '32px', fontWeight: 700, marginBottom: '32px' },
    reelsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' },
    reelCard: { background: '#1a1a1a', borderRadius: '12px', overflow: 'hidden' },
    video: { width: '100%', aspectRatio: '9/16', objectFit: 'cover' },
    caption: { padding: '12px', fontSize: '14px' },
    unsaveButton: { margin: '0 12px 12px', padding: '8px 16px', background: 'transparent', border: '1px solid #FF4444', color: '#FF4444', borderRadius: '6px', cursor: 'pointer' },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyIcon: { fontSize: '64px', marginBottom: '16px', opacity: 0.5 },
    emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af' },
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
    loadingText: { marginTop: '16px', color: '#9ca3af' }
};
