/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Cashier | FULLY WIRED
 Facebook Dark Theme | Buy-In, Cash-Out, Transaction History
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

export default function Cashier() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;

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

    // Toast
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Load data
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

            if (authUser) {
                setUser(authUser);

                // Get user's diamond balance from profiles
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', authUser.id)
                    .single();
                setDiamondBalance(profile?.diamonds || 0);

                // Get club data
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
                const { data: clubData } = await supabase
                    .from('clubs')
                    .select('*')
                    .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                    .single();
                if (clubData) setClub(clubData);

                // Get user's club membership and chip balance
                if (clubData) {
                    const { data: memberData } = await supabase
                        .from('club_members')
                        .select('*')
                        .eq('club_id', clubData.id)
                        .eq('user_id', authUser.id)
                        .single();
                    if (memberData) {
                        setMembership(memberData);
                        setChipBalance(memberData.chip_balance || 0);
                    }
                }

                // Get transaction history for this club
                const { data: txns } = await supabase
                    .from('chip_transactions')
                    .select('*')
                    .eq('from_user_id', authUser.id)
                    .eq('club_id', clubData.id)
                    .order('created_at', { ascending: false })
                    .limit(20);
                setTransactions(txns || []);
            }
        } catch (e) {
            console.error('[Cashier] Error loading data:', e);
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam]);

    useEffect(() => { loadData(); }, [loadData]);

    // ═══════════════════════════════════════════════════════════════════════════
    // BUY-IN: Diamonds → Club Chips
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
            // Read fresh balances to prevent stale-state overwrites
            const { data: freshProfile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .single();
            const currentDiamonds = freshProfile?.diamonds || 0;
            if (diamondCost > currentDiamonds) {
                showToast(`Not enough diamonds. Need ${diamondCost}, have ${currentDiamonds}`, 'error');
                setProcessing(false);
                return;
            }

            const { data: freshMember } = await supabase
                .from('club_members')
                .select('chip_balance')
                .eq('club_id', club.id)
                .eq('user_id', user.id)
                .single();
            const currentChips = freshMember?.chip_balance || 0;

            // 1. Deduct diamonds from profile
            const { error: diamondError } = await supabase
                .from('profiles')
                .update({ diamonds: currentDiamonds - diamondCost })
                .eq('id', user.id);

            if (diamondError) throw diamondError;

            // 2. Add chips to club membership
            const { error: chipError } = await supabase
                .from('club_members')
                .update({ chip_balance: currentChips + amount })
                .eq('club_id', club.id)
                .eq('user_id', user.id);

            if (chipError) throw chipError;

            // 3. Record transaction
            await supabase.from('chip_transactions').insert({
                from_user_id: user.id,
                to_user_id: user.id,
                club_id: club?.id,
                transaction_type: 'buyin',
                amount: amount,
                notes: `Buy-in: ${amount} chips for ${diamondCost} diamonds`,
            });

            showToast(`Bought ${amount.toLocaleString()} chips!`, 'success');
            setShowBuyInModal(false);
            setBuyInAmount('');
            loadData();
        } catch (e) {
            console.error('[Cashier] Buy-in error:', e);
            showToast('Buy-in failed. Try again.', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CASH-OUT: Club Chips → Diamonds
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

        // Reverse of buy-in: 100 chips = 38 diamonds
        const diamondsReturned = Math.floor((amount / 100) * 38);

        setProcessing(true);
        try {
            // Read fresh balances to prevent stale-state overwrites
            const { data: freshMember } = await supabase
                .from('club_members')
                .select('chip_balance')
                .eq('club_id', club.id)
                .eq('user_id', user.id)
                .single();
            const currentChips = freshMember?.chip_balance || 0;

            // If 'Cash All', recalculate amount from fresh balance
            if (cashOutAmount === 'All') {
                amount = currentChips;
            }

            if (amount > currentChips || amount <= 0) {
                showToast(currentChips <= 0 ? 'No chips to cash out' : `Max cashout is ${currentChips.toLocaleString()} chips`, 'error');
                setProcessing(false);
                return;
            }

            const { data: freshProfile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .single();
            const currentDiamonds = freshProfile?.diamonds || 0;

            // 1. Deduct chips from club membership
            const { error: chipError } = await supabase
                .from('club_members')
                .update({ chip_balance: currentChips - amount })
                .eq('club_id', club.id)
                .eq('user_id', user.id);

            if (chipError) throw chipError;

            // 2. Add diamonds to profile
            const { error: diamondError } = await supabase
                .from('profiles')
                .update({ diamonds: currentDiamonds + diamondsReturned })
                .eq('id', user.id);

            if (diamondError) throw diamondError;

            // 3. Record transaction
            await supabase.from('chip_transactions').insert({
                from_user_id: user.id,
                to_user_id: user.id,
                club_id: club?.id,
                transaction_type: 'cashout',
                amount: -amount,
                notes: `Cash-out: ${amount} chips for ${diamondsReturned} diamonds`,
            });

            showToast(`Cashed out ${amount.toLocaleString()} chips → ${diamondsReturned}`, 'success');
            setShowCashOutModal(false);
            setCashOutAmount('');
            loadData();

            // ═══════════════════════════════════════════════════════════════════════════
            // NOTIFY AGENT: Send message and push notification on cash-out
            // ═══════════════════════════════════════════════════════════════════════════
            if (membership?.agent_id) {
                try {
                    // Get user profile for name
                    const { data: userProfile } = await supabase
                        .from('profiles')
                        .select('username, display_name')
                        .eq('id', user.id)
                        .single();
                    const displayName = userProfile?.display_name || userProfile?.username || 'A player';

                    // 1. Create/get conversation and send in-app message
                    const { data: convId } = await supabase.rpc('fn_get_or_create_conversation', {
                        user1_id: user.id,
                        user2_id: membership.agent_id,
                    });
                    if (convId) {
                        await supabase.rpc('fn_send_message', {
                            p_conversation_id: convId,
                            p_sender_id: user.id,
                            p_content: ` Cash-Out Request: I cashed out ${amount.toLocaleString()} chips → ${diamondsReturned}`,
                        });
                    }

                    // 2. Send push notification to agent
                    await fetch('/api/notifications/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: ' Cash-Out Request',
                            message: `${displayName} cashed out ${amount.toLocaleString()} chips`,
                            url: `/hub/club-arena/messages?club=${clubIdParam}`,
                            externalUserIds: [membership.agent_id],
                        }),
                    });

                    console.log('[Cashier] Agent notified of cash-out');
                } catch (notifyError) {
                    console.warn('[Cashier] Failed to notify agent:', notifyError);
                    // Don't fail the cash-out if notification fails
                }
            }
        } catch (e) {
            console.error('[Cashier] Cash-out error:', e);
            showToast('Cash-out failed. Try again.', 'error');
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
            case 'rake': return 'Rake';
            case 'transfer_in': return 'Transfer In';
            case 'transfer_out': return 'Transfer Out';
            default: return type || 'Transaction';
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

                    <h1 style={S.pageTitle}> Cashier</h1>

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

                            {/* Transaction History */}
                            <h2 style={S.sectionTitle}>Transaction History</h2>
                            {transactions.length > 0 ? transactions.map((tx, i) => (
                                <div key={tx.id || i} style={S.listItem}>
                                    <div>
                                        <div style={S.txType}>{getTransactionLabel(tx.transaction_type)}</div>
                                        <div style={S.txDate}>
                                            {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}
                                        </div>
                                    </div>
                                    <div style={{
                                        ...S.txAmount,
                                        color: (tx.amount || 0) >= 0 ? FB.success : FB.danger
                                    }}>
                                        {(tx.amount || 0) >= 0 ? '+' : ''}{(tx.amount || 0).toLocaleString()}
                                    </div>
                                </div>
                            )) : (
                                <div style={S.emptyState}>
                                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
                                    <p>No Transactions Yet</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="cashier" />
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
 BUY-IN MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {showBuyInModal && (
                <div style={S.modalOverlay} onClick={() => !processing && setShowBuyInModal(false)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}> Buy Chips</span>
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
                            <span style={S.modalTitle}> Cash Out</span>
                            <button style={S.modalClose} onClick={() => !processing && setShowCashOutModal(false)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <label style={S.modalLabel}>How Many Chips To Cash Out?</label>
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
                                {processing ? 'Processing...' : `Cash Out ${(cashOutAmount === 'All' ? chipBalance : parseInt(cashOutAmount || 0)).toLocaleString()} Chips`}
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
