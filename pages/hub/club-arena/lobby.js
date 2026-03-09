/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Club Lobby (Club Detail View)
   Shows club info, tables, tournaments, and club navigation
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import SEOHead from '../../../src/components/seo/SEOHead';
import { usePersistedFilters } from '../../../src/hooks/usePersistedFilters';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import CreateGameModal from '../../../src/components/club-arena/CreateGameModal';
import { BBJBanner, BBJModal, useBBJ } from '../../../src/components/club-arena/BBJDisplay';
import useDebounce from '../../../src/hooks/useDebounce';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import { buildStickerAssetMap } from '../../../src/lib/stickerOrchestrator';
import useWalletData from '../../../src/hooks/useWalletData';

// Dynamic imports — GameCard + DynamicWallet use browser APIs, must be client-only
const GameCard = dynamic(
    () => import('../../../src/components/club-arena/GameCard'),
    { ssr: false, loading: () => null }
);
const DynamicWallet = dynamic(
    () => import('../../../src/components/club-arena/DynamicWallet'),
    { ssr: false, loading: () => null }
);

const getAuthToken = async () => {
    // 1. Fast path: read from localStorage cache (instant, no network round-trip)
    try {
        const cached = localStorage.getItem('smarter-poker-auth');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.access_token) return parsed.access_token;
        }
    } catch (_) { /* localStorage unavailable */ }

    // 2. Slow path: ask Supabase (handles token refresh)
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
        useTrainingBus('club-arena-lobby');

