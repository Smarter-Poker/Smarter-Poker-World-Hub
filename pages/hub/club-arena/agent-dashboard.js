/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Agent Dashboard | FULLY WIRED
   Facebook Dark Theme | Downline, Cashouts, Chips, Commissions, Clawback
   ═══════════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

const FB = {
    primary: '#2374E1', background: '#18191A', cardBg: '#242526',
    textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042',
    success: '#31A24C', danger: '#FA383E', gold: '#F7C52A', hover: '#3A3B3C',
    orange: '#F5A623', purple: '#A855F7',
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
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
    const router = useRouter();
    const { club: clubIdParam } = router.query;

    const [user, setUser] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [toast, setToast] = useState({ message: '', type: '' });

    // Modal states
    const [distributeModal, setDistributeModal] = useState(null); // { playerId, playerName }
    const [distributeAmount, setDistributeAmount] = useState('');
    const [cashoutModal, setCashoutModal] = useState(null); // cashout request object
    const [cashoutNote, setCashoutNote] = useState('');
    const [clawbackModal, setClawbackModal] = useState(null); // transaction object
    const [processing, setProcessing] = useState(false);
    const [subAgents, setSubAgents] = useState([]);
    const [subAgentsLoaded, setSubAgentsLoaded] = useState(false);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast({ message: '', type: '' }), 3000);
    };

    // ─── Auth ───────────────────────────────────────────────────
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setUser(session.user);
            else router.push('/auth/login');
        });
    }, []);

    // ─── Load Dashboard ─────────────────────────────────────────
    const loadDashboard = useCallback(async () => {
        if (!user || !clubIdParam) return;
        setIsLoading(true);
        try {
            const data = await apiGet(`/api/club-arena/agent-dashboard?clubId=${clubIdParam}`);
            setDashboard(data);
        } catch (err) {
            console.error('Dashboard load failed:', err);
            showToast(err.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user, clubIdParam]);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

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
            });
            showToast(`Sent ${amount.toLocaleString()} chips to ${distributeModal.playerName}`);
            setDistributeModal(null);
            setDistributeAmount('');
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
                cashoutRequestId: cashoutModal.id,
                action: 'approve',
                agentNote: cashoutNote || undefined,
            });
            showToast(`Approved cashout of ${cashoutModal.amount.toLocaleString()} chips`);
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
                cashoutRequestId: cashoutModal.id,
                action: 'cancel',
                agentNote: cashoutNote || 'Cancelled by agent',
            });
            showToast('Cashout cancelled — chips returned to player');
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
            showToast('Clawback successful — chips reversed');
            setClawbackModal(null);
            loadDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ─── Loading / Auth gate ────────────────────────────────────
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
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'players', label: `Players (${stats?.totalPlayers || 0})`, icon: '👥' },
        { id: 'cashouts', label: `Cashouts (${pendingCashouts?.length || 0})`, icon: '💸' },
        { id: 'transactions', label: 'Transactions', icon: '📋' },
        { id: 'commissions', label: 'Commissions', icon: '💰' },
        { id: 'subagents', label: 'Sub-Agents', icon: '🔗' },
        { id: 'promo', label: 'Promo Wallet', icon: '🎁' },
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
                            {role === 'owner' ? '👑 Owner View' : role === 'admin' ? '🛡️ Admin View' : '🕵️ Agent View'}
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
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: '0 20px 100px' }}>
                {activeTab === 'overview' && (
                    <OverviewTab stats={stats} myAgent={myAgent} clawbackCount={clawbackEligible.length} pendingCashouts={pendingCashouts} />
                )}
                {activeTab === 'players' && (
                    <PlayersTab
                        players={players}
                        onDistribute={(p) => setDistributeModal({ playerId: p.user_id, playerName: p.profile?.display_name || p.nickname || 'Player' })}
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
                            <div style={{ textAlign: 'center', padding: 30 }}>
                                <button onClick={async () => {
                                    try {
                                        const r = await apiCall('/api/club-arena/manage-agent', {
                                            action: 'list_sub_agents', clubId: dashboard.clubId, parentAgentUserId: user.id,
                                        });
                                        setSubAgents(r.subAgents || []);
                                        setSubAgentsLoaded(true);
                                    } catch (e) { showToast(e.message || 'Failed to load', 'error'); }
                                }} style={{ ...actionBtn, background: FB.primary, width: 'auto', padding: '12px 32px' }}>
                                    Load Sub-Agents
                                </button>
                            </div>
                        ) : subAgents.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>
                                <div style={{ fontSize: 32, marginBottom: 12 }}>🔗</div>
                                <div style={{ fontSize: 14 }}>No sub-agents under you yet.</div>
                                <div style={{ fontSize: 12, marginTop: 6 }}>Club owners assign sub-agent relationships.</div>
                            </div>
                        ) : subAgents.map(sa => (
                            <div key={sa.id} style={{ ...cardStyle, marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>
                                            {sa.profile?.display_name || sa.profile?.username || 'Unknown'}
                                        </div>
                                        <div style={{ fontSize: 12, color: FB.textSecondary }}>
                                            {sa.status === 'active' ? '🟢' : '🔴'} {sa.status} · {((sa.commission_rate || 0) * 100).toFixed(0)}% commission
                                        </div>
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
                <ModalOverlay onClose={() => setDistributeModal(null)}>
                    <h3 style={modalTitle}>Send Chips</h3>
                    <p style={{ color: FB.textSecondary, fontSize: 13, marginBottom: 16 }}>
                        To: <strong style={{ color: FB.textPrimary }}>{distributeModal.playerName}</strong>
                    </p>
                    <input
                        type="number" value={distributeAmount}
                        onChange={(e) => setDistributeAmount(e.target.value)}
                        placeholder="Amount..." style={inputStyle}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        {[100, 500, 1000, 5000].map(v => (
                            <button key={v} onClick={() => setDistributeAmount(String(v))} style={{
                                ...btnStyle, flex: 1, padding: '6px 0', fontSize: 12,
                                background: distributeAmount === String(v) ? FB.primary : FB.cardBg,
                                color: distributeAmount === String(v) ? '#fff' : FB.textSecondary,
                            }}>
                                {v.toLocaleString()}
                            </button>
                        ))}
                    </div>
                    <button onClick={handleDistribute} disabled={processing} style={{ ...actionBtn, marginTop: 16, background: FB.success }}>
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
                            {processing ? '...' : '✕ Decline'}
                        </button>
                        <button onClick={handleApproveCashout} disabled={processing} style={{ ...actionBtn, flex: 2, background: FB.success }}>
                            {processing ? '...' : `✓ Approve ${cashoutModal.amount?.toLocaleString()}`}
                        </button>
                    </div>
                </ModalOverlay>
            )}

            {/* ═══ CLAWBACK MODAL ═══ */}
            {clawbackModal && (
                <ModalOverlay onClose={() => setClawbackModal(null)}>
                    <h3 style={{ ...modalTitle, color: FB.danger }}>⚠️ Clawback Chips</h3>
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

            <ClubArenaBottomNav clubId={clubIdParam} active="admin" />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════════════════════

function OverviewTab({ stats, myAgent, clawbackCount, pendingCashouts }) {
    const statCards = [
        { label: 'My Players', value: stats?.totalPlayers || 0, color: FB.primary, icon: '👥' },
        { label: 'Online Now', value: stats?.onlinePlayers || 0, color: FB.success, icon: '🟢' },
        { label: 'Player Chip Total', value: (stats?.totalPlayerChips || 0).toLocaleString(), color: FB.gold, icon: '💰' },
        { label: 'Pending Cashouts', value: stats?.pendingCashouts || 0, color: stats?.pendingCashouts > 0 ? FB.orange : FB.textSecondary, icon: '💸' },
        { label: 'Pending Amount', value: (stats?.pendingCashoutAmount || 0).toLocaleString(), color: FB.orange, icon: '⏳' },
        { label: 'Clawback Window', value: clawbackCount, color: clawbackCount > 0 ? FB.danger : FB.textSecondary, icon: '↩️' },
    ];

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                {statCards.map((s, i) => (
                    <div key={i} style={{ ...cardStyle, textAlign: 'center' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                            {s.value}
                        </div>
                        <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>{s.label}</div>
                    </div>
                ))}
            </div>

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
                        ⚡ {pendingCashouts.length} Pending Cashout{pendingCashouts.length > 1 ? 's' : ''}
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

function PlayersTab({ players, onDistribute }) {
    const [search, setSearch] = useState('');
    const filtered = (players || []).filter(p => {
        const name = (p.profile?.display_name || p.nickname || '').toLowerCase();
        return name.includes(search.toLowerCase());
    });

    return (
        <div>
            <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players..." style={{ ...inputStyle, marginBottom: 12 }}
            />
            {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: FB.textSecondary }}>
                    {search ? 'No players match search' : 'No players in your downline yet'}
                </div>
            ) : filtered.map((p, i) => (
                <div key={i} style={{ ...cardStyle, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Avatar */}
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%', background: FB.hover,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, color: FB.textSecondary, flexShrink: 0,
                        border: p.profile?.is_online ? `2px solid ${FB.success}` : `2px solid ${FB.border}`,
                    }}>
                        {p.profile?.avatar_url
                            ? <img src={p.profile.avatar_url} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                            : '👤'}
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
                    </div>

                    {/* Balance */}
                    <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: FB.gold, fontVariantNumeric: 'tabular-nums' }}>
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
                        Send
                    </button>
                </div>
            ))}
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
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
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
        send: '📤 Sent', deposit: '📥 Deposit', withdrawal: '📤 Withdrawal',
        buyin: '🎰 Buy-in', table_lock: '🔒 Table Lock', table_unlock: '🔓 Table Unlock',
    };

    return (
        <div>
            {clawbackEligible.length > 0 && (
                <div style={{ ...cardStyle, marginBottom: 16, borderLeft: `3px solid ${FB.danger}` }}>
                    <h4 style={{ color: FB.danger, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                        ↩️ Clawback Window ({clawbackEligible.length})
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
                                {h.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
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
        const iv = setInterval(update, 1000);
        return () => clearInterval(iv);
    }, [createdAt]);

    return (
        <div style={{
            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: remaining === 'Expired' ? FB.textSecondary : FB.danger,
            marginTop: 2,
        }}>
            {remaining === 'Expired' ? '⏰ Window expired' : `⏱ ${remaining} remaining`}
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
                const r = await apiCall('/api/club-arena/agent-dashboard', { clubId, userId });
                setPromoBalance(r?.agent?.promo_balance || 0);
                setLoaded(true);
            } catch (e) {
                console.error('Promo load error:', e);
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
            await apiCall('/api/club-arena/distribute-chips', {
                clubId,
                targetUserId: promoTarget,
                amount: parseFloat(promoAmount),
                type: 'promo',
                note: 'Agent promo distribution',
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
                    🎁 Distribute Promo to Player
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
                        • Your promo balance is funded by your club or union
                    </p>
                    <p style={{ margin: '0 0 4px' }}>
                        • Players can redeem promo chips into playable chips
                    </p>
                    <p style={{ margin: 0 }}>
                        • Use promos for sign-up bonuses, loyalty rewards, and rakeback
                    </p>
                </div>
            </div>
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
