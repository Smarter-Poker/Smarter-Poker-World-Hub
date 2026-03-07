/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Club Lobby (Club Detail View)
   Shows club info, tables, tournaments, and club navigation
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import CreateGameModal from '../../../src/components/club-arena/CreateGameModal';
import { BBJBanner, BBJModal, useBBJ } from '../../../src/components/club-arena/BBJDisplay';
import useDebounce from '../../../src/hooks/useDebounce';

const getAuthToken = async () => {
    // 1. Fast path: read from localStorage cache (instant, no network round-trip)
    //    'smarter-poker-auth' is the storageKey configured in supabase.ts
    try {
        const cached = localStorage.getItem('smarter-poker-auth');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.access_token) return parsed.access_token;
        }
    } catch (_) { /* localStorage unavailable (incognito, quota) */ }

    // 2. Slow path: ask Supabase (handles token refresh, also writes back to localStorage)
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || null;
    } catch (_) {
        return null;
    }
};

const apiCall = async (endpoint, body) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};

const apiGet = async (url) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};

export default function ClubLobby() {
    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [tables, setTables] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [chipBalance, setChipBalance] = useState(0);
    const [membership, setMembership] = useState(null);
    const [showCreateGame, setShowCreateGame] = useState(null); // null | { tab?, variant? }
    const [creatingTable, setCreatingTable] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [newDescription, setNewDescription] = useState('');
    const [announcements, setAnnouncements] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [sortBy, setSortBy] = useState('players'); // players | stakes | name
    const [showBBJ, setShowBBJ] = useState(false);
    const [toast, setToast] = useState(null); // { msg, type }
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // BBJ pool data (realtime)
    const { bbjData, loading: bbjLoading } = useBBJ(club?.id, supabase);

    // Filter tables by game type, search, and sort
    const filteredTables = tables.filter(table => {
        // Type filter
        if (activeFilter !== 'ALL') {
            if (activeFilter === 'nlh' && table.game_variant !== 'nlh' && table.game_variant !== 'short_deck' && table.game_variant !== 'pineapple') return false;
            if (activeFilter === 'plo' && !table.game_variant?.startsWith('plo')) return false;
            if (activeFilter === 'tournament' && table.table_type !== 'tournament' && table.game_type !== 'tournament') return false;
            if (activeFilter === 'sng' && table.table_type !== 'sng') return false;
        }
        // Search filter
        if (debouncedSearchQuery.trim()) {
            const q = debouncedSearchQuery.toLowerCase();
            const name = (table.name || '').toLowerCase();
            const stakes = (table.stakes || '').toLowerCase();
            const variant = (table.game_variant || '').toLowerCase();
            if (!name.includes(q) && !stakes.includes(q) && !variant.includes(q)) return false;
        }
        return true;
    }).sort((a, b) => {
        switch (sortBy) {
            case 'players': return (b.current_players || 0) - (a.current_players || 0);
            case 'stakes': return (b.big_blind || 0) - (a.big_blind || 0);
            case 'name': return (a.name || '').localeCompare(b.name || '');
            default: return 0;
        }
    });

    // Save description
    async function handleSaveDescription() {
        if (!club) return;
        try {
            await apiCall('/api/club-arena/save-settings', {
                clubId: club.id,
                description: newDescription,
            });
            setClub({ ...club, description: newDescription });
            setIsEditingDescription(false);
        } catch (err) {
            console.error('Error updating description:', err);
            showToast('Failed to update description.', 'error');
        }
    }

    // Handler: game/table/tournament created callback
    function handleGameCreated(result) {
        if (result?.id || result?.table) {
            const table = result?.table || result;
            if (table.game_type === 'cash' || (!table.type && !table.game_type?.includes('tournament'))) {
                setTables(prev => [...prev, table]);
            }
        }
        setShowCreateGame(null);
        showToast('Created successfully!');
    }

    useEffect(() => {
        if (clubIdParam) loadClubData();
    }, [clubIdParam]);

    // Realtime subscription for table updates (player counts, status changes)
    useEffect(() => {
        if (!club?.id) return;

        const channel = supabase
            .channel(`lobby:${club.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tables',
                filter: `club_id=eq.${club.id}`,
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setTables(prev => [...prev, payload.new]);
                } else if (payload.eventType === 'UPDATE') {
                    setTables(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
                } else if (payload.eventType === 'DELETE') {
                    setTables(prev => prev.filter(t => t.id !== payload.old.id));
                }
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'club_tournaments',
                filter: `club_id=eq.${club.id}`,
            }, () => { loadClubData(); })
            .subscribe();

        const _c = new AbortController();
        // Polling fallback every 60s — last resort for player counts
        // (Realtime postgres_changes above handles all UPDATE events instantly)
        const poll = setInterval(async () => {
            try {
                const { data } = await supabase
                    .from('tables')
                    .select('id, current_players, status')
                    .eq('club_id', club.id)
                    .neq('status', 'deleted')
                    .limit(100) // lobby tables;
                if (data) {
                    setTables(prev => prev.map(t => {
                        const fresh = data.find(d => d.id === t.id);
                        return fresh ? { ...t, current_players: fresh.current_players, status: fresh.status } : t;
                    }).filter(t => {
                        const fresh = data.find(d => d.id === t.id);
                        return fresh && fresh.status !== 'deleted';
                    }));
                }
            } catch (_) { }
        }, 60000); // Reduced from 15s — Realtime handles near-instant updates

        return () => {
            supabase.removeChannel(channel);
            clearInterval(poll);
        };
    }, [club?.id]);

    async function loadClubData() {
        setIsLoading(true);
        try {
            // Load user (Supabase session only)
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser) setUser(authUser);

            // Load club by club_id
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
            const { data: clubData } = await supabase
                .from('clubs')
                .select('*')
                .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                .single();

            if (clubData) {
                setClub(clubData);

                // Parallelize: tables + announcements + membership all fire at once
                const [tableResult, annResult, memberResult] = await Promise.allSettled([
                    supabase.from('tables').select('*').eq('club_id', clubData.id).neq('status', 'deleted').limit(100),
                    apiGet(`/api/club-arena/announcements?clubId=${clubData.id}`).catch(() => ({})),
                    authUser
                        ? supabase.from('club_members').select('chip_balance, role').eq('club_id', clubData.id).eq('user_id', authUser.id).maybeSingle()
                        : Promise.resolve(null),
                ]);

                if (tableResult.status === 'fulfilled') setTables(tableResult.value?.data || []);
                if (annResult.status === 'fulfilled') setAnnouncements(annResult.value?.announcements || []);
                if (memberResult.status === 'fulfilled' && memberResult.value?.data) {
                    setMembership(memberResult.value.data);
                    setChipBalance(memberResult.value.data.chip_balance || 0);
                }
            }
        } catch (e) {
            console.error('[ClubLobby] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <SEOHead
                title="Club Arena — Game Lobby"
                description="Browse Available Poker Games In Club Arena."
                canonical="/hub/club-arena/lobby"
                noindex={true}
            >

            </SEOHead>

            <div style={styles.page}>
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />

                {/* Toast notification */}
                {toast && (
                    <div style={{
                        position: 'fixed', top: 20, right: 20, zIndex: 9999,
                        background: toast.type === 'error' ? '#FA383E' : toast.type === 'info' ? '#2374E1' : '#31A24C',
                        color: '#fff', padding: '12px 20px', borderRadius: 10,
                        fontWeight: 600, fontSize: 14, maxWidth: 320,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                        animation: 'fadeIn 0.2s ease',
                    }}>{toast.msg}</div>
                )}
            <div style={styles.container}>
                    <button onClick={() => router.push('/hub/club-arena')} style={styles.backBtn}>
                        &#8592; Back to Club Arena
                    </button>

                    {isLoading ? (
                        <div style={styles.loading}>Loading Club...</div>
                    ) : !club ? (
                        <div style={styles.error}>
                            <h2 style={{ color: '#ff4d4d', marginBottom: '16px' }}>Club Not Found</h2>
                            <p style={{ color: 'rgba(255,255,255,0.6)' }}>The club with ID {clubIdParam} could not be found.</p>
                            <button onClick={() => router.push('/hub/club-arena')} style={styles.primaryBtn}>
                                Return to Club Arena
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Club Header Card */}
                            <div style={styles.clubCard}>
                                <div style={styles.clubAvatar}>
                                    <span style={styles.clubLogo}></span>
                                </div>
                                <div style={styles.clubInfo}>
                                    <h2 style={styles.clubName}>{club.name}</h2>
                                    <div style={styles.clubMeta}>
                                        <span style={styles.clubId}>ID: {club.club_id}</span>
                                        <span style={styles.memberCount}>{club.member_count || 0} Members</span>
                                        {club.union_id && (
                                            <span
                                                onClick={(e) => { e.stopPropagation(); router.push(`/hub/club-arena/union-dashboard?union=${club.union_id}`); }}
                                                style={{ fontSize: 11, color: '#2374E1', cursor: 'pointer', fontWeight: 600 }}
                                            >Union</span>
                                        )}
                                    </div>
                                </div>
                                <div style={styles.clubBalance}>
                                    <div style={styles.balanceRow}>
                                        <span style={styles.balanceAmount}>{chipBalance.toLocaleString()}</span>
                                        <button style={styles.addBtn} onClick={() => router.push(`/hub/club-arena/cashier?club=${club.club_id}`)}>+</button>
                                    </div>
                                </div>
                            </div>

                            {/* Club Description */}
                            <div
                                style={{ ...styles.descriptionCard, cursor: (membership?.role === 'owner' || membership?.role === 'admin') ? 'pointer' : 'default' }}
                                onClick={() => {
                                    if (membership?.role === 'owner' || membership?.role === 'admin') {
                                        setNewDescription(club.description || '');
                                        setIsEditingDescription(true);
                                    }
                                }}
                            >
                                {isEditingDescription ? (
                                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <textarea
                                            value={newDescription}
                                            onChange={e => setNewDescription(e.target.value)}
                                            style={{ ...styles.formInput, width: '100%', minHeight: '60px', resize: 'vertical' }}
                                            placeholder="Enter club description/message..."
                                            autoFocus
                                        />
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button style={{ ...styles.actionBtn, padding: '4px 12px', fontSize: '12px' }} onClick={() => setIsEditingDescription(false)}>Cancel</button>
                                            <button style={{ ...styles.actionBtn, padding: '4px 12px', fontSize: '12px', background: FB.primary, color: '#fff', borderColor: FB.primary }} onClick={handleSaveDescription}>Save</button>
                                        </div>
                                    </div>
                                ) : (
                                    <p style={styles.descriptionText}>{club.description || 'Welcome to the club!'}</p>
                                )}
                            </div>

                            {/* Club Announcements */}
                            {announcements.length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    {announcements.slice(0, 3).map(ann => (
                                        <div key={ann.id} style={{
                                            background: 'rgba(35,116,225,0.08)', borderRadius: '8px',
                                            padding: '10px 14px', marginBottom: '6px',
                                            border: `1px solid rgba(35,116,225,0.2)`,
                                        }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: FB.textPrimary }}>
                                                {ann.title}
                                            </div>
                                            {ann.content && (
                                                <div style={{ fontSize: '12px', color: FB.textSecondary, marginTop: '2px' }}>
                                                    {ann.content.length > 120 ? ann.content.slice(0, 120) + '...' : ann.content}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Bad Beat Jackpot Banner */}
                            {bbjData && bbjData.pool?.amount > 0 && (
                                <BBJBanner
                                    amount={bbjData.pool.amount}
                                    hourlyRate={bbjData.hourlyRate || 0}
                                    onClick={() => setShowBBJ(true)}
                                />
                            )}

                            {/* Game Type Filters */}
                            <div style={styles.filterTabs}>
                                {[
                                    { key: 'ALL', label: 'ALL' },
                                    { key: 'nlh', label: "Hold'em" },
                                    { key: 'plo', label: 'Omaha' },
                                    { key: 'tournament', label: 'MTT' },
                                    { key: 'sng', label: 'SNG' }
                                ].map(filter => (
                                    <button
                                        key={filter.key}
                                        style={{
                                            ...styles.filterTab,
                                            ...(activeFilter === filter.key ? styles.filterTabActive : {})
                                        }}
                                        onClick={() => setActiveFilter(filter.key)}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>

                            {/* Search + Sort + Tournament Link */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    placeholder="Search tables..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{
                                        flex: 1, minWidth: 150, padding: '8px 12px',
                                        background: '#3A3B3C', border: '1px solid #4E4F50',
                                        borderRadius: 8, color: '#E4E6EB', fontSize: 13,
                                        outline: 'none',
                                    }}
                                />
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value)}
                                    style={{
                                        padding: '8px 12px', background: '#3A3B3C',
                                        border: '1px solid #4E4F50', borderRadius: 8,
                                        color: '#E4E6EB', fontSize: 13, cursor: 'pointer',
                                    }}
                                >
                                    <option value="players">Sort: Players</option>
                                    <option value="stakes">Sort: Stakes</option>
                                    <option value="name">Sort: Name</option>
                                </select>
                                {club && (membership?.role === 'owner' || membership?.role === 'admin') && (
                                    <button
                                        onClick={() => setShowCreateGame({ tab: 'mtt' })}
                                        style={{
                                            padding: '8px 14px', background: 'linear-gradient(135deg, #9333ea, #7c3aed)',
                                            border: 'none', borderRadius: 8, color: '#fff',
                                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        New Tournament
                                    </button>
                                )}
                                {club && (
                                    <button
                                        onClick={() => router.push(`/hub/club-arena/tournaments?club=${club.id}`)}
                                        style={{
                                            padding: '8px 14px', background: 'rgba(255,255,255,0.08)',
                                            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#B0B3B8',
                                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        View Tournaments
                                    </button>
                                )}
                            </div>

                            {/* Quick Actions */}
                            <div style={styles.heroActions}>
                                {(membership?.role === 'owner' || membership?.role === 'admin') && (
                                    <button
                                        style={{ ...styles.heroActionBtn, ...styles.heroActionPrimary }}
                                        onClick={() => setShowCreateGame({})}
                                    >
                                        <span style={styles.heroActionLabel}>Create Table</span>
                                    </button>
                                )}
                                {(membership?.role === 'owner' || membership?.role === 'admin' || membership?.role === 'agent') && (
                                    <button
                                        style={{ ...styles.heroActionBtn, background: 'linear-gradient(135deg, #F5A623, #D4941F)' }}
                                        onClick={() => router.push(`/hub/club-arena/agent-dashboard?club=${club.id}`)}
                                    >
                                        <span style={{ ...styles.heroActionLabel, color: '#000' }}>
                                            {membership?.role === 'agent' ? 'Agent Dashboard' : 'Agent Panel'}
                                        </span>
                                    </button>
                                )}
                                <button
                                    style={styles.heroActionBtn}
                                    onClick={() => {
                                        const openTable = filteredTables.find(t => (t.current_players || 0) < (t.max_players || 9));
                                        if (openTable) {
                                            router.push(`/hub/club-arena/table/${openTable.id}`);
                                        } else if (filteredTables.length > 0) {
                                            showToast('All tables are full — join a waitlist or create a new table.', 'info');
                                        } else {
                                            showToast('No tables available yet. Create one!', 'info');
                                        }
                                    }}
                                >
                                    <span style={styles.heroActionLabel}>Quick Seat</span>
                                </button>
                            </div>

                            {/* ═══ POKERBROS PILL-ICON GRID ═══ */}
                            <div style={styles.iconGrid}>
                                {/* Create New Table Icon */}
                                {(membership?.role === 'owner' || membership?.role === 'admin') && (
                                    <div style={styles.iconItemWrapper} onClick={() => setShowCreateGame({})}>
                                        <div style={{ ...styles.pillOuter, background: 'linear-gradient(180deg, #7A7A7A 0%, #3B3B3B 40%, #5C5C5C 60%, #292929 100%)' }}>
                                            <div style={{ ...styles.pillInner, background: 'radial-gradient(ellipse at center, #2C2C35 0%, #15151A 100%)' }}>
                                                <div style={styles.createPlus}>+</div>
                                            </div>

                                            {/* 3D NEW Logo left overhanging */}
                                            <div style={styles.newBadgeWrapper}>
                                                <div style={styles.newBadgeCoin}>
                                                    <div style={styles.newBadgeText}>NEW</div>
                                                </div>
                                            </div>

                                            {/* Bottom Label Trapezoid */}
                                            <div style={styles.createLabelWrapper}>
                                                <div style={styles.createLabelBox}>
                                                    Create New Table
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Table Icons */}
                                {filteredTables.map(table => {
                                    const variant = (table.game_variant || 'nlh').toUpperCase();
                                    const gameLabel = variant.startsWith('PLO') ? 'PLO' : variant === 'SHORT_DECK' ? 'SD' : 'NLH';
                                    const typeLabel = table.game_type === 'tournament' || table.table_type === 'tournament' ? 'XMTT' : '';
                                    const displayType = typeLabel ? `${typeLabel} ${gameLabel}` : gameLabel;
                                    const sb = table.small_blind || parseFloat(table.stakes?.split('/')[0]) || 1;
                                    const bb = table.big_blind || parseFloat(table.stakes?.split('/')[1]) || 2;
                                    const stakesLabel = `${sb}/${bb}`;
                                    const isGold = bb >= 50;

                                    // Outer gradient logic based on stakes
                                    const outerBg = isGold
                                        ? 'linear-gradient(145deg, #FFEF96 0%, #D4AF37 40%, #FFF5C3 60%, #AA801E 100%)'
                                        : 'linear-gradient(145deg, #E0E0E0 0%, #8A95A5 40%, #C0C8D0 60%, #5A6A7A 100%)';

                                    const dateStr = table.created_at ? new Date(table.created_at).toISOString().replace('T', ' ').substring(0, 19) : '2026-02-24 19:00:00';

                                    // Status badge
                                    const statusColors = {
                                        running: { bg: '#31A24C', label: '● LIVE' },
                                        waiting: { bg: '#2374E1', label: '○ OPEN' },
                                        paused: { bg: '#ea580c', label: 'PAUSED' },
                                        closed: { bg: '#666', label: 'CLOSED' },
                                    };
                                    const statusInfo = statusColors[table.status] || statusColors.waiting;

                                    return (
                                        <div key={table.id} style={styles.iconItemWrapper} onClick={() => router.push(`/hub/club-arena/table/${table.id}`)}>
                                            <div style={{ ...styles.pillOuter, background: outerBg }}>
                                                <div style={styles.pillInner}>
                                                    <div style={styles.pushPin}></div>

                                                    {/* Status badge */}
                                                    <div style={{
                                                        position: 'absolute', top: 4, right: 4, zIndex: 5,
                                                        background: statusInfo.bg, color: '#fff',
                                                        fontSize: 8, fontWeight: 800, padding: '2px 6px',
                                                        borderRadius: 4, letterSpacing: 0.3,
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                                    }}>{statusInfo.label}</div>

                                                    {/* Left Graphic */}
                                                    <div style={styles.pillLeftArt}>
                                                        <span style={styles.trophyEmoji}>{typeLabel ? '' : ''}</span>
                                                        <div style={styles.artTextOverlay}>{displayType}</div>
                                                    </div>

                                                    {/* Right Stats */}
                                                    <div style={styles.pillRightStats}>
                                                        <div style={styles.statsTopRow}>
                                                            <div style={styles.buyInStack}>
                                                                <span style={styles.buyInLabel}>Stakes</span>
                                                                <span style={styles.buyInValue}>{stakesLabel}</span>
                                                            </div>
                                                            <div style={styles.maxBadge}>{table.max_players || 9} Max</div>
                                                        </div>

                                                        <div style={styles.statsBottomRow}>
                                                            <div style={styles.statItem}>
                                                                <span style={styles.statIcon}></span>
                                                                {table.action_time_seconds || 30}s
                                                            </div>
                                                            <div style={styles.statItem}>
                                                                <span style={styles.statIcon}></span>
                                                                {table.current_players || 0}/{table.max_players || 9}
                                                            </div>
                                                        </div>

                                                        {/* Mini seat map */}
                                                        <div style={{ display: 'flex', gap: 2, marginTop: 4, justifyContent: 'center' }}>
                                                            {Array.from({ length: table.max_players || 9 }).map((_, si) => {
                                                                const filled = si < (table.current_players || 0);
                                                                return (
                                                                    <div key={si} style={{
                                                                        width: 8, height: 8, borderRadius: '50%',
                                                                        background: filled ? '#31A24C' : 'rgba(255,255,255,0.12)',
                                                                        border: filled ? '1px solid #4caf50' : '1px solid rgba(255,255,255,0.08)',
                                                                        transition: 'all 0.3s',
                                                                    }} />
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Game mode badges */}
                                                        {table.settings && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                                                                {table.settings.bomb_pot_enabled && <span style={styles.modeBadge} title="Bomb Pot"></span>}
                                                                {table.settings.seven_deuce && <span style={styles.modeBadge} title="7-2 Game">7</span>}
                                                                {table.settings.double_board && <span style={styles.modeBadge} title="Double Board">2</span>}
                                                                {table.settings.triple_board && <span style={styles.modeBadge} title="Triple Board">3</span>}
                                                                {table.settings.straddle_enabled && <span style={styles.modeBadge} title="Straddle"></span>}
                                                                {table.settings.run_it_twice && <span style={styles.modeBadge} title="Run It Twice"></span>}
                                                                {table.settings.insurance && <span style={styles.modeBadge} title="Insurance"></span>}
                                                                {table.settings.private_game && <span style={styles.modeBadge} title="Private"></span>}
                                                                {table.settings.anonymous_table && <span style={styles.modeBadge} title="Anonymous"></span>}
                                                                {table.settings.nit_game && <span style={styles.modeBadge} title={`VPIP ${table.settings.maintain_percent}%+`}></span>}
                                                                {table.settings.mixed_game && <span style={styles.modeBadge} title="Mixed Game Rotation"></span>}
                                                                {table.settings.cap && <span style={styles.modeBadge} title={`Cap ${table.settings.cap_amount}`}></span>}
                                                                {table.settings.no_rathole && <span style={styles.modeBadge} title="No Rathole"></span>}
                                                                {table.settings.pineapple && <span style={styles.modeBadge} title="Pineapple"></span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Bottom Ribbon */}
                                                <div style={styles.ribbonWrapper}>
                                                    <div style={styles.ribbonBody}>
                                                        <span style={styles.ribbonIcon}></span>
                                                        <span style={styles.ribbonText}>{table.name}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Date Box Below */}
                                            <div style={styles.dateBox}>{dateStr}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {filteredTables.length === 0 && !(membership?.role === 'owner' || membership?.role === 'admin') && (
                                <div style={styles.emptyState}>
                                    <p>No Active Tables</p>
                                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Check Back Later Or Start A New Table!</p>
                                </div>
                            )}

                        </>
                    )}
                </div>

                {/* ═══ UNIFIED CREATE GAME MODAL — Regular/SNG/MTT (PokerBros-complete) ═══ */}
                {showCreateGame && (
                    <CreateGameModal
                        club={club}
                        onClose={() => setShowCreateGame(null)}
                        onCreated={handleGameCreated}
                        apiCall={apiCall}
                        initialTab={showCreateGame?.tab}
                        initialVariant={showCreateGame?.variant}
                    />
                )}

                {/* ═══ BAD BEAT JACKPOT MODAL ═══ */}
                {showBBJ && bbjData && (
                    <BBJModal data={bbjData} onClose={() => setShowBBJ(false)} />
                )}

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={user}
                    showProfile={true}
                    {...getMenuConfig('club-arena', user, {}, {})}
                />
            </div>
        </>
    );
}

// Facebook Dark Color Scheme
const FB = {
    primary: '#2374E1',
    primaryDark: '#1A5DC8',
    primaryLight: '#263951',
    background: '#18191A',
    cardBg: '#242526',
    textPrimary: '#E4E6EB',
    textSecondary: '#B0B3B8',
    textMuted: '#8A8D91',
    border: '#3E4042',
    borderLight: '#3A3B3C',
    success: '#31A24C',
    error: '#FA383E',
    hover: '#3A3B3C',
};

const styles = {
    page: {
        minHeight: '100vh',
        background: FB.background,
        paddingBottom: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    container: {
        padding: '16px 20px 40px',
        maxWidth: '600px',
        margin: '0 auto',
    },
    backBtn: {
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        color: FB.primary,
        padding: '8px 16px',
        borderRadius: '6px',
        cursor: 'pointer',
        marginBottom: '16px',
        fontSize: '14px',
        fontWeight: 600,
    },
    loading: {
        textAlign: 'center',
        padding: '60px 0',
        color: FB.textSecondary,
        fontSize: '15px',
    },
    error: {
        textAlign: 'center',
        padding: '40px 20px',
        background: '#3B2020',
        border: `1px solid ${FB.error}`,
        borderRadius: '8px',
    },
    primaryBtn: {
        marginTop: '16px',
        padding: '12px 24px',
        background: FB.primary,
        border: 'none',
        borderRadius: '6px',
        fontSize: '15px',
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
    },
    clubCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px',
        borderRadius: '8px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        marginBottom: '16px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
    clubAvatar: {
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: FB.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    clubLogo: {
        fontSize: '28px',
        color: '#fff',
    },
    clubInfo: {
        flex: 1,
    },
    clubName: {
        fontSize: '18px',
        fontWeight: 700,
        color: FB.textPrimary,
        margin: 0,
    },
    clubMeta: {
        display: 'flex',
        gap: '12px',
        marginTop: '4px',
        fontSize: '13px',
    },
    clubId: {
        color: FB.textSecondary,
    },
    memberCount: {
        color: FB.primary,
    },
    clubBalance: {
        textAlign: 'right',
    },
    balanceRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    chipIcon: {
        fontSize: '16px',
    },
    balanceAmount: {
        fontSize: '16px',
        fontWeight: 700,
        color: FB.textPrimary,
    },
    addBtn: {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: 'none',
        background: FB.primary,
        color: '#fff',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
    },
    descriptionCard: {
        padding: '12px 16px',
        borderRadius: '8px',
        background: FB.cardBg,
        border: `1px solid ${FB.borderLight}`,
        marginBottom: '16px',
    },
    descriptionText: {
        color: FB.textSecondary,
        fontSize: '14px',
        lineHeight: '1.5',
        margin: 0,
    },
    filterTabs: {
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        marginBottom: '16px',
        paddingBottom: '4px',
    },
    filterTab: {
        padding: '8px 16px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        borderRadius: '20px',
        color: FB.textSecondary,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    /* ═══ POKERBROS PILL-ICON GRID ═══ */
    iconGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px 16px',
        marginBottom: '20px',
    },
    iconItemWrapper: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        marginBottom: '10px',
    },
    /* Pill Container */
    pillOuter: {
        width: '100%',
        height: '96px',
        borderRadius: '48px',
        padding: '3px',
        position: 'relative',
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
        transition: 'transform 0.1s ease',
    },
    pillInner: {
        width: '100%',
        height: '100%',
        borderRadius: '45px',
        background: 'radial-gradient(ellipse at right, #2a2a2a 0%, #000 100%)',
        position: 'relative',
        display: 'flex',
        overflow: 'hidden',
    },
    pushPin: {
        position: 'absolute',
        top: '-2px',
        right: '18px',
        fontSize: '18px',
        zIndex: 5,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        transform: 'rotate(15deg)',
    },
    /* Left Art */
    pillLeftArt: {
        width: '45%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trophyEmoji: {
        fontSize: '50px',
        position: 'absolute',
        left: '-5px',
        top: '5px',
        filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.8))',
    },
    artTextOverlay: {
        position: 'absolute',
        bottom: '8px',
        left: '10px',
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: '900',
        fontSize: '13px',
        color: '#fff',
        textShadow: '2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000',
        transform: 'skewX(-10deg)',
        letterSpacing: '0.5px',
    },
    /* Right Stats */
    pillRightStats: {
        width: '55%',
        height: '100%',
        padding: '8px 12px 0 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
    },
    statsTopRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    buyInStack: {
        display: 'flex',
        flexDirection: 'column',
        lineHeight: '1',
    },
    buyInLabel: {
        fontSize: '9px',
        color: '#ccc',
        marginBottom: '2px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    buyInValue: {
        fontSize: '20px',
        fontWeight: '900',
        fontFamily: 'Orbitron, sans-serif',
        color: '#fff',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
    },
    maxBadge: {
        fontSize: '12px',
        fontWeight: '800',
        fontFamily: 'Orbitron, sans-serif',
        color: '#F8B036',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    },
    statsBottomRow: {
        display: 'flex',
        flexDirection: 'column',
        marginTop: '6px',
        gap: '4px',
    },
    statItem: {
        fontSize: '11px',
        color: '#ccc',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    },
    statIcon: {
        fontSize: '10px',
    },
    modeBadge: {
        fontSize: '10px',
        cursor: 'default',
    },
    /* Bottom Ribbon */
    ribbonWrapper: {
        position: 'absolute',
        bottom: '-10px',
        left: '15px',
        right: '15px',
        zIndex: 10,
        filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.5))',
    },
    ribbonBody: {
        background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.85) 15%, rgba(0,0,0,0.85) 85%, transparent 100%)',
        padding: '2px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        borderBottom: '1px solid rgba(91,192,222,0.3)',
    },
    ribbonIcon: {
        fontSize: '10px',
        color: '#5BC0DE',
    },
    ribbonText: {
        fontSize: '10px',
        fontWeight: 'bold',
        color: '#5BC0DE',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    /* Date Box */
    dateBox: {
        marginTop: '12px',
        background: 'rgba(0,0,0,0.5)',
        borderRadius: '6px',
        padding: '3px 12px',
        fontSize: '10px',
        color: '#888',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
    },
    /* Create Table Specifics */
    createPlus: {
        fontSize: '48px',
        color: '#666',
        fontWeight: '300',
        textShadow: '0 1px 1px rgba(255,255,255,0.1), inset 0 1px 3px rgba(0,0,0,0.5)',
    },
    newBadgeWrapper: {
        position: 'absolute',
        left: '-12px',
        top: '-12px',
        zIndex: 20,
        transform: 'rotate(-10deg)',
        filter: 'drop-shadow(0 5px 8px rgba(0,0,0,0.6))',
    },
    newBadgeCoin: {
        width: '64px',
        height: '24px',
        background: '#222',
        borderRadius: '12px',
        border: '2px solid #555',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    newBadgeText: {
        position: 'absolute',
        bottom: '3px',
        left: '2px',
        fontSize: '26px',
        fontWeight: '900',
        fontFamily: 'Inter, sans-serif',
        color: '#ddd',
        letterSpacing: '-1px',
        textShadow: '0 1px 0 #aaa, 0 2px 0 #999, 0 3px 0 #888, 0 4px 0 #777, 0 5px 0 #666, 0 6px 1px rgba(0,0,0,.1), 0 0 5px rgba(0,0,0,.1), 0 1px 3px rgba(0,0,0,.3), 0 3px 5px rgba(0,0,0,.2), 0 5px 10px rgba(0,0,0,.25), 0 10px 10px rgba(0,0,0,.2)',
    },
    createLabelWrapper: {
        position: 'absolute',
        bottom: '-12px',
        left: '20px',
        right: '20px',
        zIndex: 15,
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
    },
    createLabelBox: {
        background: 'linear-gradient(to bottom, #333, #111)',
        padding: '4px 10px',
        fontSize: '11px',
        color: '#aaa',
        textAlign: 'center',
        clipPath: 'polygon(5% 0, 95% 0, 100% 100%, 0% 100%)',
        borderBottom: '1px solid #444',
    },
    emptyState: {
        textAlign: 'center',
        padding: '40px 20px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        borderRadius: '8px',
        color: FB.textSecondary,
        fontSize: '15px',
        marginBottom: '20px',
        gridColumn: '1 / -1',
    },
    quickActions: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '10px',
    },
    actionBtn: {
        padding: '12px 8px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        borderRadius: '8px',
        color: FB.textPrimary,
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'center',
    },
    bottomNav: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: FB.cardBg,
        borderTop: `1px solid ${FB.border}`,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)',
    },
    bottomNavItems: {
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        padding: '6px 0',
    },
    bottomNavItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        flex: 1,
        padding: '8px 4px',
        textDecoration: 'none',
        color: FB.textSecondary,
        transition: 'all 0.2s ease',
        borderRadius: '8px',
        margin: '0 4px',
    },
    bottomNavIcon: {
        width: '24px',
        height: '24px',
        transition: 'all 0.2s ease',
    },
    bottomNavLabel: {
        fontSize: '11px',
        fontWeight: 600,
    },
    // Filter Tab Active State
    filterTabActive: {
        background: FB.primaryLight,
        color: FB.primary,
        border: `1px solid ${FB.primary}`,
    },
    // Hero Actions (Quick Actions bar)
    heroActions: {
        display: 'flex',
        gap: '10px',
        marginBottom: '20px',
    },
    heroActionBtn: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '14px 8px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    heroActionPrimary: {
        background: FB.primaryLight,
        border: `1px solid ${FB.primary}`,
    },
    heroActionIcon: {
        fontSize: '20px',
    },
    heroActionLabel: {
        fontSize: '12px',
        fontWeight: 600,
        color: FB.textPrimary,
    },
    // Modal Styles
    modalOverlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(255, 255, 255, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 2000,
    },
    modalContent: {
        width: '100%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflow: 'auto',
        background: FB.cardBg,
        borderRadius: '8px',
        border: `1px solid ${FB.border}`,
        boxShadow: '0 12px 28px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    modalHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: `1px solid ${FB.borderLight}`,
    },
    modalTitle: {
        fontSize: '20px',
        fontWeight: 700,
        color: FB.textPrimary,
        margin: 0,
    },
    modalClose: {
        width: '36px',
        height: '36px',
        border: 'none',
        background: FB.hover,
        color: FB.textSecondary,
        borderRadius: '50%',
        fontSize: '18px',
        cursor: 'pointer',
    },
    modalBody: {
        padding: '16px 20px',
    },
    modalFooter: {
        display: 'flex',
        gap: '12px',
        padding: '16px 20px',
        borderTop: `1px solid ${FB.borderLight}`,
    },
    // Form Styles
    formGroup: {
        marginBottom: '16px',
    },
    formRow: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
    },
    formLabel: {
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: FB.textPrimary,
        marginBottom: '6px',
    },
    formInput: {
        width: '100%',
        padding: '12px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        borderRadius: '6px',
        color: FB.textPrimary,
        fontSize: '15px',
        outline: 'none',
        boxSizing: 'border-box',
    },
    formSelect: {
        width: '100%',
        padding: '12px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        borderRadius: '6px',
        color: FB.textPrimary,
        fontSize: '15px',
        outline: 'none',
        boxSizing: 'border-box',
    },
    settingsGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: FB.textPrimary,
        cursor: 'pointer',
    },
    modalBtnGhost: {
        flex: 1,
        padding: '12px 16px',
        background: FB.hover,
        border: 'none',
        borderRadius: '6px',
        color: FB.textPrimary,
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    modalBtnPrimary: {
        flex: 1,
        padding: '12px 16px',
        background: FB.primary,
        border: 'none',
        borderRadius: '6px',
        color: '#fff',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
    },
};
