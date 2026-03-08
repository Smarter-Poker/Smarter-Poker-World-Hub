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
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../src/engine/EventBus';
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
    { id: 'wallets', label: 'Wallets', leadOnly: false },
    { id: 'commissions', label: 'Commissions', leadOnly: false },
    { id: 'mint', label: 'Mint Chips', leadOnly: false },
    { id: 'bbj', label: 'BBJ', leadOnly: false },
    { id: 'admins', label: 'Admins', leadOnly: false },
    { id: 'manage_clubs', label: 'Manage Clubs', leadOnly: true },
    { id: 'settings', label: 'Settings', leadOnly: true },
];

export default function UnionDashboard() {
        useTrainingBus('club-arena-union-dashboard');

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
    const [bulkStatusData, setBulkStatusData] = useState(null);    // result of bulk check all
    const [bulkStatusLoading, setBulkStatusLoading] = useState(false);

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
    // Commission rates controlled state — keyed by club.id
    const [commissionRates, setCommissionRates] = useState({});
    // Agent commission rate editing state — keyed by agent.id
    const [agentCommRates, setAgentCommRates] = useState({});
    const [agentCommEditing, setAgentCommEditing] = useState({}); // which agents are in edit mode

    // Wallet tab state
    const [walletData, setWalletData] = useState(null);
    const [walletLoading, setWalletLoading] = useState(false);
    const [walletSendClub, setWalletSendClub] = useState('');
    const [walletSendAmount, setWalletSendAmount] = useState('');
    const [walletSendNotes, setWalletSendNotes] = useState('');
    const [walletProcessing, setWalletProcessing] = useState(false);
    const [walletTxFilter, setWalletTxFilter] = useState('all');
    const [walletMoveAmount, setWalletMoveAmount] = useState('');

    // Commission history state
    const [commHistory, setCommHistory] = useState(null);
    const [commHistoryLoading, setCommHistoryLoading] = useState(false);

    // Add-club commission rate (required before adding)
    const [addClubCommission, setAddClubCommission] = useState('90');

    // Union applications review state
    const [pendingApps, setPendingApps] = useState(null);
    const [appsLoading, setAppsLoading] = useState(false);
    const [appCommRate, setAppCommRate] = useState({}); // keyed by app.id
    const [appProcessing, setAppProcessing] = useState({});

    // Leave requests review state  
    const [leaveRequests, setLeaveRequests] = useState(null);
    const [leaveLoading, setLeaveLoading] = useState(false);
    const [leaveProcessing, setLeaveProcessing] = useState({});

    // Announcement broadcast state
    const [announceText, setAnnounceText] = useState('');
    const [announceClub, setAnnounceClub] = useState('all');
    const [announceProcessing, setAnnounceProcessing] = useState(false);

    const showToast = (msg, type = 'info') => {
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
    const loadDashboard = useCallback(async ({ signal } = {}) => {
        if (!unionIdParam || !user) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            const token = await getAuthToken();
            if (!token) { router.push('/auth/login'); return; }
            const res = await fetch(`/api/club-arena/union-dashboard?unionId=${unionIdParam}`, {
                headers: { Authorization: `Bearer ${token}` },
                ...(signal ? { signal } : {}),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Dashboard load failed (${res.status})`);
            }
            const data = await res.json();
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
                // Seed commission rates from live data (only for clubs not yet edited)
                setCommissionRates(prev => {
                    const updated = { ...prev };
                    for (const club of data.clubs) {
                        if (!(club.id in updated)) {
                            updated[club.id] = String(((club.club_commission_rate || 0.9) * 100).toFixed(0));
                        }
                    }
                    return updated;
                });
            }
        } catch (err) {
            if (err.name === 'AbortError') return; // component unmounted — ignore
            console.error('Union dashboard load failed:', err);
            showToast(err.message || 'Failed to load union dashboard', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [unionIdParam, user, router]);

    useEffect(() => {
        const _c = new AbortController();
        loadDashboard({ signal: _c.signal });
        return () => _c.abort();
    }, [loadDashboard]);

    // ── Realtime subscriptions for live data ──
    useEffect(() => {
        if (!unionIdParam || !user) return;

        // Channel 1: union-level changes (settings, BBJ balances)
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
                }
            });

        // Channel 2: club treasury/rake changes (mint, settlements)
        // Supabase Realtime .in() filter not supported — filter in callback
        const clubsChannel = supabase
            .channel(`union-clubs-data:${unionIdParam}`)
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'clubs',
            }, (payload) => {
                // Update matching club in place — avoids full reload for treasury ticks
                setDashboard(prev => {
                    if (!prev?.clubs) return prev;
                    const clubIds = prev.clubs.map(c => c.id);
                    if (!clubIds.includes(payload.new?.id)) return prev;
                    return {
                        ...prev,
                        clubs: prev.clubs.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c),
                    };
                });
            })
            .subscribe();

        // Channel 3: agent status/credit changes (suspensions, credit_used updates)
        const agentsChannel = supabase
            .channel(`union-agents:${unionIdParam}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'agents',
            }, (payload) => {
                const row = payload.new || payload.old;
                // Only reload if this agent belongs to a club in this union
                setDashboard(prev => {
                    if (!prev?.clubs) return prev;
                    const clubIds = prev.clubs.map(c => c.id);
                    if (!row?.club_id || !clubIds.includes(row.club_id)) return prev;
                    // Patch agent in-place for UPDATE; reload for INSERT/DELETE
                    if (payload.eventType === 'UPDATE') {
                        return {
                            ...prev,
                            agents: (prev.agents || []).map(a =>
                                a.id === payload.new.id ? { ...a, ...payload.new } : a
                            ),
                        };
                    }
                    // INSERT or DELETE → full reload
                    loadDashboard();
                    return prev;
                });
            })
            .subscribe();

        // Channel 4: settlement period changes
        const periodsChannel = supabase
            .channel(`union-periods:${unionIdParam}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'settlement_periods',
            }, (payload) => {
                const row = payload.new || payload.old;
                setDashboard(prev => {
                    if (!prev?.clubs) return prev;
                    const clubIds = prev.clubs.map(c => c.id);
                    if (!row?.club_id || !clubIds.includes(row.club_id)) return prev;
                    loadDashboard();
                    return prev;
                });
            })
            .subscribe();

        // Channel 5: union wallet transactions — refresh wallet balances live
        const walletsChannel = supabase
            .channel(`union-wallets:${unionIdParam}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'union_wallet_transactions',
                filter: `union_id=eq.${unionIdParam}`,
            }, () => {
                // Reload wallet balances silently when a new transaction lands
                loadWallets();
            })
            .subscribe();

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
            supabase.removeChannel(clubsChannel);
            supabase.removeChannel(agentsChannel);
            supabase.removeChannel(periodsChannel);
            supabase.removeChannel(walletsChannel);
            clearInterval(poll);
        };
    }, [unionIdParam, user?.id, loadDashboard]);

    // Wallet loading
    const loadWallets = async (txFilter = 'all') => {
        if (!unionIdParam) return;
        setWalletLoading(true);
        try {
            const token = await getAuthToken();
            const r = await fetch('/api/club-arena/union-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'get_balances', unionId: unionIdParam }),
            });
            const d = await r.json();
            if (d.success) setWalletData(d);
            else showToast(d.error || 'Failed to load wallets', 'error');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setWalletLoading(false); }
    };

    // Commission history loading
    const loadCommHistory = async () => {
        if (!unionIdParam || commHistoryLoading) return;
        setCommHistoryLoading(true);
        try {
            const token = await getAuthToken();
            const r = await fetch(`/api/club-arena/union-dashboard?unionId=${unionIdParam}&include=commissions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            if (d.success) setCommHistory(d.commissionHistory || []);
            else showToast(d.error || 'Failed to load commission history', 'error');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setCommHistoryLoading(false); }
    };

    // Load pending union applications (lazy — only when manage_clubs tab opened)
    const loadPendingApps = async () => {
        if (!unionIdParam || appsLoading) return;
        setAppsLoading(true);
        try {
            const d = await apiCall('/api/club-arena/union-application', { action: 'list', unionId: unionIdParam, statusFilter: 'pending' });
            setPendingApps(d.applications || []);
        } catch (e) { showToast(e.message || 'Failed to load applications', 'error'); }
        finally { setAppsLoading(false); }
    };

    // Load pending leave requests (lazy)
    const loadLeaveRequests = async () => {
        if (!unionIdParam || leaveLoading) return;
        setLeaveLoading(true);
        try {
            const d = await apiCall('/api/club-arena/manage-union', { action: 'list_leave', unionId: unionIdParam });
            setLeaveRequests(d.leaveRequests || []);
        } catch (e) { showToast(e.message || 'Failed to load leave requests', 'error'); }
        finally { setLeaveLoading(false); }
    };

    // Send union-wide announcement to all clubs or a specific club
    const sendAnnouncement = async () => {
        if (!announceText.trim()) { showToast('Enter announcement text', 'error'); return; }
        setAnnounceProcessing(true);
        try {
            const payload = {
                action: 'union_announcement',
                unionId: unionIdParam,
                message: announceText.trim(),
            };
            if (announceClub !== 'all') payload.clubId = announceClub;
            await apiCall('/api/club-arena/manage-union', payload);
            showToast('Announcement sent to ' + (announceClub === 'all' ? 'all clubs' : clubs.find(c => c.id === announceClub)?.name || announceClub)); busEmit.dataMutated('union_announcement');
            setAnnounceText('');
        } catch (e) { showToast(e.message || 'Announcement failed', 'error'); }
        finally { setAnnounceProcessing(false); }
    };

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
                // Sort by created_at/start_at descending to get the most recent closed period
                const closedPeriods = (statusData.recentPeriods || [])
                    .filter(p => p.status === 'closed')
                    .sort((a, b) => new Date(b.start_at || b.created_at) - new Date(a.start_at || a.created_at));
                const closedPeriod = closedPeriods[0];
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

    // Bulk settlement status — check all clubs at once
    const handleBulkStatus = async () => {
        if (!clubs.length) { showToast('No clubs in union', 'error'); return; }
        setBulkStatusLoading(true);
        setBulkStatusData(null);
        try {
            const results = await Promise.allSettled(
                clubs.map(club =>
                    apiCall('/api/club-arena/settle-period', { clubId: club.id, action: 'status' })
                        .then(d => ({ clubId: club.id, clubName: club.name, ...d }))
                        .catch(e => ({ clubId: club.id, clubName: club.name, error: e.message }))
                )
            );
            setBulkStatusData(results.map(r => r.status === 'fulfilled' ? r.value : r.reason));
        } catch (e) {
            showToast(e.message || 'Bulk status check failed', 'error');
        } finally {
            setBulkStatusLoading(false);
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
                        <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id === 'wallets') loadWallets(); if (tab.id === 'commissions') loadCommHistory(); if (tab.id === 'manage_clubs') { loadPendingApps(); loadLeaveRequests(); } }}
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
                        {/* Pending applications / leave alerts */}
                        {(dashboard.pendingApplications > 0 || dashboard.pendingLeaveRequests > 0) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                {dashboard.pendingApplications > 0 && (
                                    <div style={{ background: 'rgba(35,116,225,0.1)', borderRadius: 8, padding: '10px 16px', border: '1px solid rgba(35,116,225,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 13, color: FB.primary, fontWeight: 600 }}>
                                            {dashboard.pendingApplications} pending club application{dashboard.pendingApplications !== 1 ? 's' : ''} to join this union
                                        </span>
                                        <button onClick={() => setActiveTab('manage_clubs')} style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Review</button>
                                    </div>
                                )}
                                {dashboard.pendingLeaveRequests > 0 && (
                                    <div style={{ background: 'rgba(250,56,62,0.08)', borderRadius: 8, padding: '10px 16px', border: '1px solid rgba(250,56,62,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 13, color: FB.danger, fontWeight: 600 }}>
                                            {dashboard.pendingLeaveRequests} club{dashboard.pendingLeaveRequests !== 1 ? 's' : ''} requesting to leave this union
                                        </span>
                                        <button onClick={() => setActiveTab('manage_clubs')} style={{ background: FB.danger, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Review</button>
                                    </div>
                                )}
                            </div>
                        )}
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
                            {stats?.totalSeatedPlayers > 0 && (
                                <StatCard label="Playing Now" value={stats.totalSeatedPlayers} color={FB.success}
                                    sub={`across ${stats.totalActiveTables} table${stats.totalActiveTables !== 1 ? 's' : ''}`} />
                            )}
                        </div>
                        {(stats?.runningTournaments > 0 || stats?.scheduledTournaments > 0) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                                {stats.runningTournaments > 0 && (
                                    <div style={{ background: 'rgba(234,88,12,0.1)', border: '1px solid rgba(234,88,12,0.3)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                                        onClick={() => router.push(`/hub/club-arena/union-games?union=${unionIdParam}`)}>
                                        <span style={{ fontSize: 18 }}></span>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: FB.orange }}>{stats.runningTournaments} Running</div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary }}>tournament{stats.runningTournaments !== 1 ? 's' : ''} live</div>
                                        </div>
                                    </div>
                                )}
                                {stats.scheduledTournaments > 0 && (
                                    <div style={{ background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.2)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                                        onClick={() => router.push(`/hub/club-arena/union-games?union=${unionIdParam}`)}>
                                        <span style={{ fontSize: 18 }}></span>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: FB.primary }}>{stats.scheduledTournaments} Scheduled</div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary }}>upcoming tournament{stats.scheduledTournaments !== 1 ? 's' : ''}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {stats?.totalCreditExposure > 0 && (
                            <div style={{ background: 'rgba(250,56,62,0.07)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: '1px solid rgba(250,56,62,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: FB.textSecondary }}>Total Agent Credit In Use</span>
                                <span style={{ fontSize: 16, fontWeight: 800, color: FB.danger }}>{stats.totalCreditExposure.toLocaleString()}</span>
                            </div>
                        )}

                        {/* BBJ Summary — shown if BBJ wallet has balance */}
                        {(dashboard?.wallets?.bbj_wallet > 0) && (
                            <div style={{ background: 'rgba(255,215,0,0.06)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid rgba(255,215,0,0.15)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#FFD700' }}>Bad Beat Jackpot Pool</span>
                                    <span style={{ fontSize: 18, fontWeight: 900, color: '#FFD700' }}>
                                        {(dashboard.wallets.bbj_wallet || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Quick Actions — filter Add Club for non-leads */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {[
                                { label: 'View Games', tab: 'games', color: FB.primary },
                                { label: 'Wallets', tab: 'wallets', color: '#059669' },
                                { label: 'Commissions', tab: 'commissions', color: FB.orange },
                                { label: 'Mint Chips', tab: 'mint', color: FB.gold },
                                { label: 'Settlement', tab: 'settlement', color: FB.purple },
                                ...(isLead ? [{ label: 'Add Club', tab: 'manage_clubs', color: FB.success }] : []),
                            ].map(q => (
                                <button key={q.tab} onClick={() => { setActiveTab(q.tab); if (q.tab === 'wallets') loadWallets(); if (q.tab === 'commissions') loadCommHistory(); if (q.tab === 'manage_clubs') { loadPendingApps(); loadLeaveRequests(); } }} style={{
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
                                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: FB.textSecondary, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span>{club.member_count || 0} members</span>
                                    <span>{(club.chip_treasury || 0).toLocaleString()} treasury</span>
                                    <span>{(club.total_rake || 0).toLocaleString()} rake</span>
                                    {isLead ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: FB.textSecondary }}>Commission:</span>
                                            <input
                                                type="number" min="1" max="99" step="1"
                                                value={commissionRates[club.id] ?? String(((club.club_commission_rate || 0.9) * 100).toFixed(0))}
                                                onChange={e => setCommissionRates(prev => ({ ...prev, [club.id]: e.target.value }))}
                                                style={{ width: 48, background: FB.hover, color: FB.gold, border: `1px solid ${FB.gold}`, borderRadius: 4, padding: '2px 5px', fontSize: 12, textAlign: 'center' }}
                                            />
                                            <span style={{ fontSize: 12, color: FB.gold }}>%</span>
                                            <button onClick={async () => {
                                                const val = parseFloat(commissionRates[club.id] || '90');
                                                if (isNaN(val) || val < 1 || val > 99) { showToast('Rate must be 1–99%', 'error'); return; }
                                                try {
                                                    await apiCall('/api/club-arena/manage-union', { action: 'update_club_commission', unionId: unionIdParam, clubId: club.id, commissionRate: val / 100 });
                                                    showToast(`${club.name} commission set to ${val}%`);
                                                    loadDashboard();
                                                } catch (e) { showToast(e.message, 'error'); }
                                            }} style={{ background: FB.gold, color: '#000', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                                Save
                                            </button>
                                        </span>
                                    ) : (club.club_commission_rate != null && (
                                        <span style={{ color: FB.gold, fontWeight: 600 }}>
                                            {((club.club_commission_rate || 0) * 100).toFixed(0)}% commission
                                        </span>
                                    ))}
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
                                {stats.totalSuspendedAgents} suspended agent{stats.totalSuspendedAgents !== 1 ? 's' : ''} — outstanding credit may still be owed
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
                                                {agent.status === 'suspended' ? 'SUSPENDED' : '● active'}
                                            </span>
                                            {isLead && (
                                                <button
                                                    onClick={async () => {
                                                        const action = agent.status === 'suspended' ? 'reactivate' : 'suspend';
                                                        try {
                                                            await apiCall('/api/club-arena/manage-agent', {
                                                                clubId: agent.club_id,
                                                                action,
                                                                targetUserId: agent.user_id,
                                                            });
                                                            showToast(`Agent ${action === 'suspend' ? 'suspended' : 'reactivated'}`);
                                                            loadDashboard();
                                                        } catch (e) { showToast(e.message, 'error'); }
                                                    }}
                                                    style={{
                                                        background: agent.status === 'suspended' ? FB.success : FB.danger,
                                                        color: '#fff', border: 'none', borderRadius: 6,
                                                        padding: '4px 10px', fontSize: 11, fontWeight: 700,
                                                        cursor: 'pointer', whiteSpace: 'nowrap',
                                                    }}>
                                                    {agent.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                                                </button>
                                            )}
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
                                        {' · '}Commission:{' '}
                                        {agentCommEditing[agent.id] ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                <input
                                                    type="number"
                                                    value={agentCommRates[agent.id] ?? String(((agent.commission_rate || 0) * 100).toFixed(0))}
                                                    onChange={e => setAgentCommRates(prev => ({ ...prev, [agent.id]: e.target.value }))}
                                                    min="1" max="90" style={{ width: 52, background: '#2C2D2E', color: FB.gold, border: `1px solid ${FB.gold}`, borderRadius: 4, padding: '2px 5px', fontSize: 12, textAlign: 'center' }}
                                                />
                                                <span style={{ color: FB.gold, fontSize: 12 }}>%</span>
                                                <button onClick={async () => {
                                                    const val = parseFloat(agentCommRates[agent.id] || String(((agent.commission_rate || 0) * 100).toFixed(0)));
                                                    if (isNaN(val) || val < 1 || val > 90) { showToast('Rate must be 1–90%', 'error'); return; }
                                                    try {
                                                        await apiCall('/api/club-arena/manage-agent', {
                                                            clubId: agent.club_id,
                                                            action: 'update_commission',
                                                            targetUserId: agent.user_id,
                                                            commissionRate: val / 100,
                                                        });
                                                        showToast(`${agent.profile?.display_name || 'Agent'} commission → ${val}%`);
                                                        setAgentCommEditing(prev => ({ ...prev, [agent.id]: false }));
                                                        loadDashboard();
                                                    } catch (e) { showToast(e.message, 'error'); }
                                                }} style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                                    Save
                                                </button>
                                                <button onClick={() => setAgentCommEditing(prev => ({ ...prev, [agent.id]: false }))}
                                                    style={{ background: 'transparent', color: FB.textSecondary, border: 'none', fontSize: 11, cursor: 'pointer' }}>x</button>
                                            </span>
                                        ) : (
                                            <span
                                                onClick={() => { setAgentCommEditing(prev => ({ ...prev, [agent.id]: true })); setAgentCommRates(prev => ({ ...prev, [agent.id]: String(((agent.commission_rate || 0) * 100).toFixed(0)) })); }}
                                                style={{ color: FB.gold, cursor: isLead ? 'pointer' : 'default', textDecoration: isLead ? 'underline dotted' : 'none' }}
                                                title={isLead ? 'Click to edit commission rate' : undefined}>
                                                {((agent.commission_rate || 0) * 100).toFixed(0)}%{isLead ? ' [edit]' : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: FB.textSecondary, flexWrap: 'wrap' }}>
                                        <span>{agent.active_player_count || 0} players</span>
                                        <span>{(agent.weekly_rake_generated || 0).toLocaleString()} wk rake</span>
                                        <span>{(agent.lifetime_earnings || 0).toLocaleString()} lifetime</span>
                                        {!agent.is_prepaid && (agent.credit_used || 0) > 0 && (
                                            <span style={{ color: (agent.credit_used || 0) > (agent.credit_limit || 0) * 0.8 ? FB.danger : FB.textSecondary, fontWeight: (agent.credit_used || 0) > (agent.credit_limit || 0) * 0.8 ? 700 : 400 }}>
                                                {(agent.credit_used || 0).toLocaleString()} / {(agent.credit_limit || 0).toLocaleString()} credit
                                                {(agent.credit_used || 0) > (agent.credit_limit || 0) * 0.8 && ' (!!)'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* GAMES TAB */}
                {activeTab === 'games' && (
                    <div>
                        {/* Live activity summary */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                            <div style={{ background: stats?.runningTournaments > 0 ? 'rgba(234,88,12,0.1)' : FB.cardBg, border: `1px solid ${stats?.runningTournaments > 0 ? 'rgba(234,88,12,0.4)' : FB.border}`, borderRadius: 10, padding: '14px 18px', flex: '1 1 160px' }}>
                                <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Running Tournaments</div>
                                <div style={{ fontSize: 28, fontWeight: 900, color: stats?.runningTournaments > 0 ? FB.orange : FB.textSecondary }}>{stats?.runningTournaments ?? 0}</div>
                            </div>
                            <div style={{ background: stats?.scheduledTournaments > 0 ? 'rgba(35,116,225,0.08)' : FB.cardBg, border: `1px solid ${stats?.scheduledTournaments > 0 ? 'rgba(35,116,225,0.3)' : FB.border}`, borderRadius: 10, padding: '14px 18px', flex: '1 1 160px' }}>
                                <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Scheduled</div>
                                <div style={{ fontSize: 28, fontWeight: 900, color: stats?.scheduledTournaments > 0 ? FB.primary : FB.textSecondary }}>{stats?.scheduledTournaments ?? 0}</div>
                            </div>
                            <div style={{ background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: 10, padding: '14px 18px', flex: '1 1 160px' }}>
                                <div style={{ fontSize: 11, color: FB.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Clubs in Union</div>
                                <div style={{ fontSize: 28, fontWeight: 900, color: FB.primary }}>{clubs.length}</div>
                                <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>{(stats?.totalMembers ?? 0).toLocaleString()} total members</div>
                            </div>
                        </div>

                        {/* Per-club active tables quick view */}
                        {clubs.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Club Activity</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                                    {clubs.map(club => (
                                        <div key={club.id} style={{ background: FB.cardBg, borderRadius: 10, padding: 14, border: `1px solid ${club.active_tables > 0 ? 'rgba(49,162,76,0.4)' : FB.border}` }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                                <div style={{ fontWeight: 700, fontSize: 13, color: FB.textPrimary }}>{club.name}</div>
                                                {club.active_tables > 0 && (
                                                    <span style={{ fontSize: 10, background: 'rgba(49,162,76,0.15)', color: FB.success, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                                                        LIVE
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 6, display: 'flex', gap: 10 }}>
                                                <span>{club.member_count || 0} members</span>
                                                {club.active_tables > 0 && (
                                                    <>
                                                        <span style={{ color: FB.success }}>🎮 {club.active_tables} table{club.active_tables !== 1 ? 's' : ''}</span>
                                                        {club.seated_players > 0 && <span style={{ color: FB.primary }}>👥 {club.seated_players} seated</span>}
                                                    </>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button onClick={() => router.push(`/hub/club-arena/lobby?club=${club.id}`)}
                                                    style={{ flex: 1, background: FB.primary, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Lobby</button>
                                                <button onClick={() => router.push(`/hub/club-arena/admin?club=${club.id}`)}
                                                    style={{ flex: 1, background: 'transparent', color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Admin</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Full games dashboard link */}
                        <button onClick={() => router.push(`/hub/club-arena/union-games?union=${unionIdParam}`)}
                            style={{ width: '100%', background: FB.primary, color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                            Open Full Games Dashboard
                        </button>
                    </div>
                )}

                {/* WALLETS TAB */}
                {activeTab === 'wallets' && (
                    <div>
                        {/* Wallet balance cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                            {[
                                { key: 'chip_balance', label: 'Chip Balance', desc: 'Send to clubs', color: FB.primary },
                                { key: 'rake_wallet', label: 'Rake Wallet', desc: 'Settlement holds', color: FB.gold },
                                { key: 'bbj_wallet', label: 'BBJ Wallet', desc: 'BBJ contributions', color: '#FFD700' },
                                { key: 'promo_wallet', label: 'Promo Wallet', desc: 'Promotional funds', color: FB.purple },
                            ].map(w => (
                                <div key={w.key} style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}` }}>
                                    <div style={{ fontSize: 11, color: w.color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{w.label}</div>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: w.color, marginBottom: 2 }}>
                                        {walletData
                                            ? (walletData.wallets[w.key] || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
                                            : (dashboard?.wallets?.[w.key] || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <div style={{ fontSize: 11, color: FB.textSecondary }}>{w.desc}</div>
                                </div>
                            ))}
                        </div>

                        {/* Load / refresh */}
                        <button onClick={() => loadWallets()} disabled={walletLoading}
                            style={{ background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '7px 18px', fontSize: 13, cursor: 'pointer', marginBottom: 20, opacity: walletLoading ? 0.5 : 1 }}>
                            {walletLoading ? 'Loading...' : 'Refresh Balances'}
                        </button>

                        {isLead && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                                {/* Send chips to club */}
                                <div style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}` }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary, marginBottom: 12 }}>Send Chips to Club</div>
                                    <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 10 }}>Deducts from Chip Balance wallet.</div>
                                    <select value={walletSendClub} onChange={e => setWalletSendClub(e.target.value)}
                                        style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8 }}>
                                        <option value="">Select club...</option>
                                        {clubs.map(c => <option key={c.id} value={c.id}>{c.name} — {(c.chip_treasury || 0).toLocaleString()} treasury</option>)}
                                    </select>
                                    <input type="number" placeholder="Amount" value={walletSendAmount} onChange={e => setWalletSendAmount(e.target.value)}
                                        style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
                                    <input placeholder="Notes (optional)" value={walletSendNotes} onChange={e => setWalletSendNotes(e.target.value)}
                                        style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
                                    <button disabled={walletProcessing || !walletSendClub || !walletSendAmount} onClick={async () => {
                                        const amt = parseFloat(walletSendAmount);
                                        if (!walletSendClub || !amt || amt <= 0) { showToast('Select a club and enter a valid amount', 'error'); return; }
                                        setWalletProcessing(true);
                                        try {
                                            const token = await getAuthToken();
                                            const r = await fetch('/api/club-arena/union-wallet', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                body: JSON.stringify({ action: 'send_to_club', unionId: unionIdParam, clubId: walletSendClub, amount: amt, notes: walletSendNotes }),
                                            });
                                            const d = await r.json();
                                            if (d.success) { showToast(d.message); setWalletSendAmount(''); setWalletSendNotes(''); loadWallets(); loadDashboard(); }
                                            else showToast(d.error || 'Transfer failed', 'error');
                                        } catch (e) { showToast(e.message, 'error'); }
                                        finally { setWalletProcessing(false); }
                                    }} style={{ width: '100%', background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '9px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: walletProcessing ? 0.6 : 1 }}>
                                        {walletProcessing ? 'Sending...' : 'Send Chips'}
                                    </button>
                                </div>

                                {/* Move rake to chip balance */}
                                <div style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}` }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary, marginBottom: 12 }}>Move Rake to Chip Balance</div>
                                    <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 10 }}>Transfer from Rake Wallet into your Chip Balance for distribution.</div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: FB.gold, marginBottom: 10 }}>
                                        Available: {(walletData?.wallets?.rake_wallet || dashboard?.wallets?.rake_wallet || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <input type="number" placeholder="Amount to move"
                                        value={walletMoveAmount} onChange={e => setWalletMoveAmount(e.target.value)}
                                        style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
                                    <button disabled={walletProcessing || !walletMoveAmount} onClick={async () => {
                                        const amt = parseFloat(walletMoveAmount);
                                        if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
                                        setWalletProcessing(true);
                                        try {
                                            const token = await getAuthToken();
                                            const r = await fetch('/api/club-arena/union-wallet', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                body: JSON.stringify({ action: 'move_rake_to_chips', unionId: unionIdParam, amount: amt }),
                                            });
                                            const d = await r.json();
                                            if (d.success) { showToast(d.message); setWalletMoveAmount(''); loadWallets(); }
                                            else showToast(d.error || 'Move failed', 'error');
                                        } catch (e) { showToast(e.message, 'error'); }
                                        finally { setWalletProcessing(false); }
                                    }} style={{ width: '100%', background: FB.gold, color: '#000', border: 'none', borderRadius: 8, padding: '9px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: walletProcessing ? 0.6 : 1 }}>
                                        {walletProcessing ? 'Moving...' : 'Move to Chip Balance'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Transaction history */}
                        <div style={{ fontSize: 13, fontWeight: 700, color: FB.textPrimary, marginBottom: 10 }}>Transaction History</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                            {['all', 'chip_balance', 'rake_wallet', 'bbj_wallet', 'promo_wallet'].map(f => (
                                <button key={f} onClick={() => setWalletTxFilter(f)}
                                    style={{ background: walletTxFilter === f ? FB.primary : FB.hover, color: walletTxFilter === f ? '#fff' : FB.textSecondary, border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                                    {f === 'all' ? 'All' : f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </button>
                            ))}
                        </div>
                        {!walletData ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 30, fontSize: 13 }}>Click Refresh Balances to load transaction history.</div>
                        ) : (walletData.recentTransactions || [])
                            .filter(t => walletTxFilter === 'all' || t.wallet === walletTxFilter)
                            .length === 0 ? (
                            <div style={{ color: FB.textSecondary, textAlign: 'center', padding: 20, fontSize: 13 }}>No transactions yet.</div>
                        ) : (walletData.recentTransactions || [])
                            .filter(t => walletTxFilter === 'all' || t.wallet === walletTxFilter)
                            .map(tx => (
                                <div key={tx.id} style={{ background: FB.cardBg, borderRadius: 8, padding: '10px 14px', marginBottom: 6, border: `1px solid ${FB.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: FB.textPrimary }}>{tx.notes || tx.tx_type}</div>
                                        <div style={{ fontSize: 11, color: FB.textSecondary }}>
                                            {tx.wallet.replace(/_/g, ' ')} · {tx.clubs?.name || ''} · {new Date(tx.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: tx.direction === 'credit' ? FB.success : FB.danger, whiteSpace: 'nowrap', marginLeft: 12 }}>
                                        {tx.direction === 'credit' ? '+' : '-'}{Number(tx.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                )}

                {/* SETTLEMENT TAB */}
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
                                Tip: Run "Check Status" first to see the current period before taking action.
                            </div>
                        </div>

                        {/* ── Bulk Status — Check All Clubs ── */}
                        <div style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}`, marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: bulkStatusData ? 14 : 0 }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: FB.textPrimary }}>All Clubs Status</div>
                                    <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 2 }}>Check settlement period status across every club at once.</div>
                                </div>
                                <button onClick={handleBulkStatus} disabled={bulkStatusLoading}
                                    style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: bulkStatusLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                                    {bulkStatusLoading ? 'Checking...' : '⚡ Check All Clubs'}
                                </button>
                            </div>
                            {bulkStatusData && bulkStatusData.length > 0 && (() => {
                                const open = bulkStatusData.filter(r => r.currentPeriod?.status === 'open');
                                const closed = bulkStatusData.filter(r => r.currentPeriod?.status === 'closed');
                                const noPeriod = bulkStatusData.filter(r => !r.currentPeriod && !r.error);
                                const errors = bulkStatusData.filter(r => r.error);
                                return (
                                    <div>
                                        {/* Summary row */}
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                            {[
                                                { label: 'Open', count: open.length, color: FB.success },
                                                { label: 'Closed (unpaid)', count: closed.length, color: FB.orange },
                                                { label: 'No Period', count: noPeriod.length, color: FB.textSecondary },
                                                ...(errors.length ? [{ label: 'Errors', count: errors.length, color: FB.danger }] : []),
                                            ].map(s => (
                                                <div key={s.label} style={{ background: FB.hover, borderRadius: 8, padding: '8px 14px', border: `1px solid ${FB.border}` }}>
                                                    <span style={{ fontSize: 11, color: FB.textSecondary }}>{s.label}: </span>
                                                    <span style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Per-club grid */}
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ borderBottom: `1px solid ${FB.border}` }}>
                                                        {['Club', 'Period', 'Status', 'Rake Collected', 'Pending Comms', 'Action'].map(h => (
                                                            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: FB.textSecondary, fontWeight: 600, fontSize: 11 }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bulkStatusData.map((row, i) => {
                                                        const p = row.currentPeriod;
                                                        const statusColor = p?.status === 'open' ? FB.success : p?.status === 'closed' ? FB.orange : FB.textSecondary;
                                                        const pendingCount = row.pendingCommissions?.length ?? 0;
                                                        return (
                                                            <tr key={row.clubId} style={{ borderBottom: `1px solid ${FB.border}`, background: i % 2 === 0 ? FB.cardBg : FB.hover }}>
                                                                <td style={{ padding: '8px 10px', fontWeight: 700, color: FB.textPrimary }}>{row.clubName}</td>
                                                                <td style={{ padding: '8px 10px', color: FB.textSecondary }}>{p?.period_number ? `#${p.period_number}` : '—'}</td>
                                                                <td style={{ padding: '8px 10px' }}>
                                                                    {row.error ? (
                                                                        <span style={{ color: FB.danger, fontSize: 11 }}>Error</span>
                                                                    ) : (
                                                                        <span style={{ color: statusColor, fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                                                                            {p?.status || 'No Period'}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '8px 10px', color: FB.gold, fontWeight: 600 }}>{p ? (p.total_rake_collected || 0).toLocaleString() : '—'}</td>
                                                                <td style={{ padding: '8px 10px' }}>
                                                                    {pendingCount > 0 ? (
                                                                        <span style={{ color: FB.orange, fontWeight: 700 }}>{pendingCount} pending</span>
                                                                    ) : p ? (
                                                                        <span style={{ color: FB.success, fontSize: 11 }}>✓ All paid</span>
                                                                    ) : '—'}
                                                                </td>
                                                                <td style={{ padding: '8px 10px' }}>
                                                                    <button onClick={() => { setSettleClubId(row.clubId); setSettleStatusData({ ...row, clubId: row.clubId }); }}
                                                                        style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                                                        Select
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Status Panel — shown after running 'status' action */}
                        {settleStatusData && (
                            <div style={{ background: 'rgba(35,116,225,0.08)', borderRadius: 12, padding: 16, border: '1px solid rgba(35,116,225,0.2)', marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <span style={{ fontWeight: 700, color: FB.primary, fontSize: 14 }}>
                                        Period Status — {clubs.find(c => c.id === settleStatusData.clubId)?.name || ''}
                                    </span>
                                    <button onClick={() => setSettleStatusData(null)} style={{ background: 'transparent', border: 'none', color: FB.textSecondary, cursor: 'pointer', fontSize: 16 }}>x</button>
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
                                                {settleStatusData.pendingCommissions.map(c => {
                                                        // Resolve agent name from loaded agents list
                                                        const agentRecord = agents.find(a => a.id === c.agent_id || a.user_id === c.agents?.user_id);
                                                        const agentName = agentRecord?.profile?.display_name || agentRecord?.profile?.username
                                                            || c.agents?.display_name || c.agents?.username
                                                            || (c.agents?.user_id ? c.agents.user_id.slice(0, 8) : c.agent_id?.slice?.(0, 8) || 'Unknown Agent');
                                                        return (
                                                            <div key={c.id} style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 2 }}>
                                                                {agentName} — {(c.commission_amount || 0).toLocaleString()} chips pending
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        )}
                                        {settleStatusData.pendingCommissions?.length === 0 && (
                                            <div style={{ fontSize: 12, color: FB.success }}>All commissions paid up for this period.</div>
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
                        {/* Add club by ID — commission rate REQUIRED */}
                        <div style={{ background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}`, marginBottom: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 6 }}>Add Club to Union</h3>
                            <p style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 12 }}>
                                Enter the club code or UUID. You must set the club commission rate before adding.
                                Commission is the percentage of rake the club retains after the union hold.
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                <input value={addClubId} onChange={e => setAddClubId(e.target.value)}
                                    placeholder="Club code or UUID"
                                    style={{ flex: '2 1 200px', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13 }} />
                                <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, background: FB.background, border: `1px solid ${FB.gold}`, borderRadius: 8, padding: '0 12px' }}>
                                    <span style={{ fontSize: 12, color: FB.gold, whiteSpace: 'nowrap' }}>Club Commission</span>
                                    <input
                                        type="number" min="1" max="99" step="1"
                                        value={addClubCommission}
                                        onChange={e => setAddClubCommission(e.target.value)}
                                        style={{ width: 52, background: 'transparent', color: FB.gold, border: 'none', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none' }}
                                    />
                                    <span style={{ fontSize: 12, color: FB.gold }}>%</span>
                                </div>
                            </div>
                            <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 10 }}>
                                Club gets {addClubCommission || '?'}% of net rake. Union retains the remaining {addClubCommission ? (100 - parseInt(addClubCommission)) : '?'}% plus the union hold.
                            </div>
                            <button onClick={async () => {
                                if (!addClubId.trim()) { showToast('Enter a club ID', 'error'); return; }
                                const comm = parseFloat(addClubCommission);
                                if (isNaN(comm) || comm < 1 || comm > 99) { showToast('Club commission must be 1–99%', 'error'); return; }
                                try {
                                    const r = await apiCall('/api/club-arena/manage-union', {
                                        action: 'add_club',
                                        unionId: unionIdParam,
                                        clubId: addClubId.trim(),
                                        clubCommissionRate: comm / 100,
                                    });
                                    showToast(`Added ${r.clubName || addClubId} at ${(r.club_commission_rate * 100).toFixed(0)}% commission`);
                                    setAddClubId('');
                                    loadDashboard();
                                    busEmit.dataMutated('union_club_added');
                                } catch (e) { showToast(e.message, 'error'); }
                            }} style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                                Add Club
                            </button>
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
                                            busEmit.dataMutated('union_club_removed');
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
                                        value={commissionRates[club.id] ?? String(((club.club_commission_rate || 0.9) * 100).toFixed(0))}
                                        onChange={e => setCommissionRates(prev => ({ ...prev, [club.id]: e.target.value }))}
                                        style={{ width: 64, background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                                    />
                                    <span style={{ fontSize: 12, color: FB.textSecondary }}>%</span>
                                    <button onClick={async () => {
                                        const val = parseFloat(commissionRates[club.id] || '90');
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

                        {/* ── Pending Join Applications ── */}
                        <div style={{ marginTop: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, margin: 0 }}>
                                    Join Applications
                                    {dashboard.pendingApplications > 0 && (
                                        <span style={{ marginLeft: 8, background: FB.primary, color: '#fff', borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                                            {dashboard.pendingApplications}
                                        </span>
                                    )}
                                </h3>
                                <button onClick={loadPendingApps} disabled={appsLoading} style={{ background: 'transparent', color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                                    {appsLoading ? 'Loading...' : 'Refresh'}
                                </button>
                            </div>
                            {pendingApps === null ? (
                                <div style={{ color: FB.textSecondary, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                                    {appsLoading ? 'Loading applications...' : 'Click Refresh to load pending applications.'}
                                </div>
                            ) : pendingApps.length === 0 ? (
                                <div style={{ color: FB.textSecondary, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No pending applications.</div>
                            ) : pendingApps.map(app => (
                                <div key={app.id} style={{ background: FB.cardBg, borderRadius: 10, padding: 14, border: '1px solid rgba(35,116,225,0.25)', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>{app.club_name || app.club_id}</div>
                                            <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 2 }}>
                                                {app.member_count || 0} members · Applied {new Date(app.applied_at).toLocaleDateString()}
                                            </div>
                                            {app.message && <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 4, fontStyle: 'italic' }}>"{app.message}"</div>}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                            <input
                                                type="number" min="1" max="99" placeholder="90"
                                                value={appCommRate[app.id] ?? '90'}
                                                onChange={e => setAppCommRate(prev => ({ ...prev, [app.id]: e.target.value }))}
                                                style={{ width: 54, background: FB.background, color: FB.gold, border: `1px solid ${FB.gold}`, borderRadius: 6, padding: '4px 6px', fontSize: 12, textAlign: 'center' }}
                                            />
                                            <span style={{ fontSize: 11, color: FB.gold }}>%</span>
                                            <button disabled={appProcessing[app.id]} onClick={async () => {
                                                const rate = parseFloat(appCommRate[app.id] || '90');
                                                if (isNaN(rate) || rate < 1 || rate > 99) { showToast('Commission must be 1–99%', 'error'); return; }
                                                setAppProcessing(prev => ({ ...prev, [app.id]: 'approve' }));
                                                try {
                                                    const r = await apiCall('/api/club-arena/union-application', { action: 'approve', applicationId: app.id, commissionRate: rate / 100, unionId: unionIdParam });
                                                    showToast(r.message || `${app.club_name} approved`);
                                                    setPendingApps(prev => prev.filter(a => a.id !== app.id));
                                                    loadDashboard();
                                                } catch (e) { showToast(e.message, 'error'); }
                                                finally { setAppProcessing(prev => ({ ...prev, [app.id]: null })); }
                                            }} style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: appProcessing[app.id] ? 0.6 : 1 }}>
                                                {appProcessing[app.id] === 'approve' ? '...' : 'Approve'}
                                            </button>
                                            <button disabled={appProcessing[app.id]} onClick={async () => {
                                                setAppProcessing(prev => ({ ...prev, [app.id]: 'reject' }));
                                                try {
                                                    await apiCall('/api/club-arena/union-application', { action: 'reject', applicationId: app.id, unionId: unionIdParam });
                                                    showToast(`${app.club_name} rejected`);
                                                    setPendingApps(prev => prev.filter(a => a.id !== app.id));
                                                    loadDashboard();
                                                } catch (e) { showToast(e.message, 'error'); }
                                                finally { setAppProcessing(prev => ({ ...prev, [app.id]: null })); }
                                            }} style={{ background: FB.danger, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: appProcessing[app.id] ? 0.6 : 1 }}>
                                                {appProcessing[app.id] === 'reject' ? '...' : 'Reject'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── Leave Requests ── */}
                        <div style={{ marginTop: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.danger, margin: 0 }}>
                                        Leave Requests
                                        <span style={{ marginLeft: 8, background: FB.danger, color: '#fff', borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                                            {dashboard.pendingLeaveRequests}
                                        </span>
                                    </h3>
                                    <button onClick={loadLeaveRequests} disabled={leaveLoading} style={{ background: 'transparent', color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                                        {leaveLoading ? 'Loading...' : 'Refresh'}
                                    </button>
                                </div>
                                {leaveRequests === null ? (
                                    <div style={{ color: FB.textSecondary, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                                        {leaveLoading ? 'Loading...' : 'Click Refresh to load leave requests.'}
                                    </div>
                                ) : leaveRequests.length === 0 ? (
                                    <div style={{ color: FB.textSecondary, fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No pending leave requests.</div>
                                ) : leaveRequests.map(req => (
                                    <div key={req.id} style={{ background: FB.cardBg, borderRadius: 10, padding: 14, border: '1px solid rgba(250,56,62,0.25)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: FB.textPrimary, fontSize: 14 }}>{req.club_name || req.club_id}</div>
                                            <div style={{ fontSize: 12, color: FB.textSecondary, marginTop: 2 }}>
                                                Requested {new Date(req.requested_at || req.created_at).toLocaleDateString()}
                                                {req.reason && ` · "${req.reason}"`}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button disabled={leaveProcessing[req.id]} onClick={async () => {
                                                setLeaveProcessing(prev => ({ ...prev, [req.id]: 'approve' }));
                                                try {
                                                    await apiCall('/api/club-arena/manage-union', { action: 'approve_leave', leaveRequestId: req.id, unionId: unionIdParam });
                                                    showToast(`${req.club_name} approved to leave`);
                                                    setLeaveRequests(prev => prev.filter(r => r.id !== req.id));
                                                    loadDashboard();
                                                } catch (e) { showToast(e.message, 'error'); }
                                                finally { setLeaveProcessing(prev => ({ ...prev, [req.id]: null })); }
                                            }} style={{ background: FB.success, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: leaveProcessing[req.id] ? 0.6 : 1 }}>
                                                {leaveProcessing[req.id] === 'approve' ? '...' : 'Approve'}
                                            </button>
                                            <button disabled={leaveProcessing[req.id]} onClick={async () => {
                                                setLeaveProcessing(prev => ({ ...prev, [req.id]: 'deny' }));
                                                try {
                                                    await apiCall('/api/club-arena/manage-union', { action: 'deny_leave', leaveRequestId: req.id, unionId: unionIdParam });
                                                    showToast(`${req.club_name} leave request denied`);
                                                    setLeaveRequests(prev => prev.filter(r => r.id !== req.id));
                                                    loadDashboard();
                                                } catch (e) { showToast(e.message, 'error'); }
                                                finally { setLeaveProcessing(prev => ({ ...prev, [req.id]: null })); }
                                            }} style={{ background: 'transparent', color: FB.danger, border: `1px solid ${FB.danger}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: leaveProcessing[req.id] ? 0.6 : 1 }}>
                                                {leaveProcessing[req.id] === 'deny' ? '...' : 'Deny'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        {/* ── Union Announcement Broadcast ── */}
                        {isLead && (
                            <div style={{ marginTop: 20, background: FB.cardBg, borderRadius: 12, padding: 16, border: `1px solid ${FB.border}` }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, color: FB.textPrimary, marginBottom: 6 }}>Broadcast Announcement</h3>
                                <p style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 12 }}>
                                    Post a message to all members across union clubs, or target a specific club.
                                </p>
                                <select value={announceClub} onChange={e => setAnnounceClub(e.target.value)}
                                    style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 8 }}>
                                    <option value="all">All clubs in union</option>
                                    {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <textarea
                                    value={announceText}
                                    onChange={e => { if (e.target.value.length <= 500) setAnnounceText(e.target.value); }}
                                    placeholder="Announcement message..."
                                    rows={3}
                                    style={{ width: '100%', background: FB.background, color: FB.textPrimary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 11, color: announceText.length > 450 ? FB.orange : FB.textSecondary }}>{announceText.length}/500</span>
                                    <button onClick={sendAnnouncement} disabled={announceProcessing || !announceText.trim()}
                                        style={{ background: FB.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (announceProcessing || !announceText.trim()) ? 0.5 : 1 }}>
                                        {announceProcessing ? 'Sending...' : 'Send'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
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
                                        Role: <span style={{ color: admin.role === 'union_lead' ? FB.gold : FB.primary }}>{admin.role === 'union_lead' ? 'Union Lead' : 'Union Admin'}</span>
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
                                Settings changes require Union Lead access. You can view but not edit.
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
                                <div style={{ fontSize: 11, color: FB.danger, marginTop: 4 }}>Cannot exceed 50%</div>
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

                {/* ═══ COMMISSIONS TAB ═══ */}
                {activeTab === 'commissions' && (
                    <div style={{ background: FB.cardBg, borderRadius: 12, padding: 20, border: `1px solid ${FB.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: FB.textPrimary, margin: 0 }}>Commission History</h3>
                            <button onClick={loadCommHistory} disabled={commHistoryLoading}
                                style={{ background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`, borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer', opacity: commHistoryLoading ? 0.5 : 1 }}>
                                {commHistoryLoading ? 'Loading...' : 'Refresh'}
                            </button>
                        </div>

                        {/* Summary stats from live agents */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                            {[
                                { label: 'Total Agents', value: (dashboard?.agents || []).length },
                                { label: 'Active Agents', value: (dashboard?.agents || []).filter(a => a.status === 'active').length, color: FB.success },
                                { label: 'Total Lifetime Earnings', value: ((dashboard?.agents || []).reduce((s, a) => s + (a.lifetime_earnings || 0), 0)).toLocaleString(), color: FB.gold },
                                { label: 'Weekly Rake Generated', value: ((dashboard?.agents || []).reduce((s, a) => s + (a.weekly_rake_generated || 0), 0)).toLocaleString(), color: FB.primary },
                            ].map(s => (
                                <div key={s.label} style={{ background: FB.hover, borderRadius: 10, padding: '12px 16px', minWidth: 140, flex: '1 1 140px', border: `1px solid ${FB.border}` }}>
                                    <div style={{ fontSize: 11, color: FB.textSecondary, marginBottom: 4 }}>{s.label}</div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color || FB.textPrimary }}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Commission history table */}
                        {commHistoryLoading && (
                            <div style={{ textAlign: 'center', padding: 32, color: FB.textSecondary, fontSize: 13 }}>Loading commission history...</div>
                        )}
                        {!commHistoryLoading && commHistory === null && (
                            <div style={{ textAlign: 'center', padding: 32, color: FB.textSecondary, fontSize: 13, border: `1px dashed ${FB.border}`, borderRadius: 10 }}>
                                Commission history loads on demand. Click Refresh to load.
                            </div>
                        )}
                        {!commHistoryLoading && commHistory !== null && commHistory.length === 0 && (
                            <div style={{ textAlign: 'center', padding: 32, color: FB.textSecondary, fontSize: 13, border: `1px dashed ${FB.border}`, borderRadius: 10 }}>
                                No commission history found for this union yet.
                            </div>
                        )}
                        {!commHistoryLoading && commHistory && commHistory.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                    <thead>
                                        <tr style={{ borderBottom: `1px solid ${FB.border}` }}>
                                            {['Date', 'Club', 'Agent', 'Role', 'Period Rake', 'Commission', 'Rate', 'Type'].map(h => (
                                                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: FB.textSecondary, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {commHistory.map((row, i) => {
                                            const clubName = (dashboard?.clubs || []).find(c => c.id === row.club_id)?.name || row.club_id?.slice(0, 8);
                                            const date = row.created_at ? new Date(row.created_at).toLocaleDateString() : '--';
                                            const roleColor = { super_agent: '#F7C52A', agent: '#2374E1', sub_agent: '#A855F7' }[row.agent_role] || '#B0B3B8';
                                            return (
                                                <tr key={i} style={{ borderBottom: `1px solid ${FB.border}`, background: i % 2 === 0 ? FB.cardBg : FB.hover }}>
                                                    <td style={{ padding: '8px 10px', color: FB.textSecondary, whiteSpace: 'nowrap' }}>{date}</td>
                                                    <td style={{ padding: '8px 10px', color: FB.textPrimary, fontWeight: 600 }}>{clubName}</td>
                                                    <td style={{ padding: '8px 10px', color: FB.textSecondary }}>{row.agent_name || row.agent_user_id?.slice(0, 8) || '--'}</td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: roleColor, background: `${roleColor}22`, padding: '2px 6px', borderRadius: 4 }}>
                                                            {row.agent_role || '--'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 10px', color: FB.textPrimary }}>{(row.gross_rake || 0).toLocaleString()}</td>
                                                    <td style={{ padding: '8px 10px', color: FB.gold, fontWeight: 700 }}>{(row.commission_amount || 0).toLocaleString()}</td>
                                                    <td style={{ padding: '8px 10px', color: FB.textSecondary }}>{((row.commission_rate || 0) * 100).toFixed(1)}%</td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <span style={{ fontSize: 11, color: row.is_prepaid ? '#31A24C' : '#ea580c', fontWeight: 600 }}>
                                                            {row.is_prepaid ? 'Prepaid' : 'Credit'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 12, textAlign: 'right' }}>
                                    Showing {commHistory.length} most recent commission entries across all clubs in this union.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ BBJ TAB ═══ */}
                {activeTab === 'bbj' && (
                    <div style={{ background: FB.cardBg, borderRadius: 12, padding: 20, border: `1px solid ${FB.border}` }}>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: FB.textPrimary, marginBottom: 16 }}>Bad Beat Jackpot</h3>

                        {/* Pool Balance — from wallets system */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                            {[
                                { label: 'BBJ Wallet', value: dashboard?.wallets?.bbj_wallet || 0, color: '#FFD700' },
                                { label: 'Promo Wallet', value: dashboard?.wallets?.promo_wallet || 0, color: '#4BB543' },
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
                                {((dashboard?.wallets?.bbj_wallet || 0) + (dashboard?.wallets?.promo_wallet || 0)).toLocaleString()}
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
                                    const result = await apiCall('/api/club-arena/union-games', {
                                        action: 'get_bbj_status',
                                        unionId: unionIdParam,
                                    });
                                    if (result.rpcNotAvailable) {
                                        setBbjData({ rpcNotAvailable: true, recent_entries: [] });
                                    } else {
                                        setBbjData(result.data || { recent_entries: [] });
                                    }
                                } catch (e) {
                                    showToast(e.message || 'Failed to load BBJ activity', 'error');
                                } finally { setBbjLoading(false); }
                            }} disabled={bbjLoading} style={{
                                width: '100%', background: FB.hover, color: FB.textSecondary, border: `1px solid ${FB.border}`,
                                borderRadius: 10, padding: '10px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                                opacity: bbjLoading ? 0.5 : 1,
                            }}>{bbjLoading ? 'Loading...' : 'Load Detailed Activity'}</button>
                        ) : (
                            <div>
                                <div style={{ fontSize: 12, color: FB.textSecondary, marginBottom: 8 }}>Recent BBJ Activity</div>
                                {bbjData.rpcNotAvailable ? (
                                    <div style={{ textAlign: 'center', padding: 20, color: FB.textSecondary, fontSize: 13, border: `1px dashed ${FB.border}`, borderRadius: 8 }}>
                                        BBJ activity tracking not yet configured. Enable the <code style={{ color: FB.gold }}>get_union_bbj_status</code> RPC in your database to see detailed BBJ entry history.
                                    </div>
                                ) : (bbjData.recent_entries || []).length === 0 ? (
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
                        { label: 'Club Arena', icon: '🏠', href: '/hub/club-arena' },
                        { label: 'Dashboard', icon: '🏛️', href: null, active: true },
                        { label: 'Games', icon: '🎮', href: unionIdParam ? `/hub/club-arena/union-games?union=${unionIdParam}` : null },
                    ].map(item => (
                        item.href ? (
                            <a key={item.label} href={item.href} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                flex: 1, padding: '8px 4px', textDecoration: 'none',
                                color: item.active ? '#2374E1' : '#B0B3B8',
                            }}>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>{item.icon}</span>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
                            </a>
                        ) : (
                            <div key={item.label} style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                flex: 1, padding: '8px 4px',
                                color: item.active ? '#2374E1' : '#B0B3B8',
                                cursor: 'default',
                            }}>
                                <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700 }}>{item.icon}</span>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</span>
                            </div>
                        )
                    ))}
                </div>
            </nav>
        </div>
    );
}
