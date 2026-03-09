/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Agent Dashboard | FULLY WIRED
   SmarterPoker Dark Theme | Downline, Cashouts, Chips, Commissions, Clawback
   ═══════════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import InviteFriendsModal from '../../../src/components/ui/InviteFriendsModal';
import useDebounce from '../../../src/hooks/useDebounce';
import usePersistedState from '../../../src/hooks/usePersistedState';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import dynamic from 'next/dynamic';
import useWalletData from '../../../src/hooks/useWalletData';
const DynamicWallet = dynamic(() => import('../../../src/components/club-arena/DynamicWallet'), { ssr: false });

const FB = {
    primary: '#2374E1', background: '#18191A', cardBg: '#242526',
    textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042',
    success: '#31A24C', danger: '#FA383E', gold: '#F7C52A', hover: '#3A3B3C',
    orange: '#F5A623', purple: '#A855F7',
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const getAuthToken = () => getAccessToken();

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
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};

function timeAgo(dateStr) {
    if (!dateStr) return 'never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function Toast({ message, type }) {
    if (!message) return null;
    return (
        <div style={{
            position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
            background: type === 'error' ? FB.danger : FB.success,
            color: '#fff', padding: '10px 24px', borderRadius: 8, fontSize: 14,
            fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
            {message}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function AgentDashboard() {
        useTrainingBus('club-arena-agent-dashboard');

const router = useRouter();
    const clubIdParam = router.query?.club || null;

    const [user, setUser] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = usePersistedState('sp-filters-ca-agent-tab', 'overview');
    const [toast, setToast] = useState({ message: '', type: '' });

    // Real-time wallet data
    const walletData = useWalletData({ supabase, userId: user?.id, clubId: dashboard?.clubId || clubIdParam });

    // Modal states
    const [distributeModal, setDistributeModal] = useState(null); // { playerId, playerName, currentBalance }
    const [distributeAmount, setDistributeAmount] = useState('');
    const [distributeNote, setDistributeNote] = useState('');
    const [cashoutModal, setCashoutModal] = useState(null); // cashout request object
    const [cashoutNote, setCashoutNote] = useState('');
    const [clawbackModal, setClawbackModal] = useState(null); // transaction object
    const [promoteModal, setPromoteModal] = useState(null); // { player } for sub-agent promotion
    const [promoteRate, setPromoteRate] = useState('');
    const [processing, setProcessing] = useState(false);
    const [subAgents, setSubAgents] = useState([]);
    const [subAgentsLoaded, setSubAgentsLoaded] = useState(false);

    // Phase 17: chip flow data + player sort
    const [chipFlow, setChipFlow] = useState({}); // { [userId]: { in, out, net } }
    const [playerSort, setPlayerSort] = useState('balance'); // 'balance' | 'name' | 'activity'
    // Sub-agent action state
    const [subAgentCommModal, setSubAgentCommModal] = useState(null); // { sa } — edit commission
    const [subAgentNewRate, setSubAgentNewRate] = useState('');
    const [subAgentDistModal, setSubAgentDistModal] = useState(null); // { sa } — distribute chips
    const [subAgentDistAmount, setSubAgentDistAmount] = useState('');
    // Invite code state
    const [myPlayerNumber, setMyPlayerNumber] = useState(null);
    const [showInviteModal, setShowInviteModal] = useState(false);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast({ message: '', type: '' }), 3000);
    };

    // ─── Auth ───────────────────────────────────────────────────
    useEffect(() => {
        const authUser = getAuthUser();
        if (authUser) {
            setUser(authUser);
        } else {
            router.push('/auth/login');
        }
    }, [router]);

    // ─── Load Dashboard ─────────────────────────────────────────
    const loadDashboard = useCallback(async () => {
        if (!user || !clubIdParam) { setIsLoading(false); return; } // BUG FIX: was returning without clearing skeleton
        setIsLoading(true);
        try {
            const data = await apiGet(`/api/club-arena/agent-dashboard?clubId=${clubIdParam}`);
            setDashboard(data);
            // Agent's player_number IS their club referral code — same number,
            // different context from platform referral (no diamonds here)
            const authUser = getAuthUser();
            if (authUser?.player_number) setMyPlayerNumber(authUser.player_number);
            else if (data.myProfile?.player_number) setMyPlayerNumber(data.myProfile.player_number);
        } catch (err) {
            
            showToast(err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user, clubIdParam]);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    // BUG #234 FIX: Realtime — new cashout requests and chip changes auto-refresh
    useEffect(() => {
        if (!clubIdParam || !user?.id) return;

        const cashoutChannel = supabase
            .channel(`agent-cashouts-${clubIdParam}-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'cashout_requests',
                filter: `club_id=eq.${clubIdParam}`,
            }, () => {
                loadDashboard(); // Refresh full dashboard on any cashout change
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });

        // Also listen for chip_transactions (distribute/clawback events)
        const txnChannel = supabase
            .channel(`agent-txns-${clubIdParam}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chip_transactions',
                filter: `club_id=eq.${clubIdParam}`,
            }, () => {
                loadDashboard();
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });

        // Also listen for changes to own agent row (credit_used, commission_rate, status)
        const agentChannel = supabase
            .channel(`agent-self:${clubIdParam}-${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'agents',
                filter: `club_id=eq.${clubIdParam}`,
            }, (payload) => {
                // Only reload if it's our agent row
                if (payload.new?.user_id === user.id) loadDashboard();
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });

        return () => {
            supabase.removeChannel(cashoutChannel);
            supabase.removeChannel(txnChannel);
            supabase.removeChannel(agentChannel);
        };
    }, [clubIdParam, user?.id]);

    // ── Event Bus: refresh on cross-page mutations (admin mints, cashouts, etc.) ──
    useEffect(() => {
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const relevant = ['chips_minted', 'chips_distributed', 'cashout_approved', 'cashout_requested', 'cashout_cancelled', 'rakeback_distributed', 'marketplace_purchase'];
            if (relevant.includes(e?.payload?.entity)) loadDashboard();
        });
        return () => unsub();
    }, [loadDashboard]);

    // ─── Auto-load sub-agents when tab selected ────────────────
    useEffect(() => {
        if (activeTab !== 'subagents' || subAgentsLoaded || !dashboard?.clubId) return;
        apiCall('/api/club-arena/manage-agent', {
            action: 'list_sub_agents', clubId: dashboard.clubId, parentAgentUserId: user?.id,
        }).then(r => { setSubAgents(r.subAgents || []); setSubAgentsLoaded(true); })
            .catch(() => setSubAgentsLoaded(true));
    }, [activeTab, subAgentsLoaded, dashboard?.clubId, user?.id]);

    // ─── Phase 17: Load 7-day chip flow when players tab opens ──
    useEffect(() => {
        if (activeTab !== 'players' || !dashboard?.clubId) return;
        apiCall('/api/club-arena/player-chip-flow', { clubId: dashboard.clubId })
            .then(r => { if (r.flow) setChipFlow(r.flow); })
            .catch(() => { /* non-critical — flow indicators just won't show */ });
    }, [activeTab, dashboard?.clubId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Distribute Chips ───────────────────────────────────────
    const handleDistribute = async () => {
        if (!distributeModal || !distributeAmount || processing) return;
        const amount = parseInt(distributeAmount);
        if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

        setProcessing(true);
        try {
            await apiCall('/api/club-arena/distribute-chips', {
                clubId: clubIdParam,
                toUserId: distributeModal.playerId,
                amount,
                notes: distributeNote || undefined,
            });
            showToast(`Sent ${amount.toLocaleString()} chips to ${distributeModal.playerName}`);
            busEmit.dataMutated('chips_distributed');

            // Optimistic: update chip flow for this player
            setChipFlow(prev => {
                const existing = prev[distributeModal.playerId] || { in: 0, out: 0, net: 0 };
                return {
                    ...prev,
                    [distributeModal.playerId]: {
                        in: existing.in + amount,
                        out: existing.out,
                        net: existing.net + amount,
                    },
                };
            });

            setDistributeModal(null);
            setDistributeAmount('');
            setDistributeNote('');
            loadDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ─── Approve Cashout ────────────────────────────────────────
    const handleApproveCashout = async () => {
        if (!cashoutModal || processing) return;
        setProcessing(true);
        try {
            await apiCall('/api/club-arena/approve-cashout', {
                cashoutId: cashoutModal.id,
                action: 'approve',
                note: cashoutNote || undefined,
            });
            showToast(`Approved cashout of ${cashoutModal.amount.toLocaleString()} chips`); busEmit.dataMutated('cashout_approved');
            setCashoutModal(null);
            setCashoutNote('');
            loadDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ─── Cancel Cashout ─────────────────────────────────────────
    const handleCancelCashout = async () => {
        if (!cashoutModal || processing) return;
        setProcessing(true);
        try {
            await apiCall('/api/club-arena/approve-cashout', {
                cashoutId: cashoutModal.id,
                action: 'cancel',
                note: cashoutNote || 'Cancelled by agent',
            });
            showToast('Cashout cancelled — chips returned to player'); busEmit.dataMutated('cashout_cancelled');
            setCashoutModal(null);
            setCashoutNote('');
            loadDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ─── Clawback ───────────────────────────────────────────────
    const handleClawback = async () => {
        if (!clawbackModal || processing) return;
        setProcessing(true);
        try {
            await apiCall('/api/club-arena/clawback-chips', {
                transactionId: clawbackModal.id,
                clubId: clubIdParam,
            });
            showToast('Clawback successful — chips reversed'); busEmit.dataMutated('chips_distributed');
            setClawbackModal(null);
            loadDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ─── Loading / Auth gate ────────────────────────────────────
    // No club param — show helpful error instead of blank skeleton
    if (!isLoading && !clubIdParam) {
        return (
            <div style={{ background: FB.background, minHeight: '100vh' }}>
                <SEOHead title="Agent Dashboard | Club Arena" />
                <UniversalHeader />
                <div style={{ textAlign: 'center', padding: '80px 20px', color: FB.textSecondary }}>
                    <div style={{ fontSize: 18, marginBottom: 12 }}>No club specified.</div>
                    <button onClick={() => router.push('/hub/club-arena')} style={{ background: FB.primary, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                        ← Back to Club Arena
                    </button>
                </div>
            </div>
        );
    }

    if (!user || isLoading) {
        return (
            <div style={{ background: FB.background, minHeight: '100vh' }}>
                <SEOHead title="Agent Dashboard | Club Arena" />
                <UniversalHeader />
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                    <div style={{ color: FB.textSecondary, fontSize: 16 }}>Loading agent dashboard...</div>
                </div>
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div style={{ background: FB.background, minHeight: '100vh' }}>
                <SEOHead title="Agent Dashboard | Club Arena" />
                <UniversalHeader />
                <div style={{ textAlign: 'center', padding: '80px 20px', color: FB.textSecondary }}>
                    Failed to load dashboard. You may not be an agent in this club.
                    <div style={{ marginTop: 16 }}>
                        <button onClick={() => router.back()} style={btnStyle}>Go Back</button>
                    </div>
                </div>
            </div>
        );
    }

    const { stats, players, pendingCashouts, commissionHistory, recentTransactions, agents, role } = dashboard;
    const myAgent = agents?.find(a => a.user_id === user.id) || agents?.[0];

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'players', label: `Players (${stats?.totalPlayers || 0})` },
        { id: 'cashouts', label: `Cashouts (${pendingCashouts?.length || 0})` },
        { id: 'transactions', label: 'Transactions' },
        { id: 'commissions', label: 'Commissions' },
        { id: 'subagents', label: 'Sub-Agents' },
        { id: 'promo', label: 'Promo Wallet' },
    ];

    // Get clawback-eligible transactions (within last 10 minutes, type=send, from current user)
    const clawbackEligible = (recentTransactions || []).filter(t => {
        if (t.is_reversed || t.transaction_type !== 'send') return false;
        if (t.from_user_id !== user.id) return false;
        const elapsed = Date.now() - new Date(t.created_at).getTime();
        return elapsed < 10 * 60 * 1000; // 10 minutes
    });

    return (
        <div style={{ background: FB.background, minHeight: '100vh' }}>
            <SEOHead title="Agent Dashboard | Club Arena" />
            <UniversalHeader />
            <Toast message={toast.message} type={toast.type} />

            {/* Header */}
            <div style={{ padding: '16px 20px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                        <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, color: FB.textPrimary, margin: 0 }}>
                            Agent Dashboard
                        </h1>
                        <span style={{ fontSize: 12, color: FB.primary, fontWeight: 600, textTransform: 'uppercase' }}>
                            {role === 'owner' ? 'Owner View'
                                : role === 'admin' ? 'Admin View'
                                : role === 'super_agent' ? '⭐ Super Agent'
                                : role === 'sub_agent' ? 'Sub Agent'
                                : 'Agent View'}
                        </span>
                    </div>
                    <button onClick={loadDashboard} style={{ ...btnStyle, padding: '6px 14px', fontSize: 12 }}>
                        ↻ Refresh
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 12 }}>
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                            background: activeTab === tab.id ? FB.primary : FB.cardBg,
                            color: activeTab === tab.id ? '#fff' : FB.textSecondary,
                            border: `1px solid ${activeTab === tab.id ? FB.primary : FB.border}`,
                            borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: '0 20px 100px' }}>
                {activeTab === 'overview' && (
                    <>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px' }}>
                        <DynamicWallet {...walletData} compact
                            onBuyDiamonds={() => router.push('/hub/diamond-store')}
                            onOpenBBJ={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}#bbj`)}
                        />
                    </div>
                    <OverviewTab stats={stats} myAgent={myAgent} clawbackCount={clawbackEligible.length} pendingCashouts={pendingCashouts}
                        playerNumber={myPlayerNumber}
                        onShareInvite={() => setShowInviteModal(true)}
                    />
                    </>
                )}
                {activeTab === 'players' && (
                    <PlayersTab
                        players={players}
                        chipFlow={chipFlow}
                        playerSort={playerSort}
                        onSortChange={setPlayerSort}
                        onDistribute={(p) => setDistributeModal({ playerId: p.user_id, playerName: p.profile?.display_name || p.nickname || 'Player', currentBalance: p.chip_balance || 0 })}
                        onPromote={(p) => { setPromoteModal({ player: p }); setPromoteRate(''); }}
                    />
                )}
                {activeTab === 'cashouts' && (
                    <CashoutsTab cashouts={pendingCashouts} onAction={(c) => { setCashoutModal(c); setCashoutNote(''); }} />
                )}
                {activeTab === 'transactions' && (
                    <TransactionsTab
                        transactions={recentTransactions}
                        clawbackEligible={clawbackEligible}
                        onClawback={(t) => setClawbackModal(t)}
                        userId={user.id}
                    />
                )}
                {activeTab === 'commissions' && (
                    <CommissionsTab history={commissionHistory} myAgent={myAgent} />
                )}

                {/* ═══ SUB-AGENTS TAB ═══ */}
                {activeTab === 'subagents' && (
                    <div>
                        {!subAgentsLoaded ? (
                            <div style={{ textAlign: 'center', padding: 30, color: FB.textSecondary }}>
                                Loading sub-agents...
                            </div>
                        ) : subAgents.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>
                                <div style={{ fontSize: 32, marginBottom: 12 }}>[player]</div>
                                <div style={{ fontSize: 14 }}>No sub-agents under you yet.</div>
                                <div style={{ fontSize: 12, marginTop: 6 }}>Go to the Players tab and tap ↑ to promote a player.</div>
                            </div>
                        ) : subAgents.map(sa => (
                            <div key={sa.id} style={{ ...cardStyle, marginBottom: 10, opacity: sa.status === 'suspended' ? 0.8 : 1, borderLeft: sa.status === 'suspended' ? `3px solid ${FB.danger}` : undefined }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>
                                            {sa.profile?.display_name || sa.profile?.username || 'Unknown'}
                                        </div>
                                        <div style={{ fontSize: 12, color: FB.textSecondary }}>
                                            {sa.status === 'active' ? '[A]' : '[S]'} {sa.status} · {((sa.commission_rate || 0) * 100).toFixed(0)}% commission
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        {/* Edit commission */}
                                        <button onClick={() => { setSubAgentCommModal(sa); setSubAgentNewRate(String(((sa.commission_rate || 0) * 100).toFixed(0))); }}
                                            style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                            % Edit
                                        </button>
                                        {/* Distribute chips */}
                                        <button onClick={() => { setSubAgentDistModal(sa); setSubAgentDistAmount(''); }}
                                            style={{ background: FB.gold, color: '#000', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                            Send
                                        </button>
                                        {/* Suspend / Reactivate */}
                                        <button onClick={async () => {
                                            const act = sa.status === 'suspended' ? 'reactivate' : 'suspend';
                                            try {
                                                await apiCall('/api/club-arena/manage-agent', { clubId: dashboard.clubId, action: act, targetUserId: sa.user_id });
                                                showToast(`Sub-agent ${act === 'suspend' ? 'suspended' : 'reactivated'}`);
                                                setSubAgentsLoaded(false);
                                            } catch (e) { showToast(e.message, 'error'); }
                                        }} style={{ background: sa.status === 'suspended' ? FB.success : FB.danger, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                            {sa.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                                    {[
                                        { label: 'Players', value: sa.active_player_count || 0, color: FB.textPrimary },
                                        { label: 'Weekly Rake', value: (sa.weekly_rake_generated || 0).toLocaleString(), color: FB.gold },
                                        { label: 'Lifetime', value: (sa.lifetime_earnings || 0).toLocaleString(), color: '#4BB543' },
                                    ].map(s => (
                                        <div key={s.label} style={{ background: FB.background, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                            <div style={{ fontSize: 11, color: FB.textSecondary }}>{s.label}</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'promo' && (
                    <PromoWalletTab
                        dashboard={dashboard}
                        clubId={dashboard?.clubId}
                        userId={user?.id}
                        apiCall={apiCall}
                        showToast={showToast}
                        players={players}
                        FB={FB}
                    />
                )}
            </div>

            {/* ═══ DISTRIBUTE MODAL ═══ */}
            {distributeModal && (
                <ModalOverlay onClose={() => { setDistributeModal(null); setDistributeAmount(''); setDistributeNote(''); }}>
                    <h3 style={modalTitle}>Send Chips</h3>

                    {/* Player info + current balance */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: FB.hover, borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                        <div>
                            <div style={{ color: FB.textSecondary, fontSize: 11, marginBottom: 2 }}>Recipient</div>
                            <div style={{ color: FB.textPrimary, fontWeight: 700, fontSize: 15 }}>{distributeModal.playerName}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ color: FB.textSecondary, fontSize: 11, marginBottom: 2 }}>Current Balance</div>
                            <div style={{ color: '#F7C52A', fontWeight: 700, fontSize: 15 }}>{(distributeModal.currentBalance || 0).toLocaleString()}</div>
                        </div>
                    </div>

                    {/* Amount input */}
                    <input
                        type="number" value={distributeAmount}
                        onChange={(e) => setDistributeAmount(e.target.value)}
                        placeholder="Amount to send..." style={inputStyle}
                        autoFocus
                    />

                    {/* Quick-pick buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
                        {[500, 1000, 5000, 10000].map(v => (
                            <button key={v} onClick={() => setDistributeAmount(String(v))} style={{
                                ...btnStyle, padding: '8px 0', fontSize: 12,
                                background: distributeAmount === String(v) ? FB.primary : FB.cardBg,
                                color: distributeAmount === String(v) ? '#fff' : FB.textSecondary,
                                border: `1px solid ${distributeAmount === String(v) ? FB.primary : FB.border}`,
                            }}>
                                {v >= 1000 ? `${v / 1000}K` : v}
                            </button>
                        ))}
                    </div>

                    {/* After-send balance preview */}
                    {distributeAmount && parseInt(distributeAmount) > 0 && (
                        <div style={{ marginTop: 10, fontSize: 12, color: FB.textSecondary, textAlign: 'right' }}>
                            Balance after: <span style={{ color: FB.success, fontWeight: 600 }}>
                                {((distributeModal.currentBalance || 0) + parseInt(distributeAmount)).toLocaleString()}
                            </span>
                        </div>
                    )}

                    {/* Optional note */}
                    <input
                        value={distributeNote}
                        onChange={(e) => setDistributeNote(e.target.value)}
                        placeholder="Note (optional)..." style={{ ...inputStyle, marginTop: 10 }}
                        maxLength={120}
                    />

                    <button onClick={handleDistribute} disabled={processing || !distributeAmount || parseInt(distributeAmount) <= 0}
                        style={{ ...actionBtn, marginTop: 16, background: FB.success, opacity: (!distributeAmount || parseInt(distributeAmount) <= 0) ? 0.5 : 1 }}>
                        {processing ? 'Sending...' : `Send ${distributeAmount ? parseInt(distributeAmount).toLocaleString() : '0'} Chips`}
                    </button>
                </ModalOverlay>
            )}

            {/* ═══ CASHOUT MODAL ═══ */}
            {cashoutModal && (
                <ModalOverlay onClose={() => setCashoutModal(null)}>
                    <h3 style={modalTitle}>Cashout Request</h3>
                    <div style={{ ...cardStyle, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ color: FB.textSecondary, fontSize: 13 }}>Amount</span>
                            <span style={{ color: FB.gold, fontSize: 18, fontWeight: 800 }}>
                                {cashoutModal.amount?.toLocaleString()} chips
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: FB.textSecondary, fontSize: 13 }}>Requested</span>
                            <span style={{ color: FB.textPrimary, fontSize: 13 }}>{timeAgo(cashoutModal.created_at)}</span>
                        </div>
                        {cashoutModal.player_note && (
                            <div style={{ marginTop: 8, padding: 8, background: FB.hover, borderRadius: 6, fontSize: 12, color: FB.textSecondary }}>
                                Player note: "{cashoutModal.player_note}"
                            </div>
                        )}
                    </div>
                    <input
                        value={cashoutNote} onChange={(e) => setCashoutNote(e.target.value)}
                        placeholder="Agent note (optional)..." style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button onClick={handleCancelCashout} disabled={processing} style={{ ...actionBtn, flex: 1, background: FB.danger }}>
                            {processing ? '...' : ' Decline'}
                        </button>
                        <button onClick={handleApproveCashout} disabled={processing} style={{ ...actionBtn, flex: 2, background: FB.success }}>
                            {processing ? '...' : ` Approve ${cashoutModal.amount?.toLocaleString()}`}
                        </button>
                    </div>
                </ModalOverlay>
            )}

            {/* ═══ CLAWBACK MODAL ═══ */}
            {clawbackModal && (
                <ModalOverlay onClose={() => setClawbackModal(null)}>
                    <h3 style={{ ...modalTitle, color: FB.danger }}>Clawback Chips</h3>
                    <p style={{ color: FB.textSecondary, fontSize: 13, marginBottom: 12 }}>
                        This will reverse the transaction and return <strong style={{ color: FB.danger }}>
                            {Math.abs(clawbackModal.amount).toLocaleString()} chips</strong>.
                    </p>
                    <div style={{ ...cardStyle, marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: FB.textSecondary }}>
                            Sent {timeAgo(clawbackModal.created_at)} • {clawbackModal.notes || 'No note'}
                        </div>
                        <ClawbackTimer createdAt={clawbackModal.created_at} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => setClawbackModal(null)} style={{ ...actionBtn, flex: 1, background: FB.hover }}>
                            Cancel
                        </button>
                        <button onClick={handleClawback} disabled={processing} style={{ ...actionBtn, flex: 2, background: FB.danger }}>
                            {processing ? 'Reversing...' : 'Confirm Clawback'}
                        </button>
                    </div>
                </ModalOverlay>
            )}

            {/* ═══ PROMOTE TO SUB-AGENT MODAL ═══ */}
            {promoteModal && (
                <ModalOverlay onClose={() => setPromoteModal(null)}>
                    <h3 style={modalTitle}>Promote to Sub-Agent</h3>
                    <p style={{ color: FB.textSecondary, fontSize: 13, marginBottom: 16 }}>
                        Player: <strong style={{ color: FB.textPrimary }}>
                            {promoteModal.player?.profile?.display_name || promoteModal.player?.nickname || 'Player'}
                        </strong>
                    </p>
                    <p style={{ color: FB.textSecondary, fontSize: 12, marginBottom: 12 }}>
                        Set commission rate (1–90%). Must be lower than your own rate of{' '}
                        <strong style={{ color: FB.gold }}>{((myAgent?.commission_rate || 0) * 100).toFixed(0)}%</strong>.
                    </p>
                    <input
                        type="number" value={promoteRate}
                        onChange={(e) => setPromoteRate(e.target.value)}
                        placeholder="Commission % (e.g. 5)"
                        min="1" max="90" step="0.5"
                        style={inputStyle}
                        autoFocus
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, marginBottom: 16 }}>
                        {[5, 10, 15, 20].map(v => (
                            <button key={v} onClick={() => setPromoteRate(String(v))} style={{
                                ...btnStyle, flex: 1, padding: '6px 0', fontSize: 12,
                                background: promoteRate === String(v) ? FB.primary : FB.cardBg,
                                color: promoteRate === String(v) ? '#fff' : FB.textSecondary,
                            }}>
                                {v}%
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={async () => {
                            const pct = parseFloat(promoteRate);
                            if (isNaN(pct) || pct < 1 || pct > 90) {
                                showToast('Enter a number between 1 and 90', 'error'); return;
                            }
                            setProcessing(true);
                            try {
                                await apiCall('/api/club-arena/manage-agent', {
                                    action: 'promote_to_sub_agent',
                                    clubId: dashboard.clubId,
                                    targetUserId: promoteModal.player.user_id,
                                    commissionRate: pct / 100,
                                });
                                showToast(`Promoted to Sub-Agent at ${pct}% commission!`);
                                setPromoteModal(null);
                                setPromoteRate('');
                                setSubAgentsLoaded(false);
                            } catch (e) {
                                showToast(e.message || 'Promotion failed', 'error');
                            } finally {
                                setProcessing(false);
                            }
                        }}
                        disabled={processing || !promoteRate}
                        style={{ ...actionBtn, background: processing || !promoteRate ? FB.border : FB.purple }}
                    >
                        {processing ? 'Promoting...' : 'Confirm Promotion'}
                    </button>
                </ModalOverlay>
            )}

            {/* ── Sub-agent: Edit Commission Modal ── */}
            {subAgentCommModal && (
                <ModalOverlay onClose={() => setSubAgentCommModal(null)}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: FB.textPrimary, marginBottom: 12 }}>
                        Update Commission — {subAgentCommModal.profile?.display_name || subAgentCommModal.profile?.username || 'Sub-Agent'}
                    </div>
                    <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 8 }}>
                        Current: {((subAgentCommModal.commission_rate || 0) * 100).toFixed(0)}% · Your rate: {dashboard?.agents?.find(a => a.user_id === user?.id)?.commission_rate ? ((dashboard.agents.find(a => a.user_id === user.id).commission_rate) * 100).toFixed(0) + '%' : '—'}
                    </div>
                    <input
                        type="number" value={subAgentNewRate}
                        onChange={e => setSubAgentNewRate(e.target.value)}
                        placeholder="New rate (1–89)" min="1" max="89"
                        style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
                    />
                    <button onClick={async () => {
                        const pct = parseFloat(subAgentNewRate);
                        if (isNaN(pct) || pct < 1 || pct > 89) { showToast('Rate must be 1–89', 'error'); return; }
                        setProcessing(true);
                        try {
                            await apiCall('/api/club-arena/manage-agent', {
                                action: 'update_commission',
                                clubId: dashboard.clubId,
                                targetUserId: subAgentCommModal.user_id,
                                commissionRate: pct / 100,
                            });
                            showToast(`Commission updated to ${pct}%`);
                            setSubAgentCommModal(null);
                            setSubAgentsLoaded(false);
                        } catch (e) { showToast(e.message, 'error'); }
                        finally { setProcessing(false); }
                    }} disabled={processing || !subAgentNewRate}
                        style={{ ...actionBtn, background: processing || !subAgentNewRate ? FB.border : FB.primary }}>
                        {processing ? 'Saving...' : 'Update Commission'}
                    </button>
                </ModalOverlay>
            )}

            {/* ── Sub-agent: Distribute Chips Modal ── */}
            {subAgentDistModal && (
                <ModalOverlay onClose={() => setSubAgentDistModal(null)}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: FB.textPrimary, marginBottom: 4 }}>
                        Send Chips to Sub-Agent
                    </div>
                    <div style={{ fontSize: 13, color: FB.textSecondary, marginBottom: 12 }}>
                        To: <strong style={{ color: FB.textPrimary }}>{subAgentDistModal.profile?.display_name || subAgentDistModal.profile?.username || 'Sub-Agent'}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        {[1000, 5000, 10000, 50000].map(v => (
                            <button key={v} onClick={() => setSubAgentDistAmount(String(v))}
                                style={{ background: subAgentDistAmount === String(v) ? FB.primary : FB.cardBg, color: subAgentDistAmount === String(v) ? '#fff' : FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                                {v.toLocaleString()}
                            </button>
                        ))}
                    </div>
                    <input
                        type="number" value={subAgentDistAmount}
                        onChange={e => setSubAgentDistAmount(e.target.value)}
                        placeholder="Amount"
                        style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
                    />
                    <button onClick={async () => {
                        const amt = parseInt(subAgentDistAmount);
                        if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
                        setProcessing(true);
                        try {
                            await apiCall('/api/club-arena/distribute-chips', {
                                clubId: dashboard.clubId,
                                toUserId: subAgentDistModal.user_id,
                                amount: amt,
                                notes: 'Sub-agent chip transfer from parent agent',
                            });
                            showToast(`Sent ${amt.toLocaleString()} chips to sub-agent`);
                            setSubAgentDistModal(null);
                        } catch (e) { showToast(e.message, 'error'); }
                        finally { setProcessing(false); }
                    }} disabled={processing || !subAgentDistAmount}
                        style={{ ...actionBtn, background: processing || !subAgentDistAmount ? FB.border : FB.gold, color: '#000' }}>
                        {processing ? 'Sending...' : `Send ${subAgentDistAmount ? parseInt(subAgentDistAmount).toLocaleString() : '0'} Chips`}
                    </button>
                </ModalOverlay>
            )}

            <ClubArenaBottomNav clubId={clubIdParam} active="admin" />

            {/* ── Agent Invite: Full InviteFriendsModal ── */}
            {myPlayerNumber && (
                <InviteFriendsModal
                    isOpen={showInviteModal}
                    onClose={() => setShowInviteModal(false)}
                    user={user}
                    customUrl={`https://smarter.poker/hub/club-arena?join=${clubIdParam}&agent=${myPlayerNumber}`}
                    customTitle="Join My Club on Smarter.Poker"
                    customMessage={`Join my poker club on Smarter.Poker! Enter club code and my player number to get automatically added to my roster.`}
                    customCodeLabel="My Player Number (Agent Referral)"
                    customCodeValue={myPlayerNumber}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════════════════════

function OverviewTab({ stats, myAgent, clawbackCount, pendingCashouts, playerNumber, onShareInvite }) {
    const statCards = [
        { label: 'My Players', value: stats?.totalPlayers || 0, color: FB.primary },
        { label: 'Online Now', value: stats?.onlinePlayers || 0, color: FB.success },
        { label: 'Player Chip Total', value: (stats?.totalPlayerChips || 0).toLocaleString(), color: FB.gold },
        { label: 'Pending Cashouts', value: stats?.pendingCashouts || 0, color: stats?.pendingCashouts > 0 ? FB.orange : FB.textSecondary },
        { label: 'Pending Amount', value: (stats?.pendingCashoutAmount || 0).toLocaleString(), color: FB.orange },
        { label: 'Clawback Window', value: clawbackCount, color: clawbackCount > 0 ? FB.danger : FB.textSecondary },
    ];

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                {statCards.map((s, i) => (
                    <div key={i} style={{ ...cardStyle, textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                            {s.value}
                        </div>
                        <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* ── Club Referral Panel ── */}
            {playerNumber && (
                <div style={{ ...cardStyle, marginBottom: 12, border: `1px solid ${FB.gold}40` }}>
                    <h4 style={{ color: FB.gold, fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Your Club Referral Number</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: FB.background, borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 800, color: FB.textPrimary, letterSpacing: 3 }}>{playerNumber}</span>
                    </div>
                    <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 8 }}>
                        Share your player number with players joining this club. When they enter it alongside the club code, they&apos;ll be auto-assigned to you.
                    </div>
                    <button onClick={onShareInvite}
                        style={{ width: '100%', background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        * Share Club Join Link
                    </button>
                </div>
            )}

            {myAgent && (
                <div style={cardStyle}>
                    <h4 style={{ color: FB.textPrimary, fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Agent Profile</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <StatLine label="Commission Rate" value={`${(myAgent.commission_rate || 0) * 100}%`} />
                        <StatLine label="Lifetime Earnings" value={`${(myAgent.lifetime_earnings || 0).toLocaleString()}`} />
                        <StatLine label="Weekly Rake" value={`${(myAgent.weekly_rake_generated || 0).toLocaleString()}`} />
                        <StatLine label="Sub-Agents" value={myAgent.sub_agent_count || 0} />
                        <StatLine label="Credit Limit" value={`${(myAgent.credit_limit || 0).toLocaleString()}`} />
                        <StatLine label="Credit Used" value={`${(myAgent.credit_used || 0).toLocaleString()}`} />
                    </div>
                </div>
            )}

            {pendingCashouts?.length > 0 && (
                <div style={{ ...cardStyle, marginTop: 12, borderLeft: `3px solid ${FB.orange}` }}>
                    <h4 style={{ color: FB.orange, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                        {pendingCashouts.length} Pending Cashout{pendingCashouts.length > 1 ? 's' : ''}
                    </h4>
                    <p style={{ color: FB.textSecondary, fontSize: 12 }}>
                        Total: {pendingCashouts.reduce((s, c) => s + c.amount, 0).toLocaleString()} chips waiting for approval
                    </p>
                </div>
            )}
        </div>
    );
}

function StatLine({ label, value }) {
    return (
        <div style={{ padding: '6px 0' }}>
            <div style={{ fontSize: 11, color: FB.textSecondary }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: FB.textPrimary }}>{value}</div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// TAB: PLAYERS (Downline)
// ═══════════════════════════════════════════════════════════════

function PlayersTab({ players, onDistribute, onPromote, chipFlow = {}, playerSort = 'balance', onSortChange }) {
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);

    const filtered = (players || []).filter(p => {
        const name = (p.profile?.display_name || p.nickname || '').toLowerCase();
        return name.includes(debouncedSearch.toLowerCase());
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        if (playerSort === 'balance') return (b.chip_balance || 0) - (a.chip_balance || 0);
        if (playerSort === 'activity') {
            const ta = a.profile?.last_seen ? new Date(a.profile.last_seen).getTime() : 0;
            const tb = b.profile?.last_seen ? new Date(b.profile.last_seen).getTime() : 0;
            return tb - ta;
        }
        // name
        return (a.profile?.display_name || a.nickname || '').localeCompare(b.profile?.display_name || b.nickname || '');
    });

    const totalChips = filtered.reduce((s, p) => s + (p.chip_balance || 0), 0);
    const onlineCount = filtered.filter(p => p.profile?.is_online).length;

    return (
        <div>
            {/* Summary bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, background: FB.cardBg, borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: FB.textSecondary }}>Total Chips Out</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#F7C52A' }}>{totalChips.toLocaleString()}</div>
                </div>
                <div style={{ flex: 1, background: FB.cardBg, borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: FB.textSecondary }}>Online Now</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: FB.success }}>{onlineCount} / {filtered.length}</div>
                </div>
            </div>

            {/* Search + sort */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search players..." style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                />
                <select
                    value={playerSort}
                    onChange={(e) => onSortChange && onSortChange(e.target.value)}
                    style={{ background: FB.cardBg, color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, cursor: 'pointer' }}
                >
                    <option value="balance">By Balance</option>
                    <option value="name">By Name</option>
                    <option value="activity">By Activity</option>
                </select>
            </div>

            {sorted.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>
                    {debouncedSearch ? 'No players match search' : 'No players in your downline yet'}
                </div>
            ) : sorted.map((p, i) => {
                const flow = chipFlow[p.user_id];
                const flowNet = flow?.net || 0;
                const hasFlow = flowNet !== 0;

                return (
                    <div key={i} style={{ ...cardStyle, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Avatar */}
                        <div style={{
                            width: 40, height: 40, borderRadius: '50%', background: FB.hover,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, color: FB.textSecondary, flexShrink: 0,
                            border: p.profile?.is_online ? `2px solid ${FB.success}` : `2px solid ${FB.border}`,
                        }}>
                            {p.profile?.avatar_url
                                ? <Image src={p.profile.avatar_url} alt="User avatar" width={40} height={40} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} loading="lazy" unoptimized />
                                : ''}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: FB.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.profile?.display_name || p.nickname || 'Unknown'}
                            </div>
                            <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                {p.profile?.is_online ? '🟢 Online' : `Last seen ${timeAgo(p.profile?.last_seen)}`}
                                {p.tier && p.tier !== 'bronze' ? ` • ${p.tier}` : ''}
                            </div>
                            {/* 7-day chip flow indicator */}
                            {hasFlow && (
                                <div style={{ fontSize: 10, color: flowNet > 0 ? FB.success : '#FF6B6B', marginTop: 2 }}>
                                    {flowNet > 0 ? '▲' : '▼'} {Math.abs(flowNet).toLocaleString()} chips (7d)
                                </div>
                            )}
                        </div>

                        {/* Balance */}
                        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#F7C52A', fontVariantNumeric: 'tabular-nums' }}>
                                {(p.chip_balance || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: 10, color: FB.textSecondary }}>chips</div>
                        </div>

                        {/* Send button */}
                        <button onClick={() => onDistribute(p)} style={{
                            background: FB.primary, color: '#fff', border: 'none', borderRadius: 8,
                            padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            flexShrink: 0,
                        }}>
                            ⚡ Send
                        </button>

                        {/* Promote to Sub-Agent */}
                        {onPromote && p.role !== 'sub_agent' && p.role !== 'agent' && (
                            <button onClick={() => onPromote(p)} style={{
                                background: '#4ECDC4', color: '#000', border: 'none', borderRadius: 8,
                                padding: '8px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                flexShrink: 0,
                            }}>
                                ↑
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// TAB: CASHOUTS
// ═══════════════════════════════════════════════════════════════

function CashoutsTab({ cashouts, onAction }) {
    if (!cashouts?.length) {
        return (
            <div style={{ textAlign: 'center', padding: 60, color: FB.textSecondary }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}></div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>No pending cashouts</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>All clear — no player requests waiting</div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ fontSize: 13, color: FB.textSecondary, marginBottom: 12 }}>
                {cashouts.length} pending request{cashouts.length > 1 ? 's' : ''} •
                Total: {cashouts.reduce((s, c) => s + c.amount, 0).toLocaleString()} chips
            </div>
            {cashouts.map((c, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: 10, borderLeft: `3px solid ${FB.orange}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: FB.gold }}>
                                {c.amount?.toLocaleString()} chips
                            </div>
                            <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 2 }}>
                                Requested {timeAgo(c.created_at)}
                                {c.player_note ? ` • "${c.player_note}"` : ''}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => onAction(c)} style={{
                                background: FB.success, color: '#fff', border: 'none', borderRadius: 8,
                                padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}>
                                Review
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// TAB: TRANSACTIONS
// ═══════════════════════════════════════════════════════════════

function TransactionsTab({ transactions, clawbackEligible, onClawback, userId }) {
    const typeLabels = {
        send: ' Sent', deposit: ' Deposit', withdrawal: ' Withdrawal',
        buyin: ' Buy-in', table_lock: ' Table Lock', table_unlock: ' Table Unlock',
    };

    return (
        <div>
            {clawbackEligible.length > 0 && (
                <div style={{ ...cardStyle, marginBottom: 16, borderLeft: `3px solid ${FB.danger}` }}>
                    <h4 style={{ color: FB.danger, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                        ↩ Clawback Window ({clawbackEligible.length})
                    </h4>
                    {clawbackEligible.map((t, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? `1px solid ${FB.border}` : 'none' }}>
                            <div>
                                <div style={{ fontSize: 13, color: FB.textPrimary }}>
                                    {Math.abs(t.amount).toLocaleString()} chips
                                </div>
                                <ClawbackTimer createdAt={t.created_at} />
                            </div>
                            <button onClick={() => onClawback(t)} style={{
                                background: FB.danger, color: '#fff', border: 'none', borderRadius: 6,
                                padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}>
                                Clawback
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {(transactions || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>No recent transactions</div>
            ) : (transactions || []).map((t, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: 6, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 13, color: FB.textPrimary, fontWeight: 600 }}>
                                {typeLabels[t.transaction_type] || t.transaction_type}
                            </div>
                            <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                {timeAgo(t.created_at)}
                                {t.notes ? ` • ${t.notes.slice(0, 40)}` : ''}
                                {t.is_reversed ? ' • REVERSED' : ''}
                            </div>
                        </div>
                        <div style={{
                            fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                            color: t.amount > 0 ? FB.success : t.amount < 0 ? FB.danger : FB.textSecondary,
                        }}>
                            {t.amount > 0 ? '+' : ''}{t.amount?.toLocaleString()}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// TAB: COMMISSIONS
// ═══════════════════════════════════════════════════════════════

function CommissionsTab({ history, myAgent }) {
    const totalEarned = (history || []).reduce((s, h) => s + (h.commission_earned || 0), 0);

    return (
        <div>
            {myAgent && (
                <div style={{ ...cardStyle, marginBottom: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 4 }}>Lifetime Earnings</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: FB.gold }}>
                        {(myAgent.lifetime_earnings || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 4 }}>
                        Commission Rate: {((myAgent.commission_rate || 0) * 100).toFixed(1)}%
                    </div>
                </div>
            )}

            {(!history || history.length === 0) ? (
                <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>
                    No commission history yet. Commissions are calculated at settlement.
                </div>
            ) : history.map((h, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: FB.success }}>
                                +{(h.commission_earned || h.net_commission || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                Rake: {(h.player_rake_generated || 0).toLocaleString()} •
                                Rate: {((h.commission_rate || 0) * 100).toFixed(1)}%
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{
                                fontSize: 11, fontWeight: 600,
                                color: h.status === 'paid' ? FB.success : FB.orange,
                            }}>
                                {h.status === 'paid' ? ' Paid' : ' Pending'}
                            </div>
                            <div style={{ fontSize: 10, color: FB.textSecondary }}>
                                {h.period_start ? new Date(h.period_start).toLocaleDateString() : ''} –
                                {h.period_end ? new Date(h.period_end).toLocaleDateString() : ''}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// CLAWBACK TIMER — Countdown to 10-minute window expiry
// ═══════════════════════════════════════════════════════════════

function ClawbackTimer({ createdAt }) {
    const [remaining, setRemaining] = useState('');

    useEffect(() => {
        const update = () => {
            const elapsed = Date.now() - new Date(createdAt).getTime();
            const left = (10 * 60 * 1000) - elapsed;
            if (left <= 0) { setRemaining('Expired'); return; }
            const m = Math.floor(left / 60000);
            const s = Math.floor((left % 60000) / 1000);
            setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
        };
        update();
        const _c = new AbortController();
        const iv = setInterval(update, 1000);
        return () => { _c.abort(); clearInterval(iv); };
    }, [createdAt]);

    return (
        <div style={{
            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: remaining === 'Expired' ? FB.textSecondary : FB.danger,
            marginTop: 2,
        }}>
            {remaining === 'Expired' ? ' Window expired' : ` ${remaining} remaining`}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// MODAL OVERLAY
// ═══════════════════════════════════════════════════════════════

function ModalOverlay({ children, onClose }) {
    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9000, padding: 20,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: FB.cardBg, borderRadius: 16, padding: 24,
                border: `1px solid ${FB.border}`, maxWidth: 420, width: '100%',
            }}>
                {children}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// PROMO WALLET TAB — Manage promo balance & distribute to players
// ═══════════════════════════════════════════════════════════════

function PromoWalletTab({ dashboard, clubId, userId, apiCall, showToast, players, FB }) {
    const [promoBalance, setPromoBalance] = React.useState(0);
    const [promoTarget, setPromoTarget] = React.useState('');
    const [promoAmount, setPromoAmount] = React.useState('');
    const [promoSending, setPromoSending] = React.useState(false);
    const [promoHistory, setPromoHistory] = React.useState([]);
    const [loaded, setLoaded] = React.useState(false);

    React.useEffect(() => {
        if (!clubId || !userId) return;
        (async () => {
            try {
                const [dashData, histData] = await Promise.all([
                    apiCall('/api/club-arena/agent-dashboard', { clubId, userId }),
                    apiCall('/api/club-arena/distribute-promo', { action: 'history', clubId }),
                ]);
                setPromoBalance(dashData?.agent?.promo_balance || 0);
                setPromoHistory(histData?.history || []);
                setLoaded(true);
            } catch (e) {
                
                setLoaded(true);
            }
        })();
    }, [clubId, userId]);

    const handleSendPromo = async () => {
        if (!promoTarget || !promoAmount || parseFloat(promoAmount) <= 0) {
            showToast('Select a player and amount', 'error');
            return;
        }
        if (parseFloat(promoAmount) > promoBalance) {
            showToast('Insufficient promo balance', 'error');
            return;
        }
        setPromoSending(true);
        try {
            // Must use distribute-promo (not distribute-chips) — enforces:
            //   new account cap (max 25 per send for accounts < 14 days)
            //   lifetime cap (100 promo per player per club)
            //   3x playthrough requirement before cashout
            const result = await apiCall('/api/club-arena/distribute-promo', {
                action: 'send',
                clubId,
                targetUserId: promoTarget,
                amount: parseFloat(promoAmount),
            });
            showToast(`Sent ${parseFloat(promoAmount).toLocaleString()} promo chips!`, 'success');
            setPromoBalance(prev => prev - parseFloat(promoAmount));
            setPromoAmount('');
            setPromoTarget('');
        } catch (e) {
            showToast(e.message || 'Failed to send promo', 'error');
        } finally {
            setPromoSending(false);
        }
    };

    return (
        <div>
            {/* Promo Balance Card */}
            <div style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
                borderRadius: 16, padding: 24, marginBottom: 16,
                border: '1px solid rgba(147,51,234,0.3)',
            }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                    Your Promo Balance
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>
                    {promoBalance.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                    Received from club/union. Distribute to players as bonuses.
                </div>
            </div>

            {/* Send Promo to Player */}
            <div style={{
                background: FB.cardBg, borderRadius: 12, padding: 16,
                border: `1px solid ${FB.border}`, marginBottom: 16,
            }}>
                <h3 style={{ color: FB.textPrimary, fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
                    Distribute Promo to Player
                </h3>

                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: FB.textSecondary, marginBottom: 4 }}>
                        Select Player
                    </label>
                    <select
                        value={promoTarget}
                        onChange={e => setPromoTarget(e.target.value)}
                        style={{
                            width: '100%', padding: '10px 14px', background: FB.background,
                            border: `1px solid ${FB.border}`, borderRadius: 8, color: FB.textPrimary,
                            fontSize: 14, outline: 'none', boxSizing: 'border-box',
                        }}
                    >
                        <option value="">-- Choose Player --</option>
                        {(players || []).map(p => (
                            <option key={p.user_id} value={p.user_id}>
                                {p.profile?.display_name || p.profile?.username || p.user_id?.slice(0, 8)}
                                {' '} (Balance: {(p.chip_balance || 0).toLocaleString()})
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: FB.textSecondary, marginBottom: 4 }}>
                        Amount
                    </label>
                    <input
                        type="number"
                        value={promoAmount}
                        onChange={e => setPromoAmount(e.target.value)}
                        placeholder="Enter amount..."
                        min="1"
                        max={promoBalance}
                        style={{
                            width: '100%', padding: '10px 14px', background: FB.background,
                            border: `1px solid ${FB.border}`, borderRadius: 8, color: FB.textPrimary,
                            fontSize: 14, outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>

                {/* Quick amount buttons */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {[50, 100, 500, 1000].filter(v => v <= promoBalance).map(v => (
                        <button key={v} onClick={() => setPromoAmount(String(v))} style={{
                            flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                            background: promoAmount === String(v) ? '#7c3aed' : FB.cardBg,
                            color: promoAmount === String(v) ? '#fff' : FB.textSecondary,
                            border: `1px solid ${promoAmount === String(v) ? '#7c3aed' : FB.border}`,
                        }}>
                            {v.toLocaleString()}
                        </button>
                    ))}
                </div>

                <button
                    onClick={handleSendPromo}
                    disabled={promoSending || !promoTarget || !promoAmount}
                    style={{
                        border: 'none', borderRadius: 10, padding: '12px', fontSize: 14,
                        fontWeight: 700, color: '#fff', cursor: 'pointer', width: '100%',
                        textAlign: 'center',
                        background: promoSending || !promoTarget || !promoAmount
                            ? FB.border : 'linear-gradient(135deg, #7c3aed, #9333ea)',
                        opacity: promoSending || !promoTarget || !promoAmount ? 0.5 : 1,
                    }}
                >
                    {promoSending ? 'Sending...' : `Send ${promoAmount ? parseInt(promoAmount).toLocaleString() : '0'} Promo Chips`}
                </button>
            </div>

            {/* Info */}
            <div style={{
                background: FB.cardBg, borderRadius: 12, padding: 16,
                border: `1px solid ${FB.border}`,
            }}>
                <h4 style={{ color: FB.textPrimary, fontSize: 14, fontWeight: 600, marginTop: 0, marginBottom: 8 }}>
                    How Promo Wallets Work
                </h4>
                <div style={{ fontSize: 12, color: FB.textSecondary, lineHeight: 1.6 }}>
                    <p style={{ margin: '0 0 6px' }}>
                        Promo chips are bonus funds distributed through the hierarchy:
                    </p>
                    <p style={{ margin: '0 0 4px' }}>
                        <strong style={{ color: FB.textPrimary }}>Union → Club → Agent → Player</strong>
                    </p>
                    <p style={{ margin: '0 0 4px' }}>
                        - Your promo balance is funded by your club or union
                    </p>
                    <p style={{ margin: '0 0 4px' }}>
                        - New accounts (&lt;14 days): max 25 promo per distribution
                    </p>
                    <p style={{ margin: '0 0 4px' }}>
                        - Lifetime cap: 100 promo per player per club
                    </p>
                    <p style={{ margin: '0 0 4px' }}>
                        - Players must play through 3x before converting to real chips
                    </p>
                    <p style={{ margin: 0 }}>
                        - Use promos for sign-up bonuses, loyalty rewards, and rakeback
                    </p>
                </div>
            </div>

            {/* Distribution History */}
            {promoHistory.length > 0 && (
                <div style={{
                    background: FB.cardBg, borderRadius: 12, padding: 16,
                    border: `1px solid ${FB.border}`, marginTop: 16,
                }}>
                    <h3 style={{ color: FB.textPrimary, fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
                        Recent Distributions
                    </h3>
                    {promoHistory.slice(0, 10).map((h, i) => (
                        <div key={h.id || i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 0', borderBottom: i < Math.min(promoHistory.length, 10) - 1 ? `1px solid ${FB.border}` : 'none',
                        }}>
                            <div>
                                <div style={{ fontSize: 13, color: FB.textPrimary, fontWeight: 600 }}>
                                    {h.recipient_name || 'Player'}
                                </div>
                                <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                    {h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}
                                </div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed' }}>
                                +{(h.amount || 0).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// SHARED STYLES
// ═══════════════════════════════════════════════════════════════

const cardStyle = {
    background: FB.cardBg, borderRadius: 12, padding: 16,
    border: `1px solid ${FB.border}`,
};

const btnStyle = {
    background: FB.cardBg, color: FB.textPrimary, border: `1px solid ${FB.border}`,
    borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const actionBtn = {
    border: 'none', borderRadius: 10, padding: '12px', fontSize: 14,
    fontWeight: 700, color: '#fff', cursor: 'pointer', width: '100%', textAlign: 'center',
};

const inputStyle = {
    width: '100%', padding: '10px 14px', background: FB.background,
    border: `1px solid ${FB.border}`, borderRadius: 8, color: FB.textPrimary,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const modalTitle = {
    color: FB.textPrimary, fontSize: 18, fontWeight: 800, marginBottom: 16,
    fontFamily: 'Inter, sans-serif',
};
