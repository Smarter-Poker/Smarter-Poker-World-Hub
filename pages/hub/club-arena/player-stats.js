/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Player Stats | FULLY WIRED
 SmarterPoker Dark Theme | Real Stats from Hand History & Gameplay
 ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import usePersistedState from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import useWalletData from '../../../src/hooks/useWalletData';

const DynamicWallet = dynamic(
    () => import('../../../src/components/club-arena/DynamicWallet'),
    { ssr: false, loading: () => null }
);

// SmarterPoker Dark Color Scheme
const FB = {
    primary: '#2374E1',
    background: '#18191A',
    cardBg: '#242526',
    textPrimary: '#E4E6EB',
    textSecondary: '#B0B3B8',
    border: '#3E4042',
    success: '#31A24C',
    danger: '#FA383E',
    gold: '#F7C52A',
    hover: '#3A3B3C',
};


// ─── Mini Profit Sparkline ──────────────────────────────────────
function ProfitSparkline({ activities }) {
    if (!activities || activities.length < 2) return null;

    // Build cumulative P&L series
    let running = 0;
    const values = activities.slice().reverse().map(a => {
        running += a.type === 'win' ? a.amount : -a.amount;
        return running;
    });

    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;

    const W = 280, H = 56;
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * W;
        const y = H - ((v - min) / range) * H;
        return `${x},${y}`;
    });

    const isUp = values[values.length - 1] >= 0;
    const color = isUp ? '#31A24C' : '#FA383E';
    const zeroY = H - ((0 - min) / range) * H;

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Profit Trend (Last {activities.length} Hands)
            </div>
            <div style={{ background: '#242526', borderRadius: 8, padding: '12px 16px', border: '1px solid #3E4042' }}>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
                    {/* Zero line */}
                    {min < 0 && max > 0 && (
                        <line x1="0" y1={zeroY} x2={W} y2={zeroY}
                            stroke="#3E4042" strokeWidth="1" strokeDasharray="3,3" />
                    )}
                    {/* Area fill */}
                    <defs>
                        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                            <stop offset="100%" stopColor={color} stopOpacity="0.03" />
                        </linearGradient>
                    </defs>
                    <polygon
                        points={`0,${H} ${pts.join(' ')} ${W},${H}`}
                        fill="url(#sparkGrad)"
                    />
                    {/* Line */}
                    <polyline
                        points={pts.join(' ')}
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                    {/* End dot */}
                    <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]}
                        r="3.5" fill={color} />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#B0B3B8', marginTop: 4 }}>
                    <span>Oldest</span>
                    <span style={{ color, fontWeight: 700 }}>
                        {running >= 0 ? '+' : ''}{running.toLocaleString()} net
                    </span>
                    <span>Latest</span>
                </div>
            </div>
        </div>
    );
}

