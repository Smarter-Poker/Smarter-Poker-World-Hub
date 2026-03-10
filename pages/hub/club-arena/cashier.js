/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Cashier | FULLY WIRED
 SmarterPoker Dark Theme | Buy-In, Cash-Out, Transaction History
 ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';
import NotificationBell from '../../../src/components/club-arena/NotificationBell';
import { haptic } from '../../../src/lib/club-arena/haptic';
import { usePullToRefresh } from '../../../src/hooks/usePullToRefresh';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { busEmit, eventBus, EventType } from '../../../src/engine/EventBus';
import dynamic from 'next/dynamic';
import useWalletData from '../../../src/hooks/useWalletData';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import { apiCall, getAuthToken } from '../../../src/lib/club-arena/apiClient';
const DynamicWallet = dynamic(() => import('../../../src/components/club-arena/DynamicWallet'), { ssr: false });
const ClubAnnouncementBanner = dynamic(() => import('../../../src/components/club-arena/ClubAnnouncementBanner'), { ssr: false });

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

export default function Cashier() {
    useTrainingBus('club-arena-cashier');
    usePullToRefresh({ onRefresh: () => loadData?.() });

    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // State
    const [user, setUser] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [club, setClub] = useState(null);
    const [membership, setMembership] = useState(null);
    const [chipBalance, setChipBalance] = useState(0);
    const [diamondBalance, setDiamondBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [txPage, setTxPage] = useState(1);
    const TX_PAGE_SIZE = 20;
    const isProcessingRef = useRef(false);

    // ENH-6: Expandable transactions
    const [expandedTx, setExpandedTx] = useState(null);

    // ENH-10: Pull-to-refresh
    const [pullRefreshing, setPullRefreshing] = useState(false);
    const pullStartY = useRef(0);
    const pullDelta = useRef(0);
    const containerRef = useRef(null);

    // Modal states
    const [showBuyInModal, setShowBuyInModal] = useState(false);
    const [showCashOutModal, setShowCashOutModal] = useState(false);
    const [buyInAmount, setBuyInAmount] = useState('');
    const [buyInConfirmed, setBuyInConfirmed] = useState(false);
    const [buyInPendingAmount, setBuyInPendingAmount] = useState(null);
    const [cashOutAmount, setCashOutAmount] = useState('');
    const [processing, setProcessing] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [leavePending, setLeavePending] = useState(false);

    // Toast
    const [toast, setToast] = useState(null);
    const [pendingCashouts, setPendingCashouts] = useState([]);
    const [cashoutHistory, setCashoutHistory] = useState([]);
    const [rakebackInfo, setRakebackInfo] = useState(null); // { pendingRakeback, rakebackRate }

    // Transfer chips state
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferRecipient, setTransferRecipient] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [transferNote, setTransferNote] = useState('');
    const [clubMembers, setClubMembers] = useState([]);

    // ── P1-ENH: New state for 12 enhancements ──────────────────────────
    // ENH-1: Animated Balance Counter
    const [displayChips, setDisplayChips] = useState(0);
    const [displayDiamonds, setDisplayDiamonds] = useState(0);
    const animFrameRefChips = useRef(null);
    const animFrameRefDiamonds = useRef(null);

    // ENH-2: Transaction Category Filters
    const [txFilter, setTxFilter] = useState('all');

    // ENH-DATE: Transaction Date Filter
    const [txDateFilter, setTxDateFilter] = useState('all');

    // ENH-3: Monthly P&L Summary (collapsed by default)
    const [showPnL, setShowPnL] = useState(false);

    // ENH-5: Quick Re-Buy
    const [lastBuyInAmount, setLastBuyInAmount] = useState(null);
    const [reBuyVisible, setReBuyVisible] = useState(false);
    const reBuyTimerRef = useRef(null);

    // ENH-6: Cashout ETA
    const [cashoutEta, setCashoutEta] = useState(null);

    // Real-time wallet data
    const walletData = useWalletData({ supabase, userId: user?.id, clubId: club?.id });

    const showToast = (message, type = 'success', action = null) => {
        setToast({ message, type, action });
        setTimeout(() => setToast(null), action ? 5000 : 3000);
    };

    // ENH-8: Haptic feedback utility
    const haptic = (style = 'light') => {
        try { if (navigator.vibrate) navigator.vibrate(style === 'success' ? [15, 50, 15] : style === 'error' ? [30, 30, 30] : 10); } catch (_) { }
    };

    // ENH-1: Animated balance counter effect
    useEffect(() => {
        const target = walletData.chipBalance ?? chipBalance;
        if (displayChips === target) return;
        const start = displayChips;
        const diff = target - start;
        const duration = 400;
        const startTime = performance.now();
        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayChips(Math.round(start + diff * eased));
            if (progress < 1) animFrameRefChips.current = requestAnimationFrame(animate);
        };
        if (animFrameRefChips.current) cancelAnimationFrame(animFrameRefChips.current);
        animFrameRefChips.current = requestAnimationFrame(animate);
        return () => { if (animFrameRefChips.current) cancelAnimationFrame(animFrameRefChips.current); };
    }, [walletData.chipBalance, chipBalance]);

    useEffect(() => {
        const target = walletData.diamondBalance ?? diamondBalance;
        if (displayDiamonds === target) return;
        const start = displayDiamonds;
        const diff = target - start;
        const duration = 400;
        const startTime = performance.now();
        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayDiamonds(Math.round(start + diff * eased));
            if (progress < 1) animFrameRefDiamonds.current = requestAnimationFrame(animate);
        };
        if (animFrameRefDiamonds.current) cancelAnimationFrame(animFrameRefDiamonds.current);
        animFrameRefDiamonds.current = requestAnimationFrame(animate);
        return () => { if (animFrameRefDiamonds.current) cancelAnimationFrame(animFrameRefDiamonds.current); };
    }, [walletData.diamondBalance, diamondBalance]);

    // ENH-6: Cashout ETA — compute avg agent response time
    useEffect(() => {
        if (!cashoutHistory || cashoutHistory.length < 2) { setCashoutEta(null); return; }
        const approved = cashoutHistory.filter(c => c.status === 'approved' && c.created_at && c.updated_at);
        if (approved.length === 0) { setCashoutEta(null); return; }
        const avgMs = approved.reduce((sum, c) => sum + (new Date(c.updated_at) - new Date(c.created_at)), 0) / approved.length;
        const avgMinutes = Math.round(avgMs / 60000);
        setCashoutEta(avgMinutes < 1 ? 'under 1 minute' : avgMinutes < 60 ? `~${avgMinutes} minutes` : `~${Math.round(avgMinutes / 60)} hour${Math.round(avgMinutes / 60) > 1 ? 's' : ''}`);
    }, [cashoutHistory]);

    // Load data — ENH-5: Parallel fetch with Promise.allSettled
    const loadData = useCallback(async (signal) => {
        if (!clubIdParam) return;
        setIsLoading(true);
        setLoadError(false);
        try {
            // Get authenticated user (Supabase session only)
            const authUser = getAuthUser();

            if (authUser) {
                setUser(authUser);

                // Get user's diamond balance from profiles
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds, club_arena_tos_accepted_at')
                    .eq('id', authUser.id)
                    .maybeSingle();
                setDiamondBalance(profile?.diamonds || 0);

                // TOS gate — redirect if not accepted
                if (!profile?.club_arena_tos_accepted_at) {
                    router.replace('/hub/club-arena');
                    return;
                }

                // Get club data
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
                const { data: clubData } = await supabase
                    .from('clubs')
                    .select('*')
                    .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                    .maybeSingle();
                if (clubData) setClub(clubData);

                // ENH-5: Parallel fetch — all club-dependent queries at once
                if (clubData) {
                    const token = await getAuthToken();
                    const [memberRes, txnRes, cashoutRes, histRes, rbRes] = await Promise.allSettled([
                        supabase.from('club_members').select('*').eq('club_id', clubData.id).eq('user_id', authUser.id).maybeSingle(),
                        supabase.from('chip_transactions').select('*').eq('club_id', clubData.id)
                            .or(`from_user_id.eq.${authUser.id},to_user_id.eq.${authUser.id}`)
                            .order('created_at', { ascending: false }).limit(100),
                        supabase.from('cashout_requests').select('*').eq('club_id', clubData.id)
                            .eq('player_id', authUser.id).in('status', ['pending', 'approved'])
                            .order('created_at', { ascending: false }).limit(10),
                        token ? fetch(`/api/club-arena/cashout-history?clubId=${clubData.id}`, {
                            headers: { Authorization: `Bearer ${token}` }, signal,
                        }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
                        token ? fetch(`/api/club-arena/rakeback?clubId=${clubData.id}&action=status`, {
                            headers: { Authorization: `Bearer ${token}` }, signal,
                        }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
                    ]);

                    if (memberRes.status === 'fulfilled' && memberRes.value?.data) {
                        setMembership(memberRes.value.data);
                        setChipBalance(memberRes.value.data.chip_balance || 0);
                    }
                    if (txnRes.status === 'fulfilled') setTransactions(txnRes.value?.data || []);
                    if (cashoutRes.status === 'fulfilled') setPendingCashouts(cashoutRes.value?.data || []);
                    if (histRes.status === 'fulfilled' && histRes.value) setCashoutHistory(histRes.value.cashouts || []);
                    if (rbRes.status === 'fulfilled' && rbRes.value) setRakebackInfo(rbRes.value);
                }
            }
        } catch (e) {
            setLoadError(true);
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
        // ENH-1: Show cashout approval toast
        const cashoutChannel = supabase
            .channel(`cashier-cashouts-${club.id}-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'cashout_requests',
                filter: `club_id=eq.${club.id}`,
            }, (payload) => {
                if (payload.new?.player_id === user.id || payload.old?.player_id === user.id) {
                    if (payload.new?.status === 'approved' && payload.old?.status === 'pending') {
                        showToast(`✅ Cashout of ${(payload.new.amount || 0).toLocaleString()} chips approved!`, 'success');
                        haptic('success');
                    }
                    loadData();
                }
            })
            .subscribe();

        // Subscribe to chip_transactions (live transaction history)
        // ENH-1: Show incoming chip notification toast
        const txnChannel = supabase
            .channel(`cashier-txns-${club.id}-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chip_transactions',
                filter: `club_id=eq.${club.id}`,
            }, (payload) => {
                const tx = payload.new;
                if (!tx) return;
                const isIncoming = tx.to_user_id === user.id && tx.from_user_id !== user.id;
                if (isIncoming && tx.amount > 0) {
                    const label = tx.transaction_type === 'rakeback' ? '🎁 Rakeback' :
                        tx.transaction_type === 'admin_credit' ? '⭐ Admin Credit' : '💰 Chips Received';
                    showToast(`${label}: +${(tx.amount || 0).toLocaleString()} chips`, 'success');
                    haptic('success');
                }
                if (tx.from_user_id === user.id || tx.to_user_id === user.id) {
                    loadData();
                }
            })
            .subscribe();

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

    // ── Event Bus: refresh on cross-page mutations ────────────────────────
    useEffect(() => {
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const relevant = [
                'chips_distributed', 'chips_minted', 'cashout_approved', 'cashout_requested', 'cashout_cancelled',
                'marketplace_purchase', 'rakeback_distributed', 'table_action', 'tournament_registration',
                'tournament_cancelled', 'agent_credit_issued', 'diamond_purchase'
            ];
            if (relevant.includes(e?.payload?.entity)) loadData();
        });
        return () => unsub();
    }, [loadData]);

    // ═══════════════════════════════════════════════════════════════════════════
    // BUY-IN: Diamonds * Club Chips
    // ═══════════════════════════════════════════════════════════════════════════
    const handleBuyIn = async () => {
        if (isProcessingRef.current) return;

        const amount = parseInt(buyInAmount);
        if (!amount || amount <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }

        // 75% Cheaper Law: 38 diamonds = 100 chips
        const diamondCost = Math.ceil((amount / 100) * 38);

        if (diamondCost > diamondBalance) {
            // ENH-3: Insufficient diamond toast with Buy Diamonds action
            showToast(`Not enough diamonds. Need ${diamondCost}`, 'error', { label: 'Buy Diamonds', onClick: () => router.push('/hub/diamond-store') });
            return;
        }

        // P3 ENH-11: High-value confirmation gate (>10,000 chips)
        if (amount >= 10000 && !buyInConfirmed) {
            setBuyInPendingAmount(amount);
            return; // Show confirmation UI instead of blocking prompt
        }
        setBuyInConfirmed(false);
        setBuyInPendingAmount(null);

        isProcessingRef.current = true;
        setProcessing(true);
        // OPT-3: Optimistic diamond decrement
        const previousDiamonds = diamondBalance;
        setDiamondBalance(prev => prev - diamondCost);
        try {
            const result = await apiCall('/api/club-arena/buyin', {
                clubId: club.id,
                chipAmount: amount,
            });

            showToast(`Bought ${amount.toLocaleString()} chips for ${diamondCost} 💎`, 'success');
            haptic('success');
            playSound('buyin');
            setShowBuyInModal(false);
            setBuyInAmount('');
            busEmit.dataMutated('chips_minted');
            loadData();

            // ENH-5: Quick Re-Buy — show pill for 60s
            setLastBuyInAmount(amount);
            setReBuyVisible(true);
            if (reBuyTimerRef.current) clearTimeout(reBuyTimerRef.current);
            reBuyTimerRef.current = setTimeout(() => setReBuyVisible(false), 60000);

            // Broadcast chip balance change to other tabs
            try {
                const bc = new BroadcastChannel('smarter_poker_chips_sync');
                bc.postMessage('refresh');
                bc.close();
            } catch (e) { }
        } catch (e) {
            // Rollback diamond balance
            setDiamondBalance(previousDiamonds);
            showToast(e.message || 'Buy-in failed. Try again.', 'error');
        } finally {
            setProcessing(false);
            isProcessingRef.current = false;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // LEAVE CLUB: Player voluntarily exits — chips returned to treasury
    // ═══════════════════════════════════════════════════════════════════════════
    const handleLeaveClub = async () => {
        if (!club?.id || isProcessingRef.current) return;
        isProcessingRef.current = true;
        setLeavePending(true);
        try {
            const result = await apiCall('/api/club-arena/leave-club', { clubId: club.id });
            showToast(result.message || 'You have left the club. Redirecting...', 'success');
            setTimeout(() => router.push('/hub/club-arena'), 2000);
        } catch (e) {
            showToast(e.message || 'Failed to leave club', 'error');
        } finally {
            setLeavePending(false);
            isProcessingRef.current = false;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // CASH-OUT: Club Chips * Diamonds
    // ═══════════════════════════════════════════════════════════════════════════
    const handleCashOut = async () => {
        if (isProcessingRef.current) return;

        let amount = cashOutAmount === 'All' ? chipBalance : parseInt(cashOutAmount);
        if (!amount || amount <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }
        if (amount > chipBalance) {
            showToast(`Max cashout is ${chipBalance.toLocaleString()} chips`, 'error');
            return;
        }

        isProcessingRef.current = true;
        setProcessing(true);
        // Optimistic State Update
        const previousBalance = chipBalance;
        setChipBalance(prev => prev - amount);
        setShowCashOutModal(false);
        setCashOutAmount('');

        try {
            const result = await apiCall('/api/club-arena/request-cashout', {
                clubId: club.id,
                amount,
            });

            showToast(result.message || `Cashout request sent! ${amount.toLocaleString()} chips held.`, 'success');
            haptic('success');
            playSound('cashout');
            busEmit.dataMutated('cashout_requested');
            loadData();

            // Broadcast chip balance change to other tabs
            try {
                const bc = new BroadcastChannel('smarter_poker_chips_sync');
                bc.postMessage('refresh');
                bc.close();
            } catch (e) { }
        } catch (e) {
            // Rollback
            setChipBalance(previousBalance);
            showToast(e.message || 'Cash-out failed. Try again.', 'error');
        } finally {
            setProcessing(false);
            isProcessingRef.current = false;
        }
    };

    // ── Transfer chips handler ─────────────────────────────────────────────
    const handleTransfer = async () => {
        if (isProcessingRef.current) return;
        if (!transferRecipient || !transferAmount) return;
        const amount = Math.floor(Number(transferAmount));
        if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
        if (amount > (chipBalance || 0)) { showToast('Insufficient chips', 'error'); return; }

        isProcessingRef.current = true;
        setProcessing(true);
        // Optimistic State Update
        const previousBalance = chipBalance;
        setChipBalance(prev => prev - amount);
        setShowTransferModal(false);
        const modalState = { recipient: transferRecipient, amount, note: transferNote };
        setTransferRecipient(''); setTransferAmount(''); setTransferNote('');

        try {
            await apiCall('/api/club-arena/transfer-chips', {
                clubId: club.id, toUserId: modalState.recipient, amount: modalState.amount,
                note: modalState.note.trim() || undefined,
            });
            // OPT-8: Include recipient display name in success toast
            const recipientMember = clubMembers.find(m => m.user_id === modalState.recipient);
            const recipientName = recipientMember?.profiles?.display_name || 'Player';
            showToast(`${modalState.amount.toLocaleString()} chips sent to ${recipientName}!`, 'success');
            busEmit.dataMutated('chips_distributed');
            loadData();
        } catch (e) {
            // Rollback
            setChipBalance(previousBalance);
            showToast(e.message || 'Transfer failed', 'error');
        } finally {
            setProcessing(false);
            isProcessingRef.current = false;
        }
    };

    const loadTransferMembers = async () => {
        if (!club?.id) return;
        const { data } = await supabase
            .from('club_members')
            .select('user_id, role, profiles(display_name, player_number)')
            .eq('club_id', club.id).eq('status', 'active').limit(100);
        setClubMembers((data || []).filter(m => m.user_id !== user?.id));
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

    // ═══════════════════════════════════════════════════════════════════════════
    // P2-ENH-7: Export Transaction History as CSV
    // ═══════════════════════════════════════════════════════════════════════════
    const exportTransactionsCSV = () => {
        if (!transactions.length) return;
        const headers = ['Date', 'Type', 'Amount', 'Notes', 'ID'];
        const rows = transactions.map(tx => [
            tx.created_at ? new Date(tx.created_at).toLocaleString() : '',
            getTransactionLabel(tx.transaction_type),
            tx.amount || 0,
            (tx.notes || '').replace(/,/g, ';'),
            tx.id || '',
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cashier_transactions_${club?.club_id || 'club'}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Transactions exported to CSV!');
    };

    // P2-ENH-9: IntersectionObserver for auto-prefetch
    const loadMoreRef = useRef(null);
    useEffect(() => {
        if (!loadMoreRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setTxPage(p => p + 1); },
            { rootMargin: '200px' }
        );
        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [transactions.length, txFilter, txPage]);

    // P2-ENH-10: Swipe-to-Cancel state
    const [swipedCashoutId, setSwipedCashoutId] = useState(null);
    const swipeStartX = useRef(0);

    // P2-ENH-12: Transaction Sound Effects
    const playSound = useCallback((type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') return; // muted
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.08;
            if (type === 'buyin') { osc.frequency.value = 800; osc.type = 'sine'; }
            else if (type === 'cashout') { osc.frequency.value = 500; osc.type = 'triangle'; }
            else { osc.frequency.value = 1200; osc.type = 'sine'; }
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.stop(ctx.currentTime + 0.15);
        } catch (_) { }
    }, []);

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

            <div style={S.page}
                ref={containerRef}
                onTouchStart={(e) => { pullStartY.current = e.touches[0].clientY; pullDelta.current = 0; }}
                onTouchMove={(e) => {
                    if (window.scrollY > 0 || pullRefreshing) return;
                    pullDelta.current = e.touches[0].clientY - pullStartY.current;
                }}
                onTouchEnd={async () => {
                    if (pullDelta.current > 80 && window.scrollY === 0 && !pullRefreshing) {
                        setPullRefreshing(true);
                        haptic('light');
                        await loadData();
                        setPullRefreshing(false);
                    }
                    pullDelta.current = 0;
                }}
                role="main" aria-label="Club Arena Cashier"
            >
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
                    {/* ENH-10: Pull-to-refresh indicator */}
                    {pullRefreshing && (
                        <div style={{ textAlign: 'center', padding: '12px 0', color: FB.textSecondary, fontSize: 13 }}>
                            <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>↻</span> Refreshing...
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn} aria-label="Back to lobby">
                        &#8592; Back to Lobby
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h1 style={S.pageTitle}>Cashier</h1>
                        <NotificationBell userId={user?.id} />
                    </div>

                    {isLoading ? (
                        <div style={S.loading}>
                            {/* OPT-6: Shimmer skeleton */}
                            <div style={{ padding: '20px 0' }}>
                                <div style={{ width: 286, height: 286, background: 'linear-gradient(90deg, #242526 25%, #3A3B3C 50%, #242526 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 16, margin: '0 auto 20px' }} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                                    <div style={{ height: 80, background: 'linear-gradient(90deg, #242526 25%, #3A3B3C 50%, #242526 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 12 }} />
                                    <div style={{ height: 80, background: 'linear-gradient(90deg, #242526 25%, #3A3B3C 50%, #242526 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 12 }} />
                                </div>
                                {[1, 2, 3].map(i => <div key={i} style={{ height: 56, background: 'linear-gradient(90deg, #242526 25%, #3A3B3C 50%, #242526 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 10, marginBottom: 10 }} />)}
                            </div>
                            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes badgePulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.7; } }
@keyframes fadeInSlide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes rakebackGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(75,181,67,0.3); } 50% { box-shadow: 0 0 12px 4px rgba(75,181,67,0.25); } }`}</style>
                        </div>
                    ) : loadError ? (
                        <div style={S.emptyState}>
                            <p style={{ marginBottom: 12 }}>Failed to load cashier data</p>
                            <button onClick={() => loadData()} style={{ ...S.backBtn, background: FB.primary, color: '#fff', border: 'none' }}>Retry</button>
                        </div>
                    ) : !user ? (
                        <div style={S.emptyState}><p>Sign In To Access The Cashier</p></div>
                    ) : !membership ? (
                        <div style={S.emptyState}><p>You're Not A Member Of This Club</p></div>
                    ) : (
                        <>
                            {/* Dynamic Wallet */}
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                                <DynamicWallet
                                    {...walletData}
                                    diamondBalance={walletData.diamondBalance ?? diamondBalance}
                                    chipBalance={walletData.chipBalance ?? chipBalance}
                                    onBuyDiamonds={() => router.push('/hub/diamond-store')}
                                    onOpenBBJ={() => router.push(`/hub/club-arena/lobby?club=${club?.club_id || clubIdParam}#bbj`)}
                                    onTapSlot={(slot) => {
                                        if (slot === 'agent') router.push(`/hub/club-arena/agent-dashboard?club=${club?.club_id || clubIdParam}`);
                                        if (slot === 'clubBank') router.push(`/hub/club-arena/admin?club=${club?.club_id || clubIdParam}`);
                                    }}
                                />
                            </div>

                            <HubErrorBoundary name="AnnouncementsBanner">
                                <ClubAnnouncementBanner clubId={club?.id || clubIdParam} userRole={membership?.role} />
                            </HubErrorBoundary>

                            {/* Action Buttons */}
                            <div style={S.actionGrid} role="group" aria-label="Cashier actions">
                                <button
                                    style={{ ...S.actionBtn, ...(diamondBalance < 38 ? S.actionBtnDisabled : {}) }}
                                    onClick={() => diamondBalance >= 38 && setShowBuyInModal(true)}
                                    disabled={diamondBalance < 38}
                                    aria-label={diamondBalance < 38 ? 'Buy Chips - insufficient diamonds' : 'Buy Chips'}
                                >
                                    Buy Chips
                                </button>
                                <button
                                    style={{ ...S.actionBtn, background: FB.success, ...(chipBalance < 100 ? S.actionBtnDisabled : {}), position: 'relative' }}
                                    onClick={() => chipBalance >= 100 && setShowCashOutModal(true)}
                                    disabled={chipBalance < 100}
                                    aria-label={chipBalance < 100 ? 'Cash Out - minimum 100 chips' : 'Cash Out'}
                                >
                                    Cash Out
                                    {/* ENH-4: Smart Notification Badge */}
                                    {pendingCashouts.some(c => c.status === 'approved') && (
                                        <span style={{
                                            position: 'absolute', top: -4, right: -4, width: 12, height: 12,
                                            borderRadius: '50%', background: '#FF3B30',
                                            boxShadow: '0 0 6px rgba(255,59,48,0.6)',
                                            animation: 'badgePulse 1.5s ease-in-out infinite',
                                        }} />
                                    )}
                                </button>
                            </div>

                            {/* ENH-5: Quick Re-Buy Pill */}
                            {reBuyVisible && lastBuyInAmount && (
                                <button
                                    onClick={() => { setBuyInAmount(String(lastBuyInAmount)); setShowBuyInModal(true); setReBuyVisible(false); }}
                                    style={{
                                        width: '100%', padding: '12px 16px', marginBottom: 12,
                                        background: 'linear-gradient(135deg, rgba(35,116,225,0.12), rgba(35,116,225,0.06))',
                                        border: '1px solid rgba(35,116,225,0.3)', borderRadius: 10,
                                        color: FB.primary, fontSize: 14, fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', gap: 8,
                                        animation: 'fadeInSlide 0.3s ease',
                                    }}
                                >
                                    🔁 Re-Buy {lastBuyInAmount.toLocaleString()} Chips
                                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>· Tap to repeat</span>
                                </button>
                            )}

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
                                        <div key={co.id} style={{ position: 'relative', overflow: 'hidden', marginBottom: '8px', borderRadius: '8px' }}>
                                            <div style={{
                                                position: 'absolute', right: 0, top: 0, bottom: 0, width: '90px',
                                                background: '#FA383E', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', zIndex: 0,
                                                borderRadius: '0 8px 8px 0'
                                            }} onClick={() => {
                                                // Handle cancel logic here
                                                setSwipedCashoutId(null);
                                                showToast('Cancel functionality pending', 'error');
                                            }}>
                                                Cancel
                                            </div>
                                            <div
                                                onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
                                                onTouchMove={(e) => {
                                                    const delta = swipeStartX.current - e.touches[0].clientX;
                                                    if (delta > 80 && co.status === 'pending') setSwipedCashoutId(co.id);
                                                    else if (delta < -40) setSwipedCashoutId(null);
                                                }}
                                                style={{
                                                    ...S.listItem,
                                                    marginBottom: 0,
                                                    border: `1px solid ${co.status === 'approved' ? FB.success : '#F5A623'}`,
                                                    background: co.status === 'approved' ? '#2a352a' : '#332f22',
                                                    transition: 'transform 0.2s ease',
                                                    transform: swipedCashoutId === co.id ? 'translateX(-90px)' : 'translateX(0)',
                                                    position: 'relative', zIndex: 1
                                                }} role="listitem" aria-label={`Cashout ${co.status}: ${co.amount} chips`}>
                                                {/* ENH-2: Cashout 3-step progress tracker */}
                                                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 0 }}>
                                                    {['Requested', 'Approved', 'Completed'].map((step, idx) => {
                                                        const activeIdx = co.status === 'completed' ? 2 : co.status === 'approved' ? 1 : 0;
                                                        const isActive = idx <= activeIdx;
                                                        return (
                                                            <div key={step} style={{ display: 'flex', alignItems: 'center', flex: idx < 2 ? 1 : 'none' }}>
                                                                <div style={{
                                                                    width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 800,
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                                    background: isActive ? (idx === 2 ? FB.success : FB.primary) : FB.hover,
                                                                    color: isActive ? '#fff' : FB.textSecondary,
                                                                    border: `2px solid ${isActive ? (idx === 2 ? FB.success : FB.primary) : FB.border}`,
                                                                }}>{idx + 1}</div>
                                                                <div style={{ fontSize: 9, color: isActive ? FB.textPrimary : FB.textSecondary, marginLeft: 4, fontWeight: isActive ? 700 : 400 }}>{step}</div>
                                                                {idx < 2 && <div style={{ flex: 1, height: 2, background: isActive && idx < activeIdx ? FB.primary : FB.border, margin: '0 6px' }} />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '14px', fontWeight: 600, color: FB.textPrimary }}>
                                                        {co.status === 'pending' ? '⏳ Awaiting Agent Approval' : '✅ Approved'}
                                                    </div>
                                                    <div style={S.txDate}>
                                                        {co.created_at ? new Date(co.created_at).toLocaleString() : 'N/A'}
                                                        {co.agent_note ? ` · ${co.agent_note}` : ''}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{
                                                        fontSize: '16px', fontWeight: 700,
                                                        color: co.status === 'approved' ? FB.success : '#F5A623',
                                                    }}>
                                                        {(co.amount || 0).toLocaleString()}
                                                    </div>
                                                    {co.status === 'pending' && (
                                                        <button
                                                            onClick={async () => {
                                                                if (isProcessingRef.current || processing) return;
                                                                isProcessingRef.current = true;
                                                                setProcessing(true);
                                                                // OPT-4: Optimistic removal from pending list
                                                                const prevPending = [...pendingCashouts];
                                                                setPendingCashouts(prev => prev.filter(p => p.id !== co.id));
                                                                try {
                                                                    const result = await apiCall('/api/club-arena/cancel-my-cashout', { cashoutId: co.id });
                                                                    showToast(result.message || 'Cashout cancelled — chips returned', 'success');
                                                                    busEmit.dataMutated('cashout_cancelled');
                                                                    loadData();
                                                                } catch (e) {
                                                                    // Rollback
                                                                    setPendingCashouts(prevPending);
                                                                    showToast(e.message || 'Cancel failed', 'error');
                                                                } finally { setProcessing(false); isProcessingRef.current = false; }
                                                            }}
                                                            disabled={processing}
                                                            style={{
                                                                background: 'rgba(250,56,62,0.1)', border: '1px solid rgba(250,56,62,0.3)',
                                                                color: '#FA383E', borderRadius: 6, padding: '4px 10px',
                                                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                                opacity: processing ? 0.5 : 1,
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    )}
                                                </div>
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
                                                if (isProcessingRef.current || processing) return;
                                                isProcessingRef.current = true;
                                                setProcessing(true);
                                                try {
                                                    const result = await apiCall('/api/club-arena/rakeback', { action: 'claim', clubId: club.id });
                                                    showToast(`Claimed ${result.claimed?.toLocaleString()} chips rakeback!`);
                                                    busEmit.dataMutated('rakeback_distributed');
                                                    loadData();
                                                } catch (e) {
                                                    showToast(e.message || 'Claim failed', 'error');
                                                } finally { setProcessing(false); isProcessingRef.current = false; }
                                            }}
                                            disabled={processing}
                                            style={{
                                                width: '100%', padding: '12px', background: '#4BB543', color: '#fff',
                                                border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '15px',
                                                cursor: processing ? 'not-allowed' : 'pointer',
                                                opacity: processing ? 0.5 : 1,
                                            }}
                                        >
                                            {processing ? 'Claiming...' : `Claim ${rakebackInfo.pendingRakeback.toLocaleString()} Chips`}
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

                            {/* Send Chips to Another Player */}
                            <div style={{ marginBottom: '24px' }}>
                                <h2 style={S.sectionTitle}>Send Chips</h2>
                                <button
                                    onClick={() => { setShowTransferModal(true); loadTransferMembers(); }}
                                    style={{
                                        width: '100%', padding: '14px', borderRadius: '10px',
                                        background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.25)',
                                        color: '#2374E1', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                                    }}
                                    aria-label="Send chips to a club member"
                                >
                                    💸 Send Chips to a Club Member
                                </button>
                            </div>

                            {/* ENH-7: Chip Flow Mini-Chart (7-day sparkline) */}
                            {transactions.length > 0 && (() => {
                                const now = Date.now();
                                const dayMs = 86400000;
                                const days = Array.from({ length: 7 }, (_, i) => {
                                    const dayStart = now - (6 - i) * dayMs;
                                    const dayEnd = dayStart + dayMs;
                                    let inflow = 0, outflow = 0;
                                    transactions.forEach(tx => {
                                        const t = new Date(tx.created_at).getTime();
                                        if (t >= dayStart && t < dayEnd) {
                                            if ((tx.amount || 0) >= 0) inflow += tx.amount || 0;
                                            else outflow += Math.abs(tx.amount || 0);
                                        }
                                    });
                                    return { inflow, outflow, label: new Date(dayStart).toLocaleDateString('en', { weekday: 'short' }) };
                                });
                                const maxVal = Math.max(...days.map(d => Math.max(d.inflow, d.outflow)), 1);
                                return (
                                    <div style={{ marginBottom: 20, background: FB.cardBg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${FB.border}` }}>
                                        <h2 style={{ ...S.sectionTitle, marginBottom: 10 }}>7-Day Chip Flow</h2>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 60 }} role="img" aria-label="7-day chip flow chart">
                                            {days.map((d, i) => (
                                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                                    <div style={{ width: '100%', display: 'flex', gap: 1, alignItems: 'flex-end', height: 44 }}>
                                                        <div style={{ flex: 1, background: FB.success, borderRadius: '3px 3px 0 0', height: `${Math.max((d.inflow / maxVal) * 44, d.inflow > 0 ? 3 : 0)}px`, transition: 'height 0.3s ease' }} title={`In: ${d.inflow.toLocaleString()}`} />
                                                        <div style={{ flex: 1, background: FB.danger, borderRadius: '3px 3px 0 0', height: `${Math.max((d.outflow / maxVal) * 44, d.outflow > 0 ? 3 : 0)}px`, transition: 'height 0.3s ease' }} title={`Out: ${d.outflow.toLocaleString()}`} />
                                                    </div>
                                                    <div style={{ fontSize: 9, color: FB.textSecondary, fontWeight: 600 }}>{d.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: FB.textSecondary }}>
                                            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: FB.success, marginRight: 4 }} />In</span>
                                            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: FB.danger, marginRight: 4 }} />Out</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ENH-3: Monthly P&L Summary Card */}
                            {transactions.length > 0 && (() => {
                                const now = new Date();
                                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                                let monthIn = 0, monthOut = 0, allIn = 0, allOut = 0;
                                transactions.forEach(tx => {
                                    const amt = tx.amount || 0;
                                    const txDate = new Date(tx.created_at);
                                    if (amt >= 0) { allIn += amt; if (txDate >= monthStart) monthIn += amt; }
                                    else { allOut += Math.abs(amt); if (txDate >= monthStart) monthOut += Math.abs(amt); }
                                });
                                const monthNet = monthIn - monthOut;
                                const allNet = allIn - allOut;
                                return (
                                    <div style={{ marginBottom: 16, background: FB.cardBg, borderRadius: 12, border: `1px solid ${FB.border}`, overflow: 'hidden' }}>
                                        <button
                                            onClick={() => setShowPnL(!showPnL)}
                                            style={{
                                                width: '100%', padding: '14px 16px', background: 'none', border: 'none',
                                                color: FB.textPrimary, display: 'flex', justifyContent: 'space-between',
                                                alignItems: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                                            }}
                                        >
                                            <span>📊 Monthly P&L Summary</span>
                                            <span style={{ fontSize: 20, fontWeight: 800, color: monthNet >= 0 ? FB.success : FB.danger }}>
                                                {monthNet >= 0 ? '+' : ''}{monthNet.toLocaleString()}
                                                <span style={{ fontSize: 11, color: FB.textSecondary, marginLeft: 8 }}>{showPnL ? '▲' : '▼'}</span>
                                            </span>
                                        </button>
                                        {showPnL && (
                                            <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                                <div style={{ background: 'rgba(49,162,76,0.08)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: 10, color: FB.textSecondary, marginBottom: 2 }}>THIS MONTH IN</div>
                                                    <div style={{ fontSize: 18, fontWeight: 800, color: FB.success }}>+{monthIn.toLocaleString()}</div>
                                                </div>
                                                <div style={{ background: 'rgba(250,56,62,0.08)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: 10, color: FB.textSecondary, marginBottom: 2 }}>THIS MONTH OUT</div>
                                                    <div style={{ fontSize: 18, fontWeight: 800, color: FB.danger }}>-{monthOut.toLocaleString()}</div>
                                                </div>
                                                <div style={{ gridColumn: '1 / -1', background: FB.hover, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: 10, color: FB.textSecondary, marginBottom: 2 }}>ALL-TIME NET</div>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: allNet >= 0 ? FB.success : FB.danger }}>
                                                        {allNet >= 0 ? '+' : ''}{allNet.toLocaleString()} chips
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Transaction History */}
                            <h2 style={S.sectionTitle}>Transaction History</h2>

                            {/* ENH-2: Transaction Category Filter Pills */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                                {[{ key: 'all', label: 'All' }, { key: 'buyin', label: 'Buy-Ins' }, { key: 'cashout', label: 'Cashouts' }, { key: 'transfer', label: 'Transfers' }, { key: 'rake', label: 'Rake' }].map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => { setTxFilter(f.key); setTxPage(1); }}
                                        style={{
                                            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                            border: txFilter === f.key ? `2px solid ${FB.primary}` : `1px solid ${FB.border}`,
                                            background: txFilter === f.key ? 'rgba(35,116,225,0.15)' : FB.cardBg,
                                            color: txFilter === f.key ? FB.primary : FB.textSecondary,
                                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {/* Date Filter Row */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                                {[{ key: 'all', label: 'All Time' }, { key: 'today', label: 'Today' }, { key: 'week', label: 'This Week' }, { key: 'month', label: 'This Month' }].map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => { setTxDateFilter(f.key); setTxPage(1); }}
                                        style={{
                                            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                            border: txDateFilter === f.key ? `2px solid ${FB.primary}` : `1px solid ${FB.border}`,
                                            background: txDateFilter === f.key ? 'rgba(35,116,225,0.15)' : FB.cardBg,
                                            color: txDateFilter === f.key ? FB.primary : FB.textSecondary,
                                            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            {(() => {
                                const filterMap = {
                                    all: () => true,
                                    buyin: tx => ['buyin', 'deposit'].includes(tx.transaction_type),
                                    cashout: tx => ['cashout', 'withdrawal'].includes(tx.transaction_type),
                                    transfer: tx => ['transfer_in', 'transfer_out', 'send', 'receive'].includes(tx.transaction_type),
                                    rake: tx => ['rake', 'rakeback'].includes(tx.transaction_type),
                                };
                                // Date filter thresholds
                                let dateThreshold = null;
                                if (txDateFilter === 'today') {
                                    const t = new Date(); t.setHours(0, 0, 0, 0); dateThreshold = t;
                                } else if (txDateFilter === 'week') {
                                    const t = new Date(); t.setDate(t.getDate() - 7); dateThreshold = t;
                                } else if (txDateFilter === 'month') {
                                    const t = new Date(); t.setMonth(t.getMonth() - 1); dateThreshold = t;
                                }
                                const filtered = transactions
                                    .filter(filterMap[txFilter] || (() => true))
                                    .filter(tx => !dateThreshold || (tx.created_at && new Date(tx.created_at) >= dateThreshold));
                                return filtered.length > 0 ? (
                                    <>
                                        {filtered.slice(0, txPage * TX_PAGE_SIZE).map((tx, i) => {
                                            const txIcons = {
                                                buyin: '➕', deposit: '➕', withdrawal: '➖', cashout: '💳',
                                                win: '🏆', loss: '📉', rake: '🎰', send: '➡️', receive: '⬅️',
                                                purchase: '🛍️', rakeback: '🎁', bonus: '⭐', promo: '🎨',
                                                transfer_in: '⬅️', transfer_out: '➡️', admin_credit: '⭐',
                                            };
                                            const icon = txIcons[tx.transaction_type] || '💱';
                                            const isPos = (tx.amount || 0) >= 0;
                                            const isExpanded = expandedTx === (tx.id || i);
                                            return (
                                                <div key={tx.id || i}
                                                    onClick={() => setExpandedTx(isExpanded ? null : (tx.id || i))}
                                                    style={{ ...S.listItem, gap: '10px', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'background 0.15s' }}
                                                    role="button" aria-expanded={isExpanded} aria-label={`${getTransactionLabel(tx.transaction_type)}: ${tx.amount} chips`}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
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
                                                    {/* ENH-6: Expanded transaction detail */}
                                                    {isExpanded && (
                                                        <div style={{ width: '100%', paddingTop: 8, borderTop: `1px solid ${FB.border}`, fontSize: 12, color: FB.textSecondary, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                                                            <div><strong style={{ color: FB.textPrimary }}>Type:</strong> {getTransactionLabel(tx.transaction_type)}</div>
                                                            <div><strong style={{ color: FB.textPrimary }}>Amount:</strong> {(tx.amount || 0).toLocaleString()}</div>
                                                            {tx.notes && <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: FB.textPrimary }}>Note:</strong> {tx.notes}</div>}
                                                            <div><strong style={{ color: FB.textPrimary }}>Date:</strong> {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}</div>
                                                            {tx.id && <div><strong style={{ color: FB.textPrimary }}>ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{tx.id.slice(0, 8)}…</span></div>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {/* OPT-5: Load More pagination with IntersectionObserver */}
                                        {filtered.length > txPage * TX_PAGE_SIZE && (
                                            <button
                                                ref={loadMoreRef}
                                                onClick={() => setTxPage(p => p + 1)}
                                                style={{
                                                    width: '100%', padding: '12px', marginTop: 8,
                                                    background: FB.hover, border: `1px solid ${FB.border}`,
                                                    borderRadius: 8, color: FB.primary, fontWeight: 700,
                                                    fontSize: 13, cursor: 'pointer',
                                                }}
                                            >
                                                Load More ({filtered.length - txPage * TX_PAGE_SIZE} remaining)
                                            </button>
                                        )}
                                        {/* P2-ENH-7: Export CSV */}
                                        {filtered.length > 0 && (
                                            <button
                                                onClick={exportTransactionsCSV}
                                                style={{
                                                    width: '100%', padding: '10px', marginTop: 10,
                                                    background: 'none', border: `1px solid ${FB.border}`,
                                                    borderRadius: 8, color: FB.textSecondary, fontWeight: 600,
                                                    fontSize: 12, cursor: 'pointer',
                                                }}
                                            >
                                                💾 Export Transactions (CSV)
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <div style={S.emptyState}>
                                        <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}></span>
                                        <p>{txFilter === 'all' ? 'No Transactions Yet' : `No ${txFilter} transactions`}</p>
                                    </div>
                                );
                            })()}
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
 TRANSFER CHIPS MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {showTransferModal && (
                <div style={S.modalOverlay} onClick={() => !processing && setShowTransferModal(false)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Send Chips</span>
                            <button style={S.modalClose} onClick={() => !processing && setShowTransferModal(false)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <label style={S.modalLabel}>Recipient</label>
                            <select
                                value={transferRecipient}
                                onChange={e => setTransferRecipient(e.target.value)}
                                style={{ ...S.modalInput, padding: '12px', cursor: 'pointer' }}
                            >
                                <option value="">Select a member...</option>
                                {clubMembers.map(m => (
                                    <option key={m.user_id} value={m.user_id}>
                                        {m.profiles?.display_name || 'Player'} {m.profiles?.player_number ? `#${m.profiles.player_number}` : ''} ({m.role})
                                    </option>
                                ))}
                            </select>

                            <label style={{ ...S.modalLabel, marginTop: 12 }}>Amount</label>
                            <input
                                type="number"
                                value={transferAmount}
                                onChange={e => setTransferAmount(e.target.value)}
                                placeholder="Enter Amount"
                                style={S.modalInput}
                                min="1"
                                max={chipBalance || 0}
                            />
                            <div style={{ fontSize: 11, color: FB.textSecondary, marginTop: 4, marginBottom: 8 }}>
                                Available: {(chipBalance || 0).toLocaleString()} chips
                            </div>

                            <label style={S.modalLabel}>Note (optional)</label>
                            <input
                                type="text"
                                value={transferNote}
                                onChange={e => setTransferNote(e.target.value)}
                                placeholder="What's this for?"
                                style={S.modalInput}
                                maxLength={100}
                            />
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                style={{ ...S.modalSubmit, opacity: (processing || !transferRecipient || !transferAmount) ? 0.5 : 1 }}
                                onClick={handleTransfer}
                                disabled={processing || !transferRecipient || !transferAmount}
                            >
                                {processing ? 'Sending...' : `Send ${transferAmount ? Number(transferAmount).toLocaleString() : '0'} Chips`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            {buyInPendingAmount ? (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: '#FFA726', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                                        ⚠️ Large transaction: {buyInPendingAmount.toLocaleString()} chips for {getDiamondCost(buyInPendingAmount)} 💎
                                    </div>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button
                                            style={{ ...S.modalSubmit, flex: 1, background: '#3E4042' }}
                                            onClick={() => { setBuyInPendingAmount(null); setBuyInConfirmed(false); }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            style={{ ...S.modalSubmit, flex: 1 }}
                                            onClick={() => { setBuyInConfirmed(true); setBuyInPendingAmount(null); setTimeout(() => handleBuyIn(), 50); }}
                                        >
                                            Confirm Purchase
                                        </button>
                                    </div>
                                </div>
                            ) : (
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
                            )}
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

            {/* Toast Notification — ENH-3 action button support */}
            {toast && (
                <div style={{
                    ...S.toast,
                    background: toast.type === 'error' ? FB.danger : FB.success,
                    color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 10,
                }} role="alert" aria-live="polite">
                    <span style={{ flex: 1 }}>{toast.message}</span>
                    {toast.action && (
                        <button
                            onClick={toast.action.onClick}
                            style={{
                                background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
                                color: '#fff', borderRadius: 6, padding: '4px 12px', fontSize: 12,
                                fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                        >
                            {toast.action.label}
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
