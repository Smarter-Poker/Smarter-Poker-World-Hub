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
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';

export default function ClubLobby() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;

    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [tables, setTables] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeFilter, setActiveFilter] = useState('ALL');
    const [chipBalance, setChipBalance] = useState(0);
    const [membership, setMembership] = useState(null);
    const [showCreateTable, setShowCreateTable] = useState(false);
    const [creatingTable, setCreatingTable] = useState(false);
    const [newTable, setNewTable] = useState({
        name: '',
        variant: 'nlh',
        maxPlayers: '9',
        smallBlind: '1',
        bigBlind: '2',
        straddle: true,
        runItTwice: true,
        bombPots: false,
        autoMuck: true
    });

    // Filter tables by game type
    const filteredTables = tables.filter(table => {
        if (activeFilter === 'ALL') return true;
        if (activeFilter === 'nlh') return table.game_variant === 'nlh' || table.game_variant === 'short_deck';
        if (activeFilter === 'plo') return table.game_variant?.startsWith('plo');
        if (activeFilter === 'tournament') return table.table_type === 'tournament';
        if (activeFilter === 'sng') return table.table_type === 'sng';
        return true;
    });

    // Handler for creating a new table
    async function handleCreateTable() {
        if (!club) return;
        // Only admins/owners can create tables
        if (membership?.role !== 'owner' && membership?.role !== 'admin') {
            alert('Only admins and owners can create tables.');
            return;
        }
        setCreatingTable(true);
        try {
            const { data, error } = await supabase
                .from('tables')
                .insert({
                    club_id: club.id,
                    name: newTable.name || `New ${newTable.variant.toUpperCase()} Table`,
                    game_type: 'cash',
                    game_variant: newTable.variant,
                    stakes: `${parseFloat(newTable.smallBlind)}/${parseFloat(newTable.bigBlind)}`,
                    max_players: parseInt(newTable.maxPlayers),
                    small_blind: parseFloat(newTable.smallBlind),
                    big_blind: parseFloat(newTable.bigBlind),
                    min_buy_in: parseFloat(newTable.bigBlind) * 40,
                    max_buy_in: parseFloat(newTable.bigBlind) * 200,
                    current_players: 0,
                    status: 'waiting',
                    settings: {
                        straddle_enabled: newTable.straddle,
                        run_it_twice: newTable.runItTwice,
                        bomb_pot_enabled: newTable.bombPots,
                        auto_muck: newTable.autoMuck
                    }
                })
                .select()
                .single();

            if (error) throw error;

            // Add to table list and close modal
            setTables(prev => [...prev, data]);
            setShowCreateTable(false);
            setNewTable({
                name: '',
                variant: 'nlh',
                maxPlayers: '9',
                smallBlind: '1',
                bigBlind: '2',
                straddle: true,
                runItTwice: true,
                bombPots: false,
                autoMuck: true
            });
            alert('Table created successfully!');
        } catch (err) {
            console.error('Failed to create table:', err);
            alert('Failed to create table: ' + err.message);
        } finally {
            setCreatingTable(false);
        }
    }

    useEffect(() => {
        if (clubIdParam) loadClubData();
    }, [clubIdParam]);

    async function loadClubData() {
        setIsLoading(true);
        try {
            // Load user
            let authUser = null;
            if (typeof window !== 'undefined') {
                const explicitAuth = localStorage.getItem('smarter-poker-auth');
                if (explicitAuth) authUser = JSON.parse(explicitAuth)?.user || null;
                if (!authUser) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) authUser = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user || null;
                }
            }
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

                // Load club tables
                const { data: tableData } = await supabase
                    .from('tables')
                    .select('*')
                    .eq('club_id', clubData.id)
                    .neq('status', 'deleted');
                setTables(tableData || []);

                // Load membership & chip balance
                if (authUser) {
                    const { data: memberData } = await supabase
                        .from('club_members')
                        .select('chip_balance, role')
                        .eq('club_id', clubData.id)
                        .eq('user_id', authUser.id)
                        .maybeSingle();
                    if (memberData) {
                        setMembership(memberData);
                        setChipBalance(memberData.chip_balance || 0);
                    }
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
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

            <div style={styles.page}>
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />

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
                                    <span style={styles.clubLogo}>♠</span>
                                </div>
                                <div style={styles.clubInfo}>
                                    <h2 style={styles.clubName}>{club.name}</h2>
                                    <div style={styles.clubMeta}>
                                        <span style={styles.clubId}>ID: {club.club_id}</span>
                                        <span style={styles.memberCount}>{club.member_count || 0} Members</span>
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
                            {club.description && (
                                <div style={styles.descriptionCard}>
                                    <p style={styles.descriptionText}>{club.description}</p>
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

                            {/* Quick Actions */}
                            <div style={styles.heroActions}>
                                <button
                                    style={styles.heroActionBtn}
                                    onClick={() => router.push('/hub/club-arena')}
                                >
                                    <span style={styles.heroActionLabel}>My Clubs</span>
                                </button>
                                <button
                                    style={{ ...styles.heroActionBtn, ...styles.heroActionPrimary }}
                                    onClick={() => setShowCreateTable(true)}
                                >
                                    <span style={styles.heroActionLabel}>Create Table</span>
                                </button>
                                <button
                                    style={styles.heroActionBtn}
                                    onClick={() => {
                                        const openTable = filteredTables.find(t => (t.current_players || 0) < (t.max_players || 9));
                                        if (openTable) {
                                            router.push(`/hub/club-arena/table?table=${openTable.id}&club=${club.club_id}`);
                                        } else if (filteredTables.length > 0) {
                                            alert('All tables are full. Try joining a waitlist or create a new table.');
                                        } else {
                                            alert('No tables available. Create one!');
                                        }
                                    }}
                                >
                                    <span style={styles.heroActionLabel}>Quick Seat</span>
                                </button>
                            </div>

                            {/* Tables Section */}
                            <h2 style={styles.sectionTitle}>ACTIVE TABLES</h2>
                            {filteredTables.length > 0 ? (
                                <div style={styles.tableGrid}>
                                    {filteredTables.map(table => (
                                        <div key={table.id} style={styles.tableCard}>
                                            <div style={styles.tableHeader}>
                                                <span style={styles.seatsBadge}>{table.max_players || 9} Max</span>
                                            </div>
                                            <div style={styles.tableBody}>
                                                <h3 style={styles.tableName}>{table.name}</h3>
                                                <div style={styles.tableStakes}>{table.stakes || '1/2'}</div>
                                                <div style={styles.playersCount}>
                                                    {table.current_players || 0}/{table.max_players || 9} players
                                                </div>
                                            </div>
                                            <button style={styles.joinBtn} onClick={() => router.push(`/hub/club-arena/table?table=${table.id}&club=${club.club_id}`)}>JOIN TABLE</button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={styles.emptyState}>
                                    <p>No Active Tables</p>
                                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Check Back Later Or Start A New Table!</p>
                                    <button
                                        style={{ ...styles.primaryBtn, marginTop: '16px' }}
                                        onClick={() => setShowCreateTable(true)}
                                    >
                                        Create Table
                                    </button>
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div style={styles.quickActions}>
                                <button style={styles.actionBtn} onClick={() => router.push(`/hub/club-arena/cashier?club=${club.club_id}`)}>
                                    Cashier
                                </button>
                                <button style={styles.actionBtn} onClick={() => router.push(`/hub/club-arena/leaderboard?club=${club.club_id}`)}>
                                    Leaderboard
                                </button>
                                <button style={styles.actionBtn} onClick={() => router.push(`/hub/club-arena/hand-histories?club=${club.club_id}`)}>
                                    Hands
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Create Table Modal */}
                {showCreateTable && (
                    <div style={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowCreateTable(false)}>
                        <div style={styles.modalContent}>
                            <div style={styles.modalHeader}>
                                <h2 style={styles.modalTitle}>Create New Table</h2>
                                <button style={styles.modalClose} onClick={() => setShowCreateTable(false)}>✕</button>
                            </div>
                            <div style={styles.modalBody}>
                                <div style={styles.formGroup}>
                                    <label style={styles.formLabel}>Table Name</label>
                                    <input
                                        style={styles.formInput}
                                        type="text"
                                        placeholder="e.g. Friday Night High Stakes"
                                        value={newTable.name}
                                        onChange={e => setNewTable({ ...newTable, name: e.target.value })}
                                    />
                                </div>

                                <div style={styles.formRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}>Game Type</label>
                                        <select
                                            style={styles.formSelect}
                                            value={newTable.variant}
                                            onChange={e => setNewTable({ ...newTable, variant: e.target.value })}
                                        >
                                            <option value="nlh">No Limit Hold'em</option>
                                            <option value="plo4">PLO (4-Card)</option>
                                            <option value="plo5">PLO 5-Card</option>
                                            <option value="plo6">PLO 6-Card</option>
                                            <option value="plo8">PLO Hi/Lo (8-or-Better)</option>
                                            <option value="short_deck">Short Deck (6+)</option>
                                            <option value="ofc">Open Face Chinese</option>
                                        </select>
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}>Players</label>
                                        <select
                                            style={styles.formSelect}
                                            value={newTable.maxPlayers}
                                            onChange={e => setNewTable({ ...newTable, maxPlayers: e.target.value })}
                                        >
                                            <option value="2">Heads Up (2)</option>
                                            <option value="6">6-Max</option>
                                            <option value="9">Full Ring (9)</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={styles.formRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}>Small Blind ($)</label>
                                        <input
                                            style={styles.formInput}
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={newTable.smallBlind}
                                            onChange={e => setNewTable({ ...newTable, smallBlind: e.target.value })}
                                        />
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.formLabel}>Big Blind ($)</label>
                                        <input
                                            style={styles.formInput}
                                            type="number"
                                            min="0.02"
                                            step="0.01"
                                            value={newTable.bigBlind}
                                            onChange={e => setNewTable({ ...newTable, bigBlind: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.formLabel}>Table Options</label>
                                    <div style={styles.settingsGrid}>
                                        <label style={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={newTable.straddle}
                                                onChange={e => setNewTable({ ...newTable, straddle: e.target.checked })}
                                            />
                                            Enable Straddle
                                        </label>
                                        <label style={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={newTable.runItTwice}
                                                onChange={e => setNewTable({ ...newTable, runItTwice: e.target.checked })}
                                            />
                                            Run It Twice (RIT)
                                        </label>
                                        <label style={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={newTable.bombPots}
                                                onChange={e => setNewTable({ ...newTable, bombPots: e.target.checked })}
                                            />
                                            Bomb Pots
                                        </label>
                                        <label style={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={newTable.autoMuck}
                                                onChange={e => setNewTable({ ...newTable, autoMuck: e.target.checked })}
                                            />
                                            Auto Muck
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div style={styles.modalFooter}>
                                <button style={styles.modalBtnGhost} onClick={() => setShowCreateTable(false)}>Cancel</button>
                                <button
                                    style={styles.modalBtnPrimary}
                                    onClick={handleCreateTable}
                                    disabled={creatingTable}
                                >
                                    {creatingTable ? 'Creating...' : 'Create Table'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <ClubArenaBottomNav clubId={club?.club_id || clubIdParam} activePage="lobby" />

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
        paddingBottom: '80px',
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
    sectionTitle: {
        fontSize: '14px',
        fontWeight: 700,
        color: FB.textSecondary,
        marginBottom: '12px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    tableGrid: {
        display: 'grid',
        gap: '12px',
        marginBottom: '20px',
    },
    tableCard: {
        padding: '16px',
        borderRadius: '8px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
    tableHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
    },
    tableIcon: {
        fontSize: '20px',
    },
    seatsBadge: {
        padding: '4px 10px',
        background: FB.primaryLight,
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        color: FB.primary,
    },
    tableBody: {
        marginBottom: '12px',
    },
    tableName: {
        fontSize: '16px',
        fontWeight: 600,
        color: FB.textPrimary,
        margin: '0 0 4px 0',
    },
    tableStakes: {
        color: FB.success,
        fontSize: '14px',
        fontWeight: 600,
        marginBottom: '4px',
    },
    playersCount: {
        color: FB.textSecondary,
        fontSize: '13px',
    },
    joinBtn: {
        width: '100%',
        padding: '10px',
        background: FB.primary,
        border: 'none',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        color: '#fff',
        cursor: 'pointer',
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
    },
    quickActions: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
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