const router = useRouter();
    const clubIdParam = router.query?.club || null;

    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [tables, setTables] = useState([]);
    const [tournaments, setTournaments] = useState([]);
    const [stickerAssetMap, setStickerAssetMap] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const { filters: _lobbyFilters, setFilter: _setLobbyFilter } = usePersistedFilters('club-arena-lobby', { activeFilter: 'ALL', sortBy: 'players' });
    const [activeFilter, setActiveFilter] = useState(_lobbyFilters.activeFilter);
    const [chipBalance, setChipBalance] = useState(0);
    const [membership, setMembership] = useState(null);
    const [showCreateGame, setShowCreateGame] = useState(null); // null | { tab?, variant? }
    const [creatingTable, setCreatingTable] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [newDescription, setNewDescription] = useState('');
    const [announcements, setAnnouncements] = useState([]);
    const [showWallet, setShowWallet] = useState(false);

    // Real-time wallet data (diamonds, BBJ, chips, agent, promo)
    const walletData = useWalletData({ supabase, userId: user?.id, clubId: club?.id });
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [sortBy, setSortBy] = useState(_lobbyFilters.sortBy); // players | stakes | name
    // Sync filter changes to localStorage
    useEffect(() => { _setLobbyFilter('activeFilter', activeFilter); }, [activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { _setLobbyFilter('sortBy', sortBy); }, [sortBy]); // eslint-disable-line react-hooks/exhaustive-deps
    const [showBBJ, setShowBBJ] = useState(false);

    // Auto-open BBJ modal when navigated with #bbj hash
    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hash === '#bbj') {
            setShowBBJ(true);
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }, []);

    const [toast, setToast] = useState(null); // { msg, type }
    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // BBJ pool data (realtime)
    const { bbjData, loading: bbjLoading } = useBBJ(club?.id, supabase);

    // Load sticker asset map once on mount (one-shot, very cheap)
    useEffect(() => {
        (async () => {
            try {
                const token = await getAuthToken();
                if (!token) return;
                const res = await fetch('/api/club-arena/sticker-assets', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const d = await res.json();
                setStickerAssetMap(buildStickerAssetMap(d.stickers || []));
            } catch (_) { /* stickers optional — fail silently */ }
        })();
    }, []);

    // Filter tables by game type, search, and sort
    const filteredTables = tables.filter(table => {
        // Exclude closed/deleted tables (belt-and-suspenders with DB filter)
        if (table.status === 'closed' || table.status === 'deleted') return false;
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
            
            showToast('Failed to update description.', 'error');
        }
    }

    // Handler: game/table/tournament created callback
    function handleGameCreated(result) {
        // Hoist table extraction so it's available throughout the function
        const table = result?.table || result;
        const isCash = table?.game_type === 'cash' || (!table?.type && !table?.game_type?.includes('tournament'));
        const isTournament = table?.game_type === 'tournament' || table?.game_type === 'mtt'
            || table?.game_type === 'sng' || table?.type === 'tournament';

        if (table?.id) {
            if (isCash) {
                setTables(prev => [...prev, table]);
            } else if (isTournament) {
                // Optimistically add new tournament to the lobby section
                setTournaments(prev => [{ ...table, game_type: table.game_type || 'mtt' }, ...prev]);
            }
        }

        setShowCreateGame(null);
        showToast('Created successfully!');

        if (isCash) {
            busEmit.tableOpened(table?.name || 'New Table', table?.game_type || 'NLH');
        } else {
            busEmit.dataMutated('tournament_created');
        }
    }

    // ─── Bus Listeners ──────────────────────────────────────────────────────
    // Listen for mutations from OTHER club-arena pages (tournaments.js, agent-dashboard, etc.)
    // and keep lobby state in sync without full page reload.
    useEffect(() => {
        if (!club?.id) return;

        // Refresh tournament list when a tournament is created/started elsewhere
        const unsubMutated = eventBus.on(EventType.DATA_MUTATED, async (event) => {
            const triggerEntities = ['tournament_created', 'tournament_started', 'tournament_cancelled'];
            if (!triggerEntities.includes(event?.entity)) return;
            try {
                const token = await getAuthToken().catch(() => null);
                if (!token) return;
                const res = await fetch('/api/club-arena/tournaments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        action: 'list',
                        clubId: club.id,
                        status: ['scheduled', 'registering', 'running'],
                    }),
                });
                if (res.ok) {
                    const d = await res.json();
                    setTournaments(d.tournaments || d.data || []);
                }
            } catch (_) { /* silent — realtime subscription is primary */ }
        });

        // When a new table is announced via bus (e.g. from admin creating one),
        // append it if it's for this club and not already in state.
        const unsubTableOpened = eventBus.on(EventType.TABLE_OPENED, () => {
            // Realtime postgres_changes already handles this — bus signal triggers a soft refresh
            // of table counts by re-querying only id+current_players+status (cheap).
            supabase
                .from('tables')
                .select('*')
                .eq('club_id', club.id)
                .neq('status', 'deleted')
                .neq('status', 'closed')
                .limit(100)
                .then(({ data }) => {
                    if (data?.length) setTables(data);
                });
        });

        // When tournament starts, move it to running state in lobby display
        const unsubTournStart = eventBus.on(EventType.TOURNAMENT_STARTED, () => {
            setTournaments(prev =>
                prev.map(t => t.status === 'registering' ? { ...t, status: 'running' } : t)
            );
        });

        return () => {
            unsubMutated();
            unsubTableOpened();
            unsubTournStart();
        };
    }, [club?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Trigger initial data load when club param is available
    useEffect(() => {
        if (clubIdParam) loadClubData();
    }, [clubIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

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
                // Supabase v2 uses 'event' not 'eventType' for postgres_changes
                const eventType = payload.event || payload.eventType;
                if (eventType === 'INSERT') {
                    setTables(prev => [...prev, payload.new]);
                } else if (eventType === 'UPDATE') {
                    setTables(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t));
                } else if (eventType === 'DELETE') {
                    setTables(prev => prev.filter(t => t.id !== payload.old.id));
                }
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'club_tournaments',
                filter: `club_id=eq.${club.id}`,
            }, () => { loadClubData(); })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'club_announcements',
                filter: `club_id=eq.${club.id}`,
            }, () => {
                // Re-fetch announcements live — new announcements appear without refresh
                apiGet(`/api/club-arena/announcements?clubId=${club.id}`)
                    .then(d => setAnnouncements(d.announcements || []))
                    .catch(() => { });
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });

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
                    .neq('status', 'closed')
                    .limit(100) // lobby tables;
                if (data) {
                    setTables(prev => prev.map(t => {
                        const fresh = data.find(d => d.id === t.id);
                        return fresh ? { ...t, current_players: fresh.current_players, status: fresh.status } : t;
                    }).filter(t => {
                        const fresh = data.find(d => d.id === t.id);
                        return fresh && fresh.status !== 'deleted' && fresh.status !== 'closed';
                    }));
                }
            } catch (_) { }
        }, 15000); // 15s polling fallback — safety net if Realtime channel drops

        return () => {
            supabase.removeChannel(channel);
            clearInterval(poll);
        };
    }, [club?.id]);

    // TIER 2 REALTIME: Cross-tab sync for chip balance changes
    useEffect(() => {
        if (!club?.id || !user?.id) return;

        let memberChannel = null;
        let chipBc = null;

        try {
            // Subscribe to club_members changes for this user's chip balance
            memberChannel = supabase
                .channel(`lobby-member-${club.id}-${user.id}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'club_members',
                    filter: `club_id=eq.${club.id}`,
                }, (payload) => {
                    if (payload.new?.user_id === user.id) {
                        setChipBalance(payload.new.chip_balance || 0);
                    }
                })
                .subscribe();

            // Cross-tab sync listener
            chipBc = new BroadcastChannel('smarter_poker_chips_sync');
            chipBc.onmessage = (event) => {
                if (event.data === 'refresh') {
                    
                    loadClubData();
                }
            };
        } catch (e) {
        }

        return () => {
            if (memberChannel) supabase.removeChannel(memberChannel);
            if (chipBc) {
                try { chipBc.close(); } catch (e) { }
            }
        };
    }, [club?.id, user?.id]);

    async function loadClubData() {
        setIsLoading(true);
        try {
            // Load user (Supabase session only)
            const authUser = getAuthUser();
            if (authUser) setUser(authUser);

            // Load club by club_id
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
            const { data: clubData } = await supabase
                .from('clubs')
                .select('*')
                .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                .maybeSingle();

            if (clubData) {
                setClub(clubData);

                // Parallelize: tables + tournaments + announcements + membership all fire at once
                const [tableResult, tournResult, annResult, memberResult] = await Promise.allSettled([
                    supabase.from('tables').select('*').eq('club_id', clubData.id).neq('status', 'deleted').neq('status', 'closed').limit(100),
                    (async () => {
                        const token = await getAuthToken().catch(() => null);
                        if (!token) return { tournaments: [] };
                        const res = await fetch('/api/club-arena/tournaments', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ action: 'list', clubId: clubData.id, status: ['scheduled', 'registering', 'running'] }),
                        });
                        return res.ok ? res.json() : { tournaments: [] };
                    })(),
                    apiGet(`/api/club-arena/announcements?clubId=${clubData.id}`).catch(() => ({})),
                    authUser
                        ? supabase.from('club_members').select('chip_balance, role').eq('club_id', clubData.id).eq('user_id', authUser.id).maybeSingle()
                        : Promise.resolve(null),
                ]);

                if (tableResult.status === 'fulfilled') setTables(tableResult.value?.data || []);
                if (tournResult.status === 'fulfilled') setTournaments(tournResult.value?.tournaments || tournResult.value?.data || []);
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
                                        <span style={styles.balanceAmount}>{(walletData.chipBalance || chipBalance).toLocaleString()}</span>
                                        <button style={{ ...styles.addBtn, background: '#2374E1' }} onClick={() => setShowWallet(prev => !prev)} title="Open Wallet">💰</button>
                                        <button style={styles.addBtn} onClick={() => router.push(`/hub/club-arena/cashier?club=${club.club_id}`)}>+</button>
                                    </div>
                                </div>
                            </div>

                            {/* ═══ DYNAMIC WALLET PANEL ═══ */}
                            {showWallet && (
                                <div style={{
                                    display: 'flex', justifyContent: 'center', padding: '8px 0 4px',
                                    animation: 'fadeInDown 0.3s ease-out',
                                }}>
                                    <DynamicWallet
                                        {...walletData}
                                        chipBalance={walletData.chipBalance || chipBalance}
                                        onOpenBBJ={() => setShowBBJ(true)}
                                        onBuyDiamonds={() => router.push('/hub/diamond-store')}
                                        onTapSlot={(slot) => {
                                            if (slot === 'chips' || slot === 'promo') router.push(`/hub/club-arena/cashier?club=${club.club_id}`);
                                            if (slot === 'clubBank') router.push(`/hub/club-arena/admin?club=${club.club_id}`);
                                            if (slot === 'agent') router.push(`/hub/club-arena/agent-dashboard?club=${club.club_id}`);
                                        }}
                                    />
                                </div>
                            )}

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

                            {/* Game Summary Bar */}
                            {tables.length > 0 && (
                                <div style={{
                                    display: 'flex', gap: 16, padding: '8px 0 4px',
                                    fontSize: 11, color: '#B0B3B8', fontWeight: 600,
                                }}>
                                    <span>{filteredTables.length} Table{filteredTables.length !== 1 ? 's' : ''}</span>
                                    <span>{filteredTables.reduce((s, t) => s + (t.current_players || 0), 0)} Player{filteredTables.reduce((s, t) => s + (t.current_players || 0), 0) !== 1 ? 's' : ''}</span>
                                    {filteredTables.some(t => t.status === 'running' || t.status === 'active') && (
                                        <span style={{ color: '#00E676' }}>
                                            {filteredTables.filter(t => t.status === 'running' || t.status === 'active').length} Live
                                        </span>
                                    )}
                                </div>
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

                                {/* ── CASH GAME CARDS (GameCard 2-col grid) ── */}
                                {filteredTables.length > 0 && (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: 10,
                                        marginBottom: 16,
                                    }}>
                                        {filteredTables.map(table => (
                                            <GameCard
                                                key={table.id}
                                                game={table}
                                                assetMap={stickerAssetMap}
                                                onPress={() => router.push(`/hub/club-arena/table/${table.id}`)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {filteredTables.length === 0 && !(membership?.role === 'owner' || membership?.role === 'admin') && (
                                <div style={styles.emptyState}>
                                    <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.6 }}>🃏</div>
                                    <p style={{ fontSize: 15, fontWeight: 700, color: '#E4E6EB', marginBottom: 4 }}>No Active Tables</p>
                                    {(membership?.role === 'owner' || membership?.role === 'admin') ? (
                                        <div style={{ textAlign: 'center' }}>
                                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                                                Create a cash game or tournament to get started!
                                            </p>
                                            <button
                                                onClick={() => setShowCreateGame({})}
                                                style={{
                                                    background: 'linear-gradient(135deg, #2374E1, #1a5bb8)',
                                                    color: '#fff', border: 'none', borderRadius: 10,
                                                    padding: '10px 24px', fontSize: 13, fontWeight: 700,
                                                    cursor: 'pointer', boxShadow: '0 4px 15px rgba(35,116,225,0.3)',
                                                }}
                                            >
                                                + Create Table
                                            </button>
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                                            Check back later — the club owner hasn&apos;t started any games yet.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* ── UPCOMING TOURNAMENTS (GameCard 2-col grid) ── */}
                            {tournaments.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <div style={{ fontSize: 13, fontWeight: 800, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            🏆 Tournaments
                                        </div>
                                        {club && (
                                            <button
                                                onClick={() => router.push(`/hub/club-arena/tournaments?club=${club.id}`)}
                                                style={{
                                                    fontSize: 12, fontWeight: 600, color: '#2374E1',
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                }}
                                            >
                                                See All →
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        {tournaments.slice(0, 6).map(t => (
                                            <GameCard
                                                key={t.id}
                                                game={{ ...t, game_type: t.type || t.game_type || 'mtt' }}
                                                assetMap={stickerAssetMap}
                                                onPress={() => router.push(`/hub/club-arena/tournaments?club=${club?.id}&highlight=${t.id}`)}
                                            />
                                        ))}
                                    </div>
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

// SmarterPoker Dark Color Scheme
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
