/**
 * My Reels Page
 * ═══════════════════════════════════════════════════════════════════════════
 * User's uploaded reels
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';

export default function MyReels() {
    const [user, setUser] = useState(null);
    const [reels, setReels] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadReels();
    }, []);

    const loadReels = async () => {
        try {
            const authUser = await getAuthUser();
            setUser(authUser);

            if (!authUser) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('social_reels')
                .select('*')
                .eq('user_id', authUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setReels(data || []);
            setLoading(false);
        } catch (error) {
            console.error('Error loading reels:', error);
            setLoading(false);
        }
    };

    return (
        <PageTransition>
            <Head>
                <title>My Reels — Smarter.Poker</title>
            </Head>

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    <h1 style={styles.title}>🎬 My Reels</h1>

                    {loading ? (
                        <div style={styles.loadingContainer}>
                            <div style={styles.spinner}>🎬</div>
                            <p style={styles.loadingText}>Loading reels...</p>
                        </div>
                    ) : reels.length === 0 ? (
                        <div style={styles.emptyState}>
                            <div style={styles.emptyIcon}>🎬</div>
                            <h2 style={styles.emptyTitle}>No reels yet</h2>
                            <p style={styles.emptyText}>Upload your first reel to get started</p>
                        </div>
                    ) : (
                        <div style={styles.reelsGrid}>
                            {reels.map(reel => (
                                <div key={reel.id} style={styles.reelCard}>
                                    <video src={reel.video_url} style={styles.video} />
                                    <p style={styles.caption}>{reel.caption}</p>
                                    <div style={styles.stats}>
                                        ❤️ {reel.likes_count || 0} • 💬 {reel.comments_count || 0}
                                    </div>
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
    stats: { padding: '0 12px 12px', fontSize: '14px', color: '#9ca3af' },
    emptyState: { textAlign: 'center', padding: '80px 24px' },
    emptyIcon: { fontSize: '64px', marginBottom: '16px', opacity: 0.5 },
    emptyTitle: { fontSize: '24px', fontWeight: 600, marginBottom: '8px' },
    emptyText: { color: '#9ca3af' },
    loadingContainer: { textAlign: 'center', padding: '80px 24px' },
    spinner: { fontSize: '48px', animation: 'pulse 1.5s ease-in-out infinite' },
    loadingText: { marginTop: '16px', color: '#9ca3af' }
};
