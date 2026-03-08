/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Cashier | FULLY WIRED
 SmarterPoker Dark Theme | Buy-In, Cash-Out, Transaction History
 ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getSafeUser, getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

// SmarterPoker Dark Color Scheme
const FB = {
    primary: '#2374E1',
    primaryDark: '#1A5DC8',
    background: '#18191A',
    cardBg: '#242526',
    textPrimary: '#E4E6EB',
    textSecondary: '#B0B3B8',
    border: '#3E4042',
    success: '#31A24C',
    danger: '#FA383E',
    hover: '#3A3B3C',
};

// Preset buy-in amounts
const BUYIN_PRESETS = [100, 500, 1000, 5000];
const CASHOUT_PRESETS = [100, 500, 1000, 'All'];

// Helper: get auth token for API calls
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

export default function Cashier() {
        useTrainingBus('club-arena-cashier');

const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [membership, setMembership] = useState(null);
    const [chipBalance, setChipBalance] = useState(0);
    const [diamondBalance, setDiamondBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal states
    const [showBuyInModal, setShowBuyInModal] = useState(false);
    const [showCashOutModal, setShowCashOutModal] = useState(false);
    const [buyInAmount, setBuyInAmount] = useState('');
    const [cashOutAmount, setCashOutAmount] = useState('');
    const [processing, setProcessing] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [leavePending, setLeavePending] = useState(false);

    // Toast
    const [toast, setToast] = useState(null);
    const [pendingCashouts, setPendingCashouts] = useState([]);
    const [cashoutHistory, setCashoutHistory] = useState([]);
    const [rakebackInfo, setRakebackInfo] = useState(null); // { pendingRakeback, rakebackRate }
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Load data
    const loadData = useCallback(async (signal) => {
        if (!clubIdParam) return;
        setIsLoading(true);
        try {
            // Get authenticated user (Supabase session only)
            const authUser = getAuthUser();

            if (authUser) {
                setUser(authUser);

                // Get user's diamond balance from profiles
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', authUser.id)
                    .maybeSingle();
                setDiamondBalance(profile?.diamonds || 0);

                // Get club data
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
                const { data: clubData } = await supabase
                    .from('clubs')
                    .select('*')
                    .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                    .maybeSingle();
                if (clubData) setClub(clubData);

                // Get user's club membership and chip balance
                if (clubData) {
                    const { data: memberData } = await supabase
                        .from('club_members')
                        .select('*')
                        .eq('club_id', clubData.id)
                        .eq('user_id', authUser.id)
                        .maybeSingle();
                    if (memberData) {
                        setMembership(memberData);
                        setChipBalance(memberData.chip_balance || 0);
                    }
                }

                // Get transaction history for this club (both sent AND received)
                const { data: txns } = await supabase
                    .from('chip_transactions')
                    .select('*')
                    .eq('club_id', clubData.id)
                    .or(`from_user_id.eq.${authUser.id},to_user_id.eq.${authUser.id}`)
                    .order('created_at', { ascending: false })
                    .limit(20);
                setTransactions(txns || []);

                // Get pending cashout requests for this user
                const { data: cashouts } = await supabase
                    .from('cashout_requests')
                    .select('*')
                    .eq('club_id', clubData.id)
                    .eq('player_id', authUser.id)
                    .in('status', ['pending', 'approved'])
                    .order('created_at', { ascending: false })
                    .limit(10);
                setPendingCashouts(cashouts || []);

                // Load full cashout history (all statuses) via API
                try {
                    const token = await getAuthToken();
                    if (token) {
                        const histRes = await fetch(`/api/club-arena/cashout-history?clubId=${clubData.id}`, {
                            headers: { Authorization: `Bearer ${token}` },
                            signal,
                        });
                        if (histRes.ok) {
                            const histData = await histRes.json();
                            setCashoutHistory(histData.cashouts || []);
                        }
                    }
                } catch (e) { /* cashout history is optional */ }

                // Load rakeback info
                try {
                    const rbToken = await getAuthToken();
                    const rbRes = await fetch(`/api/club-arena/rakeback?clubId=${clubData.id}&action=status`, {
                        headers: { Authorization: `Bearer ${rbToken}` },
                        signal,
                    });
                    if (rbRes.ok) {
                        const rbData = await rbRes.json();
                        setRakebackInfo(rbData);
                    }
                } catch (e) { /* rakeback is optional */ }
            }
        } catch (e) {
            
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam]);

    useEffect(() => {
        const controller = new AbortController();
        loadData(controller.signal);
        return () => controller.abort();
    }, [loadData]);

    // BUG #233 FIX: Realtime subscriptions — chip balance and cashout changes auto-refresh
    useEffect(() => {
        if (!club?.id || !user?.id) return;

        // Subscribe to club_members changes (chip_balance updates from distribute/cashout)
        const memberChannel = supabase
            .channel(`cashier-member-${club.id}-${user.id}`)
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
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });

        // Subscribe to cashout_requests changes (status updates from agent)
        const cashoutChannel = supabase
            .channel(`cashier-cashouts-${club.id}-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'cashout_requests',
                filter: `club_id=eq.${club.id}`,
            }, (payload) => {
                if (payload.new?.player_id === user.id || payload.old?.player_id === user.id) {
                    loadData(); // Full refresh on cashout status change
                }
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });

        // Subscribe to chip_transactions (live transaction history)
        const txnChannel = supabase
            .channel(`cashier-txns-${club.id}-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chip_transactions',
                filter: `club_id=eq.${club.id}`,
            }, (payload) => {
                if (payload.new?.user_id === user.id) {
                    loadData();
                }
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                    
                }
            });

        // TIER 2 REALTIME: Cross-tab sync for chip balance via BroadcastChannel
        let bc = null;
        try {
            bc = new BroadcastChannel('smarter_poker_chips_sync');
            bc.onmessage = (event) => {
                if (event.data === 'refresh') {
                    
                    loadData();
                }
            };
        } catch (e) { }

        return () => {
            supabase.removeChannel(memberChannel);
            supabase.removeChannel(cashoutChannel);
            supabase.removeChannel(txnChannel);
            if (bc) {
                try { bc.close(); } catch (e) { }
            }
        };
    }, [club?.id, user?.id]);

    // ═══════════════════════════════════════════════════════════════════════════
    // BUY-IN: Diamonds * Club Chips
    // ═══════════════════════════════════════════════════════════════════════════
    const handleBuyIn = async () => {
        const amount = parseInt(buyInAmount);
        if (!amount || amount <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }

        // 75% Cheaper Law: 38 diamonds = 100 chips
        const diamondCost = Math.ceil((amount / 100) * 38);

        if (diamondCost > diamondBalance) {
            showToast(`Not enough diamonds. Need ${diamondCost}`, 'error');
            return;
        }

        setProcessing(true);
        try {
            const result = await apiCall('/api/club-arena/buyin', {
                clubId: club.id,
                chipAmount: amount,
            });

            showToast(`Bought ${amount.toLocaleString()} chips for ${diamondCost} `, 'success');
            setShowBuyInModal(false);
            setBuyInAmount('');
            loadData();

            // Broadcast chip balance change to other tabs
            try {
                new BroadcastChannel('smarter_poker_chips_sync').postMessage('refresh');
            } catch (e) { }
        } catch (e) {
            showToast(e.message || 'Buy-in failed. Try again.', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // LEAVE CLUB: Player voluntarily exits — chips returned to treasury
    // ═══════════════════════════════════════════════════════════════════════════
    const handleLeaveClub = async () => {
        if (!clubIdParam) return;
        setLeavePending(true);
        try {
            const token = getAccessToken();
            const res = await fetch('/api/club-arena/leave-club', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ clubId: clubIdParam }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to leave club');
            showToast('You have left the club. Redirecting...', 'success');
            setTimeout(() => router.push('/hub/club-arena'), 2000);
        } catch (e) {
            showToast(e.message || 'Failed to leave club', 'error');
            setLeavePending(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CASH-OUT: Club Chips * Diamonds
    // ═══════════════════════════════════════════════════════════════════════════
    const handleCashOut = async () => {
        let amount = cashOutAmount === 'All' ? chipBalance : parseInt(cashOutAmount);
        if (!amount || amount <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }
        if (amount > chipBalance) {
            showToast(`Max cashout is ${chipBalance.toLocaleString()} chips`, 'error');
            return;
        }

        setProcessing(true);
        try {
            const result = await apiCall('/api/club-arena/request-cashout', {
                clubId: club.id,
                amount,
            });

            showToast(result.message || `Cashout request sent! ${amount.toLocaleString()} chips held.`, 'success');
            setShowCashOutModal(false);
            setCashOutAmount('');
            loadData();

            // Broadcast chip balance change to other tabs
            try {
                new BroadcastChannel('smarter_poker_chips_sync').postMessage('refresh');
            } catch (e) { }
        } catch (e) {
            showToast(e.message || 'Cash-out failed. Try again.', 'error');
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

        // Balance cards
        balanceRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' },
        balanceCard: { padding: '20px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, textAlign: 'center' },
        balanceLabel: { fontSize: '11px', color: FB.textSecondary, letterSpacing: '1px', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' },
        balanceAmount: { fontSize: '28px', fontWeight: 700 },
        balanceNote: { fontSize: '10px', color: FB.textSecondary, marginTop: '4px' },

        // Action buttons
        actionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' },
        actionBtn: { padding: '14px', background: FB.primary, border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: 600, color: '#fff', cursor: 'pointer', transition: 'background 0.2s' },
        actionBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },

        // Transactions
        sectionTitle: { fontSize: '14px', fontWeight: 700, color: FB.textSecondary, marginBottom: '12px', textTransform: 'uppercase' },
        listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '8px' },
        txType: { color: FB.textPrimary, fontSize: '15px', fontWeight: 600 },
        txDate: { color: FB.textSecondary, fontSize: '12px', marginTop: '2px' },
        txAmount: { fontSize: '15px', fontWeight: 700 },
        emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary, fontSize: '15px' },

        // Modal
        modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
        modal: { background: FB.cardBg, borderRadius: '12px', width: '100%', maxWidth: '400px', overflow: 'hidden', border: `1px solid ${FB.border}` },
        modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${FB.border}` },
        modalTitle: { fontSize: '18px', fontWeight: 700, color: FB.textPrimary },
        modalClose: { background: 'none', border: 'none', color: FB.textSecondary, fontSize: '24px', cursor: 'pointer', lineHeight: 1 },
        modalBody: { padding: '20px' },
        modalLabel: { fontSize: '13px', color: FB.textSecondary, marginBottom: '8px', display: 'block' },
        modalInput: { width: '100%', padding: '14px', fontSize: '18px', fontWeight: 600, background: FB.background, border: `1px solid ${FB.border}`, borderRadius: '6px', color: FB.textPrimary, outline: 'none', textAlign: 'center' },
        modalPresets: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' },
        presetBtn: { flex: 1, minWidth: '70px', padding: '10px', background: FB.hover, border: `1px solid ${FB.border}`, borderRadius: '6px', color: FB.textPrimary, fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
        modalFooter: { padding: '16px 20px', borderTop: `1px solid ${FB.border}` },
        modalSubmit: { width: '100%', padding: '14px', background: FB.primary, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '16px', fontWeight: 600, cursor: 'pointer' },
        conversionNote: { textAlign: 'center', fontSize: '12px', color: FB.textSecondary, marginTop: '12px', padding: '8px', background: FB.background, borderRadius: '6px' },

        // Toast
        toast: { position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
    };

    const getTransactionLabel = (type) => {
        switch (type) {
            case 'buyin': return 'Buy-In';
            case 'cashout': return 'Cash Out';
            case 'win': return 'Table Win';
            case 'loss': return 'Table Loss';
            case 'table_win': return 'Table Win';
            case 'table_loss': return 'Table Loss';
            case 'rake': return 'Rake';
            case 'transfer_in': return 'Transfer In';
            case 'transfer_out': return 'Transfer Out';
            case 'admin_credit': return 'Admin Credit';
            case 'purchase': return 'Shop Purchase';
            default: return type ? type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Transaction';
        }
    };

    const getDiamondCost = (chips) => Math.ceil((parseInt(chips) || 0) / 100 * 38);
    const getDiamondReturn = (chips) => Math.floor((parseInt(chips) || 0) / 100 * 38);

    return (
        <>
            <SEOHead
                title="Club Arena — Cashier"
                description="Club Arena Cashier For Deposits And Withdrawals."
                canonical="/hub/club-arena/cashier"
                noindex={true}
            />

            <div style={S.page}>
                <UniversalHeader pageDepth={2} />

                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <h1 style={S.pageTitle}>Cashier</h1>

                    {isLoading ? (
                        <div style={S.loading}>Loading...</div>
                    ) : !user ? (
                        <div style={S.emptyState}><p>Sign In To Access The Cashier</p></div>
                    ) : !membership ? (
                        <div style={S.emptyState}><p>You're Not A Member Of This Club</p></div>
                    ) : (
                        <>
                            {/* Balance Cards */}
                            <div style={S.balanceRow}>
                                <div style={S.balanceCard}>
                                    <div style={S.balanceLabel}>Club Chips</div>
                                    <div style={{ ...S.balanceAmount, color: FB.primary }}>
                                        {chipBalance.toLocaleString()}
                                    </div>
                                    <div style={S.balanceNote}>Play Money</div>
                                </div>
                                <div style={S.balanceCard}>
                                    <div style={S.balanceLabel}>Diamonds</div>
                                    <div style={{ ...S.balanceAmount, color: '#00D4FF' }}>
                                        {diamondBalance.toLocaleString()}
                                    </div>
                                    <div style={S.balanceNote}>38 = 100 Chips</div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={S.actionGrid}>
                                <button
                                    style={{ ...S.actionBtn, ...(diamondBalance < 38 ? S.actionBtnDisabled : {}) }}
                                    onClick={() => diamondBalance >= 38 && setShowBuyInModal(true)}
                                    disabled={diamondBalance < 38}
                                >
                                    Buy Chips
                                </button>
                                <button
                                    style={{ ...S.actionBtn, background: FB.success, ...(chipBalance < 100 ? S.actionBtnDisabled : {}) }}
                                    onClick={() => chipBalance >= 100 && setShowCashOutModal(true)}
                                    disabled={chipBalance < 100}
                                >
                                    Cash Out
                                </button>
                            </div>

                            {/* Leave Club — non-owners only */}
                            {membership?.role && membership.role !== 'owner' && (
                                <div style={{ marginTop: 8, marginBottom: 8, textAlign: 'right' }}>
                                    <button
                                        onClick={() => setShowLeaveModal(true)}
                                        style={{ background: 'none', border: 'none', color: '#FA383E', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                                    >
                                        Leave Club
                                    </button>
                                </div>
                            )}

                            {/* Pending Cashout Requests */}
                            {pendingCashouts.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <h2 style={S.sectionTitle}>Pending Cashouts</h2>
                                    {pendingCashouts.map(co => (
                                        <div key={co.id} style={{
                                            ...S.listItem,
                                            border: `1px solid ${co.status === 'approved' ? FB.success : '#F5A623'}`,
                                            background: co.status === 'approved' ? 'rgba(49,162,76,0.08)' : 'rgba(245,166,35,0.08)',
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: 600, color: FB.textPrimary }}>
                                                    {co.status === 'pending' ? ' Awaiting Agent Approval' : ' Approved'}
                                                </div>
                                                <div style={S.txDate}>
                                                    {co.created_at ? new Date(co.created_at).toLocaleString() : 'N/A'}
                                                    {co.agent_note ? ` · ${co.agent_note}` : ''}
                                                </div>
                                            </div>
                                            <div style={{
                                                fontSize: '16px', fontWeight: 700,
                                                color: co.status === 'approved' ? FB.success : '#F5A623',
                                            }}>
                                                {(co.amount || 0).toLocaleString()} chips
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rakeback */}
                            {rakebackInfo && rakebackInfo.pendingRakeback > 0 && (
                                <div style={{ marginBottom: '24px' }}>
                                    <h2 style={S.sectionTitle}>Rakeback Available</h2>
                                    <div style={{
                                        background: 'rgba(75,181,67,0.08)', borderRadius: '12px',
                                        padding: '16px', border: '1px solid rgba(75,181,67,0.25)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <div>
                                                <div style={{ fontSize: '13px', color: FB.textSecondary }}>Unclaimed Rakeback</div>
                                                <div style={{ fontSize: '24px', fontWeight: 800, color: '#4BB543' }}>
                                                    {rakebackInfo.pendingRakeback.toLocaleString()} chips
                                                </div>
                                                <div style={{ fontSize: '12px', color: FB.textSecondary }}>
                                                    Rate: {((rakebackInfo.rakebackRate || 0) * 100).toFixed(0)}% · {rakebackInfo.pendingCount} period{rakebackInfo.pendingCount !== 1 ? 's' : ''}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const result = await apiCall('/api/club-arena/rakeback', { action: 'claim', clubId: club.id });
                                                    showToast(`Claimed ${result.claimed?.toLocaleString()} chips rakeback!`);
                                                    loadData();
                                                } catch (e) { showToast(e.message || 'Claim failed', 'error'); }
                                            }}
                                            style={{
                                                width: '100%', padding: '12px', background: '#4BB543', color: '#fff',
                                                border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '15px', cursor: 'pointer',
                                            }}
                                        >
                                            Claim {rakebackInfo.pendingRakeback.toLocaleString()} Chips
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Cashout History */}
                            {cashoutHistory.length > 0 && (
                                <div style={{ marginBottom: '24px' }}>
                                    <h2 style={S.sectionTitle}>Cashout History</h2>
                                    {cashoutHistory.slice(0, 20).map(co => {
                                        const statusColors = {
                                            pending: { bg: 'rgba(255,165,0,0.08)', border: 'rgba(255,165,0,0.25)', text: '#FFA500' },
                                            approved: { bg: 'rgba(75,181,67,0.08)', border: 'rgba(75,181,67,0.25)', text: '#4BB543' },
                                            cancelled: { bg: 'rgba(255,59,48,0.08)', border: 'rgba(255,59,48,0.25)', text: '#FA383E' },
                                            completed: { bg: 'rgba(35,116,225,0.08)', border: 'rgba(35,116,225,0.25)', text: '#2374E1' },
                                        };
                                        const sc = statusColors[co.status] || statusColors.pending;
                                        return (
                                            <div key={co.id} style={{
                                                background: sc.bg, borderRadius: '10px', padding: '12px 14px',
                                                border: `1px solid ${sc.border}`, marginBottom: '8px',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <span style={{ fontSize: '16px', fontWeight: 800, color: sc.text }}>
                                                            {(co.amount || 0).toLocaleString()} chips
                                                        </span>
                                                    </div>
                                                    <div style={{
                                                        fontSize: '11px', fontWeight: 700, color: sc.text,
                                                        background: `${sc.text}15`, padding: '3px 10px', borderRadius: '12px',
                                                    }}>
                                                        {co.status?.toUpperCase()}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '11px', color: FB.textSecondary, marginTop: '4px' }}>
                                                    {co.created_at ? new Date(co.created_at).toLocaleString() : ''}
                                                    {co.agent_note && <span> · Agent: {co.agent_note}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Transaction History */}
                            <h2 style={S.sectionTitle}>Transaction History</h2>
                            {transactions.length > 0 ? transactions.map((tx, i) => {
                                const txIcons = {
                                    buyin: '[+]', deposit: '[+]', withdrawal: '[-]', cashout: '[-]',
                                    win: '[W]', loss: '[L]', rake: '[R]', send: '[>]', receive: '[<]',
                                    purchase: '[$]', rakeback: '[RB]', bonus: '[+]', promo: '[P]',
                                };
                                const icon = txIcons[tx.transaction_type] || '[?]';
                                const isPos = (tx.amount || 0) >= 0;
                                return (
                                    <div key={tx.id || i} style={{ ...S.listItem, gap: '10px', alignItems: 'center', display: 'flex' }}>
                                        <div style={{ fontSize: 20, flexShrink: 0 }}>{icon}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={S.txType}>{getTransactionLabel(tx.transaction_type)}</div>
                                            <div style={S.txDate}>
                                                {tx.notes ? <span style={{ color: '#B0B3B8' }}>{tx.notes.slice(0, 40)} · </span> : null}
                                                {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}
                                            </div>
                                        </div>
                                        <div style={{
                                            ...S.txAmount,
                                            color: isPos ? FB.success : FB.danger,
                                            background: isPos ? 'rgba(49,162,76,0.1)' : 'rgba(250,56,62,0.1)',
                                            borderRadius: 6, padding: '3px 8px',
                                        }}>
                                            {isPos ? '+' : ''}{(tx.amount || 0).toLocaleString()}
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div style={S.emptyState}>
                                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
                                    <p>No Transactions Yet</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="cashier" userRole={membership?.role} />

            {/* ═══════════════════════════════════════════════════════════════════════
                LEAVE CLUB MODAL
            ═══════════════════════════════════════════════════════════════════════ */}
            {showLeaveModal && (
                <div style={S.modalOverlay} onClick={() => !leavePending && setShowLeaveModal(false)}>
                    <div style={{ ...S.modal, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Leave Club</span>
                            <button style={S.modalClose} onClick={() => !leavePending && setShowLeaveModal(false)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <p style={{ color: FB.textPrimary, fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                                Are you sure you want to leave this club?
                            </p>
                            <div style={{ background: 'rgba(250,56,62,0.08)', border: '1px solid rgba(250,56,62,0.25)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#FA383E', lineHeight: 1.6 }}>
                                <strong>Your entire chip balance ({chipBalance.toLocaleString()} chips) will be returned to the club treasury.</strong>
                                {' '}Any pending cashout requests will be cancelled. This action cannot be undone.
                            </div>
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                style={{ ...S.modalSubmit, background: '#FA383E', opacity: leavePending ? 0.5 : 1 }}
                                onClick={handleLeaveClub}
                                disabled={leavePending}
                            >
                                {leavePending ? 'Processing...' : 'Confirm — Leave Club'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
 BUY-IN MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {showBuyInModal && (
                <div style={S.modalOverlay} onClick={() => !processing && setShowBuyInModal(false)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Buy Chips</span>
                            <button style={S.modalClose} onClick={() => !processing && setShowBuyInModal(false)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <label style={S.modalLabel}>How Many Chips?</label>
                            <input
                                type="number"
                                value={buyInAmount}
                                onChange={e => setBuyInAmount(e.target.value)}
                                placeholder="Enter Amount"
                                style={S.modalInput}
                                min="100"
                                step="100"
                            />
                            <div style={S.modalPresets}>
                                {BUYIN_PRESETS.map(amt => (
                                    <button
                                        key={amt}
                                        style={{
                                            ...S.presetBtn,
                                            border: buyInAmount === String(amt) ? `2px solid ${FB.primary}` : `1px solid ${FB.border}`
                                        }}
                                        onClick={() => setBuyInAmount(String(amt))}
                                    >
                                        {amt.toLocaleString()}
                                    </button>
                                ))}
                            </div>
                            {buyInAmount && (
                                <div style={S.conversionNote}>
                                    Cost: <strong>{getDiamondCost(buyInAmount)} </strong>
                                    {getDiamondCost(buyInAmount) > diamondBalance && (
                                        <span style={{ color: FB.danger, display: 'block', marginTop: '4px' }}>
                                            Not enough diamonds!
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                style={{
                                    ...S.modalSubmit,
                                    opacity: processing || !buyInAmount || getDiamondCost(buyInAmount) > diamondBalance ? 0.5 : 1
                                }}
                                onClick={handleBuyIn}
                                disabled={processing || !buyInAmount || getDiamondCost(buyInAmount) > diamondBalance}
                            >
                                {processing ? 'Processing...' : `Buy ${parseInt(buyInAmount || 0).toLocaleString()} Chips`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════
 CASH-OUT MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {showCashOutModal && (
                <div style={S.modalOverlay} onClick={() => !processing && setShowCashOutModal(false)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Request Cash Out</span>
                            <button style={S.modalClose} onClick={() => !processing && setShowCashOutModal(false)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <label style={S.modalLabel}>How Many Chips To Cash Out?</label>
                            <p style={{ fontSize: '12px', color: FB.textSecondary, margin: '0 0 12px 0' }}>
                                Chips will be held until your agent approves the request.
                            </p>
                            <input
                                type="number"
                                value={cashOutAmount === 'All' ? chipBalance : cashOutAmount}
                                onChange={e => setCashOutAmount(e.target.value)}
                                placeholder="Enter Amount"
                                style={S.modalInput}
                                min="100"
                                max={chipBalance}
                                step="100"
                            />
                            <div style={S.modalPresets}>
                                {CASHOUT_PRESETS.map(amt => (
                                    <button
                                        key={amt}
                                        style={{
                                            ...S.presetBtn,
                                            border: cashOutAmount === String(amt) ? `2px solid ${FB.success}` : `1px solid ${FB.border}`
                                        }}
                                        onClick={() => setCashOutAmount(amt === 'All' ? 'All' : String(amt))}
                                        disabled={typeof amt === 'number' && amt > chipBalance}
                                    >
                                        {amt === 'All' ? `All (${chipBalance.toLocaleString()})` : amt.toLocaleString()}
                                    </button>
                                ))}
                            </div>
                            {cashOutAmount && (
                                <div style={S.conversionNote}>
                                    You'll receive: <strong style={{ color: '#00D4FF' }}>
                                        {getDiamondReturn(cashOutAmount === 'All' ? chipBalance : cashOutAmount)}
                                    </strong>
                                </div>
                            )}
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                style={{
                                    ...S.modalSubmit,
                                    background: FB.success,
                                    opacity: processing || !cashOutAmount ? 0.5 : 1
                                }}
                                onClick={handleCashOut}
                                disabled={processing || !cashOutAmount}
                            >
                                {processing ? 'Processing...' : `Request Cash Out — ${(cashOutAmount === 'All' ? chipBalance : parseInt(cashOutAmount || 0)).toLocaleString()} Chips`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div style={{
                    ...S.toast,
                    background: toast.type === 'error' ? FB.danger : FB.success,
                    color: '#fff'
                }}>
                    {toast.message}
                </div>
            )}
        </>
    );
}
