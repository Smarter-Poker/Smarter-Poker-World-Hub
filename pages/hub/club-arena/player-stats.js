/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Player Stats | FULLY WIRED
 Facebook Dark Theme | Real Stats from Hand History & Gameplay
 ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

// Facebook Dark Color Scheme
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

export default function PlayerStats() {
    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [membership, setMembership] = useState(null);
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
    const [period, setPeriod] = useState('all'); // 'week' | 'month' | 'all'

    // ═══════════════════════════════════════════════════════════════════════════
    // LOAD DATA
    // ═══════════════════════════════════════════════════════════════════════════
    const loadData = useCallback(async () => {
        if (!clubIdParam) return;
        setIsLoading(true);
        try {
            // Get authenticated user
            let authUser = null;
            if (typeof window !== 'undefined') {
                const explicitAuth = localStorage.getItem('smarter-poker-auth');
                if (explicitAuth) authUser = JSON.parse(explicitAuth)?.user || null;
                if (!authUser) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) authUser = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user || null;
                }
            }
            if (!authUser) {
                const { data: { user: supaUser } } = await supabase.auth.getUser();
                authUser = supaUser;
            }
            setUser(authUser);

            // Get club data
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
            const { data: clubData } = await supabase
                .from('clubs')
                .select('*')
                .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                .single();

            if (clubData) {
                setClub(clubData);

                // Get membership
                if (authUser) {
                    const { data: memberData } = await supabase
                        .from('club_members')
                        .select('*')
                        .eq('club_id', clubData.id)
                        .eq('user_id', authUser.id)
                        .single();
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
                        .select('*')
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
                            .select('*')
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

                    <h1 style={S.pageTitle}>My Stats</h1>

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
                            <h2 style={S.sectionTitle}>Recent Activity</h2>
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
