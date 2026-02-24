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

export default function Admin() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;

    // Core state
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
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
                    .order('role', { ascending: true });
                setMembers(memberData || []);

                // Get stats
                const { count: memberCount } = await supabase
                    .from('club_members')
                    .select('*', { count: 'exact', head: true })
                    .eq('club_id', clubData.id);

                const { data: tableData } = await supabase
                    .from('tables')
                    .select('id')
                    .eq('club_id', clubData.id)
                    .eq('status', 'active');

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

    useEffect(() => { loadData(); }, [loadData]);

    // ═══════════════════════════════════════════════════════════════════════════
    // MEMBER MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    const updateMemberRole = async (memberUserId, newRole) => {
        // Hierarchy enforcement: prevent unauthorized role changes
        const currentMember = members.find(m => m.user_id === user?.id);
        const targetMember = members.find(m => m.user_id === memberUserId);
        if (!currentMember || !targetMember) return;

        // Only owner can promote to admin
        if (newRole === 'admin' && currentMember.role !== 'owner') {
            showToast('Only the club owner can promote to admin', 'error');
            return;
        }
        // Only owner can demote admins
        if (targetMember.role === 'admin' && currentMember.role !== 'owner') {
            showToast('Only the club owner can change admin roles', 'error');
            return;
        }
        // Never allow changing the owner's role
        if (targetMember.role === 'owner') {
            showToast('Cannot change the owner\'s role', 'error');
            return;
        }

        setProcessing(true);
        try {
            const updates = { role: newRole };
            // If changing from agent to another role, clear agent_id on their downline
            if (targetMember.role === 'agent' && newRole !== 'agent') {
                await supabase
                    .from('club_members')
                    .update({ agent_id: null })
                    .eq('club_id', club.id)
                    .eq('agent_id', memberUserId);
            }
            // If changing from player/agent to non-player, clear their own agent_id
            if (newRole !== 'player') {
                updates.agent_id = null;
            }

            const { error } = await supabase
                .from('club_members')
                .update(updates)
                .eq('club_id', club.id)
                .eq('user_id', memberUserId);

            if (error) throw error;
            showToast(`Role updated to ${newRole}`);
            loadData();
        } catch (e) {
            showToast('Failed to update role', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const assignAgent = async (memberUserId, agentUserId) => {
        // Validate: if assigning, verify the agent actually has the agent role
        if (agentUserId) {
            const agentMember = members.find(m => m.user_id === agentUserId);
            if (!agentMember || agentMember.role !== 'agent') {
                showToast('Selected user is not an agent', 'error');
                return;
            }
        }

        setProcessing(true);
        try {
            const { error } = await supabase
                .from('club_members')
                .update({ agent_id: agentUserId || null })
                .eq('club_id', club.id)
                .eq('user_id', memberUserId);

            if (error) throw error;
            showToast(agentUserId ? 'Agent assigned' : 'Agent removed');
            loadData();
        } catch (e) {
            showToast('Failed to assign agent', 'error');
        } finally {
            setProcessing(false);
        }
    };

    const removeMember = async (memberUserId, memberName) => {
        // Hierarchy enforcement
        const currentMember = members.find(m => m.user_id === user?.id);
        const targetMember = members.find(m => m.user_id === memberUserId);
        if (!currentMember || !targetMember) return;

        // Can't remove the owner
        if (targetMember.role === 'owner') {
            showToast('Cannot remove the club owner', 'error');
            return;
        }
        // Admins can't remove other admins (only owner can)
        if (targetMember.role === 'admin' && currentMember.role !== 'owner') {
            showToast('Only the club owner can remove admins', 'error');
            return;
        }

        if (!confirm(`Remove ${memberName} from the club?`)) return;
        setProcessing(true);
        try {
            // If removing an agent, clear agent_id on their downline first
            if (targetMember.role === 'agent') {
                await supabase
                    .from('club_members')
                    .update({ agent_id: null })
                    .eq('club_id', club.id)
                    .eq('agent_id', memberUserId);
            }

            const { error } = await supabase
                .from('club_members')
                .delete()
                .eq('club_id', club.id)
                .eq('user_id', memberUserId);

            if (error) throw error;
            showToast('Member removed');
            loadData();
        } catch (e) {
            showToast('Failed to remove member', 'error');
        } finally {
            setProcessing(false);
        }
    };

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
            // Read fresh balance to prevent stale-state overwrites
            const { data: freshMember, error: fetchError } = await supabase
                .from('club_members')
                .select('chip_balance')
                .eq('club_id', club.id)
                .eq('user_id', selectedMember.user_id)
                .single();

            if (fetchError) throw fetchError;

            const currentBalance = freshMember?.chip_balance || 0;
            const { error } = await supabase
                .from('club_members')
                .update({ chip_balance: currentBalance + amount })
                .eq('club_id', club.id)
                .eq('user_id', selectedMember.user_id);

            if (error) throw error;

            // Record transaction
            await supabase.from('chip_transactions').insert({
                from_user_id: user.id,
                to_user_id: selectedMember.user_id,
                club_id: club?.id,
                transaction_type: 'admin_credit',
                amount: amount,
                notes: `Admin distribution by ${user?.email || 'admin'}`,
            });

            showToast(`${amount.toLocaleString()} chips sent to ${selectedMember.profiles?.display_name || selectedMember.profiles?.username}`);
            setSelectedMember(null);
            setChipAmount('');
            loadData();
        } catch (e) {
            showToast('Failed to distribute chips', 'error');
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
            const { error } = await supabase
                .from('clubs')
                .update({
                    name: clubName.trim(),
                    description: clubDescription.trim(),
                })
                .eq('id', club.id);

            if (error) throw error;
            showToast('Settings saved');
            loadData();
            setActiveModal(null);
        } catch (e) {
            showToast('Failed to save settings', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // DELETE CLUB
    // ═══════════════════════════════════════════════════════════════════════════
    const deleteClub = async () => {
        // Only the owner can delete the club
        const currentMember = members.find(m => m.user_id === user?.id);
        if (!currentMember || currentMember.role !== 'owner') {
            showToast('Only the club owner can delete the club', 'error');
            return;
        }

        const confirmText = prompt(`Type "${club?.name}" to delete this club permanently:`);
        if (confirmText !== club?.name) {
            showToast('Club name did not match', 'error');
            return;
        }

        setProcessing(true);
        try {
            // Clean up related data first (order matters due to foreign keys)
            try { await supabase.from('chip_transactions').delete().eq('club_id', club.id); } catch (e) { /* may not exist */ }
            try { await supabase.from('club_announcements').delete().eq('club_id', club.id); } catch (e) { /* may not exist */ }
            try { await supabase.from('club_activity').delete().eq('club_id', club.id); } catch (e) { /* may not exist */ }
            try { await supabase.from('tables').delete().eq('club_id', club.id); } catch (e) { /* may not exist */ }
            try { await supabase.from('union_clubs').delete().eq('club_id', club.id); } catch (e) { /* may not exist */ }

            // Delete members
            await supabase.from('club_members').delete().eq('club_id', club.id);

            // Delete club
            const { error } = await supabase.from('clubs').delete().eq('id', club.id);

            if (error) throw error;
            showToast('Club deleted');
            router.push('/hub/club-arena');
        } catch (e) {
            showToast('Failed to delete club', 'error');
        } finally {
            setProcessing(false);
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
        { id: 'members', icon: '', title: 'Manage Members', desc: 'Add, remove, or update player roles', color: FB.primary },
        { id: 'chips', icon: '', title: 'Chip Management', desc: 'Distribute chips to members', color: FB.success },
        { id: 'reports', icon: '', title: 'Club Reports', desc: 'View club statistics and activity', color: '#F582AE' },
        { id: 'settings', icon: 'Admin', title: 'Club Settings', desc: 'Edit club name and description', color: FB.textSecondary },
        { id: 'danger', icon: '', title: 'Danger Zone', desc: 'Delete club permanently', color: FB.danger },
    ];

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

                    <h1 style={S.pageTitle}> Club Admin</h1>

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
                                    <div style={{ ...S.iconBox, background: opt.color }}>{opt.icon}</div>
                                    <div>
                                        <div style={S.actionTitle}>{opt.title}</div>
                                        <div style={S.actionDesc}>{opt.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="admin" />
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
 MANAGE MEMBERS MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'members' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}> Manage Members</span>
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
                                                    <img src={member.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                            <span style={S.modalTitle}> Chip Management</span>
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
                            <span style={S.modalTitle}> Club Reports</span>
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
                            <span style={S.modalTitle}> Danger Zone</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={{ padding: '20px', background: 'rgba(250,56,62,0.1)', borderRadius: '8px', border: `1px solid ${FB.danger}` }}>
                                <h3 style={{ color: FB.danger, fontSize: '16px', marginBottom: '8px' }}> Delete Club</h3>
                                <p style={{ color: FB.textSecondary, fontSize: '14px', marginBottom: '16px' }}>
                                    This action cannot be undone. All members, tables, and data will be permanently deleted.
                                </p>
                                <button
                                    style={{ ...S.modalBtn, background: FB.danger, color: '#fff', opacity: processing ? 0.5 : 1 }}
                                    onClick={deleteClub}
                                    disabled={processing}
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
        </>
    );
}
