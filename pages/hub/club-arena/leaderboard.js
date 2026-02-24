/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Leaderboard | FULLY WIRED
   Facebook Dark Theme | Time Filters, Multiple Board Types, Member Rankings
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
    silver: '#A0AEC0',
    bronze: '#CD7F32',
    hover: '#3A3B3C',
};

const LEADERBOARD_TYPES = [
    { id: 'chips', label: '💰 Chip Balance', field: 'chip_balance', desc: 'Highest chip counts' },
    { id: 'profit', label: '📈 Profit', field: 'total_profit', desc: 'Most profitable players' },
    { id: 'hands', label: '🃏 Hands Played', field: 'hands_played', desc: 'Most active players' },
    { id: 'wins', label: '🏆 Win Rate', field: 'win_rate', desc: 'Highest win percentages' },
];

const TIME_PERIODS = [
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'all', label: 'All Time' },
];

export default function Leaderboard() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [boardType, setBoardType] = useState('chips');
    const [period, setPeriod] = useState('all');

    // User's rank
    const [userRank, setUserRank] = useState(null);

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

                // Get members with profiles
                const { data: memberData } = await supabase
                    .from('club_members')
                    .select('*, profiles(username, display_name, avatar_url)')
                    .eq('club_id', clubData.id);

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

                    // Batch fetch hand_history for ALL members at once (avoid N+1)
                    // hand_history may have minimal schema — wrap in try/catch
                    let allHands = [];
                    if (boardType !== 'chips') {
                        try {
                            let handQuery = supabase
                                .from('hand_history')
                                .select('*');

                            if (dateFilter) {
                                handQuery = handQuery.gte('created_at', dateFilter);
                            }

                            const { data: handData, error: handErr } = await handQuery;
                            if (!handErr && handData) {
                                // Only use data if it has the columns we need
                                if (handData.length > 0 && handData[0].user_id !== undefined) {
                                    // Filter by club_id client-side if column exists
                                    allHands = handData[0].club_id !== undefined
                                        ? handData.filter(h => h.club_id === clubData.id)
                                        : handData;
                                }
                            }
                        } catch (handQueryErr) {
                            console.warn('[Leaderboard] hand_history query failed:', handQueryErr);
                        }
                    }

                    // Group hand_history by user_id
                    const handsByUser = {};
                    allHands.forEach(h => {
                        if (!handsByUser[h.user_id]) handsByUser[h.user_id] = [];
                        handsByUser[h.user_id].push(h);
                    });

                    // Compute stats for each member
                    const membersWithStats = memberData.map(member => {
                        const userHands = handsByUser[member.user_id] || [];
                        const wins = userHands.filter(h => h.result === 'win' || h.profit > 0).length;
                        return {
                            ...member,
                            stats: {
                                chip_balance: member.chip_balance || 0,
                                total_profit: userHands.reduce((sum, h) => sum + (h.profit || 0), 0),
                                hands_played: userHands.length,
                                win_rate: userHands.length > 0 ? Math.round((wins / userHands.length) * 100) : 0,
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
            console.error('[Leaderboard] Error loading data:', e);
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam, boardType, period]);

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
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
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

                    <h1 style={S.pageTitle}>🏆 Leaderboard</h1>

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
                            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>🏆</span>
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
                                        {getRankEmoji(userRank) || '🎯'}
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
                                                <img src={top3[1].profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : '👤'}
                                        </div>
                                        <div style={S.podiumName}>{top3[1]?.profiles?.display_name || top3[1]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.primary }}>{getDisplayValue(top3[1])}</div>
                                        <div style={S.podiumRank}>🥈</div>
                                    </div>

                                    {/* 1st Place */}
                                    <div style={{ ...S.podiumPlace, width: '100px', minHeight: '160px' }}>
                                        <div style={{ ...S.podiumAvatar, width: '60px', height: '60px', background: FB.gold }}>
                                            {top3[0]?.profiles?.avatar_url ? (
                                                <img src={top3[0].profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : '👤'}
                                        </div>
                                        <div style={S.podiumName}>{top3[0]?.profiles?.display_name || top3[0]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.gold, fontSize: '18px' }}>{getDisplayValue(top3[0])}</div>
                                        <div style={{ ...S.podiumRank, fontSize: '24px' }}>🥇</div>
                                    </div>

                                    {/* 3rd Place */}
                                    <div style={{ ...S.podiumPlace, width: '85px', minHeight: '130px' }}>
                                        <div style={{ ...S.podiumAvatar, width: '45px', height: '45px', background: FB.bronze }}>
                                            {top3[2]?.profiles?.avatar_url ? (
                                                <img src={top3[2].profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : '👤'}
                                        </div>
                                        <div style={S.podiumName}>{top3[2]?.profiles?.display_name || top3[2]?.profiles?.username || 'Player'}</div>
                                        <div style={{ ...S.podiumValue, color: FB.primary }}>{getDisplayValue(top3[2])}</div>
                                        <div style={S.podiumRank}>🥉</div>
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
                                                        <img src={member.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : '👤'}
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
                                                        <img src={member.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : '👤'}
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
