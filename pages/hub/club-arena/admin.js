/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Admin | FULLY WIRED
 SmarterPoker Dark Theme | Member Management, Chip Distribution, Settings
 ═══════════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import { haptic } from '../../../src/lib/club-arena/haptic';
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh';
// getAccessToken now handled by centralized apiClient
import useTrainingBus from '../../../src/hooks/useTrainingBus'; import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import SkeletonDark from '../../../src/components/ui/SkeletonDark';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import { resolveAvatarDisplay } from '../../../src/lib/resolveAvatarDisplay';
import { apiCall, apiGet, getAuthToken } from '../../../src/lib/club-arena/apiClient';
import useAdminShortcuts from '../../../src/hooks/useAdminShortcuts';
import dynamic from 'next/dynamic';
import useWalletData from '../../../src/hooks/useWalletData';
const DynamicWallet = dynamic(() => import('../../../src/components/club-arena/DynamicWallet'), { ssr: false });
const ClubAnnouncementBanner = dynamic(() => import('../../../src/components/club-arena/ClubAnnouncementBanner'), { ssr: false });
const CreateTableModal = dynamic(() => import('../../../src/components/club-arena/CreateTableModal'), { ssr: false });

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
    warning: '#F7C52A',
    hover: '#3A3B3C',
};


const ROLES = ['owner', 'admin', 'super_agent', 'agent', 'sub_agent', 'player'];

