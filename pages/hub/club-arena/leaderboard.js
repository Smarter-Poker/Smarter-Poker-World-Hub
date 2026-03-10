/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Leaderboard | FULLY WIRED | ORB-7 AUDITED
   SmarterPoker Dark Theme | Time Filters, Multiple Board Types, SVG Sparklines
   ═══════════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import usePersistedFilters from '../../../src/hooks/usePersistedFilters';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import { resolveAvatarDisplay } from '../../../src/lib/resolveAvatarDisplay';
import useWalletData from '../../../src/hooks/useWalletData';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';

const DynamicWallet = dynamic(
    () => import('../../../src/components/club-arena/DynamicWallet'),
    { ssr: false, loading: () => null }
);
const ClubAnnouncementBanner = dynamic(() => import('../../../src/components/club-arena/ClubAnnouncementBanner'), { ssr: false });

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
    silver: '#A0AEC0',
    bronze: '#CD7F32',
    hover: '#3A3B3C',
};

const LEADERBOARD_TYPES = [
    { id: 'chips', label: 'Chip Balance', field: 'chip_balance', desc: 'Highest chip counts' },
    { id: 'profit', label: 'Profit', field: 'total_profit', desc: 'Most profitable players' },
    { id: 'hands', label: 'Hands Played', field: 'hands_played', desc: 'Most active players' },
    { id: 'wins', label: 'Win Rate', field: 'win_rate', desc: 'Highest win percentages' },
    { id: 'bounties', label: 'Bounty Hunters', field: 'bounty_earnings', desc: 'Top bounty earners' },
];

const TIME_PERIODS = [
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Time' },
];

// ─── Mini Sparkline for leaderboard rows (NaN-hardened) ───────
function MiniSparkline({ hands, userId, width = 80, height = 24 }) {
    if (!hands || !Array.isArray(hands) || hands.length < 2) return null;
    if (!userId) return null;

    let running = 0;
    const values = hands.slice().reverse().map(h => {
        const player = h?.hand_data?.players?.find(p => String(p?.id) === String(userId));
        const nr = Number(player?.netResult) || 0;
        // Guard: reject NaN, Infinity, absurdly large values
        running += Number.isFinite(nr) ? nr : 0;
        return running;
    });

    if (values.every(v => v === 0)) return null;
    if (values.length < 2) return null;

    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min;
    // Guard: if all values identical, range is 0 → flat line at midpoint
    const safeRange = Number.isFinite(range) && range > 0 ? range : 1;

    const pts = values.map((v, i) => {
        const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2;
        const y = height - ((v - min) / safeRange) * height;
        // Final NaN guard — clamp to valid SVG coords
        const sx = Number.isFinite(x) ? Math.max(0, Math.min(width, x)) : 0;
        const sy = Number.isFinite(y) ? Math.max(0, Math.min(height, y)) : height / 2;
        return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    });

    if (pts.length < 2) return null;

    const color = values[values.length - 1] >= 0 ? '#31A24C' : '#FA383E';
    const lastPt = pts[pts.length - 1].split(',');
    const cx = lastPt[0] || '0';
    const cy = lastPt[1] || String(height / 2);

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
            <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="2" fill={color} />
        </svg>
    );
}

