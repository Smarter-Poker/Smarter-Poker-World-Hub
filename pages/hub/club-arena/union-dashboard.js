/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Union Dashboard | FULLY WIRED
   Facebook Dark Theme | Union Stats, Clubs, Agents, Settlement, Mint Chips
   ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import dynamic from 'next/dynamic';
const SkeletonDark = dynamic(() => import('../../../src/components/ui/SkeletonDark'), { ssr: false });

const FB = {
    primary: '#2374E1', background: '#18191A', cardBg: '#242526',
    textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042',
    success: '#31A24C', danger: '#FA383E', gold: '#F7C52A', hover: '#3A3B3C',
    orange: '#F5A623', purple: '#A855F7',
};

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
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};

const StatCard = ({ label, value, color, sub }) => (
    <div style={{
        background: FB.cardBg, borderRadius: 12, padding: '16px 14px',
        border: `1px solid ${FB.border}`, flex: '1 1 140px', minWidth: 140,
    }}>
        <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: color || FB.textPrimary }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
);

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'clubs', label: 'Clubs' },
    { id: 'agents', label: 'Agents' },
    { id: 'games', label: 'Games' },
    { id: 'settlement', label: 'Settlement' },
    { id: 'mint', label: 'Mint Chips' },
    { id: 'bbj', label: 'BBJ' },
    { id: 'admins', label: 'Admins' },
    { id: 'manage_clubs', label: 'Manage Clubs' },
    { id: 'settings', label: 'Settings' },
];

