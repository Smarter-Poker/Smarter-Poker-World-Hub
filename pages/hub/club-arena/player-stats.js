/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Player Stats | FULLY WIRED | ORB-7 AUDITED
 SmarterPoker Dark Theme | Real Stats from Hand History & Gameplay
 ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import usePersistedState from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import useWalletData from '../../../src/hooks/useWalletData';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

const DynamicWallet = dynamic(
    () => import('../../../src/components/club-arena/DynamicWallet'),
    { ssr: false, loading: () => null }
);
const ClubAnnouncementBanner = dynamic(
    () => import('../../../src/components/club-arena/ClubAnnouncementBanner'),
    { ssr: false }
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


// ─── Mini Profit Sparkline (NaN-hardened) ─────────────────────
function ProfitSparkline({ activities }) {
    if (!activities || !Array.isArray(activities) || activities.length < 2) return null;

    // Build cumulative P&L series with NaN protection
    let running = 0;
    const values = activities.slice().reverse().map(a => {
        const amt = Number(a?.amount) || 0;
        const safeAmt = Number.isFinite(amt) ? amt : 0;
        running += a?.type === 'win' ? safeAmt : -safeAmt;
        return Number.isFinite(running) ? running : 0;
    });

    if (values.length < 2) return null;

    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min;
    const safeRange = Number.isFinite(range) && range > 0 ? range : 1;

    const W = 280, H = 56;
    const pts = values.map((v, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * W : W / 2;
        const y = H - ((v - min) / safeRange) * H;
        // Final NaN guard — clamp to valid SVG coordinates
        const sx = Number.isFinite(x) ? Math.max(0, Math.min(W, x)) : 0;
        const sy = Number.isFinite(y) ? Math.max(0, Math.min(H, y)) : H / 2;
        return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    });

    if (pts.length < 2) return null;

    const isUp = values[values.length - 1] >= 0;
    const color = isUp ? '#31A24C' : '#FA383E';
    const zeroY = H - ((0 - min) / safeRange) * H;
    const safeZeroY = Number.isFinite(zeroY) ? Math.max(0, Math.min(H, zeroY)) : H / 2;

    const lastPt = pts[pts.length - 1].split(',');
    const endCx = lastPt[0] || '0';
    const endCy = lastPt[1] || String(H / 2);

    // Guard: running must be finite for display
    const displayRunning = Number.isFinite(running) ? running : 0;

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#B0B3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Profit Trend (Last {activities.length} Hands)
            </div>
            <div style={{ background: '#242526', borderRadius: 8, padding: '12px 16px', border: '1px solid #3E4042' }}>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
                    {/* Zero line */}
                    {min < 0 && max > 0 && (
                        <line x1="0" y1={safeZeroY} x2={W} y2={safeZeroY}
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
                    <circle cx={endCx} cy={endCy}
                        r="3.5" fill={color} />
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#B0B3B8', marginTop: 4 }}>
                    <span>Oldest</span>
                    <span style={{ color, fontWeight: 700 }}>
                        {displayRunning >= 0 ? '+' : ''}{displayRunning.toLocaleString()} net
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
    const [menuOpen, setMenuOpen] = useState(false);

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
        vpip: 0,
        pfr: 0,
        avgPot: 0,
    });
    const [recentActivity, setRecentActivity] = useState([]);
    const [sparklineActivity, setSparklineActivity] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // ── Ghost-listener defense: mounted ref ──
    const mountedRef = useRef(true);
    // Debounce ref for realtime reloads
    const reloadTimerRef = useRef(null);
    const loadDataRef = useRef(null);
    const debouncedLoadData = useCallback(() => {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => {
            if (mountedRef.current && loadDataRef.current) loadDataRef.current(true); // isBackground = true
        }, 1000);
    }, []);

    // Bounty stats
    const [bountyStats, setBountyStats] = useState({
        totalBountyEarnings: 0,
        bountiesCollected: 0,
        biggestBounty: 0,
        mysteryBountiesWon: 0,
    });

    // Time period filter
    const [period, setPeriod] = usePersistedState('sp-filters-ca-player-stats', 'all'); // 'week' | 'month' | 'all'

    // ═══════════════════════════════════════════════════════════════════════════
    // LOAD DATA
    // ═══════════════════════════════════════════════════════════════════════════
    const loadData = useCallback(async (isBackground = false) => {
        if (!clubIdParam) {
            setIsLoading(false);
            return;
        }
        if (!isBackground) setIsLoading(true);
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

                    // Use Materialized View for cold-archived hand histories
                    // Engine saves to mv_hand_histories containing full action log
                    let handQuery = supabase
                        .from('mv_hand_histories')
                        .select('id, hand_number, variant, pot_total, player_ids, winner_ids, hand_data, rake, completed_at, club_id')
                        .contains('player_ids', [authUser.id])

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
                        console.warn('[PlayerStats] Hand history query failed:', handErr?.message);
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
                        let totalPotSum = 0;

                        for (const h of hands) {
                            const hd = h.hand_data || {};
                            const player = hd.players?.find(p => String(p.id) === String(userId));
                            if (player) {
                                totalWinnings += player.netResult || 0;
                            }
                            const potVal = Number(h.pot_total) || 0;
                            biggestPot = Math.max(biggestPot, potVal);
                            totalPotSum += potVal;

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

                        // Estimate hours played from hand timestamps
                        let hoursPlayed = 0;
                        if (hands.length > 1) {
                            const timestamps = hands
                                .map(h => h.completed_at ? new Date(h.completed_at).getTime() : 0)
                                .filter(t => t > 0)
                                .sort((a, b) => a - b);
                            if (timestamps.length > 1) {
                                // Cluster into sessions (30-min gap = new session)
                                let totalMs = 0;
                                let sessionStart = timestamps[0];
                                let prevTime = timestamps[0];
                                for (let i = 1; i < timestamps.length; i++) {
                                    const gap = timestamps[i] - prevTime;
                                    if (gap > 30 * 60 * 1000) {
                                        totalMs += prevTime - sessionStart;
                                        sessionStart = timestamps[i];
                                    }
                                    prevTime = timestamps[i];
                                }
                                totalMs += prevTime - sessionStart;
                                hoursPlayed = parseFloat((totalMs / (1000 * 60 * 60)).toFixed(1));
                            }
                        }

                        setStats({
                            handsPlayed,
                            handsWon,
                            winRate: handsPlayed > 0 ? Math.round((handsWon / handsPlayed) * 100) : 0,
                            totalWinnings,
                            biggestPot,
                            bestHand: bestHandEntry || null,
                            sessionsPlayed: memberData?.sessions_played || 0,
                            hoursPlayed,
                            vpip: handsPlayed > 0 ? parseFloat((vpipCount / handsPlayed * 100).toFixed(1)) : 0,
                            pfr: handsPlayed > 0 ? parseFloat((pfrCount / handsPlayed * 100).toFixed(1)) : 0,
                            avgPot: handsPlayed > 0 ? Math.round(totalPotSum / handsPlayed) : 0,
                        });

                        // Recent activity (last 10 hands)
                        const recentHands = hands.slice(0, 10).map(h => {
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
                        });
                        setRecentActivity(recentHands);

                        // Sparkline data — use up to 50 hands for meaningful trend
                        setSparklineActivity(hands.slice(0, 50).map(h => {
                            const player = h.hand_data?.players?.find(p => String(p.id) === String(userId));
                            const profit = player?.netResult || 0;
                            return {
                                id: h.id,
                                type: profit > 0 ? 'win' : 'loss',
                                amount: Math.abs(profit),
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

                    // ── Load bounty stats from completed tournaments ──
                    try {
                        const { data: regs } = await supabase
                            .from('tournament_registrations')
                            .select('tournament_id, payout_amount')
                            .eq('user_id', authUser.id)
                            .gt('payout_amount', 0);

                        // Fetch bounty_results from completed tournaments in this club
                        const { data: bTourns } = await supabase
                            .from('club_tournaments')
                            .select('id, settings')
                            .eq('club_id', clubData.id)
                            .eq('status', 'complete')
                            .limit(100);

                        let totalBE = 0, bCount = 0, bigB = 0, mysteryB = 0;
                        for (const bt of (bTourns || [])) {
                            const br = bt.settings?.bounty_results;
                            if (!br?.leaderboard) continue;
                            const userEntry = br.leaderboard.find(e => String(e.playerId) === String(authUser.id));
                            if (userEntry) {
                                totalBE += userEntry.totalBounties || 0;
                                bCount += userEntry.eliminationCount || 0;
                            }
                            // Find biggest single bounty from awards
                            for (const a of (br.awards || [])) {
                                if (String(a.playerId) === String(authUser.id)) {
                                    bigB = Math.max(bigB, a.amount || 0);
                                    if (a.type === 'mystery' || a.type === 'mystery_bounty') mysteryB++;
                                }
                            }
                        }
                        setBountyStats({
                            totalBountyEarnings: totalBE,
                            bountiesCollected: bCount,
                            biggestBounty: bigB,
                            mysteryBountiesWon: mysteryB,
                        });
                    } catch (_) { /* non-fatal */ }
                }
            }
        } catch (e) {
            console.error('[PlayerStats] Error loading data:', e);
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
    }, [clubIdParam, period]);

    // Keep the ref pointing to the latest loadData
    loadDataRef.current = loadData;

    // ── Initial load + unmount cleanup ──
    useEffect(() => {
        mountedRef.current = true;
        loadData();
        return () => {
            mountedRef.current = false;
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        };
    }, [loadData]);

    // ── Realtime: refresh stats on new hands/transactions (debounced) ──
    useEffect(() => {
        const resolvedClubId = club?.id;
        if (!resolvedClubId) return;
        const ch = supabase
            .channel(`stats-live:${resolvedClubId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'hand_histories',
                filter: `club_id=eq.${resolvedClubId}`
            }, () => { if (mountedRef.current) debouncedLoadData(); })
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'chip_transactions',
                filter: `club_id=eq.${resolvedClubId}`
            }, () => { if (mountedRef.current) debouncedLoadData(); })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    console.warn('[PlayerStats] Realtime status:', status);
                }
            });
        return () => { supabase.removeChannel(ch); };
    }, [club?.id, debouncedLoadData]);

    // ── Event Bus: refresh stats on cross-page data mutations ──────────────
    // Delta-aware: only reloads when relevant entity types change
    useEffect(() => {
        if (!mountedRef.current) return;
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const relevant = ['hand_complete', 'chips_distributed', 'cashout_approved', 'cashout_requested', 'cashout_cancelled', 'rakeback_distributed', 'marketplace_purchase'];
            if (relevant.includes(e?.payload?.entity) && mountedRef.current) debouncedLoadData();
        });
        const unsub2 = eventBus.on(EventType.HAND_COMPLETE, () => { if (mountedRef.current) debouncedLoadData(); });
        const unsub3 = eventBus.on(EventType.BOUNTY_AWARDED, () => { if (mountedRef.current) debouncedLoadData(); });
        const unsub4 = eventBus.on(EventType.TOURNAMENT_COMPLETE, () => { if (mountedRef.current) debouncedLoadData(); });
        return () => { unsub(); unsub2(); unsub3(); unsub4(); };
    }, [debouncedLoadData]);

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
            'four_of_a_kind': 'Four of a Kind',
            'full_house': 'Full House',
            'flush': 'Flush',
            'straight': 'Straight',
            'three_of_a_kind': 'Three of a Kind',
            'two_pair': 'Two Pair',
            'one_pair': 'One Pair',
            'high_card': 'High Card',
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

                    <HubErrorBoundary name="AnnouncementsBanner">
                        <ClubAnnouncementBanner clubId={clubIdParam} userRole={membership?.role} />
                    </HubErrorBoundary>

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
                                onClick={() => { setPeriod(p.id); try { busEmit.dataMutated('filter_changed'); } catch (e) { } }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {!clubIdParam ? (
                        <div style={S.emptyState}>
                            <p>Invalid Club. Please return to your Hub.</p>
                            <button onClick={() => router.push('/hub')} style={{ ...S.backBtn, marginTop: 16 }}>Go to Hub</button>
                        </div>
                    ) : isLoading ? (
                        <div style={S.loading}>Loading Stats...</div>
                    ) : !user ? (
                        <div style={S.emptyState}><p>Sign In To View Your Stats</p></div>
                    ) : (
                        <HubErrorBoundary name="PlayerStatsGrid">
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
                                    <div style={S.statCard}>
                                        <div style={S.statIcon}></div>
                                        <div style={{ ...S.statValue, color: '#9333EA' }}>{stats.vpip}%</div>
                                        <div style={S.statLabel}>VPIP</div>
                                    </div>
                                    <div style={S.statCard}>
                                        <div style={S.statIcon}></div>
                                        <div style={{ ...S.statValue, color: '#EC4899' }}>{stats.pfr}%</div>
                                        <div style={S.statLabel}>PFR</div>
                                    </div>
                                    <div style={S.statCard}>
                                        <div style={S.statIcon}></div>
                                        <div style={S.statValue}>{stats.avgPot.toLocaleString()}</div>
                                        <div style={S.statLabel}>Avg Pot</div>
                                    </div>
                                    <div style={S.statCard}>
                                        <div style={S.statIcon}></div>
                                        <div style={S.statValue}>{stats.hoursPlayed > 0 ? `${stats.hoursPlayed}h` : stats.sessionsPlayed || '0'}</div>
                                        <div style={S.statLabel}>{stats.hoursPlayed > 0 ? 'Hours Played' : 'Sessions'}</div>
                                    </div>
                                </div>

                                {/* Profit Trend Sparkline */}
                                {sparklineActivity.length >= 2 && (
                                    <ProfitSparkline activities={sparklineActivity} />
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

                                {/* Bounty Stats */}
                                {bountyStats.totalBountyEarnings > 0 && (
                                    <>
                                        <h2 style={S.sectionTitle}>Bounty Stats</h2>
                                        <div style={S.statsGrid}>
                                            <div style={S.statCard}>
                                                <div style={S.statIcon}>💰</div>
                                                <div style={{ ...S.statValue, color: FB.gold }}>{bountyStats.totalBountyEarnings.toLocaleString()}</div>
                                                <div style={S.statLabel}>Bounty Earnings</div>
                                            </div>
                                            <div style={S.statCard}>
                                                <div style={S.statIcon}>🎯</div>
                                                <div style={S.statValue}>{bountyStats.bountiesCollected}</div>
                                                <div style={S.statLabel}>Bounties Collected</div>
                                            </div>
                                            <div style={S.statCard}>
                                                <div style={S.statIcon}>🏆</div>
                                                <div style={{ ...S.statValue, color: FB.gold }}>{bountyStats.biggestBounty.toLocaleString()}</div>
                                                <div style={S.statLabel}>Biggest Bounty</div>
                                            </div>
                                            {bountyStats.mysteryBountiesWon > 0 && (
                                                <div style={S.statCard}>
                                                    <div style={S.statIcon}>🎁</div>
                                                    <div style={{ ...S.statValue, color: '#9333EA' }}>{bountyStats.mysteryBountiesWon}</div>
                                                    <div style={S.statLabel}>Mystery Bounties</div>
                                                </div>
                                            )}
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
                        </HubErrorBoundary>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="data" userRole={membership?.role} />
            </div>
        </>
    );
}