const MemoizedLeaderboardRow = React.memo(({ member, rank, isCurrentUser, S, FB, getRankColor, getRankEmoji, getDisplayValue, resolveAvatarDisplay, sparklineHands }) => (
    <div style={{ ...S.playerRow, ...(isCurrentUser ? S.playerRowHighlight : {}) }}>
        <div style={{ ...S.playerRank, color: getRankColor(rank) }}>{getRankEmoji(rank) || rank}</div>
        <div style={{ ...S.playerAvatar, background: FB.primary }}>
            <img src={resolveAvatarDisplay(member.profiles?.avatar_url, member.user_id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={(e) => { e.target.src = '/avatars/table/free_shark.png'; }} />
        </div>
        <div style={S.playerInfo}>
            <div style={S.playerName}>
                {member.profiles?.display_name || member.profiles?.username || 'Player'}
                {isCurrentUser && <span style={{ color: FB.primary, marginLeft: '6px' }}>(You)</span>}
            </div>
            {sparklineHands && sparklineHands.length >= 2 && (
                <div style={{ marginTop: '4px' }}>
                    <MiniSparkline hands={sparklineHands} userId={member.user_id} />
                </div>
            )}
        </div>
        <div style={{ ...S.playerValue, color: getRankColor(rank) }}>{getDisplayValue(member)}</div>
    </div>
));

export default function Leaderboard() {
    useTrainingBus('club-arena-leaderboard');

    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showWallet, setShowWallet] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // Wallet data (real-time balances)
    const walletData = useWalletData({ supabase, userId: user?.id, clubId: club?.id });

    // Filters
    const { filters, setFilter } = usePersistedFilters('club-arena-leaderboard', { boardType: 'chips', period: 'all' });
    const boardType = filters.boardType;
    const setBoardType = (val) => setFilter('boardType', val);
    const period = filters.period;
    const setPeriod = (val) => setFilter('period', val);

    // User's rank
    const [userRank, setUserRank] = useState(null);

    // Per-user hand data for sparklines
    const [handsByUser, setHandsByUser] = useState({});

    // ── Ghost-listener defense: mounted ref ──
    const mountedRef = useRef(true);

    // Debounce ref for realtime reloads
    const reloadTimerRef = useRef(null);
    const loadDataRef = useRef(null);
    const debouncedLoadData = useCallback(() => {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => {
            if (loadDataRef.current) loadDataRef.current(true); // isBackground = true
        }, 1000);
    }, []);

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
                .select('id, name, club_id, union_id, avatar_url, total_rake, hands_played')
                .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                .maybeSingle();

            if (clubData) {
                setClub(clubData);

                // Get members with profiles
                const { data: memberData } = await supabase
                    .from('club_members')
                    .select('*, profiles(username, display_name, avatar_url)')
                    .eq('club_id', clubData.id)
                    .limit(100) // leaderboard

                if (memberData) {
                    // Calculate date filter for period-specific stats
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

                    // Batch fetch hand_histories for this club
                    // Schema: player_ids (UUID[]), winner_ids (UUID[]), hand_data (JSONB), pot_total
                    // Per-player profit is inside hand_data.players[].netResult
                    let allHands = [];
                    try {
                        // Always fetch hands for sparklines (ORB-7 mandate) + stats
                        const handLimit = dateFilter ? 200 : 500;
                        let handQuery = supabase
                            .from('mv_hand_histories')
                            .select('player_ids, winner_ids, hand_data, pot_total, completed_at')
                            .eq('club_id', clubData.id)
                            .order('completed_at', { ascending: false })
                            .limit(handLimit);

                        if (dateFilter) {
                            handQuery = handQuery.gte('completed_at', dateFilter);
                        }

                        const { data: handData, error: handErr } = await handQuery;

                        if (!handErr && handData) {
                            allHands = handData;
                        }
                    } catch (handQueryErr) {
                        console.warn('[Leaderboard] Hand history fetch error:', handQueryErr?.message);
                    }

                    // Extract per-player stats from hand_data JSONB
                    const statsByUser = {}; // { [userId]: { handsPlayed, wins, totalProfit } }
                    for (const hand of allHands) {
                        const hd = hand.hand_data || {};
                        const players = hd.players || [];
                        const winnerIds = hand.winner_ids || hd.result?.winners?.map(w => w.playerId) || [];

                        for (const p of players) {
                            const pid = String(p.id);
                            if (!statsByUser[pid]) {
                                statsByUser[pid] = { handsPlayed: 0, wins: 0, totalProfit: 0 };
                            }
                            statsByUser[pid].handsPlayed++;
                            const netResult = p.netResult ?? 0;
                            statsByUser[pid].totalProfit += netResult;
                            if (netResult > 0 || winnerIds.some(w => String(w) === pid)) {
                                statsByUser[pid].wins++;
                            }
                        }
                    }

                    // ── Build per-user hand arrays for sparklines ──
                    const handsByUserMap = {};
                    for (const hand of allHands) {
                        for (const pid of (hand.player_ids || [])) {
                            const key = String(pid);
                            if (!handsByUserMap[key]) handsByUserMap[key] = [];
                            if (handsByUserMap[key].length < 30) handsByUserMap[key].push(hand);
                        }
                    }
                    setHandsByUser(handsByUserMap);

                    // ── Bounty Earnings: aggregate from completed tournament results ──
                    const bountyByUser = {};
                    try {
                        const { data: bTourns } = await supabase
                            .from('club_tournaments')
                            .select('settings')
                            .eq('club_id', clubData.id)
                            .eq('status', 'complete')
                            .limit(100);
                        for (const bt of (bTourns || [])) {
                            const br = bt.settings?.bounty_results;
                            if (!br?.leaderboard) continue;
                            for (const entry of br.leaderboard) {
                                const pid = String(entry.playerId);
                                bountyByUser[pid] = (bountyByUser[pid] || 0) + (entry.totalBounties || 0);
                            }
                        }
                    } catch (bountyErr) {
                        console.warn('[Leaderboard] Bounty fetch error:', bountyErr?.message);
                    }

                    // Compute stats for each member
                    const membersWithStats = memberData.map(member => {
                        const userStats = statsByUser[String(member.user_id)] || { handsPlayed: 0, wins: 0, totalProfit: 0 };
                        const bountyEarned = bountyByUser[String(member.user_id)] || 0;
                        return {
                            ...member,
                            stats: {
                                chip_balance: member.chip_balance || 0,
                                total_profit: Math.round(userStats.totalProfit),
                                hands_played: userStats.handsPlayed,
                                win_rate: userStats.handsPlayed > 0 ? Math.round((userStats.wins / userStats.handsPlayed) * 100) : 0,
                                bounty_earnings: bountyEarned,
                            },
                        };
                    });

                    // Sort based on selected board type
                    const boardConfig = LEADERBOARD_TYPES.find(b => b.id === boardType);
                    const sortField = boardConfig?.field || 'chip_balance';

                    const sorted = membersWithStats.sort((a, b) => {
                        const aVal = a.stats?.[sortField] ?? 0;
                        const bVal = b.stats?.[sortField] ?? 0;
                        return bVal - aVal;
                    });

                    setMembers(sorted);

                    // Find current user's rank
                    if (authUser) {
                        const rank = sorted.findIndex(m => m.user_id === authUser.id);
                        setUserRank(rank >= 0 ? rank + 1 : null);
                    }
                }
            }
        } catch (e) {
            console.warn('[Leaderboard] loadData error:', e?.message);
        } finally {
            if (mountedRef.current) setIsLoading(false);
        }
    }, [clubIdParam, boardType, period]);

    // Keep the ref pointing to the latest loadData
    loadDataRef.current = loadData;

    // ── Initial load + unmount cleanup ──
    useEffect(() => {
        mountedRef.current = true;
        loadData();
        return () => { mountedRef.current = false; };
    }, [loadData]);

    // ── Realtime: refresh leaderboard on new hand results (debounced) ─────
    useEffect(() => {
        const resolvedClubId = club?.id;
        if (!resolvedClubId) return;
        const ch = supabase
            .channel(`leaderboard-live:${resolvedClubId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'hand_histories',
                filter: `club_id=eq.${resolvedClubId}`
            }, () => debouncedLoadData())
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    console.warn('[Leaderboard] Realtime status:', status);
                }
            });
        return () => {
            supabase.removeChannel(ch);
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        };
    }, [club?.id, debouncedLoadData]);

    // ── Event Bus: refresh leaderboard on cross-page data mutations ────────
    // Delta-aware: only reloads when relevant entity types change
    useEffect(() => {
        if (!mountedRef.current) return;
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const relevant = ['hand_complete', 'tournament_complete', 'chips_distributed', 'cashout_approved', 'rakeback_distributed'];
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
        container: { padding: '16px 20px 100px', maxWidth: '600px', margin: '0 auto' },
        backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 },
        pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' },
        loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' },
        emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary },

        // Board type selector
        boardSelector: { display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' },
        boardBtn: { padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', whiteSpace: 'nowrap', flexShrink: 0 },

        // Period tabs
        periodTabs: { display: 'flex', gap: '8px', marginBottom: '20px' },
        periodTab: { flex: 1, padding: '10px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },

        // Your rank card
        rankCard: { padding: '16px', borderRadius: '8px', background: `linear-gradient(135deg, ${FB.primary} 0%, #1A5DC8 100%)`, marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        rankLabel: { fontSize: '13px', color: 'rgba(255,255,255,0.8)' },
        rankValue: { fontSize: '28px', fontWeight: 700, color: '#fff' },

        // Top 3 podium
        podium: { display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: '8px', marginBottom: '24px', padding: '20px 0' },
        podiumPlace: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px', borderRadius: '10px', background: FB.cardBg, border: `1px solid ${FB.border}` },
        podiumAvatar: { width: '50px', height: '50px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '8px', overflow: 'hidden', position: 'relative' },
        podiumName: { fontSize: '12px', color: FB.textPrimary, fontWeight: 600, textAlign: 'center', maxWidth: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        podiumValue: { fontSize: '14px', fontWeight: 700, marginTop: '4px' },
        podiumRank: { fontSize: '18px', marginTop: '8px' },

        // Leaderboard list
        listHeader: { fontSize: '12px', fontWeight: 700, color: FB.textSecondary, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
        playerRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '8px' },
        playerRowHighlight: { border: `2px solid ${FB.primary}`, background: '#1a2a40' },
        playerRank: { width: '28px', fontSize: '14px', fontWeight: 700, color: FB.textSecondary, textAlign: 'center', flexShrink: 0 },
        playerAvatar: { width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, overflow: 'hidden', position: 'relative' },
        playerInfo: { flex: 1, minWidth: 0 },
        playerName: { fontSize: '14px', fontWeight: 600, color: FB.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        playerSub: { fontSize: '12px', color: FB.textSecondary },
        playerValue: { fontSize: '16px', fontWeight: 700, textAlign: 'right' },
    };

    const getRankColor = (rank) => {
        if (rank === 1) return FB.gold;
        if (rank === 2) return FB.silver;
        if (rank === 3) return FB.bronze;
        return FB.textSecondary;
    };

    const getRankEmoji = (rank) => {
        if (rank === 1) return '1st';
        if (rank === 2) return '2nd';
        if (rank === 3) return '3rd';
        return null;
    };

    const getDisplayValue = (member) => {
        const boardConfig = LEADERBOARD_TYPES.find(b => b.id === boardType);
        const field = boardConfig?.field || 'chip_balance';
        const value = member.stats?.[field] ?? member[field] ?? 0;

        if (boardType === 'wins') return `${value}%`;
        return value.toLocaleString();
    };

    const top3 = members.slice(0, 3);
    const rest = members.slice(3);
    const currentUserRole = user ? (members.find(m => m.user_id === user.id)?.role || null) : null;

    return (
        <>
            <SEOHead
                title="Club Arena — Leaderboard"
                description="View Club Arena Leaderboard Rankings."
                canonical="/hub/club-arena/leaderboard"
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
                        <h1 style={{ ...S.pageTitle, marginBottom: 0 }}>Leaderboard</h1>
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
                        <ClubAnnouncementBanner clubId={clubIdParam} userRole={currentUserRole} />
                    </HubErrorBoundary>

                    {/* Board Type Selector */}
                    <div style={S.boardSelector}>
                        {LEADERBOARD_TYPES.map(board => (
                            <button
                                key={board.id}
                                style={{
                                    ...S.boardBtn,
                                    background: boardType === board.id ? FB.primary : FB.hover,
                                    color: boardType === board.id ? '#fff' : FB.textSecondary,
                                }}
                                onClick={() => { setBoardType(board.id); try { busEmit.dataMutated('filter_changed'); } catch (e) { } }}
                            >
                                {board.label}
                            </button>
                        ))}
                    </div>

                    {/* Period Tabs */}
                    <div style={S.periodTabs}>
                        {TIME_PERIODS.map(p => (
                            <button
                                key={p.id}
                                style={{
                                    ...S.periodTab,
                                    background: period === p.id ? FB.cardBg : 'transparent',
                                    color: period === p.id ? FB.textPrimary : FB.textSecondary,
                                    border: period === p.id ? `1px solid ${FB.border}` : '1px solid transparent',
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
                        <div style={S.loading}>Loading Rankings...</div>
                    ) : members.length === 0 ? (
                        <div style={S.emptyState}>
                            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
                            <p>No Players Yet</p>
                        </div>
                    ) : (
                        <>
                            {/* Your Rank Card */}
                            {userRank && (
                                <div style={S.rankCard}>
                                    <div>
                                        <div style={S.rankLabel}>Your Rank</div>
                                        <div style={S.rankValue}>#{userRank}</div>
                                    </div>
                                    <div style={{ fontSize: '40px' }}>
                                        {getRankEmoji(userRank) || ''}
                                    </div>
                                </div>
                            )}

                            {/* Top 3 Podium */}
                            {top3.length >= 3 && (
                                <div style={S.podium}>
                                    {/* 2nd Place */}
                                    <div style={{ ...S.podiumPlace, width: '90px', minHeight: '140px' }}>
                                        <div style={{ ...S.podiumAvatar, background: FB.silver }}>
                                            <img src={resolveAvatarDisplay(top3[1]?.profiles?.avatar_url, top3[1]?.user_id || 1)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={(e) => { e.target.src = '/avatars/table/free_lion.png'; }} />
                                        </div>
                                        <div style={S.podiumName}>{top3[1]?.profiles?.display_name || top3[1]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.primary }}>{getDisplayValue(top3[1])}</div>
                                        <div style={S.podiumRank}></div>
                                    </div>

                                    {/* 1st Place */}
                                    <div style={{ ...S.podiumPlace, width: '100px', minHeight: '160px' }}>
                                        <div style={{ ...S.podiumAvatar, width: '60px', height: '60px', background: FB.gold }}>
                                            <img src={resolveAvatarDisplay(top3[0]?.profiles?.avatar_url, top3[0]?.user_id || 0)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={(e) => { e.target.src = '/avatars/table/free_shark.png'; }} />
                                        </div>
                                        <div style={S.podiumName}>{top3[0]?.profiles?.display_name || top3[0]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.gold, fontSize: '18px' }}>{getDisplayValue(top3[0])}</div>
                                        <div style={{ ...S.podiumRank, fontSize: '24px' }}></div>
                                    </div>

                                    {/* 3rd Place */}
                                    <div style={{ ...S.podiumPlace, width: '85px', minHeight: '130px' }}>
                                        <div style={{ ...S.podiumAvatar, width: '45px', height: '45px', background: FB.bronze }}>
                                            <img src={resolveAvatarDisplay(top3[2]?.profiles?.avatar_url, top3[2]?.user_id || 2)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" onError={(e) => { e.target.src = '/avatars/table/free_owl.png'; }} />
                                        </div>
                                        <div style={S.podiumName}>{top3[2]?.profiles?.display_name || top3[2]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.primary }}>{getDisplayValue(top3[2])}</div>
                                        <div style={S.podiumRank}></div>
                                    </div>
                                </div>
                            )}

                            {/* Rest of Leaderboard — uses MemoizedLeaderboardRow */}
                            {rest.length > 0 && (
                                <>
                                    <div style={S.listHeader}>Rankings</div>
                                    {rest.map((member, i) => (
                                        <MemoizedLeaderboardRow
                                            key={member.user_id}
                                            member={member}
                                            rank={i + 4}
                                            isCurrentUser={user && member.user_id === user.id}
                                            S={S} FB={FB}
                                            getRankColor={getRankColor} getRankEmoji={getRankEmoji}
                                            getDisplayValue={() => getDisplayValue(member)} resolveAvatarDisplay={resolveAvatarDisplay}
                                            sparklineHands={handsByUser[String(member.user_id)]}
                                        />
                                    ))}
                                </>
                            )}

                            {/* Show top 3 in list if less than 3 members */}
                            {top3.length < 3 && (
                                <>
                                    <div style={S.listHeader}>Rankings</div>
                                    {members.map((member, i) => (
                                        <MemoizedLeaderboardRow
                                            key={member.user_id}
                                            member={member}
                                            rank={i + 1}
                                            isCurrentUser={user && member.user_id === user.id}
                                            S={S} FB={FB}
                                            getRankColor={getRankColor} getRankEmoji={getRankEmoji}
                                            getDisplayValue={() => getDisplayValue(member)} resolveAvatarDisplay={resolveAvatarDisplay}
                                            sparklineHands={handsByUser[String(member.user_id)]}
                                        />
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="data" userRole={currentUserRole} />
            </div>
        </>
    );
}