const MemoizedMemberRow = React.memo(({ member, agents, downlineCount, assignedAgent, processing, assignAgent, updateMemberRole, removeMember, resolveAvatarDisplay, rList, S, FB }) => (
    <div key={member.user_id} style={S.memberRow}>
        <div style={S.memberAvatar}>
            <img src={resolveAvatarDisplay(member.profiles?.avatar_url, member.user_id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
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
                    {rList.map(r => (
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
));

export default function Admin() {
    useTrainingBus('club-arena-admin');
    usePullToRefresh({ onRefresh: () => loadClubData?.() });

    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // Keyboard shortcuts moved down below state initialization
    // Core state
    const [user, setUser] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
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

    // Real-time wallet data (owner view — shows Club Bank)
    const walletData = useWalletData({ supabase, userId: user?.id, clubId: club?.id });

    // Modal states
    const [activeModal, setActiveModal] = useState(null); // 'members' | 'chips' | 'reports' | 'settings' | 'danger'
    const [selectedMember, setSelectedMember] = useState(null);
    const [chipAmount, setChipAmount] = useState('');
    const [processing, setProcessing] = useState(false);

    // BBJ Config state
    const [bbjConfig, setBbjConfig] = useState(null);    // { bbjEnabled, poolAmount, handsContributed, lastHitAt, lastHitAmount }
    const [bbjLoading, setBbjLoading] = useState(false);
    const [bbjSaving, setBbjSaving] = useState(false);

    // Tables management state
    const [tables, setTables] = useState([]);
    const [tablesLoading, setTablesLoading] = useState(false);
    const [editTableModal, setEditTableModal] = useState(null); // table object
    const [editTableForm, setEditTableForm] = useState({});
    const [tableProcessing, setTableProcessing] = useState(false);
    const [tableProcessingIds, setTableProcessingIds] = useState(new Set());
    const [showCreateTable, setShowCreateTable] = useState(false);
    const [tableSearch, setTableSearch] = useState(''); // #11: Table search in admin
    const loadTablesTimerRef = React.useRef(null); // #8: Debounce ref

    // Settings form
    const [clubName, setClubName] = useState('');
    const [clubDescription, setClubDescription] = useState('');
    const [isPublic, setIsPublic] = useState(false);
    const [requiresApproval, setRequiresApproval] = useState(true);

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

    // Anti-cheat state
    const [acTab, setAcTab] = useState('flags');
    const [acFlags, setAcFlags] = useState([]);
    const [acSessions, setAcSessions] = useState([]);
    const [acLoading, setAcLoading] = useState(false);

    // Phase 17: Mint audit
    const [recentMints, setRecentMints] = useState([]);

    // Table Templates state
    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [saveTemplateName, setSaveTemplateName] = useState('');
    const [showSaveTemplate, setShowSaveTemplate] = useState(false);

    // Analytics Dashboard state
    const [analytics, setAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [showRakeReport, setShowRakeReport] = useState(false);
    const [rakeReport, setRakeReport] = useState(null);
    const [rakeReportPeriod, setRakeReportPeriod] = useState('7d');
    const [rakeReportLoading, setRakeReportLoading] = useState(false);

    // Phase 2: Health Score state
    const [healthScore, setHealthScore] = useState(null);
    const [healthLoading, setHealthLoading] = useState(false);
    // Phase 2: Audit Trail state
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditStats, setAuditStats] = useState(null);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditFilter, setAuditFilter] = useState('');
    // Phase 2: Player Retention state
    const [retentionData, setRetentionData] = useState(null);
    const [retentionLoading, setRetentionLoading] = useState(false);
    // Phase 2: Settlement History state
    // Phase 2: Settlement History state
    const [settlementHistory, setSettlementHistory] = useState([]);
    const [settlementHistoryLoading, setSettlementHistoryLoading] = useState(false);

    // Phase 3: Player Sessions Tracker
    const [sessionsData, setSessionsData] = useState(null);
    const [sessionsLoading, setSessionsLoading] = useState(false);

    // Phase 3: Smart Table Recommendations
    const [smartRecsData, setSmartRecsData] = useState(null);
    const [smartRecsLoading, setSmartRecsLoading] = useState(false);

    // Phase 3: Club Branding & Theming
    const [brandingTheme, setBrandingTheme] = useState(null);
    const [brandingLoading, setBrandingLoading] = useState(false);
    const [brandingSaving, setBrandingSaving] = useState(false);

    // Phase 3: Table Chat & Dealer Messages
    const [dealerMsgTable, setDealerMsgTable] = useState('');
    const [dealerMsgText, setDealerMsgText] = useState('');
    const [dealerMsgSending, setDealerMsgSending] = useState(false);

    // Phase 3: Drag-and-Drop Lobby Ordering
    const [lobbyOrder, setLobbyOrder] = useState([]);
    const [lobbyOrderSaving, setLobbyOrderSaving] = useState(false);

    // Keyboard shortcuts must be declared AFTER isAdmin and activeModal states are initialized
    const handleShortcutAction = useCallback((actionId) => {
        if (actionId === 'close_modal') { setActiveModal(null); return; }
        if (actionId === 'new_table') { setActiveModal('tables'); loadTables(); loadTemplates(); setShowCreateTable(true); return; }
        setActiveModal(actionId);
        if (actionId === 'tables') { loadTables(); loadTemplates(); }
    }, []);
    const shortcuts = useAdminShortcuts({ onAction: handleShortcutAction, isAdmin, activeModal });

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
                setClubName(clubData.name || '');
                setClubDescription(clubData.description || '');
                setIsPublic(clubData.is_public || false);
                setRequiresApproval(clubData.requires_approval !== false);

                // Check if user is admin/owner of this club
                if (authUser) {
                    const { data: membership } = await supabase
                        .from('club_members')
                        .select('role')
                        .eq('club_id', clubData.id)
                        .eq('user_id', authUser.id)
                        .maybeSingle();
                    let adminAccess = membership?.role === 'owner' || membership?.role === 'admin';

                    // Also grant access to union admins of the club's parent union
                    if (!adminAccess && clubData.union_id) {
                        const { data: unionAdmin } = await supabase
                            .from('union_admins')
                            .select('role')
                            .eq('union_id', clubData.union_id)
                            .eq('user_id', authUser.id)
                            .maybeSingle();
                        if (unionAdmin) adminAccess = true;
                    }
                    setIsAdmin(adminAccess);
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
                    .in('status', ['active', 'running', 'waiting'])
                    .limit(100) // admin tables

                setStats({
                    totalMembers: memberCount || 0,
                    totalRake: clubData.total_rake || 0,
                    handsPlayed: clubData.hands_played || 0,
                    activeTables: tableData?.length || 0,
                });
            }
        } catch (e) {
            showToast('Failed to load club data', 'error');

        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam]);

    // Load all tables for this club (lazy — only when Tables modal opens)
    // #2: Now fetches `settings` JSONB for game mode pills
    const loadTables = useCallback(async () => {
        if (!club?.id) return;
        // #8: Debounce — prevent double-fetch from realtime + explicit call
        if (loadTablesTimerRef.current) clearTimeout(loadTablesTimerRef.current);
        return new Promise((resolve) => {
            loadTablesTimerRef.current = setTimeout(async () => {
                setTablesLoading(true);
                try {
                    const { data } = await supabase
                        .from('tables')
                        .select('id, name, status, game_variant, game_type, small_blind, big_blind, max_players, current_players, min_buy_in, max_buy_in, ante, action_time_seconds, created_at, updated_at, settings')
                        .eq('club_id', club.id)
                        .order('created_at', { ascending: false })
                        .limit(100);
                    setTables(data || []);
                } catch (_) {
                } finally {
                    setTablesLoading(false);
                }
                resolve();
            }, 200); // 200ms debounce
        });
    }, [club?.id]);

    // ── Initial data load — fire when clubIdParam becomes available ─────────
    useEffect(() => {
        if (clubIdParam) loadData();
    }, [clubIdParam, loadData]);

    // ── Realtime: live table + member + cashout + agent updates ─────────────
    useEffect(() => {
        if (!club?.id) return;
        const ch = supabase
            .channel(`admin-live:${club.id}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'tables',
                filter: `club_id=eq.${club.id}`
            }, () => { loadTables(); loadData(); })
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'club_members',
                filter: `club_id=eq.${club.id}`
            }, () => loadData())
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'cashout_requests',
                filter: `club_id=eq.${club.id}`
            }, () => loadData())
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'agents',
                filter: `club_id=eq.${club.id}`
            }, () => loadData())
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'clubs',
                filter: `id=eq.${club.id}`
            }, (payload) => {
                // Patch treasury/rake in-place without full reload
                setClub(prev => prev ? { ...prev, ...payload.new } : prev);
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {

                }
            });
        return () => { supabase.removeChannel(ch); };
    }, [club?.id, loadData]);

    // ── Event Bus: refresh admin on cross-page mutations ──────────────────
    useEffect(() => {
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const entity = e?.payload?.entity;
            const relevantData = ['tournament_created', 'tournament_registration', 'chips_distributed', 'chips_minted', 'cashout_requested', 'cashout_approved', 'cashout_cancelled', 'rakeback_distributed', 'marketplace_purchase', 'union_club_added', 'agent_credit_issued', 'agent_commission_updated', 'agent_hierarchy_updated', 'agent_suspended', 'promo_distributed', 'member_role_changed', 'agent_assigned', 'member_removed', 'club_settings_updated'];
            const relevantTables = ['table_action', 'table_created', 'table_settings_updated'];

            if (relevantData.includes(entity)) loadData();
            if (relevantTables.includes(entity)) loadTables();
        });
        return () => unsub();
    }, [loadData, loadTables]);

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
        if (activeModal === 'reports') {
            // Phase 17: Load last 10 mint transactions for audit micro-section
            supabase
                .from('chip_transactions')
                .select('id, amount, notes, created_at, from_user_id')
                .eq('club_id', club.id)
                .eq('transaction_type', 'mint')
                .order('created_at', { ascending: false })
                .limit(10)
                .then(({ data }) => setRecentMints(data || []))
                .catch(() => { });
        }
        if (activeModal === 'rakeback') {
            setRakebackLoading(true);
            apiGet(`/api/club-arena/rakeback?clubId=${club.id}&action=status`)
                .then(d => setRakebackStatus(d))
                .catch(() => { })
                .finally(() => setRakebackLoading(false));
        }
        if (activeModal === 'anticheat') {
            setAcLoading(true);
            Promise.all([
                apiCall('/api/club-arena/anti-cheat', { action: 'get_flags', clubId: club.id }).catch(() => ({ flags: [] })),
                apiCall('/api/club-arena/anti-cheat', { action: 'get_sessions', clubId: club.id }).catch(() => ({ sessions: [] })),
            ]).then(([flagsRes, sessionsRes]) => {
                setAcFlags(flagsRes.flags || []);
                setAcSessions(sessionsRes.sessions || []);
            }).finally(() => setAcLoading(false));
        }
        // Phase 2: Health Score
        if (activeModal === 'health') {
            setHealthLoading(true);
            apiCall('/api/club-arena/club-health', { clubId: club.id, action: 'score' })
                .then(d => setHealthScore(d))
                .catch(() => { })
                .finally(() => setHealthLoading(false));
        }
        // Phase 2: Audit Trail
        if (activeModal === 'audit') {
            setAuditLoading(true);
            Promise.all([
                apiCall('/api/club-arena/audit-trail', { clubId: club.id, action: 'list', limit: 50, ...(auditFilter ? { actionType: auditFilter } : {}) }).catch(() => ({ logs: [] })),
                apiCall('/api/club-arena/audit-trail', { clubId: club.id, action: 'stats' }).catch(() => ({ stats: {} })),
            ]).then(([logsRes, statsRes]) => {
                setAuditLogs(logsRes.logs || []);
                setAuditStats(statsRes.stats || null);
            }).finally(() => setAuditLoading(false));
        }
        // Phase 2: Player Retention
        if (activeModal === 'retention') {
            setRetentionLoading(true);
            apiCall('/api/club-arena/player-retention', { clubId: club.id, action: 'scan' })
                .then(d => setRetentionData(d))
                .catch(() => { })
                .finally(() => setRetentionLoading(false));
        }
        // Phase 2: Settlement History
        if (activeModal === 'settlement') {
            setSettlementHistoryLoading(true);
            apiCall('/api/club-arena/settlement-history', { clubId: club.id, action: 'list' })
                .then(d => setSettlementHistory(d.periods || []))
                .catch(() => { })
                .finally(() => setSettlementHistoryLoading(false));
        }
    }, [activeModal, club, auditFilter]);

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
        // Optimistic State Update
        const previousMembers = [...members];
        setMembers(prev => prev.map(m =>
            m.user_id === memberUserId ? { ...m, role: newRole } : m
        ));

        try {
            await apiCall('/api/club-arena/manage-agent', {
                clubId: club.id,
                action: 'change_role',
                targetUserId: memberUserId,
                newRole,
            });
            showToast(`Role updated to ${newRole}`);
            busEmit.dataMutated('member_role_changed');
            loadData();
        } catch (e) {
            // Rollback
            setMembers(previousMembers);
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
            busEmit.dataMutated('agent_assigned');
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
            // Optimistic State Update
            const previousMembers = [...members];
            setMembers(prev => prev.filter(m => m.user_id !== memberUserId));

            try {
                await apiCall('/api/club-arena/manage-agent', {
                    clubId: club.id,
                    action: 'remove',
                    targetUserId: memberUserId,
                });
                showToast('Member removed');
                busEmit.dataMutated('member_removed');
                loadData();
            } catch (e) {
                // Rollback
                setMembers(previousMembers);
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

        const name = selectedMember.profiles?.display_name || selectedMember.profiles?.username;

        // OPTIMISTIC UI: Immediately show the chips as sent
        const previousBalance = selectedMember.chip_balance || 0;
        setMembers(prev => prev.map(m =>
            m.user_id === selectedMember.user_id
                ? { ...m, chip_balance: (m.chip_balance || 0) + amount, _confirming: true }
                : m
        ));
        showToast(`⚡ ${amount.toLocaleString()} chips sent to ${name} (confirming...)`);
        const savedMember = selectedMember;
        setSelectedMember(null);
        setChipAmount('');

        setProcessing(true);
        try {
            await apiCall('/api/club-arena/distribute-chips', {
                clubId: club.id,
                toUserId: savedMember.user_id,
                amount,
                notes: `Admin distribution by ${user?.email || 'admin'}`,
            });

            // Confirmed — remove confirming badge
            setMembers(prev => prev.map(m =>
                m.user_id === savedMember.user_id
                    ? { ...m, _confirming: false, _confirmed: true }
                    : m
            ));
            setTimeout(() => {
                setMembers(prev => prev.map(m =>
                    m.user_id === savedMember.user_id ? { ...m, _confirmed: false } : m
                ));
            }, 3000);
            showToast(`✅ ${amount.toLocaleString()} chips confirmed to ${name}`);
            busEmit.dataMutated('chips_distributed');
        } catch (e) {
            // ROLLBACK: Reverse the optimistic update
            setMembers(prev => prev.map(m =>
                m.user_id === savedMember.user_id
                    ? { ...m, chip_balance: previousBalance, _confirming: false }
                    : m
            ));
            showToast(e.message || 'Failed to distribute chips', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // TABLE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════
    // #5: Optimistic UI for table actions
    const handleTableAction = async (tableId, action) => {
        setTableProcessing(true);
        setTableProcessingIds(prev => new Set(prev).add(tableId));
        // Optimistic: immediately update status in local state
        const previousTables = [...tables];
        const statusMap = { close: 'closed', delete: 'deleted', pause: 'paused', resume: 'running' };
        setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: statusMap[action] || t.status } : t));
        try {
            await apiCall('/api/club-arena/manage-table', { tableId, clubId: club.id, action });
            showToast(`Table ${action}d`);
            busEmit.dataMutated('table_action');
            loadTables(); // sync with server
            if (action === 'delete') {
                setStats(prev => ({ ...prev, activeTables: Math.max(0, prev.activeTables - 1) }));
            }
        } catch (e) {
            setTables(previousTables); // rollback on error
            showToast(e.message || `Failed to ${action} table`, 'error');
        } finally {
            setTableProcessing(false);
            setTableProcessingIds(prev => { const n = new Set(prev); n.delete(tableId); return n; });
        }
    };

    // #7: Bulk table operations
    const handleBulkAction = async (action) => {
        const targets = tables.filter(t => {
            if (action === 'close') return ['active', 'running', 'waiting', 'paused'].includes(t.status);
            if (action === 'pause') return ['active', 'running'].includes(t.status);
            return false;
        });
        if (targets.length === 0) { showToast(`No tables to ${action}`, 'error'); return; }
        setTableProcessing(true);
        let successCount = 0;
        for (const t of targets) {
            try {
                await apiCall('/api/club-arena/manage-table', { tableId: t.id, clubId: club.id, action });
                successCount++;
            } catch (_) { /* continue */ }
        }
        showToast(`${action}d ${successCount}/${targets.length} tables`);
        busEmit.dataMutated('table_action');
        loadTables();
        setTableProcessing(false);
    };

    // #3: Clone table — create a new table with the same settings
    const handleCloneTable = async (sourceTable) => {
        if (!sourceTable || !club?.id) return;
        setTableProcessing(true);
        try {
            const result = await apiCall('/api/club-arena/create-table', {
                clubId: club.id,
                name: `${sourceTable.name || 'Table'} (Copy)`,
                variant: sourceTable.game_variant || 'nlh',
                gameType: sourceTable.game_type || 'cash',
                smallBlind: sourceTable.small_blind,
                bigBlind: sourceTable.big_blind,
                maxPlayers: sourceTable.max_players,
                minBuyIn: sourceTable.min_buy_in,
                maxBuyIn: sourceTable.max_buy_in,
                ante: sourceTable.ante || 0,
                actionTime: sourceTable.action_time_seconds || 30,
                settings: sourceTable.settings || {},
            });
            showToast(`Table cloned: "${result.table?.name || 'Copy'}"`);
            busEmit.dataMutated('table_created');
            loadTables();
            loadData();
        } catch (e) {
            showToast(e.message || 'Failed to clone table', 'error');
        } finally {
            setTableProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // TABLE TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════════
    const loadTemplates = async () => {
        if (!club?.id) return;
        setTemplatesLoading(true);
        try {
            const data = await apiCall('/api/club-arena/table-templates', { action: 'list', clubId: club.id });
            setTemplates(data.templates || []);
        } catch (e) {
            console.error('Failed to load templates:', e);
        } finally {
            setTemplatesLoading(false);
        }
    };

    const saveTemplate = async (name, tableConfig) => {
        if (!club?.id || !name?.trim()) return;
        try {
            await apiCall('/api/club-arena/table-templates', {
                action: 'save',
                clubId: club.id,
                name: name.trim(),
                config: tableConfig,
            });
            showToast(`Template "${name}" saved!`);
            setSaveTemplateName('');
            setShowSaveTemplate(false);
            loadTemplates();
            busEmit.dataMutated('table_settings_updated');
        } catch (e) {
            showToast(e.message || 'Failed to save template', 'error');
        }
    };

    const deleteTemplate = async (templateId, templateName) => {
        askConfirm(`Delete template "${templateName}"?`, async () => {
            try {
                await apiCall('/api/club-arena/table-templates', { action: 'delete', clubId: club.id, templateId });
                showToast('Template deleted');
                loadTemplates();
            } catch (e) {
                showToast(e.message || 'Delete failed', 'error');
            }
        });
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3 LOADERS (Sessions, Recommendations, Branding, Lobby Order)
    // ═══════════════════════════════════════════════════════════════════════════
    const loadPlayerSessions = async () => {
        if (!club?.id) return;
        setSessionsLoading(true);
        try {
            const res = await apiGet(`/api/club-arena/player-sessions?clubId=${club.id}`);
            if (res.success) setSessionsData(res);
        } catch (e) {
            showToast('Failed to load sessions', 'error');
        } finally {
            setSessionsLoading(false);
        }
    };

    const loadSmartRecs = async () => {
        if (!club?.id) return;
        setSmartRecsLoading(true);
        try {
            const res = await apiGet(`/api/club-arena/smart-recommendations?clubId=${club.id}`);
            if (res.success) setSmartRecsData(res);
        } catch (e) {
            showToast('Failed to load recommendations', 'error');
        } finally {
            setSmartRecsLoading(false);
        }
    };

    const loadClubBranding = async () => {
        if (!club?.id) return;
        setBrandingLoading(true);
        try {
            const res = await apiCall('/api/club-arena/club-branding', { action: 'get', clubId: club.id });
            if (res.success) setBrandingTheme(res.theme);
        } catch (e) {
            showToast('Failed to load branding', 'error');
        } finally {
            setBrandingLoading(false);
        }
    };

    const saveClubBranding = async () => {
        if (!club?.id || !brandingTheme) return;
        setBrandingSaving(true);
        try {
            await apiCall('/api/club-arena/club-branding', { action: 'save', clubId: club.id, theme: brandingTheme });
            showToast('Branding saved! Theme will apply next reload.');
            setActiveModal(null);
        } catch (e) {
            showToast(e.message || 'Failed to save branding', 'error');
        } finally {
            setBrandingSaving(false);
        }
    };

    const sendDealerMessage = async () => {
        if (!club?.id || !dealerMsgTable || !dealerMsgText) return;
        setDealerMsgSending(true);
        try {
            await apiCall('/api/club-arena/table-chat', { action: 'dealer_msg', clubId: club.id, tableId: dealerMsgTable, message: dealerMsgText });
            showToast('Dealer message broadcasted!');
            setDealerMsgText('');
        } catch (e) {
            showToast(e.message || 'Failed to send message', 'error');
        } finally {
            setDealerMsgSending(false);
        }
    };

    const loadLobbyOrder = async () => {
        if (!club?.id) return;
        try {
            const res = await apiCall('/api/club-arena/lobby-ordering', { action: 'get', clubId: club.id });
            if (res.success && res.order && res.order.length > 0) {
                setLobbyOrder(res.order);
            } else if (tables && tables.length > 0) {
                setLobbyOrder(tables.map(t => t.id));
            }
        } catch (e) {
            showToast('Failed to load ordering', 'error');
        }
    };

    const saveLobbyOrder = async () => {
        if (!club?.id || !lobbyOrder.length) return;
        setLobbyOrderSaving(true);
        try {
            await apiCall('/api/club-arena/lobby-ordering', { action: 'save', clubId: club.id, order: lobbyOrder });
            showToast('Lobby order updated!');
            setActiveModal(null);
        } catch (e) {
            showToast('Failed to save order', 'error');
        } finally {
            setLobbyOrderSaving(false);
        }
    };

    // Auto-load Phase 3 data when their modals open
    useEffect(() => {
        if (activeModal === 'sessions') loadPlayerSessions();
        if (activeModal === 'smart_recs') loadSmartRecs();
        if (activeModal === 'branding') loadClubBranding();
        if (activeModal === 'lobby_order') { loadTables(); loadLobbyOrder(); }
    }, [activeModal]);


    // ═══════════════════════════════════════════════════════════════════════════
    // ANALYTICS DASHBOARD
    // ═══════════════════════════════════════════════════════════════════════════
    const loadAnalytics = useCallback(async () => {
        if (!club?.id) return;
        setAnalyticsLoading(true);
        try {
            const data = await apiGet(`/api/club-arena/club-analytics?clubId=${club.id}`);
            if (data.analytics) setAnalytics(data.analytics);
        } catch (e) {
            console.error('Failed to load analytics:', e);
        } finally {
            setAnalyticsLoading(false);
        }
    }, [club?.id]);

    const loadRakeReport = async (period) => {
        const p = period || rakeReportPeriod;
        if (!club?.id) return;
        setRakeReportLoading(true);
        try {
            const data = await apiGet(`/api/club-arena/club-analytics?clubId=${club.id}&action=rake_report&period=${p}`);
            setRakeReport(data);
        } catch (e) {
            console.error('Failed to load rake report:', e);
            showToast('Failed to load rake report', 'error');
        } finally {
            setRakeReportLoading(false);
        }
    };

    const downloadRakeCSV = async () => {
        if (!club?.id) return;
        try {
            const token = await getAuthToken();
            const res = await fetch(`/api/club-arena/club-analytics?clubId=${club.id}&action=csv&period=${rakeReportPeriod}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rake_report_${rakeReportPeriod}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('CSV downloaded!');
        } catch (e) {
            showToast('Download failed', 'error');
        }
    };

    // Auto-load analytics on mount + 60s refresh
    useEffect(() => {
        if (club?.id && isAdmin) {
            loadAnalytics();
            const timer = setInterval(loadAnalytics, 60000);
            return () => clearInterval(timer);
        }
    }, [club?.id, isAdmin, loadAnalytics]);

    const saveTableSettings = async () => {
        if (!editTableModal) return;
        // #9+#10: Enhanced inline validation
        const sb = parseFloat(editTableForm.small_blind);
        const bb = parseFloat(editTableForm.big_blind);
        if (sb && bb && sb >= bb) { showToast('Small blind must be less than big blind', 'error'); return; }
        const minBI = parseInt(editTableForm.min_buy_in);
        const maxBI = parseInt(editTableForm.max_buy_in);
        if (minBI && maxBI && minBI > maxBI) { showToast('Min buy-in cannot exceed max buy-in', 'error'); return; }
        // #10: max_players >= current_players check
        const mp = parseInt(editTableForm.max_players);
        if (mp && editTableModal.current_players && mp < editTableModal.current_players) {
            showToast(`Max players (${mp}) cannot be less than current players (${editTableModal.current_players})`, 'error');
            return;
        }
        setTableProcessing(true);
        try {
            await apiCall('/api/club-arena/update-table-settings', {
                tableId: editTableModal.id,
                clubId: club.id,
                name: editTableForm.name,
                smallBlind: editTableForm.small_blind ? parseFloat(editTableForm.small_blind) : undefined,
                bigBlind: editTableForm.big_blind ? parseFloat(editTableForm.big_blind) : undefined,
                maxPlayers: editTableForm.max_players ? parseInt(editTableForm.max_players) : undefined,
                minBuyIn: editTableForm.min_buy_in ? parseInt(editTableForm.min_buy_in) : undefined,
                maxBuyIn: editTableForm.max_buy_in ? parseInt(editTableForm.max_buy_in) : undefined,
                actionTime: editTableForm.action_time_seconds ? parseInt(editTableForm.action_time_seconds) : undefined,
                ante: editTableForm.ante ? parseFloat(editTableForm.ante) : undefined,
            });
            showToast('Table settings saved');
            busEmit.dataMutated('table_settings_updated');
            setEditTableModal(null);
            loadTables();
        } catch (e) {
            showToast(e.message || 'Failed to save', 'error');
        } finally {
            setTableProcessing(false);
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
                isPublic,
                requiresApproval,
            });
            showToast('Settings saved');
            busEmit.dataMutated('club_settings_updated');
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
        { id: 'bbj', title: '[GAME] BBJ Config', desc: 'Enable / disable Bad Beat Jackpot for this club', color: '#FFD700' },
        { id: 'tables', title: 'Table Management', desc: 'Pause, close, delete, or edit table settings', color: '#0EA5E9' },
        { id: 'anticheat', title: '[SECURITY] Anti-Cheat', desc: 'View flags, sessions, and kick suspicious players', color: '#FF453A' },
        { id: 'health', title: '📊 Club Health', desc: 'Composite score, trend arrows, breakdown', color: '#10B981' },
        { id: 'audit', title: '📋 Audit Trail', desc: 'Live audit log with CSV export', color: '#6366F1' },
        { id: 'retention', title: '🎯 Player Retention', desc: 'At-risk players, welcome-back promos', color: '#EC4899' },
        { id: 'sessions', title: '📡 Player Sessions', desc: 'Live tracker of who is playing now', color: '#38BDF8' },
        { id: 'smart_recs', title: '🧠 AI Table Recommender', desc: 'AI-driven optimizations to boost rake', color: '#8B5CF6' },
        { id: 'lobby_order', title: '↕️ Lobby Ordering', desc: 'Drag-and-drop table positions', color: '#94A3B8' },
        { id: 'telecom', title: '🎙️ Club Broadcasts', desc: 'Send dealer chat messages to tables', color: '#F43F5E' },
        { id: 'branding', title: '🎨 Club Branding', desc: 'Custom theme colors, chips, and table felts', color: '#EAB308' },
        { id: 'settings', title: '⚙️ Club Settings', desc: 'Edit club name, rules, and privacy', color: FB.textSecondary },
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
            {/* Pulse animation for live table indicators */}
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
            <SEOHead
                title="Club Arena — Admin"
                description="Club Arena Administration Panel."
                canonical="/hub/club-arena/admin"
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

                    <h1 style={S.pageTitle}>
                        Club Admin
                        <span style={{ fontSize: 11, color: FB.textSecondary, fontWeight: 400, marginLeft: 8 }}>⌘K shortcuts</span>
                    </h1>

                    {isLoading ? (
                        <div style={{ marginTop: 20 }}><SkeletonDark variant="stat-cards" count={3} /><div style={{ marginTop: 20 }}><SkeletonDark variant="table-rows" rows={4} /></div></div>
                    ) : !isAdmin ? (
                        <div style={S.noAccess}>
                            <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}></span>
                            <p>You Don't Have Admin Access To This Club</p>
                        </div>
                    ) : (
                        <>
                            {/* Owner/Admin Wallet — shows Club Bank */}
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
                                <DynamicWallet {...walletData} compact onBuyDiamonds={() => router.push('/hub/diamond-store')} onOpenBBJ={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}#bbj`)} />
                            </div>

                            <HubErrorBoundary name="AnnouncementsBanner">
                                <ClubAnnouncementBanner clubId={clubIdParam} userRole={currentMemberForUI?.role} />
                            </HubErrorBoundary>

                            {/* ═══ Analytics Dashboard Widget ═══ */}
                            {analytics && (
                                <div style={{
                                    background: FB.cardBg, borderRadius: 12, padding: '16px 18px',
                                    border: `1px solid ${FB.border}`, marginBottom: 16,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: FB.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Live Dashboard</span>
                                        <button
                                            onClick={() => { setShowRakeReport(true); loadRakeReport(); }}
                                            style={{ background: 'rgba(35,116,225,0.12)', border: '1px solid rgba(35,116,225,0.3)', borderRadius: 6, color: FB.primary, fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}
                                        >📊 Rake Report</button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: FB.success }}>{(analytics.todayRake || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2, textTransform: 'uppercase' }}>Today Rake</div>
                                            {analytics.rakeChange !== 0 && (
                                                <div style={{ fontSize: 10, fontWeight: 700, color: analytics.rakeChange > 0 ? FB.success : FB.danger, marginTop: 2 }}>
                                                    {analytics.rakeChange > 0 ? '▲' : '▼'} {Math.abs(analytics.rakeChange)}% vs yesterday
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: FB.primary }}>{analytics.seatedNow || 0}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2, textTransform: 'uppercase' }}>Seated Now</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2 }}>{analytics.uniquePlayers24h || 0} unique 24h</div>
                                        </div>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: '#0EA5E9' }}>{analytics.activeTables || 0}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2, textTransform: 'uppercase' }}>Active Tables</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2 }}>{analytics.totalMembers || 0} members</div>
                                        </div>
                                    </div>
                                    {/* 7-day Sparkline */}
                                    {analytics.sparkline && analytics.sparkline.some(v => v > 0) && (
                                        <div style={{ background: FB.background, borderRadius: 8, padding: '10px 14px' }}>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginBottom: 6, textTransform: 'uppercase', fontWeight: 700 }}>7-Day Rake Trend</div>
                                            <svg viewBox="0 0 200 40" style={{ width: '100%', height: 40 }}>
                                                {(() => {
                                                    const data = analytics.sparkline;
                                                    const max = Math.max(...data, 1);
                                                    const points = data.map((v, i) => `${(i / (data.length - 1)) * 196 + 2},${38 - (v / max) * 34}`).join(' ');
                                                    return (
                                                        <>
                                                            <polyline points={points} fill="none" stroke="#31A24C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                            <polyline points={`2,38 ${points} 198,38`} fill="url(#sparkGrad)" opacity="0.3" />
                                                            <defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#31A24C" /><stop offset="100%" stopColor="transparent" /></linearGradient></defs>
                                                        </>
                                                    );
                                                })()}
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ═══ Quick Actions Bar ═══ */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => { setActiveModal('mint'); }}
                                    style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 10px', background: 'rgba(247,197,42,0.12)', border: '1px solid rgba(247,197,42,0.3)', borderRadius: 10, color: '#F7C52A', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(247,197,42,0.25)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(247,197,42,0.12)'}
                                >
                                    💰 Mint
                                </button>
                                <button
                                    onClick={() => { setActiveModal('tables'); loadTables(); loadTemplates(); setShowCreateTable(true); }}
                                    style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 10px', background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 10, color: '#0EA5E9', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(14,165,233,0.25)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(14,165,233,0.12)'}
                                >
                                    🎯 New Table
                                </button>
                                <button
                                    onClick={() => { setActiveModal('chips'); }}
                                    style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 10px', background: 'rgba(49,162,76,0.12)', border: '1px solid rgba(49,162,76,0.3)', borderRadius: 10, color: '#31A24C', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(49,162,76,0.25)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(49,162,76,0.12)'}
                                >
                                    🎰 Distribute
                                </button>
                            </div>

                            <h2 style={S.sectionTitle}>Administration</h2>
                            {adminOptions.map(opt => (
                                <div
                                    key={opt.id}
                                    style={S.actionCard}
                                    onClick={() => { setActiveModal(opt.id); if (opt.id === 'tables') { loadTables(); loadTemplates(); } }}
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
                                const agents = members.filter(m => ['agent', 'super_agent'].includes(m.role));
                                return members.map(member => {
                                    const assignedAgent = agents.find(a => a.user_id === member.agent_id);
                                    const downlineCount = member.role === 'agent' ? members.filter(m => m.agent_id === member.user_id).length : 0;
                                    return (
                                        <MemoizedMemberRow
                                            key={member.user_id}
                                            member={member}
                                            agents={agents}
                                            downlineCount={downlineCount}
                                            assignedAgent={assignedAgent}
                                            processing={processing}
                                            assignAgent={assignAgent}
                                            updateMemberRole={updateMemberRole}
                                            removeMember={removeMember}
                                            resolveAvatarDisplay={resolveAvatarDisplay}
                                            rList={ROLES.filter(r => r !== 'owner')}
                                            S={S} FB={FB}
                                        />
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
                                <input
                                    type="text"
                                    placeholder="Search members..."
                                    style={{ ...S.formInput, marginBottom: 8 }}
                                    onChange={e => {
                                        const q = e.target.value.toLowerCase();
                                        // Filter is applied inline to the select options below
                                        e.target.dataset.search = q;
                                        // Force re-render by toggling a trivial state
                                        setChipAmount(prev => prev);
                                    }}
                                    id="chip-member-search"
                                />
                                <select
                                    style={{ ...S.formInput, marginBottom: 0 }}
                                    value={selectedMember?.user_id || ''}
                                    onChange={e => setSelectedMember(members.find(m => m.user_id === e.target.value))}
                                >
                                    <option value="">Choose A Member...</option>
                                    {members.filter(m => {
                                        const searchEl = typeof document !== 'undefined' && document.getElementById('chip-member-search');
                                        const q = searchEl?.dataset?.search || '';
                                        if (!q) return true;
                                        const name = (m.profiles?.display_name || m.profiles?.username || '').toLowerCase();
                                        const num = String(m.profiles?.player_number || '');
                                        return name.includes(q) || num.includes(q);
                                    }).map(m => (
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
                            {/* Club Health Dashboard */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📊 Club Health Dashboard</div>
                                <div className="ca-health-grid">
                                    <div className="ca-health-card">
                                        <div className="ca-health-value">{stats.totalMembers}</div>
                                        <div className="ca-health-label">Members</div>
                                    </div>
                                    <div className="ca-health-card">
                                        <div className="ca-health-value">{stats.activeTables}</div>
                                        <div className="ca-health-label">Active Tables</div>
                                    </div>
                                    <div className="ca-health-card">
                                        <div className="ca-health-value" style={{ color: '#4ade80' }}>{stats.totalRake.toLocaleString()}</div>
                                        <div className="ca-health-label">Total Rake</div>
                                    </div>
                                    <div className="ca-health-card">
                                        <div className="ca-health-value">{stats.handsPlayed.toLocaleString()}</div>
                                        <div className="ca-health-label">Hands Played</div>
                                    </div>
                                    <div className="ca-health-card">
                                        <div className="ca-health-value" style={{ color: stats.handsPlayed > 0 ? '#4ade80' : '#B0B3B8' }}>{stats.handsPlayed > 0 && stats.activeTables > 0 ? Math.round(stats.handsPlayed / Math.max(1, stats.activeTables)).toLocaleString() : '—'}</div>
                                        <div className="ca-health-label">Hands/Table</div>
                                    </div>
                                    <div className="ca-health-card">
                                        <div className="ca-health-value" style={{ color: stats.totalRake > 0 ? '#fbbf24' : '#B0B3B8' }}>{stats.totalRake > 0 && stats.handsPlayed > 0 ? (stats.totalRake / stats.handsPlayed).toFixed(1) : '—'}</div>
                                        <div className="ca-health-label">Avg Rake/Hand</div>
                                    </div>
                                    <div className="ca-health-card">
                                        <div className="ca-health-value" style={{ color: stats.totalMembers > 0 ? '#00d4ff' : '#B0B3B8' }}>{stats.totalMembers > 0 ? `${Math.round((stats.activeTables / Math.max(1, stats.totalMembers)) * 100)}%` : '—'}</div>
                                        <div className="ca-health-label">Table Utilization</div>
                                    </div>
                                    <div className="ca-health-card">
                                        <div className="ca-health-value" style={{ color: club?.chip_treasury > 0 ? '#4ade80' : '#f87171' }}>{(club?.chip_treasury || 0).toLocaleString()}</div>
                                        <div className="ca-health-label">Treasury</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ borderTop: `1px solid ${FB.border}`, paddingTop: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: FB.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legacy Stats</div>
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

                            {/* ─── Phase 17: Mint Audit ─── */}
                            <div style={{ marginTop: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#F7C52A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    🪙 Recent Mints
                                    <span style={{ fontSize: 11, fontWeight: 400, color: FB.textSecondary }}>(last 10)</span>
                                </div>
                                {recentMints.length === 0 ? (
                                    <div style={{ color: FB.textSecondary, fontSize: 12, textAlign: 'center', padding: '16px 0' }}>No mints recorded yet</div>
                                ) : recentMints.map((tx, i) => (
                                    <div key={tx.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: i % 2 === 0 ? FB.hover : 'transparent', borderRadius: 6 }}>
                                        <div>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: '#F7C52A' }}>
                                                +{Number(tx.amount).toLocaleString()} chips
                                            </span>
                                            {tx.notes && (
                                                <span style={{ fontSize: 11, color: FB.textSecondary, marginLeft: 8 }}>
                                                    "{tx.notes}"
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                            {tx.created_at ? new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </div>
                                    </div>
                                ))}
                                {recentMints.length > 0 && (
                                    <div style={{ textAlign: 'right', marginTop: 8, fontSize: 11, color: FB.textSecondary }}>
                                        Total minted (shown): <strong style={{ color: '#F7C52A' }}>{recentMints.reduce((s, t) => s + Number(t.amount), 0).toLocaleString()}</strong>
                                    </div>
                                )}
                            </div>

                            {/* ─── Settlement Report Export ─── */}
                            <div style={{ marginTop: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#A855F7', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    📊 Settlement Export
                                </div>
                                <button
                                    disabled={processing}
                                    onClick={async () => {
                                        setProcessing(true);
                                        try {
                                            const { data: records } = await supabase
                                                .from('commission_records')
                                                .select('id, agent_id, commission_amount, rake_attributed, status, paid_at, period_id, created_at')
                                                .eq('club_id', club.id)
                                                .order('created_at', { ascending: false })
                                                .limit(500);

                                            if (!records || records.length === 0) {
                                                showToast('No settlement records found', 'info');
                                                setProcessing(false);
                                                return;
                                            }

                                            const header = 'Date,Agent ID,Rake Attributed,Commission,Status,Paid At\n';
                                            const rows = records.map(r => {
                                                const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
                                                const paidAt = r.paid_at ? new Date(r.paid_at).toLocaleDateString() : '';
                                                return `${date},${r.agent_id?.slice(0, 8) || ''},${r.rake_attributed || 0},${r.commission_amount || 0},${r.status || 'pending'},${paidAt}`;
                                            }).join('\n');

                                            const blob = new Blob([header + rows], { type: 'text/csv' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `settlement-${(club.name || 'club').replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                            showToast('Settlement report downloaded');
                                        } catch (e) {
                                            showToast(e.message || 'Export failed', 'error');
                                        } finally { setProcessing(false); }
                                    }}
                                    style={{
                                        width: '100%', padding: '12px', background: '#A855F720',
                                        border: '1px solid #A855F740', borderRadius: 8,
                                        color: '#A855F7', fontSize: 13, fontWeight: 700,
                                        cursor: 'pointer', opacity: processing ? 0.5 : 1,
                                    }}
                                >
                                    {processing ? 'Exporting...' : '⬇ Download Settlement CSV'}
                                </button>
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

                            {/* Public/Private Toggle */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${FB.border}` }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: FB.textPrimary }}>Public Club</div>
                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>Visible in club discovery for anyone to find</div>
                                </div>
                                <button
                                    onClick={() => setIsPublic(!isPublic)}
                                    style={{
                                        width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                                        background: isPublic ? '#31A24C' : '#3E4042', position: 'relative',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                        position: 'absolute', top: 3, left: isPublic ? 25 : 3,
                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                    }} />
                                </button>
                            </div>

                            {/* Require Approval Toggle */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${FB.border}` }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: FB.textPrimary }}>Require Approval</div>
                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>New members need owner approval to join</div>
                                </div>
                                <button
                                    onClick={() => setRequiresApproval(!requiresApproval)}
                                    style={{
                                        width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                                        background: requiresApproval ? '#31A24C' : '#3E4042', position: 'relative',
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                        position: 'absolute', top: 3, left: requiresApproval ? 25 : 3,
                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                    }} />
                                </button>
                            </div>
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
                                <h3 style={{ color: FB.danger, fontSize: '16px', marginBottom: '8px' }}>[WARN] Delete Club</h3>
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
                                        busEmit.dataMutated('agent_credit_issued');
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
                                        busEmit.dataMutated('agent_commission_updated');
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
                                {(members || []).filter(m => ['agent', 'super_agent'].includes(m.role) && m.user_id !== agentActionModal.agent.user_id).map(a => (
                                    <option key={a.user_id} value={a.user_id}>{a.profiles?.display_name || a.profiles?.username || a.user_id.slice(0, 8)}</option>
                                ))}
                            </select>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => { setAgentActionModal(null); setAgentActionValue(''); }} style={{ flex: 1, padding: 10, background: '#3A3B3C', border: 'none', borderRadius: 8, color: '#B0B3B8', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={async () => {
                                    setProcessing(true);
                                    try {
                                        await apiCall('/api/club-arena/manage-agent', { clubId: club.id, targetUserId: agentActionModal.agent.user_id, action: 'set_parent_agent', parentAgentUserId: agentActionValue || null });
                                        showToast(agentActionValue ? 'Parent agent assigned' : 'Agent set as independent');
                                        busEmit.dataMutated('agent_hierarchy_updated');
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
                                                            showToast(`Period closed! ${r.playersProcessed} players, ${r.totalRakebackDistributed?.toLocaleString()} chips rakeback distributed.`); busEmit.dataMutated('rakeback_distributed'); busEmit.celebration('confetti');
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
                                        showToast(`Minted ${parseInt(mintAmount).toLocaleString()} chips to treasury`); busEmit.dataMutated('chips_minted');
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
                            {members.filter(m => ['agent', 'super_agent', 'sub_agent'].includes(m.role)).length === 0 ? (
                                <div style={{ textAlign: 'center', color: FB.textSecondary, padding: '30px' }}>
                                    No agents in this club. Promote a member to agent from the Members panel.
                                </div>
                            ) : members.filter(m => ['agent', 'super_agent', 'sub_agent'].includes(m.role)).map(agent => (
                                <div key={agent.user_id} style={{ background: FB.background, borderRadius: '8px', padding: '14px', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, color: FB.textPrimary, fontSize: '14px' }}>
                                                {agent.profiles?.display_name || agent.profiles?.username || agent.user_id.slice(0, 8)}
                                            </span>
                                            <span style={{ fontSize: '12px', color: '#F5A623', marginLeft: '8px' }}>{agent.role === 'super_agent' ? 'Super Agent' : agent.role === 'sub_agent' ? 'Sub Agent' : 'Agent'}</span>
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
                                                askConfirm(`Suspend agent ${agent.profiles?.display_name || agent.profiles?.username || agent.user_id.slice(0, 8)}?`, async () => {
                                                    setConfirmModal(null);
                                                    setProcessing(true);
                                                    try {
                                                        await apiCall('/api/club-arena/manage-agent', { clubId: club.id, targetUserId: agent.user_id, action: 'suspend' });
                                                        showToast('Agent suspended');
                                                        busEmit.dataMutated('agent_suspended');
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
                                        // Refresh history
                                        apiCall('/api/club-arena/settlement-history', { clubId: club.id, action: 'list' })
                                            .then(d => setSettlementHistory(d.periods || []))
                                            .catch(() => { });
                                    } catch (e) { showToast(e.message, 'error'); }
                                    finally { setProcessing(false); }
                                }}
                            >
                                {processing ? 'Processing...' : `Execute: ${settleAction === 'pay_all' ? 'Pay All' : settleAction}`}
                            </button>

                            {/* Phase 2: Settlement History Timeline */}
                            {settlementHistory.length > 0 && (
                                <div style={{ marginTop: 20 }}>
                                    <h4 style={{ fontSize: 12, fontWeight: 700, color: FB.textSecondary, textTransform: 'uppercase', marginBottom: 10 }}>Settlement History</h4>
                                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                        {settlementHistory.map((p, i) => (
                                            <div key={p.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: FB.background, borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${p.status === 'closed' ? FB.success : p.status === 'open' ? '#A855F7' : FB.border}` }}>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary, textTransform: 'capitalize' }}>
                                                        {p.status} Period
                                                    </div>
                                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                                        {p.started_at ? new Date(p.started_at).toLocaleDateString() : '—'} → {p.closed_at ? new Date(p.closed_at).toLocaleDateString() : 'now'}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#F7C52A' }}>{(p.total_rake_collected || 0).toLocaleString()}</div>
                                                    <div style={{ fontSize: 10, color: FB.textSecondary }}>rake</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {settlementHistoryLoading && (
                                <div style={{ textAlign: 'center', padding: 16, color: FB.textSecondary, fontSize: 12 }}>Loading history...</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── ANTI-CHEAT MODAL ─────────────────────────────────────────────── */}
            {activeModal === 'anticheat' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>[SECURITY] Anti-Cheat</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                {['flags', 'sessions'].map(tab => (
                                    <button key={tab} onClick={() => setAcTab(tab)} style={{
                                        flex: 1, background: acTab === tab ? '#FF453A' : FB.hover,
                                        color: acTab === tab ? '#fff' : FB.textSecondary,
                                        border: 'none', borderRadius: 8, padding: '8px 0',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                    }}>{tab === 'flags' ? `[FLAG] Flags (${acFlags.length})` : `[VIEW] Sessions (${acSessions.length})`}</button>
                                ))}
                            </div>
                            {acLoading ? (
                                <div style={{ textAlign: 'center', color: FB.textSecondary, padding: 30 }}>Loading...</div>
                            ) : acTab === 'flags' ? (
                                acFlags.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: FB.textSecondary, padding: 24 }}>[OK] No open flags — club is clean.</div>
                                ) : acFlags.map((flag, i) => (
                                    <div key={flag.id || i} style={{
                                        background: FB.background, borderRadius: 10, padding: 14, marginBottom: 10,
                                        border: `1px solid ${flag.severity === 'high' ? '#FF453A' : flag.severity === 'medium' ? '#FF9500' : FB.border}`,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <div>
                                                <span style={{ background: flag.severity === 'high' ? '#FF453A' : flag.severity === 'medium' ? '#FF9500' : '#636366', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 700, marginRight: 8 }}>{(flag.severity || 'low').toUpperCase()}</span>
                                                <span style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary }}>{flag.flag_type || flag.type}</span>
                                            </div>
                                            <span style={{ fontSize: 11, color: FB.textSecondary }}>{flag.created_at ? new Date(flag.created_at).toLocaleString() : ''}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                            Player: <strong style={{ color: FB.textPrimary }}>{flag.player?.display_name || flag.player?.username || flag.user_id}</strong>
                                            <span className={`ca-trust-badge ${flag.trust_score >= 80 ? 'ca-trust-high' : flag.trust_score >= 50 ? 'ca-trust-medium' : 'ca-trust-low'}`}>
                                                {flag.trust_score >= 80 ? '🛡️' : flag.trust_score >= 50 ? '⚠️' : '🔴'} {flag.trust_score || '??'}
                                            </span>
                                            {flag.description && <> — {flag.description}</>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {['dismiss', 'reviewed', 'kick'].map(verdict => (
                                                <button key={verdict} disabled={processing} onClick={async () => {
                                                    setProcessing(true);
                                                    try {
                                                        if (verdict === 'kick') {
                                                            await apiCall('/api/club-arena/anti-cheat', { action: 'kick_player', clubId: club.id, playerId: flag.user_id, tableId: flag.table_id || null, reason: flag.flag_type });
                                                            showToast('Player kicked');
                                                        } else {
                                                            await apiCall('/api/club-arena/anti-cheat', { action: 'review_flag', clubId: club.id, flagId: flag.id, newStatus: verdict === 'dismiss' ? 'dismissed' : verdict });
                                                            showToast(`Flag marked ${verdict}`);
                                                        }
                                                        const r = await apiCall('/api/club-arena/anti-cheat', { action: 'get_flags', clubId: club.id });
                                                        setAcFlags(r.flags || []);
                                                    } catch (e) { showToast(e.message, 'error'); }
                                                    finally { setProcessing(false); }
                                                }} style={{ background: verdict === 'kick' ? '#FF453A' : FB.hover, color: verdict === 'kick' ? '#fff' : FB.textSecondary, border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                                    {verdict === 'kick' ? '[BLOCKED] Kick' : verdict === 'dismiss' ? 'Dismiss' : '[OK] Reviewed'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                acSessions.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: FB.textSecondary, padding: 24 }}>No active sessions.</div>
                                ) : acSessions.map((session, i) => (
                                    <div key={session.id || i} style={{ background: FB.background, borderRadius: 10, padding: 14, marginBottom: 10, border: `1px solid ${FB.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary }}>{session.player?.display_name || session.player?.username || session.user_id}</div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary }}>Table: {session.table_name || session.table_id} • {session.duration_minutes ? `${session.duration_minutes}m` : 'Active'}</div>
                                        </div>
                                        <button disabled={processing} onClick={async () => {
                                            setProcessing(true);
                                            try {
                                                await apiCall('/api/club-arena/anti-cheat', { action: 'kick_player', clubId: club.id, playerId: session.user_id, tableId: session.table_id || null, reason: 'admin_kick' });
                                                showToast('Player removed');
                                                const r = await apiCall('/api/club-arena/anti-cheat', { action: 'get_sessions', clubId: club.id });
                                                setAcSessions(r.sessions || []);
                                            } catch (e) { showToast(e.message, 'error'); }
                                            finally { setProcessing(false); }
                                        }} style={{ background: '#FF453A', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>[BLOCKED] Kick</button>
                                    </div>
                                ))
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
        } catch (e) { }
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
                <div style={S.modalBody}>                    {loading ? (
                    <div style={{ marginTop: 20 }}><SkeletonDark variant="table-rows" rows={3} /></div>
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

            {/* ═══ CLUB HEALTH SCORE MODAL ═══ */}
            {activeModal === 'health' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>📊 Club Health Score</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {healthLoading ? (
                                <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>Calculating health score...</div>
                            ) : healthScore ? (
                                <>
                                    {/* Score Ring */}
                                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                                        <div style={{ position: 'relative', width: 140, height: 140 }}>
                                            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                                                <circle cx="50" cy="50" r="42" fill="none" stroke={FB.border} strokeWidth="8" />
                                                <circle cx="50" cy="50" r="42" fill="none"
                                                    stroke={healthScore.status === 'green' ? '#31A24C' : healthScore.status === 'yellow' ? '#F7C52A' : '#FA383E'}
                                                    strokeWidth="8" strokeLinecap="round"
                                                    strokeDasharray={`${(healthScore.score / 100) * 264} 264`}
                                                />
                                            </svg>
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                <div style={{ fontSize: 32, fontWeight: 800, color: healthScore.status === 'green' ? '#31A24C' : healthScore.status === 'yellow' ? '#F7C52A' : '#FA383E' }}>
                                                    {healthScore.score}
                                                </div>
                                                <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase' }}>
                                                    {healthScore.trend === 'improving' ? '▲ Improving' : healthScore.trend === 'declining' ? '▼ Declining' : '● Stable'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Factor Breakdown */}
                                    {healthScore.breakdown && (
                                        <div style={{ display: 'grid', gap: 8 }}>
                                            {healthScore.breakdown.map((f, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: FB.background, borderRadius: 8 }}>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary }}>{f.name}</div>
                                                        <div style={{ fontSize: 11, color: FB.textSecondary }}>{f.description}</div>
                                                    </div>
                                                    <div style={{ fontSize: 18, fontWeight: 800, color: f.score >= 70 ? '#31A24C' : f.score >= 40 ? '#F7C52A' : '#FA383E' }}>
                                                        {f.score}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>No health data available</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ AUDIT TRAIL MODAL ═══ */}
            {activeModal === 'audit' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxWidth: 600 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>📋 Audit Trail</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button
                                    onClick={async () => {
                                        try {
                                            const token = await getAuthToken();
                                            const res = await fetch('/api/club-arena/audit-trail', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                body: JSON.stringify({ clubId: club.id, action: 'export', format: 'csv', limit: 5000 }),
                                            });
                                            const blob = await res.blob();
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url; a.download = 'audit_log.csv';
                                            document.body.appendChild(a); a.click(); a.remove();
                                            URL.revokeObjectURL(url);
                                            showToast('CSV downloaded!');
                                        } catch (e) { showToast('Export failed', 'error'); }
                                    }}
                                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, color: '#6366F1', fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer' }}
                                >
                                    ⬇ CSV
                                </button>
                                <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                            </div>
                        </div>
                        <div style={S.modalBody}>
                            {/* Filter */}
                            <div style={{ marginBottom: 12 }}>
                                <select
                                    value={auditFilter}
                                    onChange={e => setAuditFilter(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', background: FB.background, border: `1px solid ${FB.border}`, borderRadius: 6, color: FB.textPrimary, fontSize: 13 }}
                                >
                                    <option value="">All Actions</option>
                                    <option value="chip_distribution">Chip Distribution</option>
                                    <option value="chip_transfer">Chip Transfer</option>
                                    <option value="cashout_approved">Cashout Approved</option>
                                    <option value="cashout_requested">Cashout Requested</option>
                                    <option value="chips_minted">Chips Minted</option>
                                    <option value="agent_promoted">Agent Promoted</option>
                                    <option value="buyin">Buy-In</option>
                                    <option value="clawback">Clawback</option>
                                </select>
                            </div>
                            {/* Stats Summary */}
                            {auditStats && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                                    <div style={{ background: FB.background, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: FB.primary }}>{auditStats.total_actions || 0}</div>
                                        <div style={{ fontSize: 10, color: FB.textSecondary }}>ACTIONS</div>
                                    </div>
                                    <div style={{ background: FB.background, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: FB.success }}>{auditStats.unique_users || 0}</div>
                                        <div style={{ fontSize: 10, color: FB.textSecondary }}>USERS</div>
                                    </div>
                                    <div style={{ background: FB.background, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#F7C52A' }}>{(auditStats.total_volume || 0).toLocaleString()}</div>
                                        <div style={{ fontSize: 10, color: FB.textSecondary }}>VOLUME</div>
                                    </div>
                                </div>
                            )}
                            {/* Log Feed */}
                            {auditLoading ? (
                                <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>Loading audit logs...</div>
                            ) : auditLogs.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>No audit records found</div>
                            ) : (
                                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                    {auditLogs.map((log, i) => (
                                        <div key={log.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${FB.border}` }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary }}>{(log.action_type || '').replace(/_/g, ' ')}</div>
                                                <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                                    {log.user_name || log.user_id?.slice(0, 8)} {log.target_user_name ? `→ ${log.target_user_name}` : ''}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                {log.amount > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#F7C52A' }}>{log.amount.toLocaleString()}</div>}
                                                <div style={{ fontSize: 10, color: FB.textSecondary }}>{new Date(log.created_at).toLocaleString()}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ PLAYER RETENTION MODAL ═══ */}
            {activeModal === 'retention' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>🎯 Player Retention</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {retentionLoading ? (
                                <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>Scanning player activity...</div>
                            ) : retentionData ? (
                                <>
                                    {/* Summary Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: '#F7C52A' }}>{retentionData.at_risk?.length || 0}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2 }}>AT RISK</div>
                                        </div>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: FB.danger }}>{retentionData.churned?.length || 0}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2 }}>CHURNED</div>
                                        </div>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: FB.success }}>{retentionData.active || 0}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, marginTop: 2 }}>ACTIVE</div>
                                        </div>
                                    </div>

                                    {/* At-Risk Players */}
                                    {retentionData.at_risk?.length > 0 && (
                                        <>
                                            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#F7C52A', marginBottom: 8, textTransform: 'uppercase' }}>At-Risk Players</h4>
                                            {retentionData.at_risk.map((p, i) => (
                                                <div key={p.user_id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: FB.background, borderRadius: 8, marginBottom: 6 }}>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary }}>{p.display_name || p.username || 'Unknown'}</div>
                                                        <div style={{ fontSize: 11, color: FB.textSecondary }}>Last active: {p.days_inactive}d ago • {(p.chip_balance || 0).toLocaleString()} chips</div>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await apiCall('/api/club-arena/player-retention', { clubId: club.id, action: 'welcome_back', targetUserId: p.user_id, promoAmount: 500 });
                                                                showToast(`Welcome-back promo sent to ${p.display_name || 'player'}!`);
                                                            } catch (e) { showToast(e.message || 'Failed', 'error'); }
                                                        }}
                                                        style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.3)', borderRadius: 6, color: '#EC4899', fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        💌 Send Promo
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {/* Churned Players */}
                                    {retentionData.churned?.length > 0 && (
                                        <>
                                            <h4 style={{ fontSize: 13, fontWeight: 700, color: FB.danger, marginBottom: 8, marginTop: 16, textTransform: 'uppercase' }}>Churned Players ({'>'}14d inactive)</h4>
                                            {retentionData.churned.slice(0, 10).map((p, i) => (
                                                <div key={p.user_id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: FB.background, borderRadius: 8, marginBottom: 6, opacity: 0.7 }}>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: FB.textPrimary }}>{p.display_name || p.username || 'Unknown'}</div>
                                                        <div style={{ fontSize: 11, color: FB.textSecondary }}>{p.days_inactive}d ago • {(p.chip_balance || 0).toLocaleString()} chips</div>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await apiCall('/api/club-arena/player-retention', { clubId: club.id, action: 'welcome_back', targetUserId: p.user_id, promoAmount: 1000 });
                                                                showToast(`Welcome-back promo sent!`);
                                                            } catch (e) { showToast(e.message || 'Failed', 'error'); }
                                                        }}
                                                        style={{ background: 'rgba(250,56,62,0.12)', border: '1px solid rgba(250,56,62,0.3)', borderRadius: 6, color: FB.danger, fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        💌 Win Back
                                                    </button>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {(retentionData.at_risk?.length === 0 && retentionData.churned?.length === 0) && (
                                        <div style={{ textAlign: 'center', padding: 30, color: FB.success, fontWeight: 600 }}>
                                            All players are active! No retention issues detected.
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>No retention data available</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ BBJ CONFIG MODAL ═══ */}
            {activeModal === 'bbj' && (() => {
                // Load config when modal opens
                if (!bbjConfig && !bbjLoading) {
                    setBbjLoading(true);
                    getAuthToken().then(token => {
                        fetch('/api/club-arena/bbj', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ action: 'get_config', clubId: clubIdParam }),
                        })
                            .then(r => r.json())
                            .then(d => { if (d.success) setBbjConfig(d); })
                            .catch(() => { })
                            .finally(() => setBbjLoading(false));
                    });
                }
                return (
                    <div style={S.modalOverlay} onClick={() => { setActiveModal(null); setBbjConfig(null); }}>
                        <div style={{ ...S.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                            <div style={S.modalHeader}>
                                <span style={S.modalTitle}>[GAME] Bad Beat Jackpot Config</span>
                                <button style={S.modalClose} onClick={() => { setActiveModal(null); setBbjConfig(null); }}>&times;</button>
                            </div>
                            <div style={S.modalBody}>
                                {bbjLoading ? (
                                    <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>Loading BBJ config...</div>
                                ) : (
                                    <>
                                        {/* Pool snapshot */}
                                        {bbjConfig && (
                                            <div style={{ background: FB.background, borderRadius: 10, padding: 14, marginBottom: 20, border: `1px solid ${FB.border}` }}>
                                                <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Current Pool</div>
                                                <div style={{ fontSize: 28, fontWeight: 900, color: '#FFD700', marginBottom: 4 }}>
                                                    {(bbjConfig.poolAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} chips
                                                </div>
                                                <div style={{ fontSize: 12, color: FB.textSecondary }}>
                                                    {(bbjConfig.handsContributed || 0).toLocaleString()} hands contributed
                                                    {bbjConfig.lastHitAt && (
                                                        <> · Last hit {new Date(bbjConfig.lastHitAt).toLocaleDateString()} for {(bbjConfig.lastHitAmount || 0).toLocaleString()} chips</>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Enable / Disable toggle */}
                                        <div style={{ background: FB.cardBg, borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${FB.border}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>Bad Beat Jackpot</div>
                                                    <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 2 }}>
                                                        {bbjConfig?.bbjEnabled
                                                            ? 'Active — eligible tables collect BBJ contributions'
                                                            : 'Disabled — no BBJ rake collected on any table'}
                                                    </div>
                                                </div>
                                                <div style={{
                                                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                                                    background: bbjConfig?.bbjEnabled ? '#31A24C' : FB.border,
                                                    position: 'relative', transition: 'background 0.2s',
                                                    opacity: bbjSaving ? 0.5 : 1,
                                                }} onClick={async () => {
                                                    if (bbjSaving || !bbjConfig) return;
                                                    const newVal = !bbjConfig.bbjEnabled;
                                                    setBbjSaving(true);
                                                    try {
                                                        const token = await getAuthToken();
                                                        const r = await fetch('/api/club-arena/bbj', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                            body: JSON.stringify({ action: 'configure', clubId: clubIdParam, bbjEnabled: newVal }),
                                                        });
                                                        const d = await r.json();
                                                        if (d.success) {
                                                            setBbjConfig(prev => ({ ...prev, bbjEnabled: newVal }));
                                                        }
                                                    } catch (_) { }
                                                    finally { setBbjSaving(false); }
                                                }}>
                                                    <div style={{
                                                        position: 'absolute', top: 2,
                                                        left: bbjConfig?.bbjEnabled ? 22 : 2,
                                                        width: 20, height: 20, borderRadius: '50%',
                                                        background: '#fff', transition: 'left 0.2s',
                                                    }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Info card */}
                                        <div style={{ background: '#1a2a1a', borderRadius: 8, padding: '10px 14px', border: '1px solid #31a24c33', fontSize: 12, color: '#4CAF50', lineHeight: 1.5 }}>
                                            <strong>How it works:</strong> When enabled, eligible cash game tables automatically collect a small BBJ rake each hand. The pool grows until a qualifying bad beat occurs — then the entire pool pays out to the losing hand, winning hand, and table participants.
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══════════════════════════════════════════════════════════════════════
 TABLE MANAGEMENT MODAL — Enhanced with search, bulk ops, clone, mode pills, activity indicator
 ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'tables' && (() => {
                // #11: Filter tables by search query
                const q = tableSearch.toLowerCase().trim();
                const filteredTables = q ? tables.filter(t => {
                    const name = (t.name || '').toLowerCase();
                    const variant = (t.game_variant || '').toLowerCase();
                    const stakes = `${t.small_blind}/${t.big_blind}`;
                    const status = (t.status || '').toLowerCase();
                    return name.includes(q) || variant.includes(q) || stakes.includes(q) || status.includes(q);
                }) : tables;
                // Stats for display
                const runningCount = tables.filter(t => ['active', 'running'].includes(t.status)).length;
                const pausedCount = tables.filter(t => t.status === 'paused').length;
                const waitingCount = tables.filter(t => t.status === 'waiting').length;
                return (
                    <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                        <div style={{ ...S.modal, maxWidth: 680 }} onClick={e => e.stopPropagation()}>
                            <div style={S.modalHeader}>
                                <span style={S.modalTitle}>Table Management ({tables.length})</span>
                                <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                            </div>
                            <div style={S.modalBody}>
                                {/* Status summary bar */}
                                {tables.length > 0 && (
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 11, fontWeight: 600, color: FB.textSecondary }}>
                                        {runningCount > 0 && <span style={{ color: '#00E676' }}>● {runningCount} Live</span>}
                                        {pausedCount > 0 && <span style={{ color: '#F7C52A' }}>● {pausedCount} Paused</span>}
                                        {waitingCount > 0 && <span style={{ color: FB.primary }}>● {waitingCount} Waiting</span>}
                                    </div>
                                )}
                                {/* Action bar: Create + Search + Refresh + Bulk */}
                                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <button onClick={() => setShowCreateTable(true)}
                                        style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                        + Create Table
                                    </button>
                                    {/* #11: Search input */}
                                    <input
                                        type="text" placeholder="Search tables..."
                                        value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                                        style={{ flex: 1, minWidth: 120, padding: '7px 12px', background: FB.hover, border: `1px solid ${FB.border}`, borderRadius: 6, color: FB.textPrimary, fontSize: 12, outline: 'none' }}
                                    />
                                    <button onClick={loadTables} disabled={tablesLoading}
                                        style={{ background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                                        {tablesLoading ? '...' : '↻'}
                                    </button>
                                </div>
                                {/* #7: Bulk operations */}
                                {tables.length > 1 && (
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                                        <button onClick={() => askConfirm(`Pause all ${runningCount} running tables?`, () => { setConfirmModal(null); handleBulkAction('pause'); }, false)}
                                            disabled={tableProcessing || runningCount === 0}
                                            style={{ background: '#F7C52A', color: '#000', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: runningCount === 0 ? 0.4 : 1 }}>
                                            ⏸ Pause All ({runningCount})
                                        </button>
                                        <button onClick={() => askConfirm(`Close ALL ${tables.filter(t => !['closed', 'deleted'].includes(t.status)).length} tables?`, () => { setConfirmModal(null); handleBulkAction('close'); })}
                                            disabled={tableProcessing}
                                            style={{ background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                            Close All
                                        </button>
                                    </div>
                                )}
                                {tablesLoading ? (
                                    <div style={{ textAlign: 'center', color: FB.textSecondary, padding: 24 }}>Loading tables...</div>
                                ) : filteredTables.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: FB.textSecondary, padding: 24 }}>
                                        {q ? `No tables matching "${tableSearch}"` : 'No tables found for this club.'}
                                    </div>
                                ) : filteredTables.map(t => {
                                    const statusColor = { active: '#00E676', running: '#00E676', waiting: FB.primary, paused: '#F7C52A', closed: FB.textSecondary, deleted: FB.danger }[t.status] || FB.textSecondary;
                                    const variant = (t.game_variant || 'NLH').toUpperCase().replace('NO_LIMIT_HOLDEM', 'NLH').replace('HOLDEM', 'NLH');
                                    // #2: Game mode pills from settings JSONB
                                    const s = t.settings || {};
                                    const modePills = [];
                                    if (s.bomb_pot_enabled) modePills.push('💣 Bomb Pot');
                                    if (s.straddle_enabled) modePills.push('📈 Straddle');
                                    if (s.run_it_twice) modePills.push('🔄 RIT');
                                    if (s.private_game) modePills.push('🔒 Private');
                                    if (s.anonymous_table) modePills.push('🎭 Anonymous');
                                    if (s.double_board) modePills.push('2️⃣ Double Board');
                                    if (s.vip_only) modePills.push('👑 VIP');
                                    if (s.insurance) modePills.push('🛡️ Insurance');
                                    // #9: Activity indicator — time since last update
                                    const lastUpdate = t.updated_at ? new Date(t.updated_at) : null;
                                    const minutesAgo = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 60000) : null;
                                    const isLive = ['active', 'running'].includes(t.status);
                                    const activityText = isLive && minutesAgo !== null
                                        ? (minutesAgo < 1 ? 'Active now' : minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.floor(minutesAgo / 60)}h ago`)
                                        : null;
                                    return (
                                        <div key={t.id} style={{ background: FB.cardBg, border: `1px solid ${tableProcessingIds.has(t.id) ? FB.primary : FB.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 10, transition: 'border-color 0.2s, opacity 0.3s', opacity: t.status === 'deleted' ? 0.5 : 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                                <div style={{ flex: 1, minWidth: 200 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        {isLive && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00E676', display: 'inline-block', animation: 'pulse 2s infinite', flexShrink: 0 }} />}
                                                        <span style={{ fontWeight: 700, fontSize: 14, color: FB.textPrimary }}>{t.name || 'Unnamed Table'}</span>
                                                    </div>
                                                    <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 2 }}>
                                                        {variant} {t.small_blind}/{t.big_blind} &bull; {t.current_players || 0}/{t.max_players || 9} players
                                                        &bull; <span style={{ color: statusColor, fontWeight: 600 }}>{t.status}</span>
                                                        {activityText && <span style={{ color: '#00E676', marginLeft: 6, fontSize: 11 }}>{activityText}</span>}
                                                    </div>
                                                    {/* #2: Game mode pills */}
                                                    {modePills.length > 0 && (
                                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                                            {modePills.map(pill => (
                                                                <span key={pill} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '2px 8px', fontSize: 10, color: FB.textSecondary, whiteSpace: 'nowrap' }}>{pill}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {/* #3: Clone button */}
                                                    <button onClick={() => askConfirm(`Clone table "${t.name || 'Table'}"?`, () => { setConfirmModal(null); handleCloneTable(t); }, false)}
                                                        title="Clone table with same settings"
                                                        style={{ background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }} disabled={tableProcessing}>
                                                        📋
                                                    </button>
                                                    <button onClick={() => { setEditTableModal(t); setEditTableForm({ name: t.name || '', small_blind: String(t.small_blind || ''), big_blind: String(t.big_blind || ''), max_players: String(t.max_players || ''), min_buy_in: String(t.min_buy_in || ''), max_buy_in: String(t.max_buy_in || ''), action_time_seconds: String(t.action_time_seconds || ''), ante: String(t.ante || '') }); }}
                                                        style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} disabled={tableProcessing || tableProcessingIds.has(t.id)}>
                                                        Edit
                                                    </button>
                                                    {['active', 'running'].includes(t.status) && (
                                                        <button onClick={() => askConfirm('Pause this table? No new hands will be dealt.', () => { setConfirmModal(null); handleTableAction(t.id, 'pause'); }, false)}
                                                            style={{ background: '#F7C52A', color: '#000', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} disabled={tableProcessing || tableProcessingIds.has(t.id)}>
                                                            Pause
                                                        </button>
                                                    )}
                                                    {t.status === 'paused' && (
                                                        <button onClick={() => handleTableAction(t.id, 'resume')}
                                                            style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} disabled={tableProcessing || tableProcessingIds.has(t.id)}>
                                                            Resume
                                                        </button>
                                                    )}
                                                    {['active', 'paused', 'waiting', 'running'].includes(t.status) && (
                                                        <button onClick={() => askConfirm('Close this table? Active players will be removed.', () => { setConfirmModal(null); handleTableAction(t.id, 'close'); })}
                                                            style={{ background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} disabled={tableProcessing || tableProcessingIds.has(t.id)}>
                                                            Close
                                                        </button>
                                                    )}
                                                    {['closed', 'waiting', 'paused'].includes(t.status) && (
                                                        <button onClick={() => askConfirm('Permanently delete this table? This cannot be undone.', () => { setConfirmModal(null); handleTableAction(t.id, 'delete'); })}
                                                            style={{ background: FB.danger, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }} disabled={tableProcessing || tableProcessingIds.has(t.id)}>
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Create Table Modal (from Tables section) */}
            {showCreateTable && (
                <CreateTableModal
                    club={club}
                    onClose={() => setShowCreateTable(false)}
                    onCreated={(table) => {
                        showToast(`Table "${table.name || 'New Table'}" created!`);
                        busEmit.dataMutated('table_created');
                        loadTables();
                        loadData();
                        setShowCreateTable(false);
                    }}
                    apiCall={apiCall}
                    onError={(msg) => showToast(msg, 'error')}
                />
            )}

            {/* Edit Table Settings Modal */}
            {editTableModal && (
                <div style={S.modalOverlay} onClick={() => setEditTableModal(null)}>
                    <div style={{ ...S.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Edit: {editTableModal.name || 'Table'}</span>
                            <button style={S.modalClose} onClick={() => setEditTableModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {[['name', 'Table Name', 'text'], ['small_blind', 'Small Blind', 'number'], ['big_blind', 'Big Blind', 'number'], ['max_players', 'Max Players', 'number'], ['min_buy_in', 'Min Buy-in (chips)', 'number'], ['max_buy_in', 'Max Buy-in (chips)', 'number'], ['ante', 'Ante', 'number'], ['action_time_seconds', 'Action Time (seconds)', 'number']].map(([key, label, type]) => (
                                <div key={key} style={{ marginBottom: 14 }}>
                                    <label style={S.formLabel}>{label}</label>
                                    <input
                                        type={type}
                                        value={editTableForm[key] || ''}
                                        onChange={e => setEditTableForm(prev => ({ ...prev, [key]: e.target.value }))}
                                        style={S.formInput}
                                    />
                                </div>
                            ))}
                            <button
                                onClick={saveTableSettings}
                                disabled={tableProcessing}
                                style={{ width: '100%', background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: tableProcessing ? 'not-allowed' : 'pointer', opacity: tableProcessing ? 0.6 : 1, marginTop: 4 }}
                            >
                                {tableProcessing ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                RAKE REPORT MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {showRakeReport && (
                <div style={S.modalOverlay} onClick={() => setShowRakeReport(false)}>
                    <div style={{ ...S.modal, maxWidth: 540 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>📊 Rake Report</span>
                            <button style={S.modalClose} onClick={() => setShowRakeReport(false)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            {/* Period Selector */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                                {['7d', '14d', '30d', '90d'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => { setRakeReportPeriod(p); loadRakeReport(p); }}
                                        style={{
                                            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                            border: rakeReportPeriod === p ? `2px solid ${FB.primary}` : `1px solid ${FB.border}`,
                                            background: rakeReportPeriod === p ? 'rgba(35,116,225,0.15)' : FB.background,
                                            color: rakeReportPeriod === p ? FB.primary : FB.textSecondary,
                                        }}
                                    >{p.replace('d', ' Days')}</button>
                                ))}
                            </div>

                            {rakeReportLoading ? (
                                <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>Loading...</div>
                            ) : rakeReport?.days ? (
                                <>
                                    {/* Summary Stats */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: FB.success }}>{(rakeReport.summary?.totalRake || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, textTransform: 'uppercase' }}>Total Rake</div>
                                        </div>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: FB.primary }}>{(rakeReport.summary?.avgDaily || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, textTransform: 'uppercase' }}>Avg / Day</div>
                                        </div>
                                        <div style={{ background: FB.background, borderRadius: 8, padding: 12, textAlign: 'center' }}>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: '#F7C52A' }}>{(rakeReport.summary?.peakAmount || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: 10, color: FB.textSecondary, textTransform: 'uppercase' }}>Peak Day</div>
                                        </div>
                                    </div>

                                    {/* Daily Bar Chart */}
                                    <div style={{ background: FB.background, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                                        <div style={{ fontSize: 10, color: FB.textSecondary, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>Daily Breakdown</div>
                                        <svg viewBox={`0 0 ${(rakeReport.days || []).length * 12} 60`} style={{ width: '100%', height: 80 }}>
                                            {(() => {
                                                const days = rakeReport.days || [];
                                                const max = Math.max(...days.map(d => d.rake), 1);
                                                return days.map((d, i) => {
                                                    const h = (d.rake / max) * 50;
                                                    return (
                                                        <g key={i}>
                                                            <rect x={i * 12 + 1} y={55 - h} width={10} height={h} rx={2} fill={d.rake > 0 ? '#31A24C' : '#3E4042'} opacity={0.85} />
                                                            {days.length <= 14 && (
                                                                <text x={i * 12 + 6} y={60} textAnchor="middle" fill="#B0B3B8" fontSize="3">{d.date.slice(5)}</text>
                                                            )}
                                                        </g>
                                                    );
                                                });
                                            })()}
                                        </svg>
                                    </div>

                                    {/* Daily Detail List (scrollable) */}
                                    <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: `1px solid ${FB.border}` }}>
                                        {(rakeReport.days || []).slice().reverse().map((d, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${FB.border}`, fontSize: 13 }}>
                                                <span style={{ color: FB.textSecondary }}>{d.date}</span>
                                                <span style={{ color: d.rake > 0 ? FB.success : FB.textSecondary, fontWeight: 600, fontFamily: 'monospace' }}>{(d.rake || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: 20, color: FB.textSecondary }}>No rake data available</div>
                            )}
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                onClick={downloadRakeCSV}
                                style={{ width: '100%', padding: 14, background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                            >📥 Download CSV Export</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                PLAYER SESSIONS MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'sessions' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxWidth: 800 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>📡 Live Player Sessions</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={{ ...S.modalBody, padding: 0 }}>
                            {sessionsLoading && !sessionsData ? (
                                <div style={{ padding: 40, textAlign: 'center' }}><SkeletonDark variant="table-rows" rows={5} /></div>
                            ) : sessionsData ? (
                                <>
                                    {/* Summary Bar */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: FB.border, marginBottom: 16 }}>
                                        <div style={{ background: FB.cardBg, padding: '16px 20px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: FB.success }}>{sessionsData.summary?.online || 0}</div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase' }}>Online Now</div>
                                        </div>
                                        <div style={{ background: FB.cardBg, padding: '16px 20px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: '#F7C52A' }}>{sessionsData.summary?.idle || 0}</div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase' }}>Idle ({'<'} 1h)</div>
                                        </div>
                                        <div style={{ background: FB.cardBg, padding: '16px 20px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: FB.primary }}>{sessionsData.summary?.activeTables || 0}</div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase' }}>Active Tables</div>
                                        </div>
                                        <div style={{ background: FB.cardBg, padding: '16px 20px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: '#A855F7' }}>{sessionsData.summary?.totalSeated || 0}</div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase' }}>Total Seated</div>
                                        </div>
                                    </div>

                                    {/* Player List */}
                                    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead style={{ position: 'sticky', top: 0, background: FB.cardBg, zIndex: 10 }}>
                                                <tr style={{ borderBottom: `1px solid ${FB.border}`, color: FB.textSecondary, textAlign: 'left' }}>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Player</th>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>24h Volume</th>
                                                    <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Chip Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(sessionsData.sessions || []).map((s, i) => (
                                                    <tr key={i} style={{ borderBottom: `1px solid ${FB.border}` }}>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                <img src={resolveAvatarDisplay(s.avatarUrl)} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                                                                <div>
                                                                    <div style={{ fontWeight: 600, color: FB.textPrimary }}>{s.displayName}</div>
                                                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>{s.role}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, background: FB.background }}>
                                                                <div style={{
                                                                    width: 8, height: 8, borderRadius: '50%',
                                                                    background: s.status === 'online' ? FB.success : s.status === 'idle' ? '#F7C52A' : s.status === 'away' ? FB.textSecondary : '#3E4042',
                                                                    boxShadow: s.status === 'online' ? `0 0 8px ${FB.success}` : 'none'
                                                                }} />
                                                                <span style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 700, color: s.status === 'online' ? FB.success : FB.textSecondary }}>
                                                                    {s.status}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: s.volume24h > 0 ? FB.primary : FB.textSecondary }}>
                                                            {s.volume24h > 0 ? s.volume24h.toLocaleString() : '-'}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#fff' }}>
                                                            {s.chipBalance.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <div style={{ padding: 40, textAlign: 'center', color: FB.textSecondary }}>No data available</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                SMART RECOMMENDATIONS MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'smart_recs' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>🧠 AI Table Recommender</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={{ ...S.modalBody, background: FB.background }}>
                            {smartRecsLoading && !smartRecsData ? (
                                <div style={{ padding: 30 }}><SkeletonDark variant="news-feed" count={3} /></div>
                            ) : smartRecsData?.recommendations ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {smartRecsData.recommendations.map((rec, i) => {
                                        const color = rec.type === 'success' ? FB.success : rec.type === 'warning' ? '#F7C52A' : FB.primary;
                                        return (
                                            <div key={i} style={{ display: 'flex', gap: 16, background: FB.cardBg, padding: 16, borderRadius: 12, borderLeft: `4px solid ${color}`, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                                                <div style={{ fontSize: 24 }}>{rec.icon}</div>
                                                <div style={{ flex: 1 }}>
                                                    <h4 style={{ margin: '0 0 4px 0', fontSize: 16, color: '#fff' }}>{rec.title}</h4>
                                                    <p style={{ margin: 0, fontSize: 13, color: FB.textSecondary, lineHeight: 1.5 }}>{rec.desc}</p>
                                                    {rec.action === 'create_table' && (
                                                        <button onClick={() => { setActiveModal('tables'); setShowCreateTable(true); }} style={{ marginTop: 12, padding: '6px 16px', background: FB.primary, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Create Table ➔</button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ padding: 40, textAlign: 'center', color: FB.textSecondary }}>Analysis unavailable</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                CLUB BRANDING & THEMING MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'branding' && brandingTheme && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>🎨 Club Branding</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <p style={{ fontSize: 13, color: FB.textSecondary, marginBottom: 20 }}>Customize the look and feel of your club for all members.</p>

                            <div style={{ marginBottom: 16 }}>
                                <label style={S.formLabel}>Primary Brand Color (Hex)</label>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input type="color" value={brandingTheme.primaryColor || '#2374E1'} onChange={e => setBrandingTheme({ ...brandingTheme, primaryColor: e.target.value })} style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }} />
                                    <input type="text" value={brandingTheme.primaryColor || '#2374E1'} onChange={e => setBrandingTheme({ ...brandingTheme, primaryColor: e.target.value })} style={{ ...S.formInput, flex: 1, fontFamily: 'monospace' }} />
                                </div>
                            </div>

                            <div style={{ marginBottom: 16 }}>
                                <label style={S.formLabel}>Table Felt Color</label>
                                <select value={brandingTheme.tableFelt || 'default'} onChange={e => setBrandingTheme({ ...brandingTheme, tableFelt: e.target.value })} style={S.formInput}>
                                    <option value="default">SmarterPoker Dark (Default)</option>
                                    <option value="green">Classic Green</option>
                                    <option value="blue">Casino Blue</option>
                                    <option value="red">High Roller Red</option>
                                    <option value="purple">Royal Purple</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: 24 }}>
                                <label style={S.formLabel}>Chip Style</label>
                                <select value={brandingTheme.chipStyle || 'default'} onChange={e => setBrandingTheme({ ...brandingTheme, chipStyle: e.target.value })} style={S.formInput}>
                                    <option value="default">SmarterPoker Standard (Default)</option>
                                    <option value="classic">Classic Clay</option>
                                    <option value="modern">Modern Minimalist</option>
                                    <option value="neon">Neon Cyberpunk</option>
                                </select>
                            </div>

                            <button onClick={saveClubBranding} disabled={brandingSaving} style={{ width: '100%', padding: 14, background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: brandingSaving ? 'not-allowed' : 'pointer' }}>
                                {brandingSaving ? 'Saving...' : 'Save Theme Preferences'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                CLUB BROADCASTS (TABLE CHAT) MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'telecom' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>🎙️ Club Broadcasts</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <p style={{ fontSize: 13, color: FB.textSecondary, marginBottom: 20 }}>Send a dealer announcement to a specific table. This appears in the in-game chat for all seated players.</p>

                            <div style={{ marginBottom: 16 }}>
                                <label style={S.formLabel}>Target Table</label>
                                <select value={dealerMsgTable} onChange={e => setDealerMsgTable(e.target.value)} style={S.formInput}>
                                    <option value="">-- Select a table --</option>
                                    {tables.map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.small_blind}/{t.big_blind} {t.game_variant?.toUpperCase()})</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: 24 }}>
                                <label style={S.formLabel}>Dealer Message</label>
                                <textarea
                                    value={dealerMsgText}
                                    onChange={e => setDealerMsgText(e.target.value)}
                                    placeholder="e.g. Last 3 orbits before table break!"
                                    style={{ ...S.formInput, height: 100, resize: 'none' }}
                                    maxLength={200}
                                />
                                <div style={{ fontSize: 11, color: FB.textSecondary, textAlign: 'right', marginTop: 4 }}>{dealerMsgText.length} / 200</div>
                            </div>

                            <button
                                onClick={sendDealerMessage}
                                disabled={!dealerMsgTable || !dealerMsgText.trim() || dealerMsgSending}
                                style={{ width: '100%', padding: 14, background: (!dealerMsgTable || !dealerMsgText.trim() || dealerMsgSending) ? FB.border : '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: (!dealerMsgTable || !dealerMsgText.trim() || dealerMsgSending) ? 'not-allowed' : 'pointer' }}
                            >
                                {dealerMsgSending ? 'Sending...' : 'Broadcast to Table'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                LOBBY ORDERING MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {activeModal === 'lobby_order' && (
                <div style={S.modalOverlay} onClick={() => setActiveModal(null)}>
                    <div style={{ ...S.modal, maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>↕️ Lobby Ordering</span>
                            <button style={S.modalClose} onClick={() => setActiveModal(null)}>&times;</button>
                        </div>
                        <div style={{ ...S.modalBody, padding: 0 }}>
                            <div style={{ padding: '16px 20px', background: FB.background, fontSize: 13, color: FB.textSecondary, borderBottom: `1px solid ${FB.border}` }}>
                                Drag tables to reorder them in the player lobby. Top tables get the most visibility.
                            </div>
                            <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 16 }}>
                                {lobbyOrder.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: FB.textSecondary, padding: 20 }}>No tables found</div>
                                ) : (
                                    lobbyOrder.map((tid, idx) => {
                                        const t = tables.find(x => x.id === tid);
                                        if (!t) return null;
                                        return (
                                            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: 8, marginBottom: 8, cursor: 'grab' }}
                                                draggable
                                                onDragStart={e => e.dataTransfer.setData('text/plain', idx)}
                                                onDragOver={e => e.preventDefault()}
                                                onDrop={e => {
                                                    e.preventDefault();
                                                    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                                                    const toIdx = idx;
                                                    if (fromIdx === toIdx) return;
                                                    const newOrder = [...lobbyOrder];
                                                    const [moved] = newOrder.splice(fromIdx, 1);
                                                    newOrder.splice(toIdx, 0, moved);
                                                    setLobbyOrder(newOrder);
                                                }}
                                            >
                                                <div style={{ color: FB.textSecondary, fontSize: 18, cursor: 'grab' }}>≡</div>
                                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: FB.background, color: FB.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{idx + 1}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: FB.textPrimary }}>{t.name}</div>
                                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>{t.small_blind}/{t.big_blind} {t.game_variant?.toUpperCase()}</div>
                                                </div>
                                                <div style={{ fontSize: 12, color: t.status === 'playing' ? FB.success : FB.textSecondary }}>{t.current_players}/{t.max_players}</div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div style={{ ...S.modalFooter, borderTop: `1px solid ${FB.border}` }}>
                                <button onClick={saveLobbyOrder} disabled={lobbyOrderSaving} style={{ width: '100%', padding: 14, background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: lobbyOrderSaving ? 'not-allowed' : 'pointer' }}>
                                    {lobbyOrderSaving ? 'Saving...' : 'Save Lobby Order'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
                COMMAND PALETTE (Ctrl+K / Cmd+K)
            ═══════════════════════════════════════════════════════════════════════ */}
            {shortcuts.paletteOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 20px' }}
                    onClick={() => shortcuts.setPaletteOpen(false)}
                >
                    <div
                        style={{ background: FB.cardBg, borderRadius: 14, width: '100%', maxWidth: 420, border: `1px solid ${FB.border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${FB.border}` }}>
                            <input
                                autoFocus
                                value={shortcuts.paletteQuery}
                                onChange={e => shortcuts.setPaletteQuery(e.target.value)}
                                placeholder="Type a command..."
                                style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 16, color: FB.textPrimary, fontWeight: 500 }}
                                onKeyDown={e => {
                                    if (e.key === 'Escape') shortcuts.setPaletteOpen(false);
                                    if (e.key === 'Enter' && shortcuts.filteredShortcuts.length > 0) {
                                        shortcuts.handleAction(shortcuts.filteredShortcuts[0].action);
                                    }
                                }}
                            />
                        </div>
                        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '8px 0' }}>
                            {shortcuts.filteredShortcuts.map(s => (
                                <div
                                    key={s.key}
                                    onClick={() => shortcuts.handleAction(s.action)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', cursor: 'pointer', transition: 'background 0.1s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = FB.hover}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{s.icon}</span>
                                    <span style={{ flex: 1, fontSize: 14, color: FB.textPrimary, fontWeight: 500 }}>{s.label}</span>
                                    <kbd style={{ background: FB.background, border: `1px solid ${FB.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, color: FB.textSecondary, fontFamily: 'monospace', textTransform: 'uppercase' }}>{s.key}</kbd>
                                </div>
                            ))}
                            {shortcuts.filteredShortcuts.length === 0 && (
                                <div style={{ padding: '20px 18px', color: FB.textSecondary, textAlign: 'center', fontSize: 13 }}>No matching commands</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