export default function UnionDashboard() {
    const router = useRouter();
    const unionIdParam = router.query?.union || null;

    const [user, setUser] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [toast, setToast] = useState(null);

    // Mint chips state
    const [mintClubId, setMintClubId] = useState('');
    const [mintAmount, setMintAmount] = useState('');
    const [mintProcessing, setMintProcessing] = useState(false);
    const [createProcessing, setCreateProcessing] = useState(false);

    // Settlement state
    const [settleClubId, setSettleClubId] = useState('');
    const [settleAction, setSettleAction] = useState('open');
    const [settleProcessing, setSettleProcessing] = useState(false);

    // Manage clubs state
    const [addClubId, setAddClubId] = useState('');
    // Admin management state
    const [addAdminId, setAddAdminId] = useState('');
    // Settings state
    const [unionName, setUnionName] = useState('');
    const [unionDesc, setUnionDesc] = useState('');
    const [unionHoldRate, setUnionHoldRate] = useState('');
    const [bbjData, setBbjData] = useState(null);
    const [bbjLoading, setBbjLoading] = useState(false);
    const [bbjMainPct, setBbjMainPct] = useState('40');
    const [bbjBackupPct, setBbjBackupPct] = useState('30');
    const [bbjPromoPct, setBbjPromoPct] = useState('30');
    // Two-tap confirm state
    const [confirmRemoveClub, setConfirmRemoveClub] = useState(null);
    const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Auth
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) setUser(session.user);
            else router.push('/auth/login');
        });
    }, [router]);

    // Load dashboard data
    const loadDashboard = useCallback(async () => {
        if (!unionIdParam || !user) return;
        setIsLoading(true);
        try {
            const data = await apiGet(`/api/club-arena/union-dashboard?unionId=${unionIdParam}`);
            setDashboard(data);
            if (data.union) {
                setUnionName(data.union.name || '');
                setUnionDesc(data.union.description || '');
                setUnionHoldRate(String(((data.union.settings?.union_rake_hold || 0.10) * 100).toFixed(0)));
                setBbjMainPct(String(data.union.settings?.bbj_main_pct || 40));
                setBbjBackupPct(String(data.union.settings?.bbj_backup_pct || 30));
                setBbjPromoPct(String(data.union.settings?.bbj_promo_pct || 30));
            }
            // Only set default club selection on first load (when clubs were empty before)
            // Use functional update to read current state without capturing it in deps
            if (data.clubs?.length > 0) {
                setMintClubId(prev => prev || data.clubs[0].id);
                setSettleClubId(prev => prev || data.clubs[0].id);
            }
        } catch (err) {
            console.error('Union dashboard load failed:', err);
            showToast(err.message || 'Failed to load union dashboard', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [unionIdParam, user]);

    useEffect(() => { const _c = new AbortController(); loadDashboard(); return () => _c.abort(); }, [loadDashboard]);

    // ── Realtime subscriptions for live data ──
    useEffect(() => {
        if (!unionIdParam || !dashboard) return;

        // Subscribe to union table changes (BBJ pools, settings)
        const unionChannel = supabase
            .channel(`union:${unionIdParam}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'unions',
                filter: `id=eq.${unionIdParam}`,
            }, (payload) => {
                setDashboard(prev => prev ? { ...prev, union: { ...prev.union, ...payload.new } } : prev);
            })
            .subscribe();

        // Silent poll every 30s — does NOT set isLoading to avoid loading flash
        const poll = setInterval(async () => {
            try {
                const token = await getAuthToken();
                if (!token) return;
                const res = await fetch(`/api/club-arena/union-dashboard?unionId=${unionIdParam}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return; // Skip update on error responses
                const data = await res.json();
                if (data.success) setDashboard(data);
            } catch (e) { console.error('[union-dashboard:poll]', e); }
        }, 30000);

        return () => {
            supabase.removeChannel(unionChannel);
            clearInterval(poll);
        };
    }, [unionIdParam, dashboard]);

    // Mint chips
    const handleMint = async () => {
        if (!mintClubId || !mintAmount || parseInt(mintAmount) <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }
        setMintProcessing(true);
        try {
            await apiCall('/api/club-arena/mint-chips', {
                clubId: mintClubId,
                amount: parseInt(mintAmount),
            });
            showToast(`Minted ${parseInt(mintAmount).toLocaleString()} chips`);
            setMintAmount('');
            loadDashboard();
        } catch (err) {
            showToast(err.message || 'Mint failed', 'error');
        } finally {
            setMintProcessing(false);
        }
    };

    // Settlement action
    const handleSettle = async () => {
        if (!settleClubId) {
            showToast('Select a club', 'error');
            return;
        }
        setSettleProcessing(true);
        try {
            const body = {
                clubId: settleClubId,
                action: settleAction,
            };

            // pay_all requires a periodId — fetch the most recent closed period
            if (settleAction === 'pay_all') {
                const statusData = await apiCall('/api/club-arena/settle-period', {
                    clubId: settleClubId,
                    action: 'status',
                });
                const closedPeriod = (statusData.recentPeriods || []).find(p => p.status === 'closed');
                if (!closedPeriod) {
                    showToast('No closed period found to pay. Close a period first.', 'error');
                    return;
                }
                body.periodId = closedPeriod.id;
            }

            await apiCall('/api/club-arena/settle-period', body);
            showToast(`Settlement: ${settleAction} successful`);
            loadDashboard();
        } catch (err) {
            showToast(err.message || 'Settlement action failed', 'error');
        } finally {
            setSettleProcessing(false);
        }
    };

    // Loading
    if (isLoading || !user) {
        return (
            <div style={{ background: FB.background, minHeight: '100vh' }}>
                <SEOHead title="Union Dashboard | Club Arena" />
                <UniversalHeader />
                <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>
                    <SkeletonDark variant="stat-cards" count={4} />
                    <div style={{ marginTop: 16 }}>
                        <SkeletonDark variant="table-rows" rows={5} />
                    </div>
                </div>
            </div>
        );
    }

    if (!dashboard) {
        // If no unionIdParam, show Create Union form
        if (!unionIdParam) {
            return (
                <div style={{ background: FB.background, minHeight: '100vh' }}>
                    <SEOHead title="Create Union | Club Arena" />
                    <UniversalHeader />
                    <div style={{ maxWidth: 500, margin: '0 auto', padding: '60px 16px' }}>
                        <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: 24, fontWeight: 800, color: FB.gold, margin: '0 0 8px', textAlign: 'center' }}>
                            Create a Union
                        </h1>
                        <p style={{ fontSize: 13, color: FB.textSecondary, textAlign: 'center', marginBottom: 32 }}>
                            Manage multiple clubs under one umbrella with shared agents, settlements, and chip minting.
                        </p>
                        <div style={{ background: FB.cardBg, borderRadius: 12, padding: 24, border: `1px solid ${FB.border}` }}>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Union Name *</label>
                                <input value={unionName} onChange={e => setUnionName(e.target.value)}
                                    placeholder="My Poker Union" style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '12px', fontSize: 14, boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Description</label>
                                <textarea value={unionDesc} onChange={e => setUnionDesc(e.target.value)}
                                    placeholder="Describe your union..." rows={3}
                                    style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '12px', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Union Rake Hold Rate (%)</label>
                                <input type="number" value={unionHoldRate} onChange={e => setUnionHoldRate(e.target.value)}
                                    placeholder="10" min="0" max="100"
                                    style={{ width: 120, background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '12px', fontSize: 14, boxSizing: 'border-box' }} />
                            </div>
                            <button
                                disabled={createProcessing || !unionName.trim()}
                                onClick={async () => {
                                    if (!unionName.trim()) { showToast('Union name required', 'error'); return; }
                                    setCreateProcessing(true);
                                    try {
                                        const r = await apiCall('/api/club-arena/manage-union', {
                                            action: 'create',
                                            name: unionName,
                                            description: unionDesc,
                                            settings: { union_rake_hold: parseFloat(unionHoldRate || '10') / 100 },
                                        });
                                        showToast('Union created!');
                                        router.push(`/hub/club-arena/union-dashboard?union=${r.union.id}`);
                                    } catch (e) { showToast(e.message, 'error'); }
                                    finally { setCreateProcessing(false); }
                                }}
                                style={{
                                    width: '100%', background: FB.gold, color: '#000', border: 'none',
                                    borderRadius: 10, padding: '14px', fontWeight: 800, fontSize: 16, cursor: 'pointer',
                                    opacity: createProcessing || !unionName.trim() ? 0.5 : 1,
                                }}>
                                {createProcessing ? 'Creating...' : 'Create Union'}
                            </button>
                        </div>
                        <button onClick={() => router.push('/hub/club-arena')}
                            style={{ display: 'block', margin: '20px auto 0', background: 'transparent', color: FB.textSecondary, border: 'none', fontSize: 13, cursor: 'pointer' }}>
                            ← Back to Club Arena
                        </button>
                    </div>
                    {toast && (
                        <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? FB.danger : FB.success, color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999 }}>
                            {toast.msg}
                        </div>
                    )}
                </div>
            );
        }
        return (
            <div style={{ background: FB.background, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <SEOHead title="Union Dashboard | Club Arena" />
                <div style={{ color: FB.danger, fontSize: 18 }}>Failed to load union dashboard</div>
                <button onClick={() => router.push('/hub/club-arena')}
                    style={{ background: FB.primary, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer' }}>
                    Back to Club Arena
                </button>
            </div>
        );
    }

    const { union, stats, clubs, agents, recentPeriods } = dashboard;

    return (
        <div style={{ background: FB.background, minHeight: '100vh' }}>
            <SEOHead title={`${union?.name || 'Union'} Dashboard | Club Arena`} />
            <UniversalHeader />

            <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 120px' }}>
                {/* Header */}
                <div style={{ marginBottom: 24 }}>
                    <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: 24, fontWeight: 800, color: FB.gold, margin: 0 }}>
                        {union?.name || 'Union Dashboard'}
                    </h1>
                    <p style={{ fontSize: 13, color: FB.textSecondary, margin: '4px 0 0' }}>
                        Union Code: <span style={{ color: FB.primary, fontWeight: 700 }}>{union?.union_code || union?.code || 'N/A'}</span>
                        &nbsp; · &nbsp; Role: <span style={{ color: FB.gold }}>{dashboard.adminRole === 'union_lead' ? 'Union Lead' : dashboard.adminRole === 'union_admin' ? 'Union Admin' : dashboard.adminRole || 'Admin'}</span>
                    </p>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            style={{
                                background: activeTab === tab.id ? FB.primary : FB.cardBg,
                                color: activeTab === tab.id ? '#fff' : FB.textSecondary,
                                border: `1px solid ${activeTab === tab.id ? FB.primary : FB.border}`,
                                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                            }}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ═══ OVERVIEW TAB ═══ */}
                {activeTab === 'overview' && (
                    <div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                            <StatCard label="Clubs" value={stats?.totalClubs ?? 0} color={FB.primary} />
                            <StatCard label="Members" value={(stats?.totalMembers ?? 0).toLocaleString()} color={FB.textPrimary} />
                            <StatCard label="Agents" value={stats?.totalAgents ?? 0} color={FB.orange} />
                            <StatCard label="Agent Players" value={stats?.totalAgentPlayers ?? 0} color={FB.purple} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                            <StatCard label="Total Treasury" value={(stats?.totalTreasury ?? 0).toLocaleString()} color={FB.gold} />
                            <StatCard label="Total Rake" value={(stats?.totalRake ?? 0).toLocaleString()} color={FB.success} />
                            <StatCard label="Weekly Rake" value={(stats?.totalWeeklyRake ?? 0).toLocaleString()} color={FB.primary} />
                            <StatCard label="Union Hold" value={(stats?.estimatedUnionHold ?? 0).toLocaleString()} color={FB.gold}
                                sub={`${(((stats?.unionHoldRate) || 0) * 100).toFixed(0)}% of period rake`} />
                        </div>

                        {/* BBJ Summary — shown if any balance > 0 */}
                        {(union?.main_bbj_balance > 0 || union?.backup_bbj_balance > 0 || union?.promo_fund_balance > 0) && (
                            <div style={{ background: 'rgba(255,215,0,0.06)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(255,215,0,0.15)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>Bad Beat Jackpot</span>
                                    <span style={{ fontSize: 18, fontWeight: 900, color: '#FFD700' }}>
                                        {((union.main_bbj_balance || 0) + (union.backup_bbj_balance || 0) + (union.promo_fund_balance || 0)).toLocaleString()}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                                    <span style={{ color: '#FFD700' }}>Main: {(union.main_bbj_balance || 0).toLocaleString()}</span>
                                    <span style={{ color: '#C0C0C0' }}>Backup: {(union.backup_bbj_balance || 0).toLocaleString()}</span>
                                    <span style={{ color: '#4BB543' }}>Promo: {(union.promo_fund_balance || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        )}

                        {/* Quick Actions */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {[
                                { label: 'View Games', tab: 'games', color: FB.primary },
                                { label: 'Mint Chips', tab: 'mint', color: FB.gold },
                                { label: 'Settlement', tab: 'settlement', color: FB.purple },
                                { label: 'Add Club', tab: 'manage_clubs', color: FB.success },
                            ].map(q => (
                                <button key={q.tab} onClick={() => setActiveTab(q.tab)} style={{
                                    background: q.color, color: q.color === FB.gold ? '#000' : '#fff',
                                    border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700,
                                    fontSize: 13, cursor: 'pointer', flex: '1 1 120px',
                                }}>{q.label}</button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ CLUBS TAB ═══ */}
                {activeTab === 'clubs' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {clubs.length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 40 }}>No clubs in this union yet.</div>
                        ) : clubs.map(club => (
                            <div key={club.id} style={{
                                background: FB.cardBg, borderRadius: 12, padding: 16,
                                border: `1px solid ${FB.border}`, cursor: 'pointer',
                            }} onClick={() => router.push(`/hub/club-arena/lobby?club=${club.id}`)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: FB.textPrimary }}>{club.name}</div>
                                        <div style={{ fontSize: 12, color: FB.textSecondary }}>Code: {club.club_id}</div>
                                    </div>
                                    <div style={{ fontSize: 12, color: FB.primary }}>View →</div>
                                </div>
                                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: FB.textSecondary }}>
                                    <span> {club.member_count || 0} members</span>
                                    <span> {(club.chip_treasury || 0).toLocaleString()} treasury</span>
                                    <span> {(club.total_rake || 0).toLocaleString()} rake</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ AGENTS TAB ═══ */}
                {activeTab === 'agents' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {agents.length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 40 }}>No agents across union clubs.</div>
                        ) : agents.map(agent => {
                            const clubName = clubs.find(c => c.id === agent.club_id)?.name || 'Unknown Club';
                            return (
                                <div key={agent.id} style={{
                                    background: FB.cardBg, borderRadius: 12, padding: 14,
                                    border: `1px solid ${FB.border}`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <div>
                                            <span style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>
                                                {agent.profile?.display_name || agent.profile?.username || agent.user_id.slice(0, 8)}
                                            </span>
                                            <span style={{ fontSize: 12, color: FB.primary, marginLeft: 8 }}>
                                                {agent.is_prepaid ? 'Prepaid' : 'Credit'}
                                            </span>
                                        </div>
                                        <span style={{
                                            fontSize: 11, color: agent.status === 'active' ? FB.success : FB.danger,
                                            fontWeight: 600,
                                        }}>
                                            {agent.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 4 }}>
                                        Club: {clubName} · Commission: {((agent.commission_rate || 0) * 100).toFixed(0)}%
                                    </div>
                                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: FB.textSecondary, flexWrap: 'wrap' }}>
                                        <span>{agent.active_player_count || 0} active players</span>
                                        <span>{(agent.weekly_rake_generated || 0).toLocaleString()} wk rake</span>
                                        <span>{(agent.lifetime_earnings || 0).toLocaleString()} lifetime</span>
                                        {!agent.is_prepaid && agent.credit_limit > 0 && (
                                            <span style={{ color: (agent.credit_used || 0) > (agent.credit_limit || 0) * 0.8 ? FB.danger : FB.textSecondary }}>
                                                Credit: {(agent.credit_used || 0).toLocaleString()} / {(agent.credit_limit || 0).toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ═══ GAMES TAB ═══ */}
                {activeTab === 'games' && (
                    <div>
                        <div style={{ background: FB.cardBg, borderRadius: 12, padding: 24, border: `1px solid ${FB.border}`, textAlign: 'center' }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: FB.textPrimary, marginBottom: 8 }}>
                                Union Games Management
                            </h3>
                            <p style={{ fontSize: 13, color: FB.textSecondary, marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                                Create and manage tournaments and cash games across all clubs in this union.
                            </p>
                            <button onClick={() => router.push(`/hub/club-arena/union-games?union=${unionIdParam}`)}
                                style={{
                                    background: FB.primary, color: '#fff', border: 'none', borderRadius: 10,
                                    padding: '14px 32px', fontWeight: 800, fontSize: 15, cursor: 'pointer',
                                }}>
                                Open Games Dashboard
                            </button>
                        </div>

                        {/* Quick Stats */}
                        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                            <div style={{ background: FB.cardBg, borderRadius: 10, padding: 14, border: `1px solid ${FB.border}`, flex: '1 1 200px' }}>
                                <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>Clubs Available</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: FB.primary }}>{clubs.length}</div>
                                <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>{clubs.map(c => c.name).join(', ') || 'None'}</div>
                            </div>
                            <div style={{ background: FB.cardBg, borderRadius: 10, padding: 14, border: `1px solid ${FB.border}`, flex: '1 1 200px' }}>
                                <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 4, textTransform: 'uppercase' }}>Total Members</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: FB.textPrimary }}>{(stats?.totalMembers ?? 0).toLocaleString()}</div>
                                <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>Players across all clubs</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ SETTLEMENT TAB ═══ */}
                {activeTab === 'settlement' && (
                    <div>
                        {/* Settlement Actions */}
                        <div style={{
                            background: FB.cardBg, borderRadius: 12, padding: 16,
                            border: `1px solid ${FB.border}`, marginBottom: 20,
                        }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 12 }}>
                                Settlement Actions
                            </h3>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                                <select value={settleClubId} onChange={e => setSettleClubId(e.target.value)}
                                    style={{ flex: '1 1 200px', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                                    {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <select value={settleAction} onChange={e => setSettleAction(e.target.value)}
                                    style={{ flex: '0 0 120px', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                                    <option value="open">Open Period</option>
                                    <option value="close">Close Period</option>
                                    <option value="pay_all">Pay All</option>
                                    <option value="status">Status</option>
                                </select>
                                <button onClick={handleSettle} disabled={settleProcessing}
                                    style={{
                                        background: FB.primary, color: '#fff', border: 'none',
                                        borderRadius: 8, padding: '8px 20px', fontWeight: 700, fontSize: 13,
                                        cursor: settleProcessing ? 'wait' : 'pointer', opacity: settleProcessing ? 0.6 : 1,
                                    }}>
                                    {settleProcessing ? 'Processing...' : 'Execute'}
                                </button>
                            </div>
                        </div>

                        {/* Recent Periods */}
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>
                            Recent Settlement Periods
                        </h3>
                        {(recentPeriods || []).length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 30 }}>No settlement periods yet.</div>
                        ) : (recentPeriods || []).map(period => {
                            const clubName = clubs.find(c => c.id === period.club_id)?.name || 'Unknown';
                            return (
                                <div key={period.id} style={{
                                    background: FB.cardBg, borderRadius: 10, padding: 14,
                                    border: `1px solid ${FB.border}`, marginBottom: 8,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 13 }}>
                                            {clubName} — Period #{period.period_number || '?'}
                                        </span>
                                        <span style={{
                                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                            background: period.status === 'open' ? 'rgba(49,162,76,0.15)' : period.status === 'closed' ? 'rgba(245,166,35,0.15)' : 'rgba(176,179,184,0.15)',
                                            color: period.status === 'open' ? FB.success : period.status === 'closed' ? FB.orange : FB.textSecondary,
                                        }}>
                                            {period.status}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: FB.textSecondary }}>
                                        Rake: {(period.total_rake_collected || 0).toLocaleString()} · Hands: {period.total_hands_dealt || 0}
                                    </div>
                                    {period.start_at && (
                                        <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>
                                            {new Date(period.start_at).toLocaleDateString()} — {period.end_at ? new Date(period.end_at).toLocaleDateString() : 'ongoing'}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ═══ MINT CHIPS TAB ═══ */}
                {activeTab === 'mint' && (
                    <div style={{
                        background: FB.cardBg, borderRadius: 12, padding: 20,
                        border: `1px solid ${FB.border}`,
                    }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: FB.gold, marginBottom: 4 }}>
                            Mint Chips to Club Treasury
                        </h3>
                        <p style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 20 }}>
                            Add chips to a club's treasury. These can then be distributed to agents and players.
                        </p>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Select Club</label>
                            <select value={mintClubId} onChange={e => setMintClubId(e.target.value)}
                                style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>
                                {clubs.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} — Treasury: {(c.chip_treasury || 0).toLocaleString()}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Amount to Mint</label>
                            <input type="number" value={mintAmount} onChange={e => setMintAmount(e.target.value)}
                                placeholder="10000"
                                style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                            {[10000, 50000, 100000, 500000].map(v => (
                                <button key={v} onClick={() => setMintAmount(String(v))}
                                    style={{
                                        background: mintAmount === String(v) ? FB.gold : FB.hover,
                                        color: mintAmount === String(v) ? '#000' : FB.textSecondary,
                                        border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12,
                                        fontWeight: 600, cursor: 'pointer',
                                    }}>
                                    {(v / 1000)}K
                                </button>
                            ))}
                        </div>

                        <button onClick={handleMint} disabled={mintProcessing}
                            style={{
                                width: '100%', background: `linear-gradient(135deg, ${FB.gold}, #d4a017)`,
                                color: '#000', border: 'none', borderRadius: 10, padding: '12px',
                                fontWeight: 800, fontSize: 15, cursor: mintProcessing ? 'wait' : 'pointer',
                                opacity: mintProcessing ? 0.6 : 1,
                            }}>
                            {mintProcessing ? 'Minting...' : `Mint ${mintAmount ? parseInt(mintAmount).toLocaleString() : '0'} Chips`}
                        </button>
                    </div>
                )}

                {/* ═══ MANAGE CLUBS TAB ═══ */}
                {activeTab === 'manage_clubs' && (
                    <div>
                        {/* Add club by ID */}
                        <div style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}`, marginBottom: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Add Club to Union</h3>
                            <p style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 12 }}>Enter a club code (numeric ID) or UUID to add it to this union.</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={addClubId} onChange={e => setAddClubId(e.target.value)}
                                    placeholder="Club code or UUID" style={{ flex: 1, background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13 }} />
                                <button onClick={async () => {
                                    if (!addClubId.trim()) { showToast('Enter a club ID', 'error'); return; }
                                    try {
                                        const r = await apiCall('/api/club-arena/manage-union', { action: 'add_club', unionId: unionIdParam, clubId: addClubId.trim() });
                                        showToast(`Added club: ${r.clubName || addClubId}`);
                                        setAddClubId('');
                                        loadDashboard();
                                    } catch (e) { showToast(e.message, 'error'); }
                                }} style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add</button>
                            </div>
                        </div>
                        {/* Current clubs with remove button */}
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Current Clubs</h3>
                        {clubs.length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 30 }}>No clubs in this union yet.</div>
                        ) : clubs.map(club => (
                            <div key={club.id} style={{ background: FB.cardBg, borderRadius: 10, padding: 14, border: `1px solid ${FB.border}`, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>{club.name}</div>
                                    <div style={{ fontSize: 12, color: FB.textSecondary }}> {club.member_count || 0} ·  {(club.chip_treasury || 0).toLocaleString()}</div>
                                </div>
                                <button onClick={async () => {
                                    if (confirmRemoveClub !== club.id) {
                                        setConfirmRemoveClub(club.id);
                                        setTimeout(() => setConfirmRemoveClub(null), 4000);
                                        return;
                                    }
                                    setConfirmRemoveClub(null);
                                    try {
                                        await apiCall('/api/club-arena/manage-union', { action: 'remove_club', unionId: unionIdParam, clubId: club.id });
                                        showToast(`Removed ${club.name}`);
                                        loadDashboard();
                                    } catch (e) { showToast(e.message, 'error'); }
                                }} style={{ background: confirmRemoveClub === club.id ? '#b91c1c' : FB.danger, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                    {confirmRemoveClub === club.id ? 'Confirm?' : 'Remove'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ ADMINS TAB ═══ */}
                {activeTab === 'admins' && (
                    <div>
                        <div style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}`, marginBottom: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Add Union Admin</h3>
                            <p style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 12 }}>Enter a user UUID to grant union admin access.</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input value={addAdminId} onChange={e => setAddAdminId(e.target.value)}
                                    placeholder="User UUID" style={{ flex: 1, background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13 }} />
                                <button onClick={async () => {
                                    if (!addAdminId.trim()) { showToast('Enter a user ID', 'error'); return; }
                                    try {
                                        const r = await apiCall('/api/club-arena/manage-union', { action: 'add_admin', unionId: unionIdParam, adminUserId: addAdminId.trim() });
                                        showToast(`Added admin: ${r.admin?.display_name || r.admin?.username || addAdminId}`);
                                        setAddAdminId('');
                                        loadDashboard();
                                    } catch (e) { showToast(e.message, 'error'); }
                                }} style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add Admin</button>
                            </div>
                        </div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Current Admins</h3>
                        {(dashboard.admins || []).length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 20 }}>No admins found.</div>
                        ) : (dashboard.admins || []).map(admin => (
                            <div key={admin.user_id} style={{
                                background: FB.cardBg, borderRadius: 10, padding: 14, border: `1px solid ${FB.border}`,
                                marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>
                                        {admin.profile?.display_name || admin.profile?.username || admin.user_id.slice(0, 8)}
                                    </div>
                                    <div style={{ fontSize: 12, color: FB.textSecondary }}>
                                        Role: <span style={{ color: admin.role === 'union_lead' ? FB.gold : FB.primary }}>{admin.role === 'union_lead' ? 'Union Lead' : admin.role === 'union_admin' ? 'Union Admin' : admin.role}</span>
                                    </div>
                                </div>
                                {admin.role !== 'union_lead' && (
                                    <button onClick={async () => {
                                        if (confirmRemoveAdmin !== admin.user_id) {
                                            setConfirmRemoveAdmin(admin.user_id);
                                            setTimeout(() => setConfirmRemoveAdmin(null), 4000);
                                            return;
                                        }
                                        setConfirmRemoveAdmin(null);
                                        try {
                                            await apiCall('/api/club-arena/manage-union', { action: 'remove_admin', unionId: unionIdParam, adminUserId: admin.user_id });
                                            showToast('Admin removed');
                                            loadDashboard();
                                        } catch (e) { showToast(e.message, 'error'); }
                                    }} style={{ background: confirmRemoveAdmin === admin.user_id ? '#b91c1c' : FB.danger, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                        {confirmRemoveAdmin === admin.user_id ? 'Confirm?' : 'Remove'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ SETTINGS TAB ═══ */}
                {activeTab === 'settings' && (
                    <div style={{ background: FB.cardBg, borderRadius: 12, padding: 20, border: `1px solid ${FB.border}` }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: FB.textPrimary, marginBottom: 16 }}>Union Settings</h3>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Union Name</label>
                            <input value={unionName} onChange={e => setUnionName(e.target.value)}
                                style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Description</label>
                            <textarea value={unionDesc} onChange={e => setUnionDesc(e.target.value)} rows={3}
                                style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
                        </div>

                        {/* Rake Routing Info */}
                        <div style={{ background: 'rgba(24,119,242,0.08)', borderRadius: 10, padding: 14, marginBottom: 16, border: '1px solid rgba(24,119,242,0.2)' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: FB.primary, marginBottom: 4 }}>Rake Routing</div>
                            <div style={{ fontSize: 12, color: FB.textSecondary }}>
                                100% of all rake and BBJ from member clubs flows to this union. Clubs in a union do not keep rake directly.
                            </div>
                        </div>

                        {/* Union Rake Hold Rate */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary, display: 'block', marginBottom: 4 }}>Union Rake Hold Rate (%)</label>
                            <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 6 }}>Percentage of total rake retained by the union before distributing to clubs/agents.</div>
                            <input type="number" value={unionHoldRate} onChange={e => setUnionHoldRate(e.target.value)}
                                min="0" max="50" step="1" placeholder="10"
                                style={{ width: 120, background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                        </div>

                        {/* BBJ Split Config */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary, display: 'block', marginBottom: 8 }}>BBJ Split Percentages</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: '#FFD700', display: 'block', marginBottom: 2 }}>Main BBJ %</label>
                                    <input type="number" value={bbjMainPct} onChange={e => setBbjMainPct(e.target.value)}
                                        min="0" max="100" style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#C0C0C0', display: 'block', marginBottom: 2 }}>Backup BBJ %</label>
                                    <input type="number" value={bbjBackupPct} onChange={e => setBbjBackupPct(e.target.value)}
                                        min="0" max="100" style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#4BB543', display: 'block', marginBottom: 2 }}>Promo Fund %</label>
                                    <input type="number" value={bbjPromoPct} onChange={e => setBbjPromoPct(e.target.value)}
                                        min="0" max="100" style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            {(parseInt(bbjMainPct || 0) + parseInt(bbjBackupPct || 0) + parseInt(bbjPromoPct || 0)) !== 100 && (
                                <div style={{ fontSize: 11, color: FB.danger, marginTop: 4 }}>
                                    Must total 100% (currently {parseInt(bbjMainPct || 0) + parseInt(bbjBackupPct || 0) + parseInt(bbjPromoPct || 0)}%)
                                </div>
                            )}
                        </div>

                        <button onClick={async () => {
                            const total = parseInt(bbjMainPct || 0) + parseInt(bbjBackupPct || 0) + parseInt(bbjPromoPct || 0);
                            if (total !== 100) { showToast('BBJ split must total 100%', 'error'); return; }
                            try {
                                await apiCall('/api/club-arena/manage-union', {
                                    action: 'update_settings',
                                    unionId: unionIdParam,
                                    name: unionName,
                                    description: unionDesc,
                                    settings: {
                                        ...dashboard?.union?.settings,
                                        union_rake_hold: parseFloat(unionHoldRate || '10') / 100,
                                        bbj_main_pct: parseInt(bbjMainPct),
                                        bbj_backup_pct: parseInt(bbjBackupPct),
                                        bbj_promo_pct: parseInt(bbjPromoPct),
                                    },
                                });
                                showToast('Settings saved');
                                loadDashboard();
                            } catch (e) { showToast(e.message, 'error'); }
                        }} style={{
                            width: '100%', background: FB.primary, color: '#fff', border: 'none',
                            borderRadius: 10, padding: '12px', fontWeight: 800, fontSize: 15, cursor: 'pointer',
                        }}>Save Settings</button>
                    </div>
                )}

                {/* ═══ BBJ TAB ═══ */}
                {activeTab === 'bbj' && (
                    <div style={{ background: FB.cardBg, borderRadius: 12, padding: 20, border: `1px solid ${FB.border}` }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: FB.textPrimary, marginBottom: 16 }}>Bad Beat Jackpot</h3>

                        {/* Pool Balances — from union data directly */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                            {[
                                { label: 'Main BBJ', value: union?.main_bbj_balance || 0, color: '#FFD700' },
                                { label: 'Backup BBJ', value: union?.backup_bbj_balance || 0, color: '#C0C0C0' },
                                { label: 'Promo Fund', value: union?.promo_fund_balance || 0, color: '#4BB543' },
                            ].map(p => (
                                <div key={p.label} style={{ background: FB.background, borderRadius: 10, padding: 14, textAlign: 'center', border: `1px solid ${FB.border}` }}>
                                    <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 4 }}>{p.label}</div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: p.color }}>{(p.value).toLocaleString()}</div>
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div style={{ background: 'rgba(255,215,0,0.06)', borderRadius: 10, padding: 14, marginBottom: 16, textAlign: 'center', border: '1px solid rgba(255,215,0,0.2)' }}>
                            <div style={{ fontSize: 12, color: '#FFD700', marginBottom: 2 }}>TOTAL BBJ POOL</div>
                            <div style={{ fontSize: 28, fontWeight: 900, color: '#FFD700' }}>
                                {((union?.main_bbj_balance || 0) + (union?.backup_bbj_balance || 0) + (union?.promo_fund_balance || 0)).toLocaleString()}
                            </div>
                        </div>

                        {/* Split Config */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 8 }}>BBJ Split Configuration</div>
                            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                                <span style={{ color: '#FFD700' }}>Main: {union?.settings?.bbj_main_pct || 40}%</span>
                                <span style={{ color: '#C0C0C0' }}>Backup: {union?.settings?.bbj_backup_pct || 30}%</span>
                                <span style={{ color: '#4BB543' }}>Promo: {union?.settings?.bbj_promo_pct || 30}%</span>
                            </div>
                        </div>

                        {/* Detailed activity loader */}
                        {!bbjData ? (
                            <button onClick={async () => {
                                setBbjLoading(true);
                                try {
                                    const { data, error } = await supabase.rpc('get_union_bbj_status', { p_union_id: unionIdParam });
                                    if (error) throw error;
                                    setBbjData(data);
                                } catch (e) {
                                    showToast('Detailed BBJ activity not available yet', 'error');
                                } finally { setBbjLoading(false); }
                            }} disabled={bbjLoading} style={{
                                width: '100%', background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`,
                                borderRadius: 10, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                                opacity: bbjLoading ? 0.5 : 1,
                            }}>{bbjLoading ? 'Loading...' : 'Load Detailed Activity'}</button>
                        ) : (
                            <div>
                                <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 8 }}>Recent BBJ Activity</div>
                                {(bbjData.recent_entries || []).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 20, color: FB.textSecondary, fontSize: 13 }}>
                                        No BBJ activity yet. BBJ drops start when tables have bbj_percent configured.
                                    </div>
                                ) : (bbjData.recent_entries || []).map((entry, i) => (
                                    <div key={entry.id || i} style={{
                                        background: FB.background, borderRadius: 8, padding: '10px 12px',
                                        border: `1px solid ${FB.border}`, marginBottom: 6, fontSize: 12,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: entry.entry_type === 'contribution' ? '#4BB543' : '#FA383E', fontWeight: 600 }}>
                                                {entry.entry_type === 'contribution' ? '+' : ''}{(entry.main_amount || 0).toFixed(2)} main
                                                {entry.backup_amount ? ` / ${(entry.backup_amount).toFixed(2)} backup` : ''}
                                                {entry.promo_amount ? ` / ${(entry.promo_amount).toFixed(2)} promo` : ''}
                                            </span>
                                            <span style={{ color: FB.textSecondary }}>
                                                {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
                                            </span>
                                        </div>
                                        {entry.note && <div style={{ color: FB.textSecondary, marginTop: 2 }}>{entry.note}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
                    background: toast.type === 'error' ? FB.danger : FB.success,
                    color: '#fff', padding: '10px 24px', borderRadius: 10,
                    fontSize: 13, fontWeight: 600, zIndex: 999,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                }}>
                    {toast.msg}
                </div>
            )}

            <ClubArenaBottomNav active="admin" />
        </div>
    );
}
