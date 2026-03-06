/**
 * 🏆 TRAINING TOURNAMENTS LOBBY
 * ═══════════════════════════════════════════════════════════════════════════
 * Competitive timed training challenges vs other players
 * ═══════════════════════════════════════════════════════════════════════════
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import SkeletonLoader from '../../../src/components/ui/SkeletonLoader';
import { getAuthUser } from '../../../src/lib/authUtils';
import { getGameById } from '../../../src/data/TRAINING_LIBRARY';
import { supabase } from '../../../../../src/lib/supabase';

export default function TournamentsPage() {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('live'); // 'live', 'upcoming', 'completed'
    const [registering, setRegistering] = useState(null);

    // Load auth user once
    useEffect(() => {    const _c = new AbortController();

        getAuthUser().then(u => setUser(u)).catch(() => { });
    return () => _c.abort();
  }, []);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`train-tourn:${user?.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commander_tournament_entries', filter: `user_id=eq.${user?.id}` }, () => {})
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [user?.id]);

    // SWR key includes tab + user so switching tabs is instant on revisit
    const swrKey = `/api/training/tournaments?status=${activeTab}${user ? `&userId=${user.id}` : ''}`;
    const { data: swrData, isLoading: loading, mutate: refreshTournaments } = useSWR(swrKey, (url) =>
        fetch(url).then(r => r.json()).then(d => d.success ? (d.tournaments || []) : [])
    );
    const tournaments = swrData || [];

    const registerForTournament = async (tournamentId) => {
        if (!user) {
            alert('Please sign in to register');
            return;
        }

        setRegistering(tournamentId);
        try {
            const res = await fetch('/api/training/tournaments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    tournamentId,
                    action: 'register'
                })
            });

            const data = await res.json();
            if (data.success) {
                alert('🎉 Registered successfully!');
                refreshTournaments(); // Refresh
            } else {
                alert(data.error || 'Registration failed');
            }
        } catch (error) {
            console.error('Register error:', error);
        } finally {
            setRegistering(null);
        }
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) return 'Today';
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'live':
                return <span style={{ ...styles.badge, background: '#31A24C' }}>🔴 LIVE</span>;
            case 'scheduled':
                return <span style={{ ...styles.badge, background: '#00E0FF' }}>⏰ Upcoming</span>;
            case 'complete':
                return <span style={{ ...styles.badge, background: '#6b7280' }}>✅ Complete</span>;
            default:
                return null;
        }
    };

    return (
        <PageTransition>
            <SEOHead
                title="Training Tournaments — Compete & Learn"
                description="Enter GTO Training Tournaments. Compete Against Other Students In Scenario-based Challenges."
                canonical="/hub/training/tournaments"
            />

            <div style={styles.container}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.content}>
                    {/* Header */}
                    <div style={styles.header}>
                        <h1 style={styles.title}>🏆 Training Tournaments</h1>
                        <p style={styles.subtitle}>Compete Against Other Players In Timed GTO Challenges</p>
                    </div>

                    {/* Tab Navigation */}
                    <div style={styles.tabs}>
                        {['live', 'upcoming', 'completed'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    ...styles.tab,
                                    ...(activeTab === tab ? styles.tabActive : {})
                                }}
                            >
                                {tab === 'live' ? '🔴 Live' : tab === 'upcoming' ? '⏰ Upcoming' : '✅ Past'}
                            </button>
                        ))}
                    </div>

                    {/* Tournament List */}
                    {loading ? (
                        <SkeletonLoader variant="card" count={3} style={{ padding: '16px' }} />
                    ) : tournaments.length === 0 ? (
                        <div style={styles.emptyState}>
                            <span style={styles.emptyIcon}>🏆</span>
                            <p>No {activeTab} tournaments</p>
                            {activeTab === 'live' && (
                                <p style={styles.emptyHint}>Check Upcoming Tournaments Or Wait For The Next One!</p>
                            )}
                        </div>
                    ) : (
                        <div style={styles.tournamentList}>
                            {tournaments.map((tournament, i) => {
                                const game = getGameById(tournament.game_id);

                                return (
                                    <div
                                        key={tournament.id}
                                        style={styles.tournamentCard}
                                    >
                                        <div style={styles.cardHeader}>
                                            <div style={styles.cardTitle}>
                                                <span style={styles.gameIcon}>{game?.icon || '🎯'}</span>
                                                {tournament.name}
                                            </div>
                                            {getStatusBadge(tournament.status)}
                                        </div>

                                        <div style={styles.cardDetails}>
                                            <div style={styles.detailRow}>
                                                <span>📚 Game:</span>
                                                <span>{game?.name || tournament.game_id}</span>
                                            </div>
                                            <div style={styles.detailRow}>
                                                <span>⏱️ Time:</span>
                                                <span>{formatDate(tournament.start_time)} at {formatTime(tournament.start_time)}</span>
                                            </div>
                                            <div style={styles.detailRow}>
                                                <span>❓ Questions:</span>
                                                <span>{tournament.questions_count}</span>
                                            </div>
                                            <div style={styles.detailRow}>
                                                <span>👥 Players:</span>
                                                <span>{tournament.entry_count}{tournament.max_entries ? `/${tournament.max_entries}` : ''}</span>
                                            </div>
                                        </div>

                                        <div style={styles.prizes}>
                                            <div style={styles.prizeItem}>
                                                <span>🥇</span>
                                                <span style={styles.prizeAmount}>{tournament.prize_1st}💎</span>
                                            </div>
                                            <div style={styles.prizeItem}>
                                                <span>🥈</span>
                                                <span style={styles.prizeAmount}>{tournament.prize_2nd}💎</span>
                                            </div>
                                            <div style={styles.prizeItem}>
                                                <span>🥉</span>
                                                <span style={styles.prizeAmount}>{tournament.prize_3rd}💎</span>
                                            </div>
                                        </div>

                                        {tournament.entry_fee_diamonds > 0 && (
                                            <div style={styles.entryFee}>
                                                Entry: {tournament.entry_fee_diamonds}💎
                                            </div>
                                        )}

                                        {tournament.status === 'scheduled' && (
                                            <button
                                                onClick={() => registerForTournament(tournament.id)}
                                                disabled={registering === tournament.id}
                                                style={styles.registerBtn}
                                            >
                                                {registering === tournament.id ? 'Registering...' : 'Register Now'}
                                            </button>
                                        )}

                                        {tournament.status === 'live' && (
                                            <Link href={`/hub/training/tournament/${tournament.id}`} style={styles.playBtn}>Play Now →</Link>
                                        )}

                                        {tournament.status === 'complete' && (
                                            <Link href={`/hub/training/tournament/${tournament.id}`} style={styles.viewBtn}>View Results</Link>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}



                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#FFFFFF'
    },
    content: {
        maxWidth: '600px',
        margin: '0 auto',
        padding: '80px 24px 40px'
    },
    header: {
        textAlign: 'center',
        marginBottom: '32px'
    },
    title: {
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '8px'
    },
    subtitle: {
        fontSize: '14px',
        color: '#9ca3af'
    },
    tabs: {
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        background: '#1a1a1a',
        padding: '6px',
        borderRadius: '12px'
    },
    tab: {
        flex: 1,
        padding: '12px 16px',
        background: 'transparent',
        border: 'none',
        borderRadius: '8px',
        color: '#9ca3af',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    tabActive: {
        background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
        color: '#fff'
    },
    loading: {
        textAlign: 'center',
        padding: '60px 20px',
        color: '#9ca3af'
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px 20px',
        color: '#9ca3af'
    },
    emptyIcon: {
        fontSize: '48px',
        display: 'block',
        marginBottom: '16px'
    },
    emptyHint: {
        fontSize: '13px',
        color: '#6b7280',
        marginTop: '8px'
    },
    tournamentList: {
        display: 'grid',
        gap: '16px'
    },
    tournamentCard: {
        background: '#1a1a1a',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(255,255,255,0.1)'
    },
    cardHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
    },
    cardTitle: {
        fontSize: '18px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    gameIcon: {
        fontSize: '24px'
    },
    badge: {
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        color: '#fff'
    },
    cardDetails: {
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '16px'
    },
    detailRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '13px',
        color: '#9ca3af',
        marginBottom: '6px'
    },
    prizes: {
        display: 'flex',
        justifyContent: 'space-around',
        padding: '12px 0',
        marginBottom: '16px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
    },
    prizeItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px'
    },
    prizeAmount: {
        fontWeight: 600,
        color: '#FFD700'
    },
    entryFee: {
        textAlign: 'center',
        fontSize: '13px',
        color: '#9ca3af',
        marginBottom: '12px'
    },
    registerBtn: {
        width: '100%',
        padding: '14px',
        background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
        border: 'none',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 600,
        cursor: 'pointer'
    },
    playBtn: {
        display: 'block',
        width: '100%',
        padding: '14px',
        background: 'linear-gradient(135deg, #31A24C, #228B22)',
        border: 'none',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '16px',
        fontWeight: 600,
        textAlign: 'center',
        textDecoration: 'none'
    },
    viewBtn: {
        display: 'block',
        width: '100%',
        padding: '14px',
        background: '#2a2a2a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        color: '#9ca3af',
        fontSize: '16px',
        fontWeight: 500,
        textAlign: 'center',
        textDecoration: 'none'
    },
    actions: {
        textAlign: 'center',
        marginTop: '40px'
    },
    backButton: {
        color: '#00E0FF',
        textDecoration: 'none',
        fontSize: '16px'
    }
};
