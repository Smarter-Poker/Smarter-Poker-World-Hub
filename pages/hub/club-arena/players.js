/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Players | FULLY WIRED
 Facebook Dark Theme | Member List with Search, Roles & Actions
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

const ROLE_COLORS = {
    owner: '#F7C52A',
    admin: '#E74C3C',
    agent: '#1877F2',
    player: '#3498DB',
};

const ROLE_BADGES = {
    owner: 'Owner',
    admin: 'Admin',
    agent: 'Agent',
    player: '',
};

export default function Players() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [filteredMembers, setFilteredMembers] = useState([]);
    const [currentUserRole, setCurrentUserRole] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [sortBy, setSortBy] = useState('name'); // 'name' | 'chips' | 'joined'

    // Player detail modal
    const [selectedPlayer, setSelectedPlayer] = useState(null);

    // Toast
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

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

            // Get club data — try UUID (id) first, fall back to numeric (club_id)
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
                    .select('*, profiles!inner(username, alias, avatar_url, email, last_seen_at)')
                    .eq('club_id', clubData.id)
                    .order('created_at', { ascending: true });

                if (memberData) {
                    setMembers(memberData);
                    setFilteredMembers(memberData);

                    // Get current user's role
                    if (authUser) {
                        const currentMember = memberData.find(m => m.user_id === authUser.id);
                        setCurrentUserRole(currentMember?.role || null);
                    }
                }
            }
        } catch (e) {
            console.error('[Players] Error loading data:', e);
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam]);

    useEffect(() => { loadData(); }, [loadData]);

    // ═══════════════════════════════════════════════════════════════════════════
    // FILTER & SORT
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        let result = [...members];

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(m => {
                const name = (m.profiles?.alias || m.profiles?.username || '').toLowerCase();
                const email = (m.profiles?.email || '').toLowerCase();
                return name.includes(q) || email.includes(q);
            });
        }

        // Role filter
        if (roleFilter !== 'all') {
            result = result.filter(m => m.role === roleFilter);
        }

        // Sort
        result.sort((a, b) => {
            if (sortBy === 'chips') {
                return (b.chip_balance || 0) - (a.chip_balance || 0);
            } else if (sortBy === 'joined') {
                return new Date(a.created_at) - new Date(b.created_at);
            } else {
                const nameA = (a.profiles?.alias || a.profiles?.username || '').toLowerCase();
                const nameB = (b.profiles?.alias || b.profiles?.username || '').toLowerCase();
                return nameA.localeCompare(nameB);
            }
        });

        setFilteredMembers(result);
    }, [members, searchQuery, roleFilter, sortBy]);

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    const sendMessage = (memberId) => {
        // Navigate to messages with this player's ID
        router.push(`/hub/club-arena/messages?club=${clubIdParam}&to=${memberId}`);
        setSelectedPlayer(null);
    };

    const viewProfile = (member) => {
        const username = member.profiles?.username;
        if (username) {
            router.push(`/hub/user/${username}`);
        }
        setSelectedPlayer(null);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    const isOnline = (lastSeen) => {
        if (!lastSeen) return false;
        const diff = Date.now() - new Date(lastSeen).getTime();
        return diff < 5 * 60 * 1000; // Online if seen in last 5 minutes
    };

    const formatJoined = (dateStr) => {
        if (!dateStr) return 'Unknown';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    const formatLastSeen = (dateStr) => {
        if (!dateStr) return 'Never';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(mins / 60);
        const days = Math.floor(hours / 24);

        if (mins < 5) return 'Online now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return formatJoined(dateStr);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    const S = {
        page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
        container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' },
        backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 },
        pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '8px' },
        memberCount: { fontSize: '14px', color: FB.textSecondary, marginBottom: '20px' },
        loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' },
        emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary },

        // Search
        searchBox: { position: 'relative', marginBottom: '16px' },
        searchIcon: { position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: FB.textSecondary, fontSize: '16px' },
        searchInput: { width: '100%', padding: '12px 14px 12px 40px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textPrimary, fontSize: '15px', outline: 'none' },

        // Filters
        filterRow: { display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' },
        filterBtn: { padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', border: 'none', flexShrink: 0 },
        sortSelect: { padding: '8px 12px', background: FB.hover, border: `1px solid ${FB.border}`, borderRadius: '6px', color: FB.textPrimary, fontSize: '13px', marginLeft: 'auto' },

        // Player card
        playerCard: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '10px', cursor: 'pointer', transition: 'border-color 0.2s' },
        avatarWrapper: { position: 'relative', flexShrink: 0 },
        avatar: { width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', overflow: 'hidden' },
        onlineIndicator: { position: 'absolute', bottom: '2px', right: '2px', width: '12px', height: '12px', borderRadius: '50%', border: `2px solid ${FB.cardBg}` },
        playerInfo: { flex: 1, minWidth: 0 },
        playerName: { fontSize: '15px', fontWeight: 600, color: FB.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        playerMeta: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' },
        roleBadge: { fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' },
        chipCount: { fontSize: '13px', color: FB.gold, fontWeight: 600 },
        lastSeen: { fontSize: '12px', color: FB.textSecondary },

        // Modal
        modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
        modal: { background: FB.cardBg, borderRadius: '12px', width: '100%', maxWidth: '400px', overflow: 'hidden', border: `1px solid ${FB.border}` },
        modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${FB.border}` },
        modalTitle: { fontSize: '18px', fontWeight: 700, color: FB.textPrimary },
        modalClose: { background: 'none', border: 'none', color: FB.textSecondary, fontSize: '24px', cursor: 'pointer', lineHeight: 1 },
        modalBody: { padding: '24px', textAlign: 'center' },
        modalAvatar: { width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', margin: '0 auto 16px', overflow: 'hidden' },
        modalName: { fontSize: '22px', fontWeight: 700, color: FB.textPrimary, marginBottom: '4px' },
        modalRole: { fontSize: '14px', padding: '4px 12px', borderRadius: '4px', display: 'inline-block', marginBottom: '16px' },
        modalStats: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' },
        modalStat: { padding: '12px', background: FB.background, borderRadius: '8px' },
        modalStatValue: { fontSize: '18px', fontWeight: 700, color: FB.primary },
        modalStatLabel: { fontSize: '11px', color: FB.textSecondary, marginTop: '4px', textTransform: 'uppercase' },
        modalActions: { display: 'flex', gap: '10px' },
        modalBtn: { flex: 1, padding: '12px', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },

        // Toast
        toast: { position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
    };

    const roles = ['all', 'owner', 'admin', 'agent', 'player'];

    return (
        <>
            <SEOHead
                title="Club Arena — Players"
                description="Search And View Poker Players In Club Arena."
                canonical="/hub/club-arena/players"
                noindex={true}
            />

            <div style={S.page}>
                <UniversalHeader pageDepth={2} />

                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <h1 style={S.pageTitle}>Players</h1>
                    <p style={S.memberCount}>{members.length} members in this club</p>

                    {/* Search */}
                    <div style={S.searchBox}>
                        <span style={S.searchIcon}></span>
                        <input
                            type="text"
                            style={S.searchInput}
                            placeholder="Search Players..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Filters */}
                    <div style={S.filterRow}>
                        {roles.map(r => (
                            <button
                                key={r}
                                style={{
                                    ...S.filterBtn,
                                    background: roleFilter === r ? (r === 'all' ? FB.primary : ROLE_COLORS[r]) : FB.hover,
                                    color: roleFilter === r ? '#fff' : FB.textSecondary,
                                }}
                                onClick={() => setRoleFilter(r)}
                            >
                                {r === 'all' ? 'All' : `${ROLE_BADGES[r] || ''} ${r.charAt(0).toUpperCase() + r.slice(1)}`}
                            </button>
                        ))}
                        <select
                            style={S.sortSelect}
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                        >
                            <option value="name">Sort: Name</option>
                            <option value="chips">Sort: Chips</option>
                            <option value="joined">Sort: Joined</option>
                        </select>
                    </div>

                    {isLoading ? (
                        <div style={S.loading}>Loading Players...</div>
                    ) : filteredMembers.length === 0 ? (
                        <div style={S.emptyState}>
                            <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}></span>
                            <p>{searchQuery ? 'No players found' : 'No members yet'}</p>
                        </div>
                    ) : (
                        filteredMembers.map(member => {
                            const online = isOnline(member.profiles?.last_seen_at);
                            const isMe = user && member.user_id === user.id;
                            return (
                                <div
                                    key={member.id}
                                    style={S.playerCard}
                                    onClick={() => setSelectedPlayer(member)}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = FB.primary}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = FB.border}
                                >
                                    <div style={S.avatarWrapper}>
                                        <div style={{ ...S.avatar, background: ROLE_COLORS[member.role] || FB.primary }}>
                                            {member.profiles?.avatar_url ? (
                                                <img src={member.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : ROLE_BADGES[member.role] || ''}
                                        </div>
                                        <div style={{ ...S.onlineIndicator, background: online ? FB.success : FB.textSecondary }} />
                                    </div>
                                    <div style={S.playerInfo}>
                                        <div style={S.playerName}>
                                            {member.profiles?.alias || member.profiles?.username || 'Player'}
                                            {isMe && <span style={{ color: FB.primary, marginLeft: '6px' }}>(You)</span>}
                                        </div>
                                        <div style={S.playerMeta}>
                                            <span style={{
                                                ...S.roleBadge,
                                                background: `${ROLE_COLORS[member.role] || FB.primary}20`,
                                                color: ROLE_COLORS[member.role] || FB.primary,
                                            }}>
                                                {ROLE_BADGES[member.role]} {member.role}
                                            </span>
                                            <span style={S.chipCount}>{(member.chip_balance || 0).toLocaleString()} </span>
                                            {member.role === 'player' && member.agent_id && (() => {
                                                const agent = members.find(m => m.user_id === member.agent_id);
                                                return agent ? (
                                                    <span style={{ fontSize: '11px', color: '#1877F2' }}>
                                                        Agent: {agent.profiles?.alias || agent.profiles?.username}
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                    </div>
                                    <div style={S.lastSeen}>
                                        {online ? '' : formatLastSeen(member.profiles?.last_seen_at)}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="players" />
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
 PLAYER DETAIL MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {selectedPlayer && (
                <div style={S.modalOverlay} onClick={() => setSelectedPlayer(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Player Profile</span>
                            <button style={S.modalClose} onClick={() => setSelectedPlayer(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={{ ...S.modalAvatar, background: ROLE_COLORS[selectedPlayer.role] || FB.primary }}>
                                {selectedPlayer.profiles?.avatar_url ? (
                                    <img src={selectedPlayer.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : ROLE_BADGES[selectedPlayer.role] || ''}
                            </div>
                            <div style={S.modalName}>
                                {selectedPlayer.profiles?.alias || selectedPlayer.profiles?.username || 'Player'}
                            </div>
                            <div style={{
                                ...S.modalRole,
                                background: `${ROLE_COLORS[selectedPlayer.role] || FB.primary}30`,
                                color: ROLE_COLORS[selectedPlayer.role] || FB.primary,
                            }}>
                                {ROLE_BADGES[selectedPlayer.role]} {selectedPlayer.role?.toUpperCase()}
                            </div>

                            <div style={S.modalStats}>
                                <div style={S.modalStat}>
                                    <div style={S.modalStatValue}>{(selectedPlayer.chip_balance || 0).toLocaleString()}</div>
                                    <div style={S.modalStatLabel}>Chips</div>
                                </div>
                                <div style={S.modalStat}>
                                    <div style={S.modalStatValue}>{selectedPlayer.hands_played || 0}</div>
                                    <div style={S.modalStatLabel}>Hands</div>
                                </div>
                                <div style={S.modalStat}>
                                    <div style={S.modalStatValue}>{formatJoined(selectedPlayer.created_at)}</div>
                                    <div style={S.modalStatLabel}>Joined</div>
                                </div>
                                <div style={S.modalStat}>
                                    <div style={{ ...S.modalStatValue, color: isOnline(selectedPlayer.profiles?.last_seen_at) ? FB.success : FB.textSecondary }}>
                                        {isOnline(selectedPlayer.profiles?.last_seen_at) ? 'Online' : 'Offline'}
                                    </div>
                                    <div style={S.modalStatLabel}>Status</div>
                                </div>
                            </div>

                            {user && selectedPlayer.user_id !== user.id && (
                                <div style={S.modalActions}>
                                    <button
                                        style={{ ...S.modalBtn, background: FB.primary, color: '#fff' }}
                                        onClick={() => sendMessage(selectedPlayer.user_id)}
                                    >
                                        Message
                                    </button>
                                    <button
                                        style={{ ...S.modalBtn, background: FB.hover, color: FB.textPrimary }}
                                        onClick={() => viewProfile(selectedPlayer)}
                                    >
                                        Profile
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div style={{ ...S.toast, background: toast.type === 'error' ? FB.danger : FB.success, color: '#fff' }}>
                    {toast.message}
                </div>
            )}
        </>
    );
}