export default function PlayerStats() {
    useTrainingBus('club-arena-player-stats');

    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [membership, setMembership] = useState(null);
    const [showWallet, setShowWallet] = useState(false);

    // Wallet data (real-time balances)
    const walletData = useWalletData({ supabase, userId: user?.id, clubId: club?.id });
    const [stats, setStats] = useState({
        handsPlayed: 0,
        handsWon: 0,
        winRate: 0,
        totalWinnings: 0,
        biggestPot: 0,
        bestHand: null,
        sessionsPlayed: 0,
        hoursPlayed: 0,
        vpip: 0, // Voluntarily Put In Pot %
        pfr: 0, // Pre-Flop Raise %
        avgPot: 0,
    });
    const [recentActivity, setRecentActivity] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Time period filter
    const [period, setPeriod] = usePersistedState('sp-filters-ca-player-stats', 'all'); // 'week' | 'month' | 'all'

    // ═══════════════════════════════════════════════════════════════════════════
    // LOAD DATA
    // ═══════════════════════════════════════════════════════════════════════════
    const loadData = useCallback(async () => {
        if (!clubIdParam) return;
        setIsLoading(true);
        try {
            // Get authenticated user (Supabase session only)
            const authUser = getAuthUser();
            setUser(authUser);

            // Get club data
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
            const { data: clubData } = await supabase
                .from('clubs')
                .select('*')
                .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                .maybeSingle();

            if (clubData) {
                setClub(clubData);

                // Get membership
                if (authUser) {
                    const { data: memberData } = await supabase
                        .from('club_members')
                        .select('*')
                        .eq('club_id', clubData.id)
                        .eq('user_id', authUser.id)
                        .maybeSingle();
                    setMembership(memberData);

                    // Calculate date range
                    let dateFilter = null;
                    if (period === 'week') {
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        dateFilter = weekAgo.toISOString();
                    } else if (period === 'month') {
                        const monthAgo = new Date();
                        monthAgo.setMonth(monthAgo.getMonth() - 1);
                        dateFilter = monthAgo.toISOString();
                    }

                    // Fetch hand history for this user in this club
                    // Engine saves to hand_histories with hand_data JSONB containing full action log
                    let handQuery = supabase
                        .from('hand_histories')
                        .select('id, hand_number, variant, pot_total, player_ids, winner_ids, hand_data, rake, completed_at, club_id')
                        .contains('player_ids', [authUser.id])
                        .limit(100) // player hands

                    // hand_history may not have user_id/club_id columns — wrap in try/catch
                    let hands = [];
                    try {
                        if (dateFilter) {
                            handQuery = handQuery.gte('completed_at', dateFilter);
                        }
                        if (clubData?.id || clubData?.club_id) {
                            handQuery = handQuery.eq('club_id', clubData.id || clubData.club_id);
                        }
                        const { data: handData } = await handQuery.order('completed_at', { ascending: false }).limit(200);
                        hands = handData || [];
                    } catch (handErr) {
                    }

                    // Calculate stats from hands
                    if (hands && hands.length > 0) {
                        const handsPlayed = hands.length;
                        const handsWon = hands.filter(h => h.winner_ids?.includes(authUser.id)).length;
                        const userId = authUser.id;

                        // Compute VPIP/PFR from hand_data JSONB action logs
                        let vpipCount = 0;
                        let pfrCount = 0;
                        let totalWinnings = 0;
                        let biggestPot = 0;
                        let bestHandEntry = null;

                        for (const h of hands) {
                            const hd = h.hand_data || {};
                            const player = hd.players?.find(p => String(p.id) === String(userId));
                            if (player) {
                                totalWinnings += player.netResult || 0;
                            }
                            biggestPot = Math.max(biggestPot, Number(h.pot_total) || 0);

                            // Check winning hand
                            if (hd.result?.winningHand && h.winner_ids?.includes(userId)) {
                                bestHandEntry = hd.result.winningHand;
                            }

                            // VPIP: voluntarily put money in pot preflop (call/raise/bet/all-in, NOT just posting blinds)
                            const preflopActions = hd.streets?.preflop?.actions || [];
                            const playerPreflopActions = preflopActions.filter(a => String(a.playerId) === String(userId));
                            const voluntaryPreflop = playerPreflopActions.some(a =>
                                a.type === 'call' || a.type === 'raise' || a.type === 'bet' || a.type === 'all_in'
                            );
                            if (voluntaryPreflop) vpipCount++;

                            // PFR: raised or bet preflop
                            const raisedPreflop = playerPreflopActions.some(a => a.type === 'raise' || a.type === 'bet');
                            if (raisedPreflop) pfrCount++;
                        }

                        setStats({
                            handsPlayed,
                            handsWon,
                            winRate: handsPlayed > 0 ? Math.round((handsWon / handsPlayed) * 100) : 0,
                            totalWinnings,
                            biggestPot,
                            bestHand: bestHandEntry || null,
                            sessionsPlayed: memberData?.sessions_played || 0,
                            hoursPlayed: 0,
                            vpip: handsPlayed > 0 ? parseFloat((vpipCount / handsPlayed * 100).toFixed(1)) : 0,
                            pfr: handsPlayed > 0 ? parseFloat((pfrCount / handsPlayed * 100).toFixed(1)) : 0,
                            avgPot: handsPlayed > 0 ? Math.round(totalWinnings / handsPlayed) : 0,
                        });

                        // Recent activity (last 10 hands)
                        setRecentActivity(hands.slice(0, 10).map(h => {
                            const player = h.hand_data?.players?.find(p => String(p.id) === String(userId));
                            const profit = player?.netResult || 0;
                            return {
                                id: h.id,
                                type: profit > 0 ? 'win' : 'loss',
                                amount: Math.abs(profit),
                                hand: h.hand_data?.result?.winningHand || h.variant || 'Hand',
                                date: h.completed_at || h.created_at,
                                tableName: h.hand_data?.tableName || 'Table',
                            };
                        }));
                    } else {
                        // Try to get stats from chip_transactions as fallback
                        let txQuery = supabase
                            .from('chip_transactions')
                            .select('id, transaction_type, amount, from_user_id, to_user_id, created_at, club_id, notes')
                            .eq('club_id', clubData.id)
                            .or(`from_user_id.eq.${authUser.id},to_user_id.eq.${authUser.id}`)
                            .in('transaction_type', ['win', 'loss', 'table_win', 'table_loss'])
                            .limit(100) // transactions

                        if (dateFilter) {
                            txQuery = txQuery.gte('created_at', dateFilter);
                        }

                        const { data: txns } = await txQuery.order('created_at', { ascending: false });

                        if (txns && txns.length > 0) {
                            const wins = txns.filter(t => t.transaction_type === 'win' || t.transaction_type === 'table_win' || t.amount > 0);
                            const totalWinnings = txns.reduce((sum, t) => sum + (t.amount || 0), 0);

                            setStats({
                                handsPlayed: txns.length,
                                handsWon: wins.length,
                                winRate: txns.length > 0 ? Math.round((wins.length / txns.length) * 100) : 0,
                                totalWinnings,
                                biggestPot: Math.max(...txns.map(t => Math.abs(t.amount || 0))),
                                bestHand: null,
                                sessionsPlayed: memberData?.sessions_played || 0,
                                hoursPlayed: 0,
                                vpip: 0,
                                pfr: 0,
                                avgPot: txns.length > 0 ? Math.round(totalWinnings / txns.length) : 0,
                            });

                            setRecentActivity(txns.slice(0, 10).map(t => ({
                                id: t.id,
                                type: t.amount > 0 ? 'win' : 'loss',
                                amount: Math.abs(t.amount || 0),
                                hand: t.notes || 'Table Session',
                                date: t.created_at,
                                tableName: 'Cash Game',
                            })));
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[PlayerStats] Error loading data:', e);
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam, period]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Realtime: refresh stats on new hands/transactions ─────────────────
    useEffect(() => {
        if (!clubIdParam) return;
        const ch = supabase
            .channel(`stats-live:${clubIdParam}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'hand_histories',
                filter: `club_id=eq.${clubIdParam}`
            }, () => loadData())
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'chip_transactions',
                filter: `club_id=eq.${clubIdParam}`
            }, () => loadData())
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                }
            });
        return () => { supabase.removeChannel(ch); };
    }, [clubIdParam, loadData]);

    // ── Event Bus: refresh stats on cross-page data mutations ──────────────
    useEffect(() => {
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const relevant = ['hand_complete', 'chips_distributed', 'cashout_approved', 'cashout_requested', 'cashout_cancelled', 'rakeback_distributed', 'marketplace_purchase'];
            if (relevant.includes(e?.payload?.entity)) loadData();
        });
        const unsub2 = eventBus.on(EventType.HAND_COMPLETE, () => loadData());
        return () => { unsub(); unsub2(); };
    }, [loadData]);

    // ═══════════════════════════════════════════════════════════════════════════
    // STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    const S = {
        page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
        container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' },
        backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 },
        pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' },
        loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' },
        emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary },

        // Period tabs
        periodTabs: { display: 'flex', gap: '8px', marginBottom: '20px' },
        periodTab: { flex: 1, padding: '10px', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' },

        // Stats grid
        statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' },
        statCard: { padding: '16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, textAlign: 'center' },
        statIcon: { fontSize: '24px', marginBottom: '8px' },
        statValue: { fontSize: '24px', fontWeight: 700, color: FB.primary },
        statLabel: { fontSize: '11px', color: FB.textSecondary, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },

        // Big stat card
        bigStatCard: { padding: '24px', borderRadius: '8px', background: `linear-gradient(135deg, ${FB.primary} 0%, #1A5DC8 100%)`, textAlign: 'center', marginBottom: '20px' },
        bigStatValue: { fontSize: '36px', fontWeight: 700, color: '#fff' },
        bigStatLabel: { fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginTop: '4px' },

        sectionTitle: { fontSize: '12px', fontWeight: 700, color: FB.textSecondary, marginBottom: '12px', marginTop: '24px', textTransform: 'uppercase', letterSpacing: '0.5px' },

        // Activity row
        activityRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '8px' },
        activityIcon: { width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 },
        activityInfo: { flex: 1, minWidth: 0 },
        activityTitle: { color: FB.textPrimary, fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        activityMeta: { color: FB.textSecondary, fontSize: '12px' },
        activityAmount: { fontSize: '15px', fontWeight: 700, textAlign: 'right' },
    };

    const formatHandRank = (hand) => {
        if (!hand) return null;
        const ranks = {
            'royal_flush': 'Royal Flush',
            'straight_flush': 'Straight Flush',
            'four_of_a_kind': ' Four of a Kind',
            'full_house': ' Full House',
            'flush': 'Flush',
            'straight': ' Straight',
            'three_of_a_kind': 'Three of a Kind',
            'two_pair': 'Two Pair',
            'one_pair': ' One Pair',
            'high_card': ' High Card',
        };
        return ranks[hand.toLowerCase().replace(/\s+/g, '_')] || hand;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString();
    };

    return (
        <>
            <SEOHead
                title="Club Arena — Player Stats"
                description="View Player Statistics In Club Arena."
                canonical="/hub/club-arena/player-stats"
                noindex={true}
            />

            <div style={S.page}>
                <UniversalHeader pageDepth={2} />

                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showWallet ? '8px' : '20px' }}>
                        <h1 style={{ ...S.pageTitle, marginBottom: 0 }}>My Stats</h1>
                        <button onClick={() => setShowWallet(prev => !prev)} style={{ background: showWallet ? FB.primary : FB.cardBg, border: `1px solid ${showWallet ? FB.primary : FB.border}`, color: showWallet ? '#fff' : FB.textSecondary, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                            💰 {showWallet ? 'Hide' : 'Wallet'}
                        </button>
                    </div>

                    {showWallet && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                            <DynamicWallet
                                {...walletData}
                                onOpenBBJ={() => { }}
                                onBuyDiamonds={() => router.push('/hub/diamond-store')}
                                onTapSlot={(slot) => {
                                    if (slot === 'chips' || slot === 'promo') router.push(`/hub/club-arena/cashier?club=${clubIdParam}`);
                                    if (slot === 'clubBank') router.push(`/hub/club-arena/admin?club=${clubIdParam}`);
                                    if (slot === 'agent') router.push(`/hub/club-arena/agent-dashboard?club=${clubIdParam}`);
                                }}
                            />
                        </div>
                    )}

                    {/* Period Tabs */}
                    <div style={S.periodTabs}>
                        {[
                            { id: 'week', label: 'This Week' },
                            { id: 'month', label: 'This Month' },
                            { id: 'all', label: 'All Time' },
                        ].map(p => (
                            <button
                                key={p.id}
                                style={{
                                    ...S.periodTab,
                                    background: period === p.id ? FB.primary : FB.cardBg,
                                    color: period === p.id ? '#fff' : FB.textSecondary,
                                }}
                                onClick={() => setPeriod(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div style={S.loading}>Loading Stats...</div>
                    ) : !user ? (
                        <div style={S.emptyState}><p>Sign In To View Your Stats</p></div>
                    ) : (
                        <>
                            {/* Net Winnings Card */}
                            <div style={{
                                ...S.bigStatCard,
                                background: stats.totalWinnings >= 0
                                    ? `linear-gradient(135deg, ${FB.success} 0%, #259A3E 100%)`
                                    : `linear-gradient(135deg, ${FB.danger} 0%, #D32F2F 100%)`
                            }}>
                                <div style={S.bigStatValue}>
                                    {stats.totalWinnings >= 0 ? '+' : ''}{stats.totalWinnings.toLocaleString()}
                                </div>
                                <div style={S.bigStatLabel}>Net Profit/Loss ({period === 'week' ? 'Week' : period === 'month' ? 'Month' : 'All Time'})</div>
                            </div>

                            {/* Stats Grid */}
                            <div style={S.statsGrid}>
                                <div style={S.statCard}>
                                    <div style={S.statIcon}></div>
                                    <div style={S.statValue}>{stats.handsPlayed.toLocaleString()}</div>
                                    <div style={S.statLabel}>Hands Played</div>
                                </div>
                                <div style={S.statCard}>
                                    <div style={S.statIcon}></div>
                                    <div style={{ ...S.statValue, color: FB.success }}>{stats.winRate}%</div>
                                    <div style={S.statLabel}>Win Rate</div>
                                </div>
                                <div style={S.statCard}>
                                    <div style={S.statIcon}></div>
                                    <div style={{ ...S.statValue, color: FB.gold }}>{stats.biggestPot.toLocaleString()}</div>
                                    <div style={S.statLabel}>Biggest Pot</div>
                                </div>
                                <div style={S.statCard}>
                                    <div style={S.statIcon}></div>
                                    <div style={S.statValue}>{stats.handsWon.toLocaleString()}</div>
                                    <div style={S.statLabel}>Hands Won</div>
                                </div>
                            </div>

                            {/* Profit Trend Sparkline */}
                            {recentActivity.length >= 2 && (
                                <ProfitSparkline activities={recentActivity} />
                            )}

                            {/* Best Hand */}
                            {stats.bestHand && (
                                <>
                                    <h2 style={S.sectionTitle}>Best Hand</h2>
                                    <div style={{ ...S.statCard, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                                        <span style={{ fontSize: '32px' }}></span>
                                        <span style={{ fontSize: '18px', fontWeight: 700, color: FB.gold }}>
                                            {formatHandRank(stats.bestHand)}
                                        </span>
                                    </div>
                                </>
                            )}

                            {/* Recent Activity */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <h2 style={{ ...S.sectionTitle, marginBottom: 0 }}>Recent Activity</h2>
                                <button
                                    onClick={() => router.push(`/hub/club-arena/hand-histories?club=${club?.club_id || clubIdParam}`)}
                                    style={{ background: 'none', border: 'none', color: FB.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                >
                                    View Full History →
                                </button>
                            </div>
                            {recentActivity.length > 0 ? recentActivity.map(activity => (
                                <div key={activity.id} style={S.activityRow}>
                                    <div style={{
                                        ...S.activityIcon,
                                        background: activity.type === 'win' ? FB.success : FB.danger
                                    }}>
                                        {activity.type === 'win' ? '' : ''}
                                    </div>
                                    <div style={S.activityInfo}>
                                        <div style={S.activityTitle}>{activity.hand}</div>
                                        <div style={S.activityMeta}>
                                            {activity.tableName} • {formatDate(activity.date)}
                                        </div>
                                    </div>
                                    <div style={{
                                        ...S.activityAmount,
                                        color: activity.type === 'win' ? FB.success : FB.danger
                                    }}>
                                        {activity.type === 'win' ? '+' : '-'}{activity.amount.toLocaleString()}
                                    </div>
                                </div>
                            )) : (
                                <div style={S.emptyState}>
                                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
                                    <p>No Activity Yet. Play Some Hands To See Your Stats!</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="data" userRole={membership?.role} />
            </div>
        </>
    );
}
