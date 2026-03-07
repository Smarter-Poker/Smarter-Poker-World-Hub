/* ═══════════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Union Dashboard | FULLY WIRED
   SmarterPoker Dark Theme | Union Stats, Clubs, Agents, Settlement, Mint Chips
   ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import dynamic from 'next/dynamic';
import usePersistedState from '../../../src/hooks/usePersistedState';
const SkeletonDark = dynamic(() => import('../../../src/components/ui/SkeletonDark'), { ssr: false });

const FB = {
    primary: '#2374E1', background: '#18191A', cardBg: '#242526',
    textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042',
    success: '#31A24C', danger: '#FA383E', gold: '#F7C52A', hover: '#3A3B3C',
    orange: '#F5A623', purple: '#A855F7',
};

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

const ALL_TABS = [
    { id: 'overview', label: 'Overview', leadOnly: false },
    { id: 'clubs', label: 'Clubs', leadOnly: false },
    { id: 'agents', label: 'Agents', leadOnly: false },
    { id: 'games', label: 'Games', leadOnly: false },
    { id: 'settlement', label: 'Settlement', leadOnly: false },
    { id: 'mint', label: 'Mint Chips', leadOnly: false },
    { id: 'bbj', label: 'BBJ', leadOnly: false },
    { id: 'admins', label: 'Admins', leadOnly: false },       // All admins can VIEW; only lead can manage
    { id: 'manage_clubs', label: 'Manage Clubs', leadOnly: true },
    { id: 'settings', label: 'Settings', leadOnly: true },
];

export default function UnionDashboard() {
    const router = useRouter();
    const unionIdParam = router.query?.union || null;

    const [user, setUser] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = usePersistedState('sp-filters-ca-union-tab', 'overview');
    const [clubSearch, setClubSearch] = useState('');
    const [agentSearch, setAgentSearch] = useState('');
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
    const [settleStatusData, setSettleStatusData] = useState(null); // result of 'status' action

    // Manage clubs state
    const [addClubId, setAddClubId] = useState('');
    // Admin management state
    const [addAdminId, setAddAdminId] = useState('');
    const [adminSearch, setAdminSearch] = useState('');
    const [adminSearchResults, setAdminSearchResults] = useState([]);
    const [adminSearching, setAdminSearching] = useState(false);
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

    // Auth — use bulletproof getAuthUser() from authUtils (3-level fallback chain)
    useEffect(() => {
        const authUser = getAuthUser();
        if (authUser) {
            setUser(authUser);
        } else {
            router.push('/auth/login');
        }
    }, [router]);

    // Load dashboard data
    const loadDashboard = useCallback(async () => {
        if (!unionIdParam || !user) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const data = await apiGet(`/api/club-arena/union-dashboard?unionId=${unionIdParam}`);
            setDashboard(data);
            if (data.union) {
                // Only pre-fill name/desc on first load — don't overwrite unsaved user edits
            setUnionName(prev => prev || (data.union.name || ''));
            setUnionDesc(prev => prev || (data.union.description || ''));
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
        if (!unionIdParam || !user) return;

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
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'union_clubs',
                filter: `union_id=eq.${unionIdParam}`,
            }, () => { loadDashboard(); })
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'union_admins',
                filter: `union_id=eq.${unionIdParam}`,
            }, () => { loadDashboard(); })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    console.warn(`[UnionDashboard] Realtime channel status: ${status}`);
                }
            });

        // Silent poll every 30s as fallback — Realtime postgres_changes handles live updates
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
    }, [unionIdParam, user?.id]);

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

            // Status action — display results in the panel instead of just toasting
            if (settleAction === 'status') {
                const statusData = await apiCall('/api/club-arena/settle-period', body);
                setSettleStatusData({ ...statusData, clubId: settleClubId });
                showToast('Status loaded');
                return;
            }

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

            const result = await apiCall('/api/club-arena/settle-period', body);
            showToast(result.message || `Settlement: ${settleAction} successful`);
            setSettleStatusData(null); // Clear status cache after any mutating action
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
                <UniversalHeader />
                <div style={{ color: FB.danger, fontSize: 18 }}>Failed to load union dashboard</div>
                <button onClick={() => router.push('/hub/club-arena')}
                    style={{ background: FB.primary, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer' }}>
                    Back to Club Arena
                </button>
            </div>
        );
    }

    const { union, stats, clubs, agents, recentPeriods } = dashboard;
    const isLead = dashboard.adminRole === 'union_lead';
    const TABS = ALL_TABS.filter(t => !t.leadOnly || isLead);

    // Admin user search handler
    const handleAdminSearch = async (q) => {
        setAdminSearch(q);
        if (q.trim().length < 2) { setAdminSearchResults([]); return; }
        setAdminSearching(true);
        try {
            const r = await apiCall('/api/club-arena/manage-union', { action: 'search_user', unionId: unionIdParam, query: q });
            setAdminSearchResults(r.users || []);
        } catch (_) { setAdminSearchResults([]); }
        finally { setAdminSearching(false); }
    };

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
                        Union Code: <span style={{ color: FB.primary, fontWeight: 700 }}>{union?.code || 'N/A'}</span>
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
                            <StatCard label="Active Agents" value={stats?.totalAgents ?? 0} color={FB.orange}
                                sub={stats?.totalSuspendedAgents > 0 ? `${stats.totalSuspendedAgents} suspended` : null} />
                            <StatCard label="Agent Players" value={stats?.totalAgentPlayers ?? 0} color={FB.purple} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                            <StatCard label="Total Treasury" value={(stats?.totalTreasury ?? 0).toLocaleString()} color={FB.gold} />
                            <StatCard label="Total Rake" value={(stats?.totalRake ?? 0).toLocaleString()} color={FB.success} />
                            <StatCard label="Weekly Rake" value={(stats?.totalWeeklyRake ?? 0).toLocaleString()} color={FB.primary} />
                            <StatCard label="Union Hold" value={(stats?.estimatedUnionHold ?? 0).toLocaleString()} color={FB.gold}
                                sub={`${(((stats?.unionHoldRate) || 0) * 100).toFixed(0)}% of period rake`} />
                        </div>
                        {stats?.totalCreditExposure > 0 && (
                            <div style={{ background: 'rgba(250,56,62,0.07)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid rgba(250,56,62,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: FB.textSecondary }}>⚠️ Total Agent Credit In Use</span>
                                <span style={{ fontSize: 16, fontWeight: 800, color: FB.danger }}>{stats.totalCreditExposure.toLocaleString()}</span>
                            </div>
                        )}

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

                        {/* Quick Actions — filter Add Club for non-leads */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {[
                                { label: 'View Games', tab: 'games', color: FB.primary },
                                { label: 'Mint Chips', tab: 'mint', color: FB.gold },
                                { label: 'Settlement', tab: 'settlement', color: FB.purple },
                                ...(isLead ? [{ label: 'Add Club', tab: 'manage_clubs', color: FB.success }] : []),
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
                        {clubs.length > 4 && (
                            <input
                                type="text"
                                value={clubSearch}
                                onChange={e => setClubSearch(e.target.value)}
                                placeholder="Search clubs..."
                                style={{ padding: '8px 14px', background: '#3A3B3C', border: '1px solid #3E4042', borderRadius: 8, color: '#E4E6EB', fontSize: 13, outline: 'none' }}
                            />
                        )}
                        {clubs.filter(cl => !clubSearch || (cl.name || '').toLowerCase().includes(clubSearch.toLowerCase())).length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 40 }}>{clubSearch ? `No clubs match "${clubSearch}"` : 'No clubs in this union yet.'}</div>
                        ) : clubs.filter(cl => !clubSearch || (cl.name || '').toLowerCase().includes(clubSearch.toLowerCase())).map(club => (
                            <div key={club.id} style={{
                                background: FB.cardBg, borderRadius: 12, padding: 16,
                                border: `1px solid ${FB.border}`,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: FB.textPrimary }}>{club.name}</div>
                                        <div style={{ fontSize: 12, color: FB.textSecondary }}>Code: {club.club_id}</div>
                                    </div>
                                    {/* Both action buttons: Admin Panel (management) + Lobby (player view) */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={() => router.push(`/hub/club-arena/admin?club=${club.id}`)}
                                            style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                            Admin Panel
                                        </button>
                                        <button onClick={() => router.push(`/hub/club-arena/lobby?club=${club.id}`)}
                                            style={{ background: 'transparent', color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                            Lobby
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: FB.textSecondary }}>
                                    <span>👥 {club.member_count || 0} members</span>
                                    <span>🏦 {(club.chip_treasury || 0).toLocaleString()} treasury</span>
                                    <span>🎰 {(club.total_rake || 0).toLocaleString()} rake</span>
                                    {club.club_commission_rate != null && (
                                        <span style={{ color: FB.gold, fontWeight: 600 }}>
                                            ✂️ {((club.club_commission_rate || 0) * 100).toFixed(0)}% commission
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ AGENTS TAB ═══ */}
                {activeTab === 'agents' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {stats?.totalSuspendedAgents > 0 && (
                            <div style={{ background: 'rgba(250,56,62,0.08)', borderRadius: 8, padding: '8px 14px', border: '1px solid rgba(250,56,62,0.2)', fontSize: 12, color: FB.danger }}>
                                ⚠️ {stats.totalSuspendedAgents} suspended agent{stats.totalSuspendedAgents !== 1 ? 's' : ''} — outstanding credit may still be owed
                            </div>
                        )}
                        {agents.length > 4 && (
                            <input
                                type="text"
                                value={agentSearch}
                                onChange={e => setAgentSearch(e.target.value)}
                                placeholder="Search agents..."
                                style={{ padding: '8px 14px', background: '#3A3B3C', border: '1px solid #3E4042', borderRadius: 8, color: '#E4E6EB', fontSize: 13, outline: 'none' }}
                            />
                        )}
                        {agents.filter(a => !agentSearch || (a.profile?.display_name || a.profile?.username || '').toLowerCase().includes(agentSearch.toLowerCase())).length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 40 }}>{agentSearch ? `No agents match "${agentSearch}"` : 'No agents across union clubs.'}</div>
                        ) : agents.filter(a => !agentSearch || (a.profile?.display_name || a.profile?.username || '').toLowerCase().includes(agentSearch.toLowerCase())).map(agent => {
                            const clubName = clubs.find(c => c.id === agent.club_id)?.name || 'Unknown Club';
                            const tierLabel = { super_agent: 'Super Agent', agent: 'Agent', sub_agent: 'Sub Agent' }[agent.role] || agent.role || 'Agent';
                            const tierColor = { super_agent: FB.gold, agent: FB.primary, sub_agent: FB.purple }[agent.role] || FB.primary;
                            return (
                                <div key={agent.id} style={{
                                    background: FB.cardBg, borderRadius: 12, padding: 14,
                                    border: `1px solid ${agent.status === 'suspended' ? 'rgba(250,56,62,0.4)' : FB.border}`,
                                    opacity: agent.status === 'suspended' ? 0.85 : 1,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>
                                                {agent.profile?.display_name || agent.profile?.username || agent.user_id.slice(0, 8)}
                                            </span>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: tierColor, background: `${tierColor}22`, padding: '2px 6px', borderRadius: 4 }}>
                                                {tierLabel}
                                            </span>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: agent.is_prepaid ? FB.success : FB.orange, background: agent.is_prepaid ? 'rgba(49,162,76,0.15)' : 'rgba(245,166,35,0.15)', padding: '2px 6px', borderRadius: 4 }}>
                                                {agent.is_prepaid ? 'Prepaid' : 'Credit'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{
                                                fontSize: 11, color: agent.status === 'active' ? FB.success : FB.danger,
                                                fontWeight: 700,
                                            }}>
                                                {agent.status === 'suspended' ? '🚫 SUSPENDED' : '● active'}
                                            </span>
                                            {/* Navigate to club admin panel for this agent's club */}
                                            <button
                                                onClick={() => router.push(`/hub/club-arena/admin?club=${agent.club_id}`)}
                                                style={{ background: 'transparent', color: FB.primary, border: `1px solid ${FB.primary}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                Manage →
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 4 }}>
                                        Club: <span style={{ color: FB.textPrimary }}>{clubName}</span>
                                        {' · '}Commission: <span style={{ color: FB.gold }}>{((agent.commission_rate || 0) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: FB.textSecondary, flexWrap: 'wrap' }}>
                                        <span>👤 {agent.active_player_count || 0} players</span>
                                        <span>📈 {(agent.weekly_rake_generated || 0).toLocaleString()} wk rake</span>
                                        <span>💎 {(agent.lifetime_earnings || 0).toLocaleString()} lifetime</span>
                                        {!agent.is_prepaid && (agent.credit_used || 0) > 0 && (
                                            <span style={{ color: (agent.credit_used || 0) > (agent.credit_limit || 0) * 0.8 ? FB.danger : FB.textSecondary, fontWeight: (agent.credit_used || 0) > (agent.credit_limit || 0) * 0.8 ? 700 : 400 }}>
                                                💳 {(agent.credit_used || 0).toLocaleString()} / {(agent.credit_limit || 0).toLocaleString()} credit
                                                {(agent.credit_used || 0) > (agent.credit_limit || 0) * 0.8 && ' ⚠️'}
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
                                <select value={settleClubId} onChange={e => { setSettleClubId(e.target.value); setSettleStatusData(null); }}
                                    style={{ flex: '1 1 200px', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                                    {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <select value={settleAction} onChange={e => setSettleAction(e.target.value)}
                                    style={{ flex: '0 0 130px', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                                    <option value="status">Check Status</option>
                                    <option value="open">Open Period</option>
                                    <option value="close">Close Period</option>
                                    <option value="pay_all">Pay All Agents</option>
                                </select>
                                <button onClick={handleSettle} disabled={settleProcessing}
                                    style={{
                                        background: settleAction === 'pay_all' ? FB.gold : FB.primary,
                                        color: settleAction === 'pay_all' ? '#000' : '#fff',
                                        border: 'none', borderRadius: 8, padding: '8px 20px',
                                        fontWeight: 700, fontSize: 13,
                                        cursor: settleProcessing ? 'wait' : 'pointer', opacity: settleProcessing ? 0.6 : 1,
                                    }}>
                                    {settleProcessing ? 'Processing...' : 'Execute'}
                                </button>
                            </div>
                            <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                💡 Tip: Run "Check Status" first to see the current period before taking action.
                            </div>
                        </div>

                        {/* Status Panel — shown after running 'status' action */}
                        {settleStatusData && (
                            <div style={{ background: 'rgba(35,116,225,0.08)', borderRadius: 12, padding: 16, border: '1px solid rgba(35,116,225,0.2)', marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <span style={{ fontWeight: 700, color: FB.primary, fontSize: 14 }}>
                                        Period Status — {clubs.find(c => c.id === settleStatusData.clubId)?.name || ''}
                                    </span>
                                    <button onClick={() => setSettleStatusData(null)} style={{ background: 'transparent', border: 'none', color: FB.textSecondary, cursor: 'pointer', fontSize: 16 }}>✕</button>
                                </div>
                                {settleStatusData.currentPeriod ? (
                                    <div>
                                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                                            <span style={{ fontSize: 13 }}>
                                                <span style={{ color: FB.textSecondary }}>Status: </span>
                                                <span style={{ color: settleStatusData.currentPeriod.status === 'open' ? FB.success : FB.orange, fontWeight: 700 }}>
                                                    {settleStatusData.currentPeriod.status?.toUpperCase()}
                                                </span>
                                            </span>
                                            <span style={{ fontSize: 13 }}>
                                                <span style={{ color: FB.textSecondary }}>Period: </span>
                                                <span style={{ color: FB.textPrimary, fontWeight: 600 }}>#{settleStatusData.currentPeriod.period_number}</span>
                                            </span>
                                            <span style={{ fontSize: 13 }}>
                                                <span style={{ color: FB.textSecondary }}>Rake: </span>
                                                <span style={{ color: FB.gold, fontWeight: 600 }}>{(settleStatusData.currentPeriod.total_rake_collected || 0).toLocaleString()}</span>
                                            </span>
                                        </div>
                                        {settleStatusData.pendingCommissions?.length > 0 && (
                                            <div style={{ background: 'rgba(245,166,35,0.1)', borderRadius: 8, padding: 10, border: '1px solid rgba(245,166,35,0.2)' }}>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: FB.orange, marginBottom: 6 }}>
                                                    {settleStatusData.pendingCommissions.length} Pending Commission{settleStatusData.pendingCommissions.length !== 1 ? 's' : ''}
                                                </div>
                                                {settleStatusData.pendingCommissions.map(c => (
                                                    <div key={c.id} style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 2 }}>
                                                        Agent {c.agents?.user_id?.slice(0, 8) || c.agent_id} — {(c.commission_amount || 0).toLocaleString()} chips pending
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {settleStatusData.pendingCommissions?.length === 0 && (
                                            <div style={{ fontSize: 12, color: FB.success }}>✓ No pending commissions — all paid up.</div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 13, color: FB.textSecondary }}>No active settlement period. Use "Open Period" to start one.</div>
                                )}
                            </div>
                        )}

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
                                    border: `1px solid ${period.status === 'open' ? 'rgba(49,162,76,0.4)' : FB.border}`,
                                    marginBottom: 8,
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
                        {/* Current clubs with remove button + commission editor */}
                        <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Current Clubs</h3>
                        {clubs.length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 30 }}>No clubs in this union yet.</div>
                        ) : clubs.map(club => (
                            <div key={club.id} style={{ background: FB.cardBg, borderRadius: 10, padding: 14, border: `1px solid ${FB.border}`, marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>{club.name}</div>
                                        <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 2 }}>
                                            <span>{club.member_count || 0} members</span>
                                            <span style={{ margin: '0 8px', color: FB.border }}>·</span>
                                            <span>{(club.chip_treasury || 0).toLocaleString()} treasury</span>
                                        </div>
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
                                {/* Commission rate editor */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <span style={{ fontSize: 12, color: FB.textSecondary }}>Club Commission:</span>
                                    <input
                                        type="number" min="1" max="100" step="1"
                                        defaultValue={((club.club_commission_rate || 0.9) * 100).toFixed(0)}
                                        id={`comm-rate-${club.id}`}
                                        style={{ width: 64, background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                                    />
                                    <span style={{ fontSize: 12, color: FB.textSecondary }}>%</span>
                                    <button onClick={async () => {
                                        const input = document.getElementById(`comm-rate-${club.id}`);
                                        const val = parseFloat(input?.value || '90');
                                        if (isNaN(val) || val < 1 || val > 100) { showToast('Rate must be 1–100%', 'error'); return; }
                                        try {
                                            await apiCall('/api/club-arena/manage-union', { action: 'update_club_commission', unionId: unionIdParam, clubId: club.id, commissionRate: val / 100 });
                                            showToast(`${club.name} commission set to ${val}%`);
                                            loadDashboard();
                                        } catch (e) { showToast(e.message, 'error'); }
                                    }} style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                        Save
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ ADMINS TAB ═══ */}
                {activeTab === 'admins' && (
                    <div>
                        {isLead && (
                            <div style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}`, marginBottom: 16 }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Add Union Admin</h3>
                                <p style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 12 }}>Search by username to grant union admin access.</p>

                                {/* Username search input */}
                                <div style={{ position: 'relative', marginBottom: 8 }}>
                                    <input
                                        value={adminSearch}
                                        onChange={e => handleAdminSearch(e.target.value)}
                                        placeholder="Search by username..."
                                        style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box' }}
                                    />
                                    {adminSearching && (
                                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: FB.textSecondary }}>searching...</div>
                                    )}
                                </div>

                                {/* Search results */}
                                {adminSearchResults.length > 0 && (
                                    <div style={{ background: FB.background, border: `1px solid ${FB.border}`, borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                                        {adminSearchResults.map(u => (
                                            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${FB.border}` }}>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary }}>{u.display_name || u.username}</div>
                                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>@{u.username}</div>
                                                </div>
                                                <button onClick={async () => {
                                                    try {
                                                        const r = await apiCall('/api/club-arena/manage-union', { action: 'add_admin', unionId: unionIdParam, adminUserId: u.id });
                                                        showToast(`Added admin: ${r.admin?.display_name || r.admin?.username || u.username}`);
                                                        setAdminSearch('');
                                                        setAdminSearchResults([]);
                                                        loadDashboard();
                                                    } catch (e) { showToast(e.message, 'error'); }
                                                }} style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                                    Add
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {adminSearch.length >= 2 && !adminSearching && adminSearchResults.length === 0 && (
                                    <div style={{ fontSize: 12, color: FB.textSecondary, padding: '8px 0' }}>No users found matching "{adminSearch}"</div>
                                )}

                                {/* Fallback: manual UUID entry */}
                                <details style={{ marginTop: 8 }}>
                                    <summary style={{ fontSize: 11, color: FB.textSecondary, cursor: 'pointer' }}>Add by UUID (advanced)</summary>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
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
                                        }} style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add</button>
                                    </div>
                                </details>
                            </div>
                        )}
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
                                        Role: <span style={{ color: admin.role === 'union_lead' ? FB.gold : FB.primary }}>{admin.role === 'union_lead' ? '👑 Union Lead' : '🛡 Union Admin'}</span>
                                    </div>
                                </div>
                                {isLead && admin.role !== 'union_lead' && (
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
                        {!isLead && (
                            <div style={{ background: 'rgba(245,166,35,0.1)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, border: '1px solid rgba(245,166,35,0.2)', fontSize: 13, color: FB.orange }}>
                                🔒 Settings changes require Union Lead access. You can view but not edit.
                            </div>
                        )}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Union Name</label>
                            <input value={unionName} onChange={e => setUnionName(e.target.value)}
                                disabled={!isLead}
                                style={{ width: '100%', background: isLead ? FB.background : '#2a2b2c', color: isLead ? FB.textPrimary : FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', cursor: isLead ? 'text' : 'not-allowed' }} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, color: FB.textSecondary, display: 'block', marginBottom: 4 }}>Description</label>
                            <textarea value={unionDesc} onChange={e => setUnionDesc(e.target.value)} rows={3}
                                disabled={!isLead}
                                style={{ width: '100%', background: isLead ? FB.background : '#2a2b2c', color: isLead ? FB.textPrimary : FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', cursor: isLead ? 'text' : 'not-allowed' }} />
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
                            <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 6 }}>Percentage of total rake retained by the union before distributing to clubs/agents. Max 50%.</div>
                            <input type="number" value={unionHoldRate} onChange={e => setUnionHoldRate(e.target.value)}
                                disabled={!isLead}
                                min="0" max="50" step="1" placeholder="10"
                                style={{ width: 120, background: isLead ? FB.background : '#2a2b2c', color: isLead ? FB.textPrimary : FB.textSecondary, border: `1px solid ${parseFloat(unionHoldRate) > 50 ? FB.danger : FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', cursor: isLead ? 'text' : 'not-allowed' }} />
                            {parseFloat(unionHoldRate) > 50 && (
                                <div style={{ fontSize: 11, color: FB.danger, marginTop: 4 }}>⚠️ Cannot exceed 50%</div>
                            )}
                        </div>

                        {/* BBJ Split Config */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary, display: 'block', marginBottom: 8 }}>BBJ Split Percentages</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                <div>
                                    <label style={{ fontSize: 11, color: '#FFD700', display: 'block', marginBottom: 2 }}>Main BBJ %</label>
                                    <input type="number" value={bbjMainPct} onChange={e => setBbjMainPct(e.target.value)}
                                        disabled={!isLead}
                                        min="0" max="100" style={{ width: '100%', background: isLead ? FB.background : '#2a2b2c', color: isLead ? FB.textPrimary : FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', cursor: isLead ? 'text' : 'not-allowed' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#C0C0C0', display: 'block', marginBottom: 2 }}>Backup BBJ %</label>
                                    <input type="number" value={bbjBackupPct} onChange={e => setBbjBackupPct(e.target.value)}
                                        disabled={!isLead}
                                        min="0" max="100" style={{ width: '100%', background: isLead ? FB.background : '#2a2b2c', color: isLead ? FB.textPrimary : FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', cursor: isLead ? 'text' : 'not-allowed' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, color: '#4BB543', display: 'block', marginBottom: 2 }}>Promo Fund %</label>
                                    <input type="number" value={bbjPromoPct} onChange={e => setBbjPromoPct(e.target.value)}
                                        disabled={!isLead}
                                        min="0" max="100" style={{ width: '100%', background: isLead ? FB.background : '#2a2b2c', color: isLead ? FB.textPrimary : FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxSizing: 'border-box', cursor: isLead ? 'text' : 'not-allowed' }} />
                                </div>
                            </div>
                            {(parseInt(bbjMainPct || 0) + parseInt(bbjBackupPct || 0) + parseInt(bbjPromoPct || 0)) !== 100 && (
                                <div style={{ fontSize: 11, color: FB.danger, marginTop: 4 }}>
                                    Must total 100% (currently {parseInt(bbjMainPct || 0) + parseInt(bbjBackupPct || 0) + parseInt(bbjPromoPct || 0)}%)
                                </div>
                            )}
                        </div>

                        {isLead && (
                            <button onClick={async () => {
                                const holdVal = parseFloat(unionHoldRate || '10');
                                if (holdVal > 50) { showToast('Union rake hold cannot exceed 50%', 'error'); return; }
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
                                            union_rake_hold: holdVal / 100,
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
                        )}
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

            {/* Union Bottom Navigation */}
            <nav style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
                background: '#242526', borderTop: '1px solid #3E4042',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-around', padding: '6px 0' }}>
                    {[
                        { label: 'Club Arena', emoji: '🏠', href: '/hub/club-arena' },
                        { label: 'Dashboard', emoji: '🏛', href: null, active: true },
                        { label: 'Games', emoji: '🎮', href: unionIdParam ? `/hub/club-arena/union-games?union=${unionIdParam}` : null },
                    ].map(item => (
                        item.href ? (
                            <a key={item.label} href={item.href} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                flex: 1, padding: '8px 4px', textDecoration: 'none',
                                color: item.active ? '#2374E1' : '#B0B3B8',
                            }}>
                                <span style={{ fontSize: 20 }}>{item.emoji}</span>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
                            </a>
                        ) : (
                            <div key={item.label} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                flex: 1, padding: '8px 4px',
                                color: item.active ? '#2374E1' : '#B0B3B8',
                                cursor: 'default',
                            }}>
                                <span style={{ fontSize: 20 }}>{item.emoji}</span>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
                            </div>
                        )
                    ))}
                </div>
            </nav>
        </div>
    );
}
