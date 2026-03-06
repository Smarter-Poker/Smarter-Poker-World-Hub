/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Admin | FULLY WIRED
 Facebook Dark Theme | Member Management, Chip Distribution, Settings
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
    warning: '#F7C52A',
    hover: '#3A3B3C',
};

const ROLES = ['owner', 'admin', 'agent', 'player'];

// Helper: get auth token for API calls
const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
};

// Helper: make authenticated API call
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

export default function Admin() {
    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // Core state
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [confirmModal, setConfirmModal] = useState(null); // { msg, onConfirm, danger }
    const [deleteClubModal, setDeleteClubModal] = useState(false);
    const [agentActionModal, setAgentActionModal] = useState(null); // { type: 'credit'|'commission', agent }
    const [agentActionValue, setAgentActionValue] = useState('');
    const [deleteClubInput, setDeleteClubInput] = useState('');
    const askConfirm = (msg, onConfirm, danger = true) => setConfirmModal({ msg, onConfirm, danger });
    const [members, setMembers] = useState([]);
    const [stats, setStats] = useState({ totalMembers: 0, totalRake: 0, handsPlayed: 0, activeTables: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    // Modal states
    const [activeModal, setActiveModal] = useState(null); // 'members' | 'chips' | 'reports' | 'settings' | 'danger'
    const [selectedMember, setSelectedMember] = useState(null);
    const [chipAmount, setChipAmount] = useState('');
    const [processing, setProcessing] = useState(false);

    // Settings form
    const [clubName, setClubName] = useState('');
    const [clubDescription, setClubDescription] = useState('');

    // Toast
    const [toast, setToast] = useState(null);

    // Mint chips state
    const [mintAmount, setMintAmount] = useState('');
    // Agent management state
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [agentCreditAmount, setAgentCreditAmount] = useState('');
    const [agentCommissionRate, setAgentCommissionRate] = useState('');
    // Settlement state
    const [settleAction, setSettleAction] = useState('status');
    // Announcements state
    const [announcements, setAnnouncements] = useState([]);
    const [newAnnTitle, setNewAnnTitle] = useState('');
    const [newAnnContent, setNewAnnContent] = useState('');
    // Shop management state
    const [shopItems, setShopItems] = useState([]);
    const [newItemName, setNewItemName] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemCategory, setNewItemCategory] = useState('general');
    // Rakeback state
    const [rakebackStatus, setRakebackStatus] = useState(null);
    const [rakebackLoading, setRakebackLoading] = useState(false);
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
            // Get authenticated user (Supabase session only)
            const { data: { user: authUser } } = await supabase.auth.getUser();
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
                setClubName(clubData.name || '');
                setClubDescription(clubData.description || '');

                // Check if user is admin
                if (authUser) {
                    const { data: membership } = await supabase
                        .from('club_members')
                        .select('role')
                        .eq('club_id', clubData.id)
                        .eq('user_id', authUser.id)
                        .single();
                    setIsAdmin(membership?.role === 'owner' || membership?.role === 'admin');
                }

                // Get members
                const { data: memberData } = await supabase
                    .from('club_members')
                    .select('*, profiles(username, display_name, avatar_url, email)')
                    .eq('club_id', clubData.id)
                    .order('role', { ascending: true })
                    .limit(200) // admin member list
                setMembers(memberData || []);

                // Get stats
                const { count: memberCount } = await supabase
                    .from('club_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('club_id', clubData.id)
                    .limit(200) // admin member list

                const { data: tableData } = await supabase
                    .from('tables')
                    .select('id')
                    .eq('club_id', clubData.id)
                    .eq('status', 'active')
                    .limit(100) // admin tables

                setStats({
                    totalMembers: memberCount || 0,
                    totalRake: clubData.total_rake || 0,
                    handsPlayed: clubData.hands_played || 0,
                    activeTables: tableData?.length || 0,
                });
            }
        } catch (e) {
            console.error('[Admin] Error loading data:', e);
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam]);

    useEffect(() => { const _c = new AbortController(); loadData(_c.signal); return () => _c.abort(); }, [loadData]);

    // ── Realtime: live table + member updates ─────────────────────────────
    useEffect(() => {
        if (!club?.id) return;
        const ch = supabase
            .channel(`admin-live:${club.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tables',
                filter: `club_id=eq.${club.id}` }, () => loadData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'club_members',
                filter: `club_id=eq.${club.id}` }, () => loadData())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [club?.id, loadData]);

    // Load announcements or shop items when those modals open
    useEffect(() => {
        if (!club) return;
        if (activeModal === 'announcements') {
            apiGet(`/api/club-arena/announcements?clubId=${club.id}`)
                .then(d => setAnnouncements(d.announcements || []))
                .catch(() => { });
        }
        if (activeModal === 'shop') {
            apiGet(`/api/club-arena/manage-shop?clubId=${club.id}`)
                .then(d => setShopItems(d.items || []))
                .catch(() => { });
        }
        if (activeModal === 'rakeback') {
            setRakebackLoading(true);
            apiGet(`/api/club-arena/rakeback?clubId=${club.id}&action=status`)
                .then(d => setRakebackStatus(d))
                .catch(() => { })
                .finally(() => setRakebackLoading(false));
        }
    }, [activeModal, club]);

    // ═══════════════════════════════════════════════════════════════════════════
    // MEMBER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    const updateMemberRole = async (memberUserId, newRole) => {
        const currentMember = members.find(m => m.user_id === user?.id);
        const targetMember = members.find(m => m.user_id === memberUserId);
        if (!currentMember || !targetMember) return;

        if (newRole === 'admin' && currentMember.role !== 'owner') {
            showToast('Only the club owner can promote to admin', 'error');
            return;
        }
        if (targetMember.role === 'admin' && currentMember.role !== 'owner') {
            showToast('Only the club owner can change admin roles', 'error');
            return;
        }
        if (targetMember.role === 'owner') {
            showToast('Cannot change the owner\'s role', 'error');
            return;
        }

        setProcessing(true);
        try {
            await apiCall('/api/club-arena/manage-agent', {
                clubId: club.id,
                action: 'change_role',
                targetUserId: memberUserId,
                newRole,
            });
            showToast(`Role updated to ${newRole}`);
            loadData();
        } catch (e) {
            showToast(e.message || 'Failed to update role', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const assignAgent = async (memberUserId, agentUserId) => {
        if (agentUserId) {
            const agentMember = members.find(m => m.user_id === agentUserId);
            if (!agentMember || agentMember.role !== 'agent') {
                showToast('Selected user is not an agent', 'error');
                return;
            }
        }

        setProcessing(true);
        try {
            const currentAgent = members.find(m => m.user_id === memberUserId)?.agent_id;
            await apiCall('/api/club-arena/manage-agent', {
                clubId: club.id,
                action: 'reassign',
                playerId: memberUserId,
                fromAgentId: currentAgent || null,
                toAgentId: agentUserId || null,
            });
            showToast(agentUserId ? 'Agent assigned' : 'Agent removed');
            loadData();
        } catch (e) {
            showToast(e.message || 'Failed to assign agent', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const removeMember = async (memberUserId, memberName) => {
        const currentMember = members.find(m => m.user_id === user?.id);
        const targetMember = members.find(m => m.user_id === memberUserId);
        if (!currentMember || !targetMember) return;

        if (targetMember.role === 'owner') {
            showToast('Cannot remove the club owner', 'error');
            return;
        }
        if (targetMember.role === 'admin' && currentMember.role !== 'owner') {
            showToast('Only the club owner can remove admins', 'error');
            return;
        }

        askConfirm(`Remove ${memberName} from the club?`, async () => {
        setConfirmModal(null);
        setProcessing(true);
        try {
            await apiCall('/api/club-arena/manage-agent', {
                clubId: club.id,
                action: 'remove',
                targetUserId: memberUserId,
            });
            showToast('Member removed');
            loadData();
        } catch (e) {
            showToast(e.message || 'Failed to remove member', 'error');
        } finally {
            setProcessing(false);
        }
    });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHIP DISTRIBUTION
    // ═══════════════════════════════════════════════════════════════════════════
    const distributeChips = async () => {
        const amount = parseInt(chipAmount);
        if (!selectedMember || !amount || amount <= 0) {
            showToast('Select a member and enter amount', 'error');
            return;
        }

        setProcessing(true);
        try {
            const result = await apiCall('/api/club-arena/distribute-chips', {
                clubId: club.id,
                playerId: selectedMember.user_id,
                amount,
                notes: `Admin distribution by ${user?.email || 'admin'}`,
            });

            const name = selectedMember.profiles?.display_name || selectedMember.profiles?.username;
            showToast(`${amount.toLocaleString()} chips sent to ${name}`);
            setSelectedMember(null);
            setChipAmount('');
            loadData();
        } catch (e) {
            showToast(e.message || 'Failed to distribute chips', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CLUB SETTINGS
    // ═══════════════════════════════════════════════════════════════════════════
    const saveClubSettings = async () => {
        if (!clubName.trim()) {
            showToast('Club name is required', 'error');
            return;
        }

        setProcessing(true);
        try {
            await apiCall('/api/club-arena/save-settings', {
                clubId: club.id,
                name: clubName.trim(),
                description: clubDescription.trim(),
            });
            showToast('Settings saved');
            loadData();
            setActiveModal(null);
        } catch (e) {
            showToast(e.message || 'Failed to save settings', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DELETE CLUB
    // ═══════════════════════════════════════════════════════════════════════════
    const deleteClub = async () => {
        const currentMember = members.find(m => m.user_id === user?.id);
        if (!currentMember || currentMember.role !== 'owner') {
            showToast('Only the club owner can delete the club', 'error');
            return;
        }
        if (deleteClubInput !== club?.name) {
            showToast('Club name did not match', 'error');
            return;
        }
        setProcessing(true);
        try {
            await apiCall('/api/club-arena/delete-club', {
                clubId: club.id,
                confirmName: deleteClubInput,
            });
            showToast('Club deleted');
            router.push('/hub/club-arena');
        } catch (e) {
            showToast(e.message || 'Failed to delete club', 'error');
        } finally {
            setProcessing(false);
            setDeleteClubModal(false);
            setDeleteClubInput('');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    const S = {
        page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
        container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' },
        backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 },
        pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' },
        loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' },
        noAccess: { textAlign: 'center', padding: '60px 20px', background: FB.cardBg, borderRadius: '8px', color: FB.textSecondary },

        sectionTitle: { fontSize: '12px', fontWeight: 700, color: FB.textSecondary, marginBottom: '12px', marginTop: '24px', textTransform: 'uppercase', letterSpacing: '0.5px' },

        actionCard: { display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '10px', cursor: 'pointer', transition: 'background 0.2s' },
        iconBox: { width: '44px', height: '44px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 },
        actionTitle: { color: FB.textPrimary, fontSize: '15px', fontWeight: 600 },
        actionDesc: { color: FB.textSecondary, fontSize: '13px', marginTop: '2px' },

        // Modal
        modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' },
        modal: { background: FB.cardBg, borderRadius: '12px', width: '100%', maxWidth: '500px', overflow: 'hidden', border: `1px solid ${FB.border}` },
        modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${FB.border}`, position: 'sticky', top: 0, background: FB.cardBg, zIndex: 1 },
        modalTitle: { fontSize: '18px', fontWeight: 700, color: FB.textPrimary },
        modalClose: { background: 'none', border: 'none', color: FB.textSecondary, fontSize: '24px', cursor: 'pointer', lineHeight: 1 },
        modalBody: { padding: '20px', maxHeight: '60vh', overflowY: 'auto' },
        modalFooter: { padding: '16px 20px', borderTop: `1px solid ${FB.border}` },
        modalBtn: { width: '100%', padding: '14px', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 600, cursor: 'pointer' },

        // Member row
        memberRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', background: FB.background, marginBottom: '8px' },
        memberAvatar: { width: '40px', height: '40px', borderRadius: '50%', background: FB.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', flexShrink: 0, overflow: 'hidden' },
        memberInfo: { flex: 1, minWidth: 0 },
        memberName: { color: FB.textPrimary, fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        memberRole: { color: FB.textSecondary, fontSize: '12px', textTransform: 'capitalize' },
        roleSelect: { padding: '6px 10px', background: FB.hover, border: `1px solid ${FB.border}`, borderRadius: '4px', color: FB.textPrimary, fontSize: '12px' },
        removeBtn: { background: FB.danger, border: 'none', color: '#fff', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' },

        // Form
        formLabel: { display: 'block', fontSize: '13px', color: FB.textSecondary, marginBottom: '6px' },
        formInput: { width: '100%', padding: '12px', background: FB.background, border: `1px solid ${FB.border}`, borderRadius: '6px', color: FB.textPrimary, fontSize: '15px', outline: 'none', marginBottom: '16px' },
        formTextarea: { width: '100%', padding: '12px', background: FB.background, border: `1px solid ${FB.border}`, borderRadius: '6px', color: FB.textPrimary, fontSize: '15px', outline: 'none', minHeight: '100px', resize: 'vertical', marginBottom: '16px' },

        // Stats
        statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
        statCard: { padding: '16px', background: FB.background, borderRadius: '8px', textAlign: 'center' },
        statValue: { fontSize: '24px', fontWeight: 700, color: FB.primary },
        statLabel: { fontSize: '11px', color: FB.textSecondary, marginTop: '4px', textTransform: 'uppercase' },

        // Chip select
        chipMemberSelect: { marginBottom: '16px' },

        // Toast
        toast: { position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
    };

    const adminOptions = [
        { id: 'members', title: 'Manage Members', desc: 'Add, remove, or update player roles', color: FB.primary },
        { id: 'chips', title: 'Chip Management', desc: 'Distribute chips to members', color: FB.success },
        { id: 'mint', title: 'Mint Chips', desc: 'Add chips to club treasury', color: FB.gold },
        { id: 'agents', title: 'Agent Management', desc: 'Credit, commission, suspend agents', color: '#F5A623' },
        { id: 'settlement', title: 'Settlement', desc: 'Manage settlement periods', color: '#A855F7' },
        { id: 'reports', title: 'Club Reports', desc: 'View club statistics and activity', color: '#F582AE' },
        { id: 'announcements', title: 'Announcements', desc: 'Create and manage club announcements', color: '#4ECDC4' },
        { id: 'shop', title: 'Shop Management', desc: 'Add, edit, and manage marketplace items', color: '#45B7D1' },
        { id: 'rakeback', title: 'Rakeback', desc: 'Manage rakeback periods for players', color: '#34C759' },
        { id: 'promo', title: 'Promo Wallet', desc: 'Mint promo chips and distribute to agents', color: '#9333ea' },
        { id: 'settings', title: 'Club Settings', desc: 'Edit club name and description', color: FB.textSecondary },
    ];

    // Only the club owner should see the Danger Zone
    const currentMemberForUI = members.find(m => m.user_id === user?.id);
    if (currentMemberForUI?.role === 'owner') {
        adminOptions.push({ id: 'danger', title: 'Danger Zone', desc: 'Delete club permanently', color: FB.danger });
    }

    // Navigation tiles (open pages, not modals)
    const navTiles = [];
    if (['owner', 'admin', 'agent', 'sub_agent', 'super_agent'].includes(currentMemberForUI?.role)) {
        navTiles.push({ title: 'Agent Dashboard', desc: 'Manage players, cashouts & commissions', color: '#FF9500', href: `/hub/club-arena/agent-dashboard?club=${clubIdParam}` });
    }
    if (club?.union_id && ['owner', 'admin'].includes(currentMemberForUI?.role)) {
        navTiles.push({ title: 'Union Dashboard', desc: 'Manage union settings and clubs', color: '#AF52DE', href: `/hub/club-arena/union-dashboard?union=${club.union_id}` });
    }

    return (
        <>
            <SEOHead
                title="Club Arena — Admin"
                description="Club Arena Administration Panel."
                canonical="/hub/club-arena/admin"
                noindex={true}
            />

            <div style={S.page}>
                <UniversalHeader pageDepth={2} />

                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <h1 style={S.pageTitle}>Club Admin</h1>

                    {isLoading ? (
                        <div style={S.loading}>Loading...</div>
                    ) : !isAdmin ? (
                        <div style={S.noAccess}>
                            <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}></span>
                            <p>You Don't Have Admin Access To This Club</p>
                        </div>
                    ) : (
                        <>
                            <h2 style={S.sectionTitle}>Administration</h2>
                            {adminOptions.map(opt => (
                                <div
                                    key={opt.id}
                                    style={S.actionCard}
                                    onClick={() => setActiveModal(opt.id)}
                                    onMouseEnter={e => e.currentTarget.style.background = FB.hover}
                                    onMouseLeave={e => e.currentTarget.style.background = FB.cardBg}
                                >
                                    <div>
                                        <div style={S.actionTitle}>{opt.title}</div>
                                        <div style={S.actionDesc}>{opt.desc}</div>
                                    </div>
                                </div>
                            ))}

                            {/* Dashboard navigation tiles */}
                            {navTiles.length > 0 && (
                                <>
                                    <h2 style={{ ...S.sectionTitle, marginTop: 24 }}>Dashboards</h2>
                                    {navTiles.map(tile => (
                                        <div
                                            key={tile.title}
                                            style={S.actionCard}
                                            onClick={() => router.push(tile.href)}
                                            onMouseEnter={e => e.currentTarget.style.background = FB.hover}
                                            onMouseLeave={e => e.currentTarget.style.background = FB.cardBg}
                                        >
                                            <div style={{ ...S.iconBox, background: tile.color }}>→</div>
                                            <div>
                                                <div style={S.actionTitle}>{tile.title}</div>
                                                <div style={S.actionDesc}>{tile.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="admin" userRole={currentMemberForUI?.role} />
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
 MANAGE MEMBERS MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'members' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Manage Members</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {members.length === 0 ? (
                                <p style={{ color: FB.textSecondary, textAlign: 'center' }}>No Members Yet</p>
                            ) : (() => {
                                const agents = members.filter(m => m.role === 'agent');
                                return members.map(member => {
                                    const assignedAgent = agents.find(a => a.user_id === member.agent_id);
                                    const downlineCount = member.role === 'agent' ? members.filter(m => m.agent_id === member.user_id).length : 0;
                                    return (
                                        <div key={member.user_id} style={S.memberRow}>
                                            <div style={S.memberAvatar}>
                                                {member.profiles?.avatar_url ? (
                                                    <img src={member.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                                ) : ''}
                                            </div>
                                            <div style={S.memberInfo}>
                                                <div style={S.memberName}>{member.profiles?.display_name || member.profiles?.username || 'Unknown'}</div>
                                                <div style={S.memberRole}>{member.role}{member.role === 'agent' && downlineCount > 0 ? ` (${downlineCount} player${downlineCount !== 1 ? 's' : ''})` : ''} • {(member.chip_balance || 0).toLocaleString()} chips</div>
                                                {member.role === 'player' && agents.length > 0 && (
                                                    <div style={{ marginTop: 4 }}>
                                                        <select
                                                            style={{ ...S.roleSelect, fontSize: '11px', padding: '3px 6px' }}
                                                            value={member.agent_id || ''}
                                                            onChange={e => assignAgent(member.user_id, e.target.value)}
                                                            disabled={processing}
                                                        >
                                                            <option value="">No Agent</option>
                                                            {agents.map(a => (
                                                                <option key={a.user_id} value={a.user_id}>
                                                                    {a.profiles?.display_name || a.profiles?.username}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}
                                                {member.role === 'player' && assignedAgent && (
                                                    <div style={{ fontSize: '11px', color: '#1877F2', marginTop: 2 }}>
                                                        Agent: {assignedAgent.profiles?.display_name || assignedAgent.profiles?.username}
                                                    </div>
                                                )}
                                            </div>
                                            {member.role !== 'owner' && (
                                                <>
                                                    <select
                                                        style={S.roleSelect}
                                                        value={member.role}
                                                        onChange={e => updateMemberRole(member.user_id, e.target.value)}
                                                        disabled={processing}
                                                    >
                                                        {ROLES.filter(r => r !== 'owner').map(r => (
                                                            <option key={r} value={r}>{r}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        style={S.removeBtn}
                                                        onClick={() => removeMember(member.user_id, member.profiles?.display_name || member.profiles?.username)}
                                                        disabled={processing}
                                                    >
                                                        Remove
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 CHIP MANAGEMENT MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'chips' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Chip Management</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={S.chipMemberSelect}>
                                <label style={S.formLabel}>Select Member</label>
                                <select
                                    style={{ ...S.formInput, marginBottom: 0 }}
                                    value={selectedMember?.user_id || ''}
                                    onChange={e => setSelectedMember(members.find(m => m.user_id === e.target.value))}
                                >
                                    <option value="">Choose A Member...</option>
                                    {members.map(m => (
                                        <option key={m.user_id} value={m.user_id}>
                                            {m.profiles?.display_name || m.profiles?.username} ({(m.chip_balance || 0).toLocaleString()} chips)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <label style={S.formLabel}>Amount To Send</label>
                            <input
                                type="number"
                                style={S.formInput}
                                value={chipAmount}
                                onChange={e => setChipAmount(e.target.value)}
                                placeholder="Enter Chip Amount"
                                min="1"
                            />
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                style={{ ...S.modalBtn, background: FB.success, color: '#fff', opacity: processing || !selectedMember || !chipAmount ? 0.5 : 1 }}
                                onClick={distributeChips}
                                disabled={processing || !selectedMember || !chipAmount}
                            >
                                {processing ? 'Sending...' : `Send ${parseInt(chipAmount || 0).toLocaleString()} Chips`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 CLUB REPORTS MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'reports' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Club Reports</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={S.statsGrid}>
                                <div style={S.statCard}>
                                    <div style={S.statValue}>{stats.totalMembers}</div>
                                    <div style={S.statLabel}>Total Members</div>
                                </div>
                                <div style={S.statCard}>
                                    <div style={S.statValue}>{stats.activeTables}</div>
                                    <div style={S.statLabel}>Active Tables</div>
                                </div>
                                <div style={S.statCard}>
                                    <div style={{ ...S.statValue, color: FB.success }}>{stats.totalRake.toLocaleString()}</div>
                                    <div style={S.statLabel}>Total Rake</div>
                                </div>
                                <div style={S.statCard}>
                                    <div style={S.statValue}>{stats.handsPlayed.toLocaleString()}</div>
                                    <div style={S.statLabel}>Hands Played</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 CLUB SETTINGS MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'settings' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Admin Club Settings</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <label style={S.formLabel}>Club Name</label>
                            <input
                                type="text"
                                style={S.formInput}
                                value={clubName}
                                onChange={e => setClubName(e.target.value)}
                                placeholder="Enter Club Name"
                            />
                            <label style={S.formLabel}>Description</label>
                            <textarea
                                style={S.formTextarea}
                                value={clubDescription}
                                onChange={e => setClubDescription(e.target.value)}
                                placeholder="Enter Club Description"
                            />
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                style={{ ...S.modalBtn, background: FB.primary, color: '#fff', opacity: processing ? 0.5 : 1 }}
                                onClick={saveClubSettings}
                                disabled={processing}
                            >
                                {processing ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 DANGER ZONE MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'danger' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Danger Zone</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={{ padding: '20px', background: 'rgba(250,56,62,0.1)', borderRadius: '8px', border: `1px solid ${FB.danger}` }}>
                                <h3 style={{ color: FB.danger, fontSize: '16px', marginBottom: '8px' }}>⚠️ Delete Club</h3>
                                <p style={{ color: FB.textSecondary, fontSize: '14px', marginBottom: '12px' }}>
                                    This action cannot be undone. All members, tables, and data will be permanently deleted.
                                </p>
                                <p style={{ color: FB.textSecondary, fontSize: '13px', marginBottom: '8px' }}>
                                    Type <strong style={{ color: FB.textPrimary }}>{club?.name}</strong> to confirm:
                                </p>
                                <input
                                    value={deleteClubInput}
                                    onChange={e => setDeleteClubInput(e.target.value)}
                                    placeholder={club?.name}
                                    style={{ width: '100%', padding: '10px 14px', background: '#18191A', border: `1px solid ${deleteClubInput === club?.name ? FB.danger : FB.border}`, borderRadius: '6px', color: FB.textPrimary, fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }}
                                />
                                <button
                                    style={{ ...S.modalBtn, background: FB.danger, color: '#fff', opacity: (processing || deleteClubInput !== club?.name) ? 0.4 : 1 }}
                                    onClick={deleteClub}
                                    disabled={processing || deleteClubInput !== club?.name}
                                >
                                    {processing ? 'Deleting...' : 'Delete Club Permanently'}
                                </button>
                            </div>
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

            {/* ═══ CONFIRM MODAL (askConfirm) ═══ */}
            {confirmModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
                    <div style={{ background: '#242526', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', border: `1px solid ${confirmModal.danger ? FB.danger : FB.border}` }}>
                        <p style={{ color: '#E4E6EB', fontSize: 15, fontWeight: 600, marginBottom: 20 }}>{confirmModal.msg}</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setConfirmModal(null)} style={{ flex: 1, padding: '10px', background: '#3A3B3C', border: 'none', borderRadius: 8, color: '#B0B3B8', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={confirmModal.onConfirm} style={{ flex: 2, padding: '10px', background: confirmModal.danger ? FB.danger : FB.primary, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ AGENT ACTION MODAL (Credit / Commission / Parent Agent) ═══ */}
            {agentActionModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
                    <div style={{ background: '#242526', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', border: '1px solid #3E4042' }}>
                        {agentActionModal.type === 'credit' && (<>
                            <h3 style={{ color: '#E4E6EB', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Issue Credit</h3>
                            <p style={{ color: '#B0B3B8', fontSize: 13, marginBottom: 12 }}>
                                Agent: <strong style={{ color: '#E4E6EB' }}>{agentActionModal.agent?.profile?.display_name || 'Agent'}</strong>
                            </p>
                            <input type="number" value={agentActionValue} onChange={e => setAgentActionValue(e.target.value)}
                                placeholder="Credit amount..." min="1" autoFocus
                                style={{ width: '100%', padding: '10px 14px', background: '#18191A', border: '1px solid #3E4042', borderRadius: 8, color: '#E4E6EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => { setAgentActionModal(null); setAgentActionValue(''); }} style={{ flex: 1, padding: 10, background: '#3A3B3C', border: 'none', borderRadius: 8, color: '#B0B3B8', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={async () => {
                                    if (!agentActionValue || isNaN(agentActionValue)) return;
                                    setProcessing(true);
                                    try {
                                        await apiCall('/api/club-arena/agent-credit', { clubId: club.id, agentUserId: agentActionModal.agent.user_id, action: 'issue_credit', amount: parseInt(agentActionValue) });
                                        showToast('Credit issued');
                                        loadData();
                                    } catch (e) { showToast(e.message, 'error'); }
                                    finally { setProcessing(false); setAgentActionModal(null); setAgentActionValue(''); }
                                }} style={{ flex: 2, padding: 10, background: FB.primary, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Issue Credit</button>
                            </div>
                        </>)}
                        {agentActionModal.type === 'commission' && (<>
                            <h3 style={{ color: '#E4E6EB', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Set Commission Rate</h3>
                            <p style={{ color: '#B0B3B8', fontSize: 13, marginBottom: 12 }}>
                                Agent: <strong style={{ color: '#E4E6EB' }}>{agentActionModal.agent?.profile?.display_name || 'Agent'}</strong>
                                {' · '}Current: <strong style={{ color: '#F7C52A' }}>{((agentActionModal.agent?.commission_rate || 0) * 100).toFixed(0)}%</strong>
                            </p>
                            <input type="number" value={agentActionValue} onChange={e => setAgentActionValue(e.target.value)}
                                placeholder="New rate 0–100..." min="0" max="100" step="0.5" autoFocus
                                style={{ width: '100%', padding: '10px 14px', background: '#18191A', border: '1px solid #3E4042', borderRadius: 8, color: '#E4E6EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => { setAgentActionModal(null); setAgentActionValue(''); }} style={{ flex: 1, padding: 10, background: '#3A3B3C', border: 'none', borderRadius: 8, color: '#B0B3B8', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={async () => {
                                    if (!agentActionValue || isNaN(agentActionValue)) return;
                                    setProcessing(true);
                                    try {
                                        await apiCall('/api/club-arena/manage-agent', { clubId: club.id, targetUserId: agentActionModal.agent.user_id, action: 'update', commissionRate: parseFloat(agentActionValue) / 100 });
                                        showToast(`Commission set to ${agentActionValue}%`);
                                        loadData();
                                    } catch (e) { showToast(e.message, 'error'); }
                                    finally { setProcessing(false); setAgentActionModal(null); setAgentActionValue(''); }
                                }} style={{ flex: 2, padding: 10, background: '#A855F7', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Set Rate</button>
                            </div>
                        </>)}
                        {agentActionModal.type === 'parent' && (<>
                            <h3 style={{ color: '#E4E6EB', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Set Parent Agent</h3>
                            <p style={{ color: '#B0B3B8', fontSize: 13, marginBottom: 12 }}>
                                Assign <strong style={{ color: '#E4E6EB' }}>{agentActionModal.agent?.profile?.display_name || 'Agent'}</strong> as a sub-agent of:
                            </p>
                            <select value={agentActionValue} onChange={e => setAgentActionValue(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', background: '#18191A', border: '1px solid #3E4042', borderRadius: 8, color: '#E4E6EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}>
                                <option value="">— Independent (no parent) —</option>
                                {(members || []).filter(m => ['agent','super_agent'].includes(m.role) && m.user_id !== agentActionModal.agent.user_id).map(a => (
                                    <option key={a.user_id} value={a.user_id}>{a.profile?.display_name || a.profile?.username || a.user_id.slice(0, 8)}</option>
                                ))}
                            </select>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => { setAgentActionModal(null); setAgentActionValue(''); }} style={{ flex: 1, padding: 10, background: '#3A3B3C', border: 'none', borderRadius: 8, color: '#B0B3B8', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={async () => {
                                    setProcessing(true);
                                    try {
                                        await apiCall('/api/club-arena/manage-agent', { clubId: club.id, targetUserId: agentActionModal.agent.user_id, action: 'set_parent_agent', parentAgentUserId: agentActionValue || null });
                                        showToast(agentActionValue ? 'Parent agent assigned' : 'Agent set as independent');
                                        loadData();
                                    } catch (e) { showToast(e.message, 'error'); }
                                    finally { setProcessing(false); setAgentActionModal(null); setAgentActionValue(''); }
                                }} style={{ flex: 2, padding: 10, background: '#FF9500', border: 'none', borderRadius: 8, color: '#000', fontWeight: 700, cursor: 'pointer' }}>Confirm</button>
                            </div>
                        </>)}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 ANNOUNCEMENTS MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'announcements' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Club Announcements</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {/* Create new announcement */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={S.formLabel}>Title</label>
                                <input value={newAnnTitle} onChange={e => setNewAnnTitle(e.target.value)}
                                    placeholder="Announcement title" style={S.formInput} />
                                <label style={S.formLabel}>Content</label>
                                <textarea value={newAnnContent} onChange={e => setNewAnnContent(e.target.value)}
                                    placeholder="Announcement content..." style={S.formTextarea} />
                                <button
                                    style={{ ...S.modalBtn, background: '#4ECDC4', color: '#000', opacity: processing ? 0.5 : 1 }}
                                    disabled={processing}
                                    onClick={async () => {
                                        if (!newAnnTitle.trim()) { showToast('Title required', 'error'); return; }
                                        setProcessing(true);
                                        try {
                                            await apiCall('/api/club-arena/announcements', { action: 'create', clubId: club.id, title: newAnnTitle, content: newAnnContent });
                                            showToast('Announcement posted!');
                                            setNewAnnTitle(''); setNewAnnContent('');
                                            const d = await apiGet(`/api/club-arena/announcements?clubId=${club.id}`);
                                            setAnnouncements(d.announcements || []);
                                        } catch (e) { showToast(e.message, 'error'); }
                                        finally { setProcessing(false); }
                                    }}>
                                    {processing ? 'Posting...' : 'Post Announcement'}
                                </button>
                            </div>
                            {/* Existing announcements */}
                            <h4 style={{ fontSize: 14, color: FB.textPrimary, fontWeight: 700, marginBottom: 8 }}>
                                Existing ({announcements.length})
                            </h4>
                            {announcements.map(ann => (
                                <div key={ann.id} style={{ background: FB.background, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 13 }}>{ann.title}</div>
                                        <button onClick={() => {
                                            askConfirm('Delete this announcement?', async () => {
                                                setConfirmModal(null);
                                                try {
                                                    await apiCall('/api/club-arena/announcements', { action: 'delete', clubId: club.id, announcementId: ann.id });
                                                    setAnnouncements(prev => prev.filter(a => a.id !== ann.id));
                                                    showToast('Deleted');
                                                } catch (e) { showToast(e.message, 'error'); }
                                            });
                                        }} style={{ background: FB.danger, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Delete</button>
                                    </div>
                                    {ann.content && <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 4 }}>{ann.content}</div>}
                                    <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 4 }}>
                                        {ann.created_at ? new Date(ann.created_at).toLocaleString() : ''}
                                        {ann.pinned && <span style={{ color: FB.gold, marginLeft: 8 }}>Pinned</span>}
                                    </div>
                                </div>
                            ))}
                            {announcements.length === 0 && (
                                <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 20 }}>No announcements yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 SHOP MANAGEMENT MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'shop' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Shop Management</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {/* Create new item */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={S.formLabel}>Item Name</label>
                                <input value={newItemName} onChange={e => setNewItemName(e.target.value)}
                                    placeholder="Cool Hat" style={S.formInput} />
                                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={S.formLabel}>Price (chips)</label>
                                        <input type="number" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)}
                                            placeholder="500" style={{ ...S.formInput, marginBottom: 0 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={S.formLabel}>Category</label>
                                        <select value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)}
                                            style={{ ...S.formInput, marginBottom: 0 }}>
                                            <option value="general">General</option>
                                            <option value="avatar">Avatar</option>
                                            <option value="emote">Emote</option>
                                            <option value="card_back">Card Back</option>
                                            <option value="table_theme">Table Theme</option>
                                        </select>
                                    </div>
                                </div>
                                <label style={S.formLabel}>Description (optional)</label>
                                <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)}
                                    placeholder="A cool item..." style={S.formInput} />
                                <button
                                    style={{ ...S.modalBtn, background: '#45B7D1', color: '#000', opacity: processing ? 0.5 : 1 }}
                                    disabled={processing}
                                    onClick={async () => {
                                        if (!newItemName.trim() || !newItemPrice) { showToast('Name and price required', 'error'); return; }
                                        setProcessing(true);
                                        try {
                                            await apiCall('/api/club-arena/manage-shop', { action: 'create', clubId: club.id, name: newItemName, price: newItemPrice, description: newItemDesc, category: newItemCategory });
                                            showToast('Item created!');
                                            setNewItemName(''); setNewItemPrice(''); setNewItemDesc('');
                                            const d = await apiGet(`/api/club-arena/manage-shop?clubId=${club.id}`);
                                            setShopItems(d.items || []);
                                        } catch (e) { showToast(e.message, 'error'); }
                                        finally { setProcessing(false); }
                                    }}>
                                    {processing ? 'Creating...' : 'Create Item'}
                                </button>
                            </div>
                            {/* Existing items */}
                            <h4 style={{ fontSize: 14, color: FB.textPrimary, fontWeight: 700, marginBottom: 8 }}>
                                Shop Items ({shopItems.length})
                            </h4>
                            {shopItems.map(item => (
                                <div key={item.id} style={{ background: FB.background, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <div>
                                            <span style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 13 }}>{item.name}</span>
                                            <span style={{ fontSize: 12, color: FB.gold, marginLeft: 8 }}>{item.price?.toLocaleString()} chips</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={async () => {
                                                try {
                                                    const r = await apiCall('/api/club-arena/manage-shop', { action: 'toggle', clubId: club.id, itemId: item.id });
                                                    setShopItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: r.isActive } : i));
                                                    showToast(r.isActive ? 'Item enabled' : 'Item disabled');
                                                } catch (e) { showToast(e.message, 'error'); }
                                            }} style={{ background: item.is_active ? FB.success : FB.hover, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                                                {item.is_active ? 'Active' : 'Disabled'}
                                            </button>
                                            <button onClick={() => {
                                                askConfirm(`Delete "${item.name}"?`, async () => {
                                                    setConfirmModal(null);
                                                    try {
                                                        await apiCall('/api/club-arena/manage-shop', { action: 'delete', clubId: club.id, itemId: item.id });
                                                        setShopItems(prev => prev.filter(i => i.id !== item.id));
                                                        showToast('Deleted');
                                                    } catch (e) { showToast(e.message, 'error'); }
                                                });
                                            }} style={{ background: FB.danger, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Delete</button>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 12, color: FB.textSecondary }}>
                                        {item.category} · {item.purchase_count || 0} sold
                                        {item.description && ` · ${item.description}`}
                                    </div>
                                </div>
                            ))}
                            {shopItems.length === 0 && (
                                <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 20 }}>No shop items yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 RAKEBACK MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'rakeback' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Rakeback Management</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {rakebackLoading ? (
                                <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>Loading...</div>
                            ) : (
                                <>
                                    <div style={{ background: FB.background, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                        <div style={{ fontSize: 13, color: FB.textSecondary, marginBottom: 4 }}>Current Period</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: rakebackStatus?.activePeriod ? '#4BB543' : FB.textSecondary }}>
                                            {rakebackStatus?.activePeriod ? ' Open' : ' No Active Period'}
                                        </div>
                                        {rakebackStatus?.activePeriod && (
                                            <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 4 }}>
                                                Since {new Date(rakebackStatus.activePeriod.period_start).toLocaleString()}
                                            </div>
                                        )}
                                        <div style={{ fontSize: 13, color: FB.textSecondary, marginTop: 8 }}>
                                            Rate: {((rakebackStatus?.rakebackRate || 0) * 100).toFixed(0)}% of rake returned to players
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {!rakebackStatus?.activePeriod ? (
                                            <button
                                                style={{ ...S.modalBtn, flex: 1, background: '#4BB543', color: '#fff', opacity: processing ? 0.5 : 1 }}
                                                disabled={processing}
                                                onClick={async () => {
                                                    setProcessing(true);
                                                    try {
                                                        await apiCall('/api/club-arena/rakeback', { action: 'open', clubId: club.id });
                                                        showToast('Rakeback period opened!');
                                                        const d = await apiGet(`/api/club-arena/rakeback?clubId=${club.id}&action=status`);
                                                        setRakebackStatus(d);
                                                    } catch (e) { showToast(e.message, 'error'); }
                                                    finally { setProcessing(false); }
                                                }}
                                            >
                                                {processing ? 'Opening...' : 'Open New Period'}
                                            </button>
                                        ) : (
                                            <button
                                                style={{ ...S.modalBtn, flex: 1, background: '#F5A623', color: '#000', opacity: processing ? 0.5 : 1 }}
                                                disabled={processing}
                                                onClick={() => {
                                                    askConfirm('Close this period and calculate rakeback for all players?', async () => {
                                                        setConfirmModal(null);
                                                        setProcessing(true);
                                                        try {
                                                            const r = await apiCall('/api/club-arena/rakeback', { action: 'close', clubId: club.id });
                                                            showToast(`Period closed! ${r.playersProcessed} players, ${r.totalRakebackDistributed?.toLocaleString()} chips rakeback distributed.`);
                                                            const d = await apiGet(`/api/club-arena/rakeback?clubId=${club.id}&action=status`);
                                                            setRakebackStatus(d);
                                                        } catch (e) { showToast(e.message, 'error'); }
                                                        finally { setProcessing(false); }
                                                    });
                                                }}
                                            >
                                                {processing ? 'Closing...' : 'Close Period & Calculate Rakeback'}
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ marginTop: 16, fontSize: 12, color: FB.textSecondary, lineHeight: '1.5' }}>
                                        <strong style={{ color: FB.textPrimary }}>How it works:</strong><br />
                                        1. Open a rakeback period to start tracking.<br />
                                        2. Rake from all hands during the period is tracked per player.<br />
                                        3. Close the period to calculate each player&apos;s rakeback share.<br />
                                        4. Players claim their rakeback from the Cashier page.
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 MINT CHIPS MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'mint' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Mint Chips to Treasury</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={{ padding: '16px', background: `rgba(247,197,42,0.08)`, borderRadius: '8px', border: `1px solid ${FB.border}`, marginBottom: '16px' }}>
                                <div style={{ fontSize: '12px', color: FB.textSecondary }}>Current Treasury</div>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: '#F7C52A' }}>
                                    {(club?.chip_treasury || 0).toLocaleString()} chips
                                </div>
                            </div>
                            <label style={S.formLabel}>Amount to Mint</label>
                            <input type="number" value={mintAmount} onChange={e => setMintAmount(e.target.value)}
                                placeholder="10000" style={S.formInput} />
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                {[10000, 50000, 100000, 500000].map(v => (
                                    <button key={v} onClick={() => setMintAmount(String(v))}
                                        style={{ flex: 1, background: mintAmount === String(v) ? '#F7C52A' : FB.hover, color: mintAmount === String(v) ? '#000' : FB.textSecondary, border: 'none', borderRadius: '6px', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                        {v >= 1000 ? `${v / 1000}K` : v}
                                    </button>
                                ))}
                            </div>
                            <button
                                style={{ ...S.modalBtn, background: '#F7C52A', color: '#000', opacity: processing ? 0.5 : 1 }}
                                disabled={processing}
                                onClick={async () => {
                                    if (!mintAmount || parseInt(mintAmount) <= 0) { showToast('Enter a valid amount', 'error'); return; }
                                    setProcessing(true);
                                    try {
                                        await apiCall('/api/club-arena/mint-chips', { clubId: club.id, amount: parseInt(mintAmount) });
                                        showToast(`Minted ${parseInt(mintAmount).toLocaleString()} chips to treasury`);
                                        setMintAmount('');
                                        loadData();
                                        setActiveModal(null);
                                    } catch (e) { showToast(e.message, 'error'); }
                                    finally { setProcessing(false); }
                                }}
                            >
                                {processing ? 'Minting...' : `Mint ${mintAmount ? parseInt(mintAmount).toLocaleString() : '0'} Chips`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 AGENT MANAGEMENT MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'agents' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Agent Management</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {members.filter(m => m.role === 'agent').length === 0 ? (
                                <div style={{ textAlign: 'center', color: FB.textSecondary, padding: '30px' }}>
                                    No agents in this club. Promote a member to agent from the Members panel.
                                </div>
                            ) : members.filter(m => m.role === 'agent').map(agent => (
                                <div key={agent.user_id} style={{ background: FB.background, borderRadius: '8px', padding: '14px', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, color: FB.textPrimary, fontSize: '14px' }}>
                                                {agent.profile?.display_name || agent.profile?.username || agent.user_id.slice(0, 8)}
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#F5A623', marginLeft: '8px' }}>Agent</span>
                                        </div>
                                        <span style={{ fontSize: '12px', color: FB.textSecondary }}>
                                            {agent.chip_balance?.toLocaleString() || 0} chips
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {/* Issue Credit */}
                                        <button style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => setAgentActionModal({ type: 'credit', agent })}>
                                            Issue Credit
                                        </button>
                                        {/* Set Commission */}
                                        <button style={{ background: '#A855F7', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => setAgentActionModal({ type: 'commission', agent })}>
                                            Set Commission
                                        </button>
                                        {/* Suspend */}
                                        <button style={{ background: FB.danger, color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={async () => {
                                                askConfirm(`Suspend agent ${agent.profile?.display_name || agent.user_id.slice(0, 8)}?`, async () => {
                                setConfirmModal(null);
                                                setProcessing(true);
                                                try {
                                                    await apiCall('/api/club-arena/manage-agent', { clubId: club.id, targetUserId: agent.user_id, action: 'suspend' });
                                                    showToast('Agent suspended');
                                                    loadData();
                                                } catch (e) { showToast(e.message, 'error'); }
                                                finally { setProcessing(false); }
                                            });
                                        }}>
                                            Suspend
                                        </button>
                                        {/* Set Parent Agent (make sub-agent) */}
                                        <button style={{ background: '#FF9500', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => setAgentActionModal({ type: 'parent', agent })}>
                                            Set Parent
                                        </button>
                                        <button style={{ background: '#FF9500', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'none' }}
                                            onClick={async () => {
                                                const otherAgents = members.filter(m => m.role === 'agent' && m.user_id !== agent.user_id);
                                                if (otherAgents.length === 0) { showToast('No other agents to assign as parent', 'error'); return; }
                                                const names = otherAgents.map((a, i) => `${i + 1}. ${a.profile?.display_name || a.profile?.username || a.user_id.slice(0, 8)}`).join('\n');
                                                const choice = 'legacy_prompt';
                                                if (choice === null) return;
                                                const idx = parseInt(choice);
                                                setProcessing(true);
                                                try {
                                                    if (idx === 0) {
                                                        await apiCall('/api/club-arena/manage-agent', { clubId: club.id, targetUserId: agent.user_id, action: 'set_parent_agent', parentAgentUserId: null });
                                                        showToast('Parent agent cleared (now independent)');
                                                    } else if (idx >= 1 && idx <= otherAgents.length) {
                                                        const parent = otherAgents[idx - 1];
                                                        await apiCall('/api/club-arena/manage-agent', { clubId: club.id, targetUserId: agent.user_id, action: 'set_parent_agent', parentAgentUserId: parent.user_id });
                                                        showToast(`Set as sub-agent of ${parent.profile?.display_name || parent.user_id.slice(0, 8)}`);
                                                    } else { showToast('Invalid selection', 'error'); }
                                                    loadData();
                                                } catch (e) { showToast(e.message, 'error'); }
                                                finally { setProcessing(false); }
                                            }}>
                                            Sub-Agent
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 PROMO WALLET MODAL — Mint promo, distribute to agents
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'promo' && (
                <PromoWalletModal
                    clubId={club?.id}
                    userRole={currentMemberForUI?.role}
                    apiCall={apiCall}
                    showToast={showToast}
                    onClose={() => setActiveModal(null)}
                    FB={FB}
                    S={S}
                />
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 SETTLEMENT MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'settlement' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Settlement Periods</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <p style={{ fontSize: '13px', color: FB.textSecondary, marginBottom: '16px' }}>
                                Open, close, and pay commission settlement periods for this club.
                            </p>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                {['status', 'open', 'close', 'pay_all'].map(action => (
                                    <button key={action} onClick={() => setSettleAction(action)}
                                        style={{ flex: 1, background: settleAction === action ? FB.primary : FB.hover, color: settleAction === action ? '#fff' : FB.textSecondary, border: 'none', borderRadius: '6px', padding: '10px 8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                                        {action === 'pay_all' ? 'Pay All' : action}
                                    </button>
                                ))}
                            </div>
                            <button
                                style={{ ...S.modalBtn, background: '#A855F7', color: '#fff', opacity: processing ? 0.5 : 1 }}
                                disabled={processing}
                                onClick={async () => {
                                    setProcessing(true);
                                    try {
                                        const result = await apiCall('/api/club-arena/settle-period', { clubId: club.id, action: settleAction });
                                        if (settleAction === 'status') {
                                            showToast(`Period: ${result.period?.status || 'none'} | Rake: ${(result.period?.total_rake_collected || 0).toLocaleString()}`);
                                        } else {
                                            showToast(`Settlement ${settleAction} successful`);
                                        }
                                        loadData();
                                    } catch (e) { showToast(e.message, 'error'); }
                                    finally { setProcessing(false); }
                                }}
                            >
                                {processing ? 'Processing...' : `Execute: ${settleAction === 'pay_all' ? 'Pay All' : settleAction}`}
                            </button>
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

// ═══════════════════════════════════════════════════════════════════════════
// PROMO WALLET MODAL — Admin/Owner promo chip management
// ═══════════════════════════════════════════════════════════════════════════

function PromoWalletModal({ clubId, userRole, apiCall, showToast, onClose, FB, S }) {
    const [loading, setLoading] = useState(true);
    const [clubPromo, setClubPromo] = useState(0);
    const [agents, setAgents] = useState([]);
    const [totalAgentPromo, setTotalAgentPromo] = useState(0);
    const [mintAmount, setMintAmount] = useState('');
    const [minting, setMinting] = useState(false);
    const [grantTarget, setGrantTarget] = useState('');
    const [grantAmount, setGrantAmount] = useState('');
    const [granting, setGranting] = useState(false);

    const loadBalances = async () => {
        try {
            const r = await apiCall('/api/club-arena/promo-wallet', { action: 'get_balances', clubId });
            if (r.success) {
                setClubPromo(r.clubPromoBalance);
                setAgents(r.agents || []);
                setTotalAgentPromo(r.totalAgentPromo);
            }
        } catch (e) { console.error('Promo load error:', e); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (clubId) { const _c = new AbortController(); loadBalances(_c.signal); return () => _c.abort(); } }, [clubId]);

    const handleMint = async () => {
        const amt = parseFloat(mintAmount);
        if (!amt || amt <= 0) { showToast('Enter a positive amount', 'error'); return; }
        setMinting(true);
        try {
            const r = await apiCall('/api/club-arena/promo-wallet', { action: 'mint_promo', clubId, amount: amt });
            if (r.success) {
                showToast(`Minted ${amt.toLocaleString()} promo chips!`);
                setMintAmount('');
                loadBalances();
            } else {
                showToast(r.error || 'Mint failed', 'error');
            }
        } catch (e) { showToast(e.message || 'Mint failed', 'error'); }
        finally { setMinting(false); }
    };

    const handleGrant = async () => {
        const amt = parseFloat(grantAmount);
        if (!grantTarget) { showToast('Select an agent', 'error'); return; }
        if (!amt || amt <= 0) { showToast('Enter a positive amount', 'error'); return; }
        if (amt > clubPromo) { showToast('Insufficient club promo balance', 'error'); return; }
        setGranting(true);
        try {
            const r = await apiCall('/api/club-arena/promo-wallet', {
                action: 'grant_to_agent', clubId,
                agentUserId: grantTarget, amount: amt,
            });
            if (r.success) {
                const agent = agents.find(a => a.userId === grantTarget);
                showToast(`Granted ${amt.toLocaleString()} promo to ${agent?.displayName || 'agent'}!`);
                setGrantAmount('');
                setGrantTarget('');
                loadBalances();
            } else {
                showToast(r.error || 'Grant failed', 'error');
            }
        } catch (e) { showToast(e.message || 'Grant failed', 'error'); }
        finally { setGranting(false); }
    };

    const inputStyle = {
        width: '100%', padding: '10px 14px', background: FB.background,
        border: `1px solid ${FB.border}`, borderRadius: 8, color: FB.textPrimary,
        fontSize: 14, outline: 'none', boxSizing: 'border-box',
    };

    return (
        <div style={S.modalOverlay} onClick={onClose}>
            <div style={{ ...S.modal, maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={S.modalHeader}>
                    <span style={S.modalTitle}>Promo Wallet</span>
                    <button style={S.modalClose} onClick={onClose}>&times;</button>
                </div>
                <div style={S.modalBody}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: FB.textSecondary, padding: 30 }}>Loading...</div>
                    ) : (
                        <>
                            {/* Club Promo Balance Card */}
                            <div style={{
                                background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
                                borderRadius: 12, padding: 20, marginBottom: 16,
                                border: '1px solid rgba(147,51,234,0.3)',
                            }}>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Club Promo Balance
                                </div>
                                <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', margin: '4px 0' }}>
                                    {clubPromo.toLocaleString()}
                                </div>
                                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                    <span>Distributed to agents: {totalAgentPromo.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Mint Promo (owner only) */}
                            {userRole === 'owner' && (
                                <div style={{
                                    background: FB.cardBg, borderRadius: 10, padding: 16,
                                    border: `1px solid ${FB.border}`, marginBottom: 16,
                                }}>
                                    <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: FB.textPrimary }}>
                                        Mint Promo Chips
                                    </h4>
                                    <p style={{ fontSize: 12, color: FB.textSecondary, margin: '0 0 10px' }}>
                                        Add promo chips to the club balance. These can then be distributed to agents.
                                    </p>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            type="number"
                                            value={mintAmount}
                                            onChange={e => setMintAmount(e.target.value)}
                                            placeholder="Amount to mint"
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                        <button
                                            onClick={handleMint}
                                            disabled={minting}
                                            style={{
                                                background: '#7c3aed', color: '#fff', border: 'none',
                                                borderRadius: 8, padding: '10px 20px', fontWeight: 700,
                                                cursor: minting ? 'not-allowed' : 'pointer',
                                                opacity: minting ? 0.5 : 1, whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {minting ? '...' : 'Mint'}
                                        </button>
                                    </div>
                                    {/* Quick mint buttons */}
                                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                        {[1000, 5000, 10000, 50000].map(amt => (
                                            <button key={amt} onClick={() => setMintAmount(String(amt))} style={{
                                                background: FB.hover, color: FB.textSecondary, border: 'none',
                                                borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                                            }}>{amt >= 1000 ? `${amt / 1000}K` : amt}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Grant to Agent */}
                            <div style={{
                                background: FB.cardBg, borderRadius: 10, padding: 16,
                                border: `1px solid ${FB.border}`, marginBottom: 16,
                            }}>
                                <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: FB.textPrimary }}>
                                    Grant Promo to Agent
                                </h4>
                                {agents.length === 0 ? (
                                    <p style={{ fontSize: 12, color: FB.textSecondary }}>
                                        No agents in this club. Promote a member to agent first.
                                    </p>
                                ) : (
                                    <>
                                        <div style={{ marginBottom: 10 }}>
                                            <label style={{ display: 'block', fontSize: 12, color: FB.textSecondary, marginBottom: 4 }}>
                                                Select Agent
                                            </label>
                                            <select
                                                value={grantTarget}
                                                onChange={e => setGrantTarget(e.target.value)}
                                                style={inputStyle}
                                            >
                                                <option value="">Choose agent...</option>
                                                {agents.filter(a => a.status !== 'suspended').map(a => (
                                                    <option key={a.userId} value={a.userId}>
                                                        {a.displayName} — Promo: {a.promoBalance.toLocaleString()}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input
                                                type="number"
                                                value={grantAmount}
                                                onChange={e => setGrantAmount(e.target.value)}
                                                placeholder="Amount"
                                                style={{ ...inputStyle, flex: 1 }}
                                            />
                                            <button
                                                onClick={handleGrant}
                                                disabled={granting}
                                                style={{
                                                    background: '#31A24C', color: '#fff', border: 'none',
                                                    borderRadius: 8, padding: '10px 20px', fontWeight: 700,
                                                    cursor: granting ? 'not-allowed' : 'pointer',
                                                    opacity: granting ? 0.5 : 1, whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {granting ? '...' : 'Grant'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Agent Promo Balances */}
                            {agents.length > 0 && (
                                <div style={{
                                    background: FB.cardBg, borderRadius: 10, padding: 16,
                                    border: `1px solid ${FB.border}`,
                                }}>
                                    <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: FB.textPrimary }}>
                                        Agent Promo Balances
                                    </h4>
                                    {agents.map(a => (
                                        <div key={a.userId} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '8px 0', borderBottom: `1px solid ${FB.border}`,
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    background: a.avatarUrl ? `url(${a.avatarUrl}) center/cover` : '#F5A623',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 14, color: '#fff', overflow: 'hidden',
                                                }}>
                                                    {!a.avatarUrl && (a.displayName?.[0] || '?')}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary }}>
                                                        {a.displayName}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                                        {a.status === 'suspended' ? ' Suspended' : `Commission: ${((a.commissionRate || 0) * 100).toFixed(0)}%`}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{
                                                fontSize: 15, fontWeight: 700,
                                                color: a.promoBalance > 0 ? '#9333ea' : FB.textSecondary,
                                            }}>
                                                {a.promoBalance.toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
