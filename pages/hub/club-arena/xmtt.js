/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — XMTT Hub | Cross-Club Multi-Table Tournaments | FULLY WIRED
   SmarterPoker Dark Theme | Union-Level XMTT Registration & Browse
   ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { haptic } from '../../../src/lib/club-arena/haptic';
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import NotificationBell from '../../../src/components/club-arena/NotificationBell';
import SEOHead from '../../../src/components/seo/SEOHead';

const GameCard = dynamic(() => import('../../../src/components/club-arena/GameCard'), { ssr: false });
const ClubArenaBottomNav = dynamic(() => import('../../../src/components/club-arena/ClubArenaBottomNav'), { ssr: false });

const FB = {
    primary: '#2374E1', background: '#18191A', cardBg: '#242526',
    textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042',
    success: '#31A24C', danger: '#FA383E', hover: '#3A3B3C',
};

export default function XMTTHub() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [tournaments, setTournaments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('upcoming'); // upcoming | running | past
    const [menuOpen, setMenuOpen] = useState(false);
    const mountedRef = useRef(true);

    useTrainingBus('xmtt-hub');
    usePullToRefresh({ onRefresh: () => loadData?.(user, tab) });

    // ── Auth: use bulletproof getAuthUser() ──
    useEffect(() => {
        const authUser = getAuthUser();
        if (authUser) {
            setUser(authUser);
            loadData(authUser, 'upcoming');
        } else {
            router.push('/auth/login');
        }
    }, []);

    // ── Mounted guard ──
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // ── EventBus: live mutation sync ──
    useEffect(() => {
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const relevant = ['tournament_created', 'tournament_registration', 'tournament_complete', 'tournament_cancelled', 'tournament_paused', 'tournament_resumed', 'union_tournament_created'];
            if (relevant.includes(e?.payload?.entity)) loadData(user, tab);
        });
        const unsubStart = eventBus.on(EventType.TOURNAMENT_STARTED, () => loadData(user, tab));
        const unsubDone = eventBus.on(EventType.TOURNAMENT_COMPLETE, () => loadData(user, tab));
        return () => { unsub(); unsubStart(); unsubDone(); };
    }, [user, tab]);

    const loadData = async (u, selectedTab) => {
        if (!mountedRef.current) return;
        setLoading(true);
        try {
            const statusFilter = selectedTab === 'running' ? 'running'
                : selectedTab === 'past' ? 'complete,cancelled'
                    : 'scheduled,registering';

            const { data, error } = await supabase
                .from('club_tournaments')
                .select(`
                    *,
                    clubs:club_id ( name ),
                    tournament_registrations!left ( user_id )
                `)
                .eq('type', 'xmtt')
                .in('status', statusFilter.split(','))
                .order('scheduled_start', { ascending: selectedTab !== 'past' })
                .limit(50);

            if (!error && data && mountedRef.current) {
                const enriched = data.map(t => ({
                    ...t,
                    club_name: t.clubs?.name || 'Unknown Club',
                    is_registered: (t.tournament_registrations || []).some(r => r.user_id === (u || user)?.id),
                }));
                setTournaments(enriched);
            }
        } catch (err) {
            console.error('[XMTT Hub] Load error:', err);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    };

    const handleTabChange = (newTab) => {
        haptic('light');
        setTab(newTab);
        loadData(user, newTab);
    };

    if (!user) return null;

    return (
        <div style={{ background: FB.background, minHeight: '100vh', color: FB.textPrimary }}>
            <SEOHead title="XMTT Hub — Cross-Club Tournaments" description="Browse and register for cross-club tournaments." canonical="/hub/club-arena/xmtt" noindex />
            <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="left"
                theme="dark"
                user={user}
                showProfile={true}
                {...getMenuConfig('club-arena', user, {}, {})}
            />

            {/* Page Header */}
            <div style={{ background: FB.cardBg, padding: '16px 24px', borderBottom: `1px solid ${FB.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => { haptic('light'); router.back(); }}
                    style={{ background: 'none', border: 'none', color: FB.textSecondary, cursor: 'pointer', fontSize: 20 }}>←</button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ margin: 0, fontSize: 20 }}>XMTT Hub</h1>
                    <span style={{ color: FB.textSecondary, fontSize: 13 }}>Cross-Club Tournaments</span>
                </div>
                <NotificationBell userId={user?.id} />
            </div>

            {/* Feature Banner */}
            <div style={{
                margin: '12px 16px', padding: '14px 18px', borderRadius: 10,
                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                border: '1px solid rgba(24,119,242,0.3)',
            }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#42A5F5', marginBottom: 4 }}>Cross-Club Multi-Table Tournaments</div>
                <div style={{ fontSize: 11, color: FB.textSecondary, lineHeight: 1.5 }}>
                    Compete against players from multiple clubs in massive guaranteed prize pools. One buy-in, one registration — play from any club in the union.
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${FB.border}`, background: FB.cardBg }}>
                {['upcoming', 'running', 'past'].map(t => (
                    <button key={t} onClick={() => handleTabChange(t)} style={{
                        flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                        background: tab === t ? FB.primary : 'transparent',
                        color: tab === t ? '#fff' : FB.textSecondary,
                        fontWeight: tab === t ? 700 : 500, fontSize: 14,
                    }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
            </div>

            {/* Tournament Grid */}
            <HubErrorBoundary name="XMTTContent">
                <div style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
                    {loading && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="ca-skeleton" style={{ height: 140, borderRadius: 10 }} />
                            ))}
                        </div>
                    )}

                    {!loading && tournaments.length === 0 && (
                        <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 40 }}>
                            No {tab} XMTT tournaments
                        </div>
                    )}

                    {!loading && tournaments.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {tournaments.map(t => (
                                <GameCard
                                    key={t.id}
                                    game={{ ...t, game_type: 'xmtt', game_variant: t.variant || 'nlh' }}
                                    onPress={() => { haptic('light'); router.push(`/hub/club-arena/tournaments?club=${t.club_id}`); }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </HubErrorBoundary>

            <ClubArenaBottomNav activePage="xmtt" userRole="player" />
        </div>
    );
}
