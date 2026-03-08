/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Leaderboard | FULLY WIRED
   SmarterPoker Dark Theme | Time Filters, Multiple Board Types, Member Rankings
   ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getSafeUser, getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import usePersistedFilters from '../../../src/hooks/usePersistedFilters';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

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
    { id: 'hands', label: '🃏 Hands Played', field: 'hands_played', desc: 'Most active players' },
    { id: 'wins', label: 'Win Rate', field: 'win_rate', desc: 'Highest win percentages' },
];

const TIME_PERIODS = [
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Time' },
];

export default function Leaderboard() {
        useTrainingBus('club-arena-leaderboard');

const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const { filters, setFilter } = usePersistedFilters('club-arena-leaderboard', { boardType: 'chips', period: 'all' });
    const boardType = filters.boardType;
    const setBoardType = (val) => setFilter('boardType', val);
    const period = filters.period;
    const setPeriod = (val) => setFilter('period', val);

    // User's rank
    const [userRank, setUserRank] = useState(null);

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
                    if (boardType !== 'chips') {
                        try {
                            // Fetch hand histories — cap at 500 for all-time, 200 for filtered periods
                            const handLimit = dateFilter ? 200 : 500;
                            let handQuery = supabase
                                .from('hand_histories')
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
                        }
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

                    // Compute stats for each member
                    const membersWithStats = memberData.map(member => {
                        const userStats = statsByUser[String(member.user_id)] || { handsPlayed: 0, wins: 0, totalProfit: 0 };
                        return {
                            ...member,
                            stats: {
                                chip_balance: member.chip_balance || 0,
                                total_profit: Math.round(userStats.totalProfit),
                                hands_played: userStats.handsPlayed,
                                win_rate: userStats.handsPlayed > 0 ? Math.round((userStats.wins / userStats.handsPlayed) * 100) : 0,
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
            
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam, boardType, period]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Realtime: refresh leaderboard on new hand results ─────────────────
    useEffect(() => {
        if (!clubIdParam) return;
        const ch = supabase
            .channel(`leaderboard-live:${clubIdParam}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hand_histories',
                filter: `club_id=eq.${clubIdParam}` }, () => loadData())
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });
        return () => { supabase.removeChannel(ch); };
    }, [clubIdParam, loadData]);

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
        podiumAvatar: { width: '50px', height: '50px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '8px', overflow: 'hidden' },
        podiumName: { fontSize: '12px', color: FB.textPrimary, fontWeight: 600, textAlign: 'center', maxWidth: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        podiumValue: { fontSize: '14px', fontWeight: 700, marginTop: '4px' },
        podiumRank: { fontSize: '18px', marginTop: '8px' },

        // Leaderboard list
        listHeader: { fontSize: '12px', fontWeight: 700, color: FB.textSecondary, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
        playerRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '8px' },
        playerRowHighlight: { border: `2px solid ${FB.primary}`, background: '#1a2a40' },
        playerRank: { width: '28px', fontSize: '14px', fontWeight: 700, color: FB.textSecondary, textAlign: 'center', flexShrink: 0 },
        playerAvatar: { width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, overflow: 'hidden' },
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
        if (rank === 1) return '';
        if (rank === 2) return '';
        if (rank === 3) return '';
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

    return (
        <>
            <SEOHead
                title="Club Arena — Leaderboard"
                description="View Club Arena Leaderboard Rankings."
                canonical="/hub/club-arena/leaderboard"
                noindex={true}
            />

            <div style={S.page}>
                <UniversalHeader pageDepth={2} />

                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <h1 style={S.pageTitle}>Leaderboard</h1>

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
                                onClick={() => setBoardType(board.id)}
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
                                onClick={() => setPeriod(p.id)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
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
                                            {top3[1]?.profiles?.avatar_url ? (
                                                <Image src={top3[1].profiles.avatar_url} alt="" fill style={{ objectFit: 'cover' }} />
                                            ) : ''}
                                        </div>
                                        <div style={S.podiumName}>{top3[1]?.profiles?.display_name || top3[1]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.primary }}>{getDisplayValue(top3[1])}</div>
                                        <div style={S.podiumRank}></div>
                                    </div>

                                    {/* 1st Place */}
                                    <div style={{ ...S.podiumPlace, width: '100px', minHeight: '160px' }}>
                                        <div style={{ ...S.podiumAvatar, width: '60px', height: '60px', background: FB.gold }}>
                                            {top3[0]?.profiles?.avatar_url ? (
                                                <Image src={top3[0].profiles.avatar_url} alt="" fill style={{ objectFit: 'cover' }} />
                                            ) : ''}
                                        </div>
                                        <div style={S.podiumName}>{top3[0]?.profiles?.display_name || top3[0]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.gold, fontSize: '18px' }}>{getDisplayValue(top3[0])}</div>
                                        <div style={{ ...S.podiumRank, fontSize: '24px' }}></div>
                                    </div>

                                    {/* 3rd Place */}
                                    <div style={{ ...S.podiumPlace, width: '85px', minHeight: '130px' }}>
                                        <div style={{ ...S.podiumAvatar, width: '45px', height: '45px', background: FB.bronze }}>
                                            {top3[2]?.profiles?.avatar_url ? (
                                                <Image src={top3[2].profiles.avatar_url} alt="" fill style={{ objectFit: 'cover' }} />
                                            ) : ''}
                                        </div>
                                        <div style={S.podiumName}>{top3[2]?.profiles?.display_name || top3[2]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.primary }}>{getDisplayValue(top3[2])}</div>
                                        <div style={S.podiumRank}></div>
                                    </div>
                                </div>
                            )}

                            {/* Rest of Leaderboard */}
                            {rest.length > 0 && (
                                <>
                                    <div style={S.listHeader}>Rankings</div>
                                    {rest.map((member, i) => {
                                        const rank = i + 4;
                                        const isCurrentUser = user && member.user_id === user.id;
                                        return (
                                            <div
                                                key={member.user_id}
                                                style={{
                                                    ...S.playerRow,
                                                    ...(isCurrentUser ? S.playerRowHighlight : {}),
                                                }}
                                            >
                                                <div style={{ ...S.playerRank, color: getRankColor(rank) }}>
                                                    {rank}
                                                </div>
                                                <div style={{ ...S.playerAvatar, background: FB.primary }}>
                                                    {member.profiles?.avatar_url ? (
                                                        <Image src={member.profiles.avatar_url} alt="" fill style={{ objectFit: 'cover' }} />
                                                    ) : ''}
                                                </div>
                                                <div style={S.playerInfo}>
                                                    <div style={S.playerName}>
                                                        {member.profiles?.display_name || member.profiles?.username || 'Player'}
                                                        {isCurrentUser && <span style={{ color: FB.primary, marginLeft: '6px' }}>(You)</span>}
                                                    </div>
                                                    <div style={S.playerSub}>{member.role || 'Member'}</div>
                                                </div>
                                                <div style={{ ...S.playerValue, color: FB.primary }}>
                                                    {getDisplayValue(member)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}

                            {/* Show top 3 in list if less than 3 members */}
                            {top3.length < 3 && (
                                <>
                                    <div style={S.listHeader}>Rankings</div>
                                    {members.map((member, i) => {
                                        const rank = i + 1;
                                        const isCurrentUser = user && member.user_id === user.id;
                                        return (
                                            <div
                                                key={member.user_id}
                                                style={{
                                                    ...S.playerRow,
                                                    ...(isCurrentUser ? S.playerRowHighlight : {}),
                                                }}
                                            >
                                                <div style={{ ...S.playerRank, color: getRankColor(rank) }}>
                                                    {getRankEmoji(rank) || rank}
                                                </div>
                                                <div style={{ ...S.playerAvatar, background: FB.primary }}>
                                                    {member.profiles?.avatar_url ? (
                                                        <Image src={member.profiles.avatar_url} alt="" fill style={{ objectFit: 'cover' }} />
                                                    ) : ''}
                                                </div>
                                                <div style={S.playerInfo}>
                                                    <div style={S.playerName}>
                                                        {member.profiles?.display_name || member.profiles?.username || 'Player'}
                                                        {isCurrentUser && <span style={{ color: FB.primary, marginLeft: '6px' }}>(You)</span>}
                                                    </div>
                                                </div>
                                                <div style={{ ...S.playerValue, color: getRankColor(rank) }}>
                                                    {getDisplayValue(member)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="data" userRole={null} />
            </div>
        </>
    );
}
