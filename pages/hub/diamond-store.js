/* ═══════════════════════════════════════════════════════════════════════════
   🔒 LOCKED PAGE: FUTURISTIC METAL DESIGN
   ═══════════════════════════════════════════════════════════════════════════
   ATTENTION ALL AI AGENTS & DEVELOPERS:
   1. DO NOT revert this page to the legacy plain text / emoji design.
   2. DO NOT overwrite this file with stale code from old sessions.
   3. DO NOT run blanket "Daily update" bulk commits that touch this file.
   4. This page uses dynamic image overlays (`diamond-store-checkout.png`). 
      Preserve the clickable zone coordinates.
   ═══════════════════════════════════════════════════════════════════════════ */

import dynamic from 'next/dynamic';
const ShoppingCart = dynamic(() => import('../../src/components/store/ShoppingCart'), { ssr: false });
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';

// God-Mode Stack
import useCartStore from '../../src/stores/cartStore';
import supabase from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { broadcastSync, listenBroadcast } from '../../src/lib/broadcastSync';
import { getAccessToken, getAuthUser } from '../../src/lib/authUtils';
import { showStoreToast } from '../../src/components/store/StoreToast';
import { busEmit } from '../../src/engine/EventBus';

const PageTransition = dynamic(() => import('../../src/components/transitions/PageTransition'), { ssr: false });
const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), { ssr: false });
const BottomNavBar = dynamic(() => import('../../src/components/ui/BottomNavBar'), { ssr: false });
import {
    Gem, Crown, ShoppingBag, Trophy, Gamepad2,
    Coins, Home, Package, Wrench, Search,
    Gift, ShoppingCart as CartIcon, AlertTriangle,
    CheckCircle, Trash2,
} from 'lucide-react';
const StoreToast = dynamic(() => import('../../src/components/store/StoreToast'), { ssr: false });
import { PackageCard, VIPCard, MerchCard } from '../../src/components/store/StoreCards';

import {
    STANDARD_REWARDS,
    EASTER_EGGS,
    DIAMOND_PACKAGES,
    VIP_MEMBERSHIP,
    VIP_BENEFITS,
    MERCHANDISE
} from '../../src/data/diamondStoreData';

// PackageCard, VIPCard, MerchCard — extracted to src/components/store/StoreCards.js

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAMOND STORE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function DiamondStorePage() {
    const bus = useTrainingBus('diamond-store');
    const router = useRouter();

    // Persisted filters for activeTab and rewardsSubTab
    const { filters, setFilter } = usePersistedFilters('diamond-store', {
        activeTab: 'diamonds',
        rewardsSubTab: 'overview'
    });

    const activeTab = filters.activeTab;
    const rewardsSubTab = filters.rewardsSubTab;
    const setActiveTab = (val) => setFilter('activeTab', val);
    const setRewardsSubTab = (val) => setFilter('rewardsSubTab', val);

    const [selectedPackage, setSelectedPackage] = useState('standard');
    const [selectedVIP, setSelectedVIP] = useState('vip-monthly');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isVip, setIsVip] = useState(false);
    const [diamondMultiplier, setDiamondMultiplier] = useState(1.0);

    const [user, setUser] = useState(null);

    // ═══ Club Shop State ═══
    const [clubShopItems, setClubShopItems] = useState([]);
    const [clubShopPurchases, setClubShopPurchases] = useState([]);
    const [clubChipBalance, setClubChipBalance] = useState(0);
    const [clubShopLoading, setClubShopLoading] = useState(false);
    const [clubShopLoaded, setClubShopLoaded] = useState(false);
    const [clubShopBuyTarget, setClubShopBuyTarget] = useState(null);
    const [clubShopProcessing, setClubShopProcessing] = useState(false);
    const [clubShopCategory, setClubShopCategory] = useState('All');
    const [clubShopSearch, setClubShopSearch] = useState('');
    const [clubShopSubTab, setClubShopSubTab] = useState('store');
    const [clubShopClubId, setClubShopClubId] = useState(null);
    const [clubShopRole, setClubShopRole] = useState('player');
    const [clubShopSuccess, setClubShopSuccess] = useState(null);
    const [clubShopSortMode, setClubShopSortMode] = useState('newest');
    // Admin Manage state
    const [clubShopAdminItems, setClubShopAdminItems] = useState([]);
    const [clubShopAdminLoaded, setClubShopAdminLoaded] = useState(false);
    const [clubShopNewName, setClubShopNewName] = useState('');
    const [clubShopNewPrice, setClubShopNewPrice] = useState('');
    const [clubShopNewDesc, setClubShopNewDesc] = useState('');
    const [clubShopNewCategory, setClubShopNewCategory] = useState('Time Banks');
    const [clubShopNewImage, setClubShopNewImage] = useState('');
    const [clubShopLastCreate, setClubShopLastCreate] = useState(0);
    const clubShopLoadingRef = useRef(false);

    // Check VIP status on mount
    useEffect(() => {
        const _c = new AbortController();

        (async () => {
            const authUser = getAuthUser();
            if (authUser?.id) {
                setUser(authUser);
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('is_vip, diamond_multiplier')
                    .eq('id', authUser.id)
                    .maybeSingle();
                setIsVip(!!profile?.is_vip);
                if (profile?.diamond_multiplier) setDiamondMultiplier(Number(profile.diamond_multiplier));
            }
        })();
        return () => _c.abort();
    }, []);
    // Realtime subscription — live updates (read actual VIP status from payload)
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`dstore:${user?.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user?.id}` }, (payload) => {
                if (payload.new?.is_vip !== undefined) {
                    setIsVip(!!payload.new.is_vip);
                }
                if (payload.new?.diamond_multiplier !== undefined) {
                    setDiamondMultiplier(Number(payload.new.diamond_multiplier));
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id]);

    // Cross-tab diamond purchase sync — refresh balance when another tab purchases
    useEffect(() => {
        const cleanup = listenBroadcast('smarter_poker_diamond_sync', () => {
            // Another tab purchased diamonds — refresh VIP status
            if (user?.id) {
                supabase.from('profiles').select('is_vip, diamond_balance').eq('id', user.id).maybeSingle()
                    .then(({ data }) => {
                        if (data) setIsVip(!!data.is_vip);
                    });
            }
        });
        return cleanup;
    }, [user?.id]);

    // 🎬 INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    // NOTE: Always initialize to false (server-safe) to prevent hydration mismatch.
    // Read sessionStorage in useEffect after client mount.
    const [showIntro, setShowIntro] = useState(false);
    const introVideoRef = useRef(null);

    // After mount: check if user has seen the intro already
    useEffect(() => {
        try {
            if (!sessionStorage.getItem('marketplace-intro-seen')) {
                setShowIntro(true);
            }
        } catch (_) {}
    }, []);

    // Mark intro as seen when it ends
    const handleIntroEnd = useCallback(() => {
        sessionStorage.setItem('marketplace-intro-seen', 'true');
        setShowIntro(false);
    }, []);

    // Attempt to unmute video after it starts playing
    const handleIntroPlay = useCallback(() => {
        if (introVideoRef.current) {
            introVideoRef.current.muted = false;
        }
    }, []);

    const { addItem } = useCartStore();

    // Add diamond package to cart (with haptic feedback)
    const handleAddToCart = (pkg) => {
        // Haptic feedback — short vibration pulse on mobile
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(50);
        }

        addItem({
            id: `diamond-${pkg.id}`,
            name: pkg.name,
            type: 'diamonds',
            diamonds: pkg.diamonds,
            bonus: pkg.bonus || 0,
            price: pkg.price,
            quantity: 1
        });
    };

    // Handle checkout from cart
    const handleCheckout = async (items) => {
        setIsProcessing(true);

        try {
            const token = getAccessToken();

            if (!token) {
                showStoreToast('error', 'Please sign in to complete your purchase');
                setIsProcessing(false);
                return;
            }

            // Create checkout session
            const response = await fetch('/api/store/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: 'diamonds',
                    items: items.map(item => ({
                        name: item.name,
                        diamonds: item.diamonds,
                        bonus: item.bonus,
                        price: item.price,
                        quantity: item.quantity
                    }))
                })
            });

            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error?.message || 'Failed to create checkout session');
            }

            // Redirect to Stripe Checkout
            window.location.href = data.data.url;

        } catch (error) {
            console.warn('Checkout error:', error);
            showStoreToast('error', error.message || 'Failed to start checkout. Please try again.');
            setIsProcessing(false);
        }
    };

    // VIP subscription — adds to cart (allows monthly→annual upgrade)
    const handleVIPSubscribe = async () => {
        const plan = selectedVIP === 'vip-daily' ? VIP_MEMBERSHIP.daily :
            selectedVIP === 'vip-monthly' ? VIP_MEMBERSHIP.monthly : VIP_MEMBERSHIP.annual;

        // Haptic feedback
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(50);
        }

        if (plan.isDiamondCost) {
            const token = getAccessToken();
            if (!token || !user?.id) {
                showStoreToast('error', 'Please sign in to purchase VIP.');
                return;
            }
            if (confirm(`Purchase 1-Day VIP Access for ${plan.price} Diamonds?`)) {
                setIsProcessing(true);
                try {
                    const res = await fetch('/api/store/purchase-daily-vip', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    if (!res.ok) throw new Error(`Request failed (${res.status})`);
                    const data = await res.json();
                    if (data.success) {
                        showStoreToast('success', 'VIP Daily Pass Activated! Enjoy your premium features.');
                        setIsVip(true);
                        broadcastSync('smarter_poker_vip_sync', 'refresh_vip');
                        broadcastSync('smarter_poker_diamond_sync', 'refresh');
                    } else {
                        showStoreToast('error', `VIP purchase failed: ${data.error}`);
                    }
                } catch (e) {
                    showStoreToast('error', 'Error purchasing VIP pass: ' + e.message);
                } finally {
                    setIsProcessing(false);
                }
            }
            return;
        }

        addItem({
            id: `vip-${plan.id}`,
            name: plan.name,
            type: 'vip',
            price: plan.price,
            interval: plan.interval,
            quantity: 1
        });
    };

    // Direct diamond package purchase (adds to cart)
    const handleDiamondPurchase = (pkg) => {
        handleAddToCart(pkg);
    };

    const handleMerchPurchase = (itemId) => {
        showStoreToast('info', 'Merchandise store coming soon!');
    };

    // ═══ Club Shop: Load items from marketplace API ═══
    const loadClubShop = useCallback(async (silent = false) => {
        if (clubShopLoadingRef.current) return;
        clubShopLoadingRef.current = true;
        if (!silent) setClubShopLoading(true);
        try {
            const token = getAccessToken();
            if (!token) { clubShopLoadingRef.current = false; setClubShopLoading(false); return; }
            const authUser = getAuthUser();
            if (!authUser?.id) { clubShopLoadingRef.current = false; setClubShopLoading(false); return; }

            // Find user's club
            let targetClub = clubShopClubId;
            if (!targetClub) {
                const { data: mem } = await supabase
                    .from('club_members')
                    .select('club_id')
                    .eq('user_id', authUser.id)
                    .limit(1)
                    .maybeSingle();
                targetClub = mem?.club_id || null;
                if (targetClub) setClubShopClubId(targetClub);
            }
            if (!targetClub) {
                clubShopLoadingRef.current = false;
                setClubShopLoading(false);
                setClubShopLoaded(true);
                return;
            }

            const response = await fetch(`/api/club-arena/marketplace-items?clubId=${targetClub}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error(`Failed to load club shop (${response.status})`);
            const data = await response.json();

            setClubShopItems((data.items || []).map(i => ({
                ...i,
                club_id: targetClub,
                is_active: true,
                purchase_count: i.purchase_count || 0,
            })));
            setClubShopPurchases(data.purchases || []);
            setClubChipBalance(data.balance || 0);
            if (data.role) setClubShopRole(data.role);
            setClubShopLoaded(true);
        } catch (err) {
            console.warn('[Club Shop]', err);
        } finally {
            clubShopLoadingRef.current = false;
            setClubShopLoading(false);
        }
    }, [clubShopClubId]);

    // ═══ Club Shop: Purchase handler ═══
    const handleClubPurchase = async () => {
        if (!clubShopBuyTarget || !clubShopClubId) return;
        setClubShopProcessing(true);
        try {
            const token = getAccessToken();
            if (!token) throw new Error('Not authenticated');

            const idempotencyKey = crypto.randomUUID();
            const response = await fetch('/api/club-arena/marketplace-purchase', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({ clubId: clubShopClubId, itemId: clubShopBuyTarget.id }),
            });
            const responseData = await response.json().catch(() => ({ success: false, error: `HTTP ${response.status}` }));
            if (!responseData.success) throw new Error(responseData.error || 'Purchase failed');

            setClubShopSuccess(`Purchased ${clubShopBuyTarget.name}!`);
            setTimeout(() => setClubShopSuccess(null), 2500);
            setClubChipBalance(responseData.newBalance ?? (clubChipBalance - clubShopBuyTarget.price));
            // Emit bus event so other components (cashier, etc.) update
            broadcastSync('BALANCE_UPDATED', { source: 'club_shop_purchase', clubId: clubShopClubId });
            setClubShopBuyTarget(null);
            clubShopLoadingRef.current = false;
            loadClubShop(true);
        } catch (err) {
            showStoreToast('error', err.message || 'Purchase failed');
        } finally {
            setClubShopProcessing(false);
        }
    };

    // ═══ Club Shop: Admin — load all items (active + hidden) ═══
    const loadClubShopAdmin = useCallback(async () => {
        if (!clubShopClubId) return;
        try {
            const { data } = await supabase
                .from('club_shop_items')
                .select('id, club_id, name, description, price, image_url, category, is_active')
                .eq('club_id', clubShopClubId)
                .order('created_at', { ascending: false });
            let itemsWithCounts = (data || []).map(i => ({ ...i, purchase_count: 0 }));
            if (itemsWithCounts.length > 0) {
                const itemIds = itemsWithCounts.map(i => i.id);
                const { data: countRows } = await supabase
                    .from('club_shop_purchases')
                    .select('item_id')
                    .eq('club_id', clubShopClubId)
                    .in('item_id', itemIds);
                const counts = {};
                (countRows || []).forEach(r => { counts[r.item_id] = (counts[r.item_id] || 0) + 1; });
                itemsWithCounts = itemsWithCounts.map(i => ({ ...i, purchase_count: counts[i.id] || 0 }));
            }
            setClubShopAdminItems(itemsWithCounts);
            setClubShopAdminLoaded(true);
        } catch (err) {
            console.warn('[Club Shop Admin]', err);
        }
    }, [clubShopClubId]);

    const clubShopIsAdmin = ['owner', 'admin'].includes(clubShopRole);

    // ═══ Club Shop: 5-second loading timeout safety ═══
    useEffect(() => {
        if (!clubShopLoading) return;
        const timeout = setTimeout(() => {
            clubShopLoadingRef.current = false;
            setClubShopLoading(false);
        }, 5000);
        return () => clearTimeout(timeout);
    }, [clubShopLoading]);

    // ═══ Club Shop: Real-time Supabase subscriptions ═══
    useEffect(() => {
        if (!clubShopClubId) return;
        const channelKey = `dstore-club-shop-${clubShopClubId}`;
        const channel = supabase.channel(channelKey)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'club_shop_items',
                filter: `club_id=eq.${clubShopClubId}`,
            }, () => {
                clubShopLoadingRef.current = false;
                loadClubShop(true);
                if (clubShopAdminLoaded) loadClubShopAdmin();
            })
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'club_shop_purchases',
                filter: `club_id=eq.${clubShopClubId}`,
            }, () => {
                clubShopLoadingRef.current = false;
                loadClubShop(true);
            })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') console.warn('[Club Shop] Realtime channel error');
            });
        return () => { supabase.removeChannel(channel); };
    }, [clubShopClubId, loadClubShop, clubShopAdminLoaded, loadClubShopAdmin]);

    // ═══ Club Shop: Bus listeners for cross-component balance sync ═══
    useEffect(() => {
        if (!clubShopClubId) return;
        const refresh = () => { clubShopLoadingRef.current = false; loadClubShop(true); };
        const unsubs = [
            listenBroadcast('BALANCE_UPDATED', refresh),
            listenBroadcast('CHIPS_DISTRIBUTED', refresh),
            listenBroadcast('CASHIER_BALANCE_CHANGED', refresh),
        ];
        return () => unsubs.forEach(u => u());
    }, [clubShopClubId, loadClubShop]);

    // ═══ Club Shop: Visibility refresh (tab re-focus) ═══
    useEffect(() => {
        if (!clubShopClubId) return;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && activeTab === 'club-shop') {
                clubShopLoadingRef.current = false;
                loadClubShop(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [clubShopClubId, loadClubShop, activeTab]);

    // Pay with Diamonds handler — deducts from user's diamond balance
    const handlePayWithDiamonds = async (items) => {
        setIsProcessing(true);
        try {
            const token = getAccessToken();
            if (!token || !user?.id) {
                showStoreToast('error', 'Please sign in to pay with diamonds');
                setIsProcessing(false);
                return;
            }

            // Get user's diamond balance
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', user.id)
                .maybeSingle();

            const userDiamonds = profile?.diamonds ?? 0;

            // Calculate total diamond cost (diamond items use their diamond count as the cost)
            const totalDiamondCost = items.reduce((sum, item) => {
                return sum + ((item.diamonds || 0) * (item.quantity || 1));
            }, 0);

            if (userDiamonds < totalDiamondCost) {
                showStoreToast('warning', `Not enough diamonds. You have ${userDiamonds.toLocaleString()} but need ${totalDiamondCost.toLocaleString()}.`);
                setIsProcessing(false);
                return;
            }

            // Deduct diamonds
            const { error } = await supabase.rpc('deduct_diamonds', {
                p_user_id: user.id,
                p_amount: totalDiamondCost,
                p_description: `Diamond Store purchase: ${items.map(i => i.name).join(', ')}`,
                p_transaction_type: 'purchase'
            });

            if (error) throw error;

            showStoreToast('success', `Purchase complete! ${totalDiamondCost.toLocaleString()} diamonds deducted.`);
            // Play success sound
            try { new Audio('/sounds/purchase-success.mp3').play().catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
            // Clear cart after successful purchase
            const { clearCart } = useCartStore.getState();
            clearCart();

            // 🚌 BUS EVENT: Notify all listeners of diamond spend
            busEmit.diamondsSpent(totalDiamondCost, 'Diamond Store Purchase');

            // Broadcast across tabs — diamond balance + chips changed
            broadcastSync('smarter_poker_diamond_sync', 'refresh');
            broadcastSync('smarter_poker_chips_sync', 'refresh');

        } catch (error) {
            console.warn('Diamond payment error:', error);
            showStoreToast('error', error.message || 'Failed to complete diamond payment. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    const selectedPkg = DIAMOND_PACKAGES.find(p => p.id === selectedPackage);
    const selectedVIPPlan = selectedVIP === 'vip-monthly' ? VIP_MEMBERSHIP.monthly : VIP_MEMBERSHIP.annual;

    return (
        <>
            <StoreToast />
            <PageTransition>
                {/* 🎬 INTRO VIDEO OVERLAY - Plays while page loads behind it */}
                {showIntro && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 99999,
                        background: '#000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <video
                            ref={introVideoRef}
                            src="/videos/marketplace-intro.mp4"
                            autoPlay
                            muted
                            playsInline
                            onPlay={handleIntroPlay}
                            onEnded={handleIntroEnd}
                            onError={handleIntroEnd}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain'
                            }}
                        />
                        {/* Skip button */}
                        <button
                            onClick={handleIntroEnd}
                            style={{
                                position: 'absolute',
                                top: 20,
                                right: 20,
                                padding: '8px 20px',
                                background: 'rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(10px)',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: 20,
                                color: 'white',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: 'pointer',
                                zIndex: 100000
                            }}
                        >
                            Skip
                        </button>
                    </div>
                )}
                <Head>
                    <title>Diamond Store — Smarter.Poker</title>
                    <meta name="description" content="Purchase diamonds to unlock premium features" />
                    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

                    <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .diamond-store-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
                    
                    
                    
                    
                    
                `}</style>
                </Head>

                <div className="diamond-store-page" style={styles.container}>
                    {/* Background */}
                    <div style={styles.bgGrid} />
                    <div style={styles.bgGlow} />

                    {/* Header */}
                    <UniversalHeader pageDepth={1} />

                    {/* ═══════════════════════════════════════════════════════ */}
                    {/* SHARED HEADER IMAGE — Shows on ALL tabs */}
                    {/* ═══════════════════════════════════════════════════════ */}
                    <div style={{
                        position: 'relative',
                        width: '100%',
                    }}>
                        <img
                            src="/images/diamond-store-header.png"
                            alt="Diamonds Store"
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                            draggable={false}
                            loading="lazy" />

                        {/* ── Tab button clickable zones ── */}
                        {/* Diamonds tab */}
                        <div
                            onClick={() => { if (navigator?.vibrate) navigator.vibrate(50); setActiveTab('diamonds'); }}
                            style={{ position: 'absolute', left: '3%', top: '62%', width: '18%', height: '34%', cursor: 'pointer' }}
                        />
                        {/* VIP Membership tab */}
                        <div
                            onClick={() => { if (navigator?.vibrate) navigator.vibrate(50); setActiveTab('vip'); }}
                            style={{ position: 'absolute', left: '24%', top: '62%', width: '26%', height: '34%', cursor: 'pointer' }}
                        />
                        {/* Merch tab */}
                        <div
                            onClick={() => { if (navigator?.vibrate) navigator.vibrate(50); setActiveTab('merch'); }}
                            style={{ position: 'absolute', left: '53%', top: '62%', width: '19%', height: '34%', cursor: 'pointer' }}
                        />
                        {/* Smarter Rewards tab */}
                        <div
                            onClick={() => { if (navigator?.vibrate) navigator.vibrate(50); setActiveTab('rewards'); }}
                            style={{ position: 'absolute', left: '75%', top: '62%', width: '23%', height: '34%', cursor: 'pointer' }}
                        />
                    </div>

                    {/* ═══ Club Shop Text Tab — Below Header Image ═══ */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 16px 0',
                        background: 'rgba(0,0,0,0.6)',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        {['diamonds', 'vip', 'merch', 'rewards', 'club-shop'].map(tabId => {
                            const LABEL_ICONS = { diamonds: Gem, vip: Crown, merch: ShoppingBag, rewards: Trophy, 'club-shop': Gamepad2 };
                            const LABEL_TEXT = { diamonds: 'Diamonds', vip: 'VIP', merch: 'Merch', rewards: 'Rewards', 'club-shop': 'Club Shop' };
                            const isActive = activeTab === tabId;
                            return (
                                <button
                                    key={tabId}
                                    onClick={() => {
                                        if (navigator?.vibrate) navigator.vibrate(50);
                                        setActiveTab(tabId);
                                        if (tabId === 'club-shop' && !clubShopLoaded) loadClubShop();
                                    }}
                                    style={{
                                        padding: '10px 16px',
                                        background: isActive ? 'rgba(0,180,255,0.15)' : 'transparent',
                                        border: 'none',
                                        borderBottom: isActive ? '2px solid #00B4FF' : '2px solid transparent',
                                        color: isActive ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                                        fontSize: 13,
                                        fontWeight: isActive ? 700 : 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {(() => { const LI = LABEL_ICONS[tabId]; return LI ? <LI size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> : null; })()}
                                    {LABEL_TEXT[tabId]}
                                </button>
                            );
                        })}
                    </div>

                    {/* ═══════════════════════════════════════════════════════ */}
                    {/* DIAMONDS TAB — Checkout image with clickable zones */}
                    {/* ═══════════════════════════════════════════════════════ */}
                    {activeTab === 'diamonds' && (
                        <div style={{
                            position: 'relative',
                            width: '100%',
                        }}>
                            <img
                                src="/images/diamond-store-checkout.png"
                                alt="Diamond Packages — Click any box to add to cart"
                                style={{ width: '100%', height: 'auto', display: 'block' }}
                                draggable={false}
                                loading="lazy" />
                            {/* ── Diamond package clickable zones (6 boxes, 2×3 grid) ── */}
                            {[
                                { pkgIndex: 2, left: '3%', top: '25%', width: '46%', height: '21%' }, // 1,000 Diamonds — Micro $10
                                { pkgIndex: 3, left: '51%', top: '25%', width: '46%', height: '21%' }, // 2,500 Diamonds — Standard $25
                                { pkgIndex: 4, left: '3%', top: '49%', width: '46%', height: '23%' }, // 5,000 Diamonds — Large $50
                                { pkgIndex: 5, left: '51%', top: '49%', width: '46%', height: '23%' }, // 10,500 Diamonds — Value $100
                                { pkgIndex: 6, left: '3%', top: '74%', width: '46%', height: '25%' }, // 26,250 Diamonds — Premium $250
                                { pkgIndex: 7, left: '51%', top: '74%', width: '46%', height: '25%' }, // 52,500 Diamonds — Whale $500
                            ].map(({ pkgIndex, left, top, width, height }) => {
                                const pkg = DIAMOND_PACKAGES[pkgIndex];
                                if (!pkg) return null;
                                return (
                                    <div
                                        key={pkg.id}
                                        onClick={() => handleAddToCart(pkg)}
                                        title={`${pkg.name} — ${(pkg.diamonds + (pkg.bonus || 0)).toLocaleString()} Diamonds — $${pkg.price.toFixed(2)} — Click to add to cart`}
                                        style={{
                                            position: 'absolute',
                                            left,
                                            top,
                                            width,
                                            height,
                                            cursor: 'pointer',
                                            background: 'transparent',
                                            borderRadius: 8,
                                            transition: 'box-shadow 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 20px rgba(0,180,255,0.4), inset 0 0 15px rgba(0,180,255,0.15)'}
                                        onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* VIP Membership Banner — Outside content container for full width */}
                    {activeTab === 'vip' && (
                        <div style={{ width: '100%', position: 'relative', marginTop: 0 }}>
                            <img
                                src="/images/vip-membership-header.png"
                                alt="VIP Membership — Unlock Everything For One Low Monthly Price. No Diamond Costs, No Limits."
                                style={{ width: '100%', height: 'auto', display: 'block' }}
                                draggable={false}
                                loading="lazy" />
                        </div>
                    )}

                    {/* Main Content (non-diamonds tabs) */}
                    <div style={{
                        ...styles.content,
                        ...(activeTab === 'vip' ? { paddingTop: 8 } : {}),
                    }}>

                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* VIP MEMBERSHIP TAB */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'vip' && (
                            <>

                                {/* VIP Plan Selection */}
                                <div style={styles.vipPlansRow}>
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.daily}
                                        isSelected={selectedVIP === 'vip-daily'}
                                        onSelect={setSelectedVIP}
                                    />
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.monthly}
                                        isSelected={selectedVIP === 'vip-monthly'}
                                        onSelect={setSelectedVIP}
                                    />
                                    <VIPCard
                                        plan={VIP_MEMBERSHIP.annual}
                                        isSelected={selectedVIP === 'vip-annual'}
                                        onSelect={setSelectedVIP}
                                    />
                                </div>

                                {/* Subscribe Button — Metallic Image */}
                                <div style={styles.vipSubscribeSection}>
                                    <div
                                        onClick={handleVIPSubscribe}
                                        style={{
                                            cursor: isProcessing ? 'wait' : 'pointer',
                                            opacity: isProcessing ? 0.6 : 1,
                                            transition: 'transform 0.15s ease, filter 0.15s ease',
                                            display: 'inline-block',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.filter = 'brightness(1.15)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.filter = 'brightness(1)'; }}
                                    >
                                        <img
                                            src="/images/subscribe-button.png"
                                            alt={isProcessing ? 'Processing...' : 'Subscribe For $19.99 A Month'}
                                            style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}
                                            draggable={false}
                                            loading="lazy" />
                                    </div>

                                </div>

                                {/* VIP Benefits Table */}
                                <div style={styles.benefitsSection}>
                                    <h3 style={styles.benefitsTitle}>Everything Included With VIP</h3>

                                    {/* Smarter.Poker Platform */}
                                    <div style={styles.benefitsCategoryHeader}>
                                        <span style={styles.benefitsCategoryLabel}>Smarter.Poker Platform</span>
                                    </div>
                                    <div style={styles.benefitsGrid}>
                                        {VIP_BENEFITS.filter(b => b.category === 'Smarter.Poker').map((benefit, idx) => (
                                            <div key={idx} style={styles.benefitCard}>
                                                <div style={styles.benefitInfo}>
                                                    <div style={styles.benefitTitle}>{benefit.title}</div>
                                                    <div style={styles.benefitDesc}>{benefit.description}</div>
                                                </div>
                                                <div style={styles.benefitValue}>{benefit.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Club & Diamond Arena Features */}
                                    <div style={styles.benefitsCategoryHeader}>
                                        <span style={styles.benefitsCategoryLabel}>Club & Diamond Arena Features</span>
                                    </div>
                                    <div style={styles.benefitsGrid}>
                                        {VIP_BENEFITS.filter(b => b.category === 'Club & Diamond Arena').map((benefit, idx) => (
                                            <div key={idx} style={styles.benefitCard}>
                                                <div style={styles.benefitInfo}>
                                                    <div style={styles.benefitTitle}>{benefit.title}</div>
                                                    <div style={styles.benefitDesc}>{benefit.description}</div>
                                                </div>
                                                <div style={styles.benefitValue}>{benefit.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* View in Marketplace Link */}
                                <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 32 }}>
                                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                                <a
                                        href="/hub/diamond-store?tab=merch"
                                        onClick={(e) => { e.preventDefault(); setActiveTab('merch'); }}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            color: '#FFD700',
                                            fontSize: 16,
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            cursor: 'pointer',
                                            padding: '12px 24px',
                                            borderRadius: 12,
                                            background: 'rgba(255, 215, 0, 0.08)',
                                            border: '1px solid rgba(255, 215, 0, 0.2)',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 215, 0, 0.15)'; e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.4)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 215, 0, 0.08)'; e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.2)'; }}
                                    >
                                        View in Marketplace <span style={{ fontSize: 18 }}>→</span>
                                    </a>
                                </div>

                                {/* ─── Frequently Asked Questions ─── */}
                                <div style={{
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: 16,
                                    padding: '28px 24px',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                }}>
                                    <h3 style={{
                                        fontSize: 20,
                                        fontWeight: 700,
                                        color: '#FFFFFF',
                                        marginBottom: 20,
                                        textAlign: 'center',
                                    }}>Frequently Asked Questions</h3>

                                    {[
                                        { q: 'Can I cancel anytime?', a: 'Yes! You can cancel your VIP membership at any time. Your benefits will remain active until the end of your current billing period.' },
                                        { q: 'What happens when my diamond VIP expires?', a: 'When your VIP membership expires, you\'ll revert to the free tier. Any diamonds you\'ve earned are yours to keep, but VIP-exclusive features will become locked.' },
                                        { q: 'Do I keep my bonus diamonds?', a: 'Yes! All diamonds credited to your account — including monthly VIP bonuses — are permanently yours, even after your membership ends.' },
                                        { q: 'Can I switch between monthly and annual?', a: 'Absolutely. You can switch plans at any time. If upgrading to annual, you\'ll receive a prorated credit for your remaining monthly period.' },
                                        { q: 'What payment methods are accepted?', a: 'We accept all major credit and debit cards, Apple Pay, Google Pay, and select crypto options through our secure payment processor.' },
                                    ].map((faq, idx) => (
                                        <details key={idx} style={{
                                            borderBottom: idx < 4 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                                            paddingBottom: 0,
                                        }}>
                                            <summary style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '16px 0',
                                                cursor: 'pointer',
                                                fontSize: 15,
                                                fontWeight: 600,
                                                color: '#E4E6EB',
                                                listStyle: 'none',
                                            }}>
                                                {faq.q}
                                                <span style={{ color: '#B0B3B8', fontSize: 18, marginLeft: 12, flexShrink: 0 }}>▾</span>
                                            </summary>
                                            <p style={{
                                                padding: '0 0 16px 0',
                                                margin: 0,
                                                fontSize: 14,
                                                lineHeight: 1.6,
                                                color: '#B0B3B8',
                                            }}>{faq.a}</p>
                                        </details>
                                    ))}
                                </div>

                            </>
                        )}

                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* MERCHANDISE TAB */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'merch' && (
                            <>
                                <div style={styles.intro}>
                                    <h2 style={styles.merchTitle}>Official Merch</h2>
                                    <p style={styles.introText}>
                                        Rep The Smarter.Poker Brand At The Tables. Premium Quality Gear For Serious Players.
                                    </p>
                                    {isVip && (
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginTop: 12,
                                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                            color: '#000',
                                            padding: '8px 16px',
                                            borderRadius: 20,
                                            fontSize: 13,
                                            fontWeight: 800,
                                            boxShadow: '0 2px 8px rgba(255,215,0,0.4)',
                                            letterSpacing: '0.5px',
                                        }}>
                                            <Crown size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> VIP — 10% OFF ALL PHYSICAL MERCH
                                        </div>
                                    )}
                                </div>

                                {/* Apparel Section */}
                                <div style={styles.merchSection}>
                                    <h3 style={styles.merchCategoryTitle}>Apparel</h3>
                                    <div style={styles.merchGrid}>
                                        {MERCHANDISE.filter(m => m.category === 'apparel').map(item => (
                                            <MerchCard key={item.id} item={item} onSelect={handleMerchPurchase} />
                                        ))}
                                    </div>
                                </div>

                                {/* Accessories Section */}
                                <div style={styles.merchSection}>
                                    <h3 style={styles.merchCategoryTitle}>Accessories</h3>
                                    <div style={styles.merchGrid}>
                                        {MERCHANDISE.filter(m => m.category === 'accessories').map(item => (
                                            <MerchCard key={item.id} item={item} onSelect={handleMerchPurchase} />
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* SMARTER REWARDS TAB - Comprehensive Rewards Information Center */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'rewards' && (
                            <>
                                {/* Active Diamond Multiplier Banner */}
                                <div style={{
                                    margin: '12px 0 0',
                                    padding: '14px 16px',
                                    borderRadius: 12,
                                    background: diamondMultiplier > 1.0
                                        ? 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.12))'
                                        : 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                                    border: `1px solid ${diamondMultiplier > 1.0 ? 'rgba(245,158,11,0.45)' : 'rgba(99,102,241,0.3)'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: diamondMultiplier > 1.0 ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.2)',
                                                fontSize: 20,
                                            }}>
                                                {diamondMultiplier > 1.0 ? '⚡' : '💎'}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: diamondMultiplier > 1.0 ? '#f59e0b' : '#818cf8' }}>
                                                    {diamondMultiplier > 1.0
                                                        ? `${diamondMultiplier.toFixed(2)}× Diamond Boost Active`
                                                        : 'Activate Your Diamond Boost'}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                                                    {diamondMultiplier > 1.0
                                                        ? `Every diamond you earn is multiplied ${diamondMultiplier.toFixed(2)}× by your share streak`
                                                        : 'Share posts daily for 3+ days to boost ALL your diamond earnings'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            {[
                                                { label: 'Streak 3d', mult: '1.2×', color: '#60a5fa' },
                                                { label: 'Expert 7d', mult: '1.5×', color: '#34d399' },
                                                { label: 'Master 14d', mult: '1.75×', color: '#818cf8' },
                                                { label: 'Legend 30d', mult: '2.0×', color: '#f59e0b' },
                                            ].map(tier => (
                                                <span key={tier.label} style={{
                                                    display: 'inline-block', margin: '2px 3px',
                                                    fontSize: 10, fontWeight: 600, color: tier.color,
                                                    background: `${tier.color}18`, border: `1px solid ${tier.color}35`,
                                                    borderRadius: 6, padding: '2px 6px',
                                                }}>{tier.label} {tier.mult}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Sub-Tab Navigation */}
                                <div style={styles.rewardsSubNav}>
                                    <button
                                        onClick={() => setRewardsSubTab('overview')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'overview' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        Overview
                                    </button>
                                    <button
                                        onClick={() => setRewardsSubTab('diamonds')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'diamonds' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        Diamond Rewards
                                    </button>

                                    <button
                                        onClick={() => setRewardsSubTab('eggs')}
                                        style={{
                                            ...styles.rewardsSubTab,
                                            ...(rewardsSubTab === 'eggs' ? styles.rewardsSubTabActive : {}),
                                        }}
                                    >
                                        Easter Eggs
                                    </button>
                                </div>

                                {/* OVERVIEW SUB-TAB */}
                                {rewardsSubTab === 'overview' && (
                                    <div style={styles.rewardsOverview}>
                                        <h2 style={styles.earnTitle}>Smarter Rewards</h2>
                                        <p style={styles.introText}>
                                            Welcome To The Smarter Rewards System! Earn Diamonds By Playing, Training, And Engaging With The Community.
                                        </p>

                                        <div style={styles.overviewGrid}>
                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}></div>
                                                <h3 style={styles.overviewCardTitle}>Diamond Rewards</h3>
                                                <p style={styles.overviewCardText}>
                                                    Earn Diamonds Through Daily Logins, Training, Social Engagement, And Referrals.
                                                    <strong style={{ color: '#00ff88' }}> Daily Cap: 500</strong> With Streak Multipliers!
                                                </p>
                                            </div>

                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}></div>
                                                <h3 style={styles.overviewCardTitle}>VIP Membership</h3>
                                                <div style={{ marginTop: 12, marginBottom: 12 }}>
                                                    <img
                                                        src="/images/vip-card.png"
                                                        alt="VIP Membership Card"
                                                        style={{
                                                            width: '100%',
                                                            maxWidth: 320,
                                                            borderRadius: 12,
                                                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                                                        }}
                                                        draggable={false}
                                                        loading="lazy" />
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    gap: 16,
                                                    marginTop: 8,
                                                }}>
                                                    <div style={{
                                                        background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))',
                                                        border: '1px solid rgba(255,215,0,0.3)',
                                                        borderRadius: 10,
                                                        padding: '10px 18px',
                                                        textAlign: 'center',
                                                    }}>
                                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#FFD700', fontFamily: 'Orbitron, sans-serif' }}>$19.99</div>
                                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Per Month</div>
                                                    </div>
                                                    <div style={{
                                                        background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))',
                                                        border: '1px solid rgba(0,212,255,0.3)',
                                                        borderRadius: 10,
                                                        padding: '10px 18px',
                                                        textAlign: 'center',
                                                    }}>
                                                        <div style={{ fontSize: 20, fontWeight: 800, color: '#00D4FF', fontFamily: 'Orbitron, sans-serif' }}>$199.99</div>
                                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Per Year (Save $40!)</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setActiveTab('vip')}
                                                    style={{
                                                        marginTop: 12,
                                                        padding: '10px 28px',
                                                        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                                        border: 'none',
                                                        borderRadius: 8,
                                                        color: '#000',
                                                        fontSize: 14,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        boxShadow: '0 0 16px rgba(255,215,0,0.3)',
                                                    }}
                                                >
                                                    View VIP Plans →
                                                </button>
                                            </div>

                                            <div style={styles.overviewCard}>
                                                <div style={styles.overviewIcon}></div>
                                                <h3 style={styles.overviewCardTitle}>Easter Eggs</h3>
                                                <p style={styles.overviewCardText}>
                                                    Discover <strong>100 Hidden Achievements</strong> Across 6 Categories.
                                                    From Performance To Legacy Milestones, Find Them All For Massive Rewards!
                                                </p>
                                            </div>
                                        </div>

                                        <div style={styles.quickStats}>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>500</span>
                                                <span style={styles.quickStatLabel}>Daily Cap</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>2</span>
                                                <span style={styles.quickStatLabel}>VIP Plans</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>100</span>
                                                <span style={styles.quickStatLabel}>Easter Eggs</span>
                                            </div>
                                            <div style={styles.quickStat}>
                                                <span style={styles.quickStatValue}>14</span>
                                                <span style={styles.quickStatLabel}>Standard Rewards</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* DIAMOND REWARDS SUB-TAB */}
                                {rewardsSubTab === 'diamonds' && (
                                    <div style={styles.diamondRewardsSection}>
                                        <h2 style={styles.earnTitle}>Diamond Rewards</h2>
                                        <p style={styles.introText}>
                                            All 14 Ways You Can Earn Diamonds On Smarter.Poker
                                        </p>

                                        {/* Daily Cap Banner */}
                                        <div style={styles.capBanner}>
                                            <div style={styles.capInfo}>
                                                <span style={styles.capNumber}>500</span>
                                                <span style={styles.capLabel}>Daily Cap</span>
                                            </div>
                                            <div style={styles.capDivider} />
                                            <div style={styles.streakMultipliers}>
                                                <div style={styles.multiplierItem}>
                                                    <span style={styles.multiplierValue}>1.5x</span>
                                                    <span style={styles.multiplierLabel}>Days 4-6</span>
                                                </div>
                                                <div style={styles.multiplierItem}>
                                                    <span style={styles.multiplierValueGold}>2.0x</span>
                                                    <span style={styles.multiplierLabel}>Day 7+</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Standard Rewards List */}
                                        <div style={styles.rewardCategory}>
                                            <h3 style={styles.categoryTitle}>All Standard Rewards</h3>
                                            <div style={styles.rewardList}>
                                                {STANDARD_REWARDS.map((reward, idx) => (
                                                    <div key={idx} style={reward.bypassesCap ? { ...styles.rewardItem, ...styles.referralHighlight } : styles.rewardItem}>
                                                        <span style={styles.rewardIcon}>
                                                            {reward.icon && <reward.icon size={24} />}
                                                        </span>
                                                        <div style={styles.rewardDetails}>
                                                            <span style={styles.rewardName}>{reward.name}</span>
                                                            <span style={styles.rewardNote}>{reward.note}</span>
                                                        </div>
                                                        <span style={reward.bypassesCap ? styles.referralReward : styles.rewardAmount}>{reward.amount}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* EASTER EGGS SUB-TAB */}
                                {rewardsSubTab === 'eggs' && (
                                    <div style={styles.easterEggsSection}>
                                        <h2 style={styles.earnTitle}>Easter Eggs - 100 Hidden Achievements</h2>
                                        <p style={styles.introText}>
                                            Discover 100 Hidden Achievements Across 6 Categories For Massive Bonus Rewards!
                                        </p>

                                        {/* Performance Category (10 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Performance (10 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.performance.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Timing & Loyalty Category (15 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Timing & Loyalty (15 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.timing_loyalty.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Strategy & Mastery Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Strategy & Mastery (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.strategy_mastery.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Social/Viral Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Social & Viral (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.social_viral.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Meta/Interface Category (20 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Meta & Interface (20 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.meta_interface.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Legacy/Milestones Category (15 eggs) */}
                                        <div style={styles.eggCategory}>
                                            <h3 style={styles.eggCategoryTitle}>Legacy & Milestones (15 Achievements)</h3>
                                            <div style={styles.eggGrid}>
                                                {EASTER_EGGS.legacy_milestones.map((egg) => (
                                                    <div key={egg.id} style={styles.eggCard}>
                                                        <div style={styles.eggIcon}>
                                                            {egg.icon && <egg.icon size={32} />}
                                                        </div>
                                                        <h4 style={styles.eggName}>{egg.name}</h4>
                                                        <div style={{ ...styles.rarityBadge, ...styles[`rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`] }}>
                                                            {egg.rarity.toUpperCase()}
                                                        </div>
                                                        <div style={styles.eggReward}>{egg.reward}</div>
                                                        <p style={styles.eggTrigger}>{egg.trigger}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {/* CLUB SHOP TAB — Chip-based marketplace items from user's club */}
                        {/* ═══════════════════════════════════════════════════════════════════ */}
                        {activeTab === 'club-shop' && (
                            <>
                                {/* Success Flash */}
                                {clubShopSuccess && (
                                    <div style={{
                                        position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
                                        background: 'linear-gradient(135deg, #00ff88, #00cc66)', color: '#000',
                                        padding: '12px 28px', borderRadius: 12, fontWeight: 700, fontSize: 15,
                                        zIndex: 9999, boxShadow: '0 4px 20px rgba(0,255,136,0.4)', animation: 'fadeIn 0.3s ease',
                                    }}>
                                        <CheckCircle size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {clubShopSuccess}
                                    </div>
                                )}

                                {/* Purchase Confirm Modal */}
                                {clubShopBuyTarget && (
                                    <div
                                        onClick={() => !clubShopProcessing && setClubShopBuyTarget(null)}
                                        style={{
                                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                                        }}
                                    >
                                        <div onClick={e => e.stopPropagation()} style={{
                                            background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)',
                                            borderRadius: 16, padding: 28, maxWidth: 420, width: '90%',
                                            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                                        }}>
                                            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Confirm Purchase</h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                                <div style={{
                                                    width: 56, height: 56, borderRadius: 12,
                                                    background: 'rgba(255,255,255,0.05)', display: 'flex',
                                                    alignItems: 'center', justifyContent: 'center', fontSize: 28,
                                                }}>
                                                    {clubShopBuyTarget.image_url
                                                        ? <img src={clubShopBuyTarget.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                                                        : <CartIcon size={28} color="#8b8d91" />}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#E4E6EB' }}>{clubShopBuyTarget.name}</div>
                                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{clubShopBuyTarget.description || ''}</div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                                                <div style={{
                                                    flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                                                    padding: '12px 16px', textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Item Price</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#ff6b6b', marginTop: 4 }}>{clubShopBuyTarget.price.toLocaleString()}</div>
                                                </div>
                                                <div style={{
                                                    flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                                                    padding: '12px 16px', textAlign: 'center',
                                                }}>
                                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Your Balance</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#00ff88', marginTop: 4 }}>{clubChipBalance.toLocaleString()}</div>
                                                </div>
                                            </div>
                                            {clubChipBalance < clubShopBuyTarget.price && (
                                                <div style={{ color: '#ff6b6b', fontSize: 13, fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>
                                                    <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Insufficient chips. You need {(clubShopBuyTarget.price - clubChipBalance).toLocaleString()} more.
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 12 }}>
                                                <button onClick={() => setClubShopBuyTarget(null)} disabled={clubShopProcessing}
                                                    style={{
                                                        flex: 1, padding: '12px', background: 'rgba(255,255,255,0.08)',
                                                        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
                                                        color: '#B0B3B8', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                                    }}>Cancel</button>
                                                <button onClick={handleClubPurchase}
                                                    disabled={clubShopProcessing || clubChipBalance < clubShopBuyTarget.price}
                                                    style={{
                                                        flex: 1, padding: '12px',
                                                        background: clubShopProcessing || clubChipBalance < clubShopBuyTarget.price
                                                            ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #1877F2, #4285F4)',
                                                        border: 'none', borderRadius: 10, color: '#fff',
                                                        fontSize: 14, fontWeight: 700, cursor: clubShopProcessing ? 'wait' : 'pointer',
                                                    }}>
                                                    {clubShopProcessing ? 'Purchasing...' : 'Confirm Purchase'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={styles.intro}>
                                    <h2 style={{ ...styles.merchTitle, display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <Gamepad2 size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> Club Shop
                                        <span style={{
                                            fontSize: 14, fontWeight: 600,
                                            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                                            color: '#000', padding: '4px 14px', borderRadius: 20,
                                        }}>
                                            <Coins size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {clubChipBalance.toLocaleString()} Chips
                                        </span>
                                    </h2>
                                    <p style={styles.introText}>
                                        Purchase In-Game Items For Your Club With Chips — Time Banks, Table Skins, Throwables, Emotes & More.
                                    </p>
                                </div>

                                {clubShopLoading && !clubShopLoaded ? (
                                    <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}>
                                        Loading club shop...
                                    </div>
                                ) : !clubShopClubId ? (
                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                        <div style={{ marginBottom: 12 }}><Home size={48} color="rgba(255,255,255,0.3)" /></div>
                                        <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>No Club Found</div>
                                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>Join a club to access the Club Shop.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Sub-tabs: Store / My Purchases / Manage (admin) */}
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                                            {[{ key: 'store', label: `Store (${clubShopItems.length})`, LIcon: ShoppingBag },
                                              { key: 'my-purchases', label: `My Purchases (${clubShopPurchases.length})`, LIcon: Package },
                                              ...(clubShopIsAdmin ? [{ key: 'manage', label: 'Manage', LIcon: Wrench }] : []),
                                            ].map(st => (
                                                <button key={st.key} onClick={() => { setClubShopSubTab(st.key); if (st.key === 'manage' && !clubShopAdminLoaded) loadClubShopAdmin(); }}
                                                    style={{
                                                        padding: '8px 20px',
                                                        background: clubShopSubTab === st.key ? 'rgba(0,180,255,0.15)' : 'rgba(255,255,255,0.05)',
                                                        border: clubShopSubTab === st.key ? '1px solid rgba(0,180,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: 10, color: clubShopSubTab === st.key ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                                                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                                    }}>
                                                    {st.LIcon && <st.LIcon size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />}
                                                    {st.label}
                                                </button>
                                            ))}
                                        </div>

                                        {clubShopSubTab === 'store' && (
                                            <>
                                                {/* Category Filters */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                                    {['All', 'Time Banks', 'Table Skins', 'Throwables', 'Emotes', 'Avatars', 'Exclusive'].map(cat => (
                                                        <button key={cat} onClick={() => setClubShopCategory(cat)}
                                                            style={{
                                                                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                                background: clubShopCategory === cat ? 'rgba(0,180,255,0.2)' : 'rgba(255,255,255,0.05)',
                                                                border: clubShopCategory === cat ? '1px solid #00B4FF' : '1px solid rgba(255,255,255,0.1)',
                                                                color: clubShopCategory === cat ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                                                                transition: 'all 0.2s ease',
                                                            }}>
                                                            {cat}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Search + Sort */}
                                                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                                                    <input
                                                        type="text" placeholder="Search items..."
                                                        value={clubShopSearch}
                                                        onChange={e => setClubShopSearch(e.target.value)}
                                                        style={{
                                                            flex: 1, padding: '10px 16px', borderRadius: 10,
                                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                                            color: '#E4E6EB', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                                        }}
                                                    />
                                                    <select
                                                        value={clubShopSortMode}
                                                        onChange={e => setClubShopSortMode(e.target.value)}
                                                        style={{
                                                            padding: '10px 14px', borderRadius: 10,
                                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                                            color: '#E4E6EB', fontSize: 13, outline: 'none', cursor: 'pointer',
                                                        }}>
                                                        <option value="newest">Newest First</option>
                                                        <option value="price-low">Price: Low → High</option>
                                                        <option value="price-high">Price: High → Low</option>
                                                        <option value="popular">Most Popular</option>
                                                    </select>
                                                </div>

                                                {/* Item Grid */}
                                                {(() => {
                                                    const purchasedIds = new Set(clubShopPurchases.map(p => p.item_id));
                                                    let filtered = [...clubShopItems];
                                                    if (clubShopCategory !== 'All') {
                                                        filtered = filtered.filter(i => (i.category || 'Time Banks').toLowerCase() === clubShopCategory.toLowerCase());
                                                    }
                                                    if (clubShopSearch.trim()) {
                                                        const q = clubShopSearch.toLowerCase();
                                                        filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
                                                    }
                                                    // Sort
                                                    switch (clubShopSortMode) {
                                                        case 'price-low': filtered.sort((a, b) => a.price - b.price); break;
                                                        case 'price-high': filtered.sort((a, b) => b.price - a.price); break;
                                                        case 'popular': filtered.sort((a, b) => (b.purchase_count || 0) - (a.purchase_count || 0)); break;
                                                        default: break; // newest = API order
                                                    }

                                                    if (filtered.length === 0) {
                                                        return (
                                                            <div style={{ textAlign: 'center', padding: 40 }}>
                                                                <div style={{ marginBottom: 12 }}><ShoppingBag size={48} color="rgba(255,255,255,0.3)" /></div>
                                                                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                                                                    {clubShopItems.length === 0 ? 'The shop is currently empty.' : 'No items match your filter.'}
                                                                </div>
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                                            gap: 16,
                                                        }}>
                                                            {filtered.map(item => {
                                                                const owned = purchasedIds.has(item.id);
                                                                return (
                                                                    <div key={item.id} style={{
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                                        borderRadius: 14, overflow: 'hidden',
                                                                        transition: 'border-color 0.2s, transform 0.2s',
                                                                    }}
                                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,180,255,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                                                                    >
                                                                        <div style={{
                                                                            height: 120, background: 'linear-gradient(135deg, rgba(0,180,255,0.08), rgba(138,43,226,0.08))',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            position: 'relative',
                                                                        }}>
                                                                            {item.image_url
                                                                                ? <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                                : <Gift size={40} color="#8b8d91" />}
                                                                            <span style={{
                                                                                position: 'absolute', top: 8, right: 8,
                                                                                background: 'rgba(0,0,0,0.7)', color: '#E4E6EB',
                                                                                padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                                                textTransform: 'uppercase',
                                                                            }}>{item.category || 'Time Banks'}</span>
                                                                        </div>
                                                                        <div style={{ padding: 14 }}>
                                                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB', marginBottom: 4 }}>{item.name}</div>
                                                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, lineHeight: 1.4, minHeight: 30 }}>
                                                                                {item.description || 'No description.'}
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                <div>
                                                                                    <span style={{ fontSize: 16, fontWeight: 700, color: '#FFD700', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Coins size={14} /> {item.price.toLocaleString()}</span>
                                                                                    {(item.purchase_count || 0) > 0 && (
                                                                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{item.purchase_count} sold</div>
                                                                                    )}
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => !owned && setClubShopBuyTarget(item)}
                                                                                    disabled={owned}
                                                                                    style={{
                                                                                        padding: '7px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: owned ? 'default' : 'pointer',
                                                                                        background: owned ? 'rgba(0,255,136,0.15)' : 'linear-gradient(135deg, #1877F2, #4285F4)',
                                                                                        border: owned ? '1px solid rgba(0,255,136,0.3)' : 'none',
                                                                                        color: owned ? '#00ff88' : '#fff',
                                                                                    }}>
                                                                                    {owned ? <><CheckCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Owned</> : 'Buy'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </>
                                        )}

                                        {/* My Purchases Sub-Tab */}
                                        {clubShopSubTab === 'my-purchases' && (
                                            <>
                                                {clubShopPurchases.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                                        <div style={{ marginBottom: 12 }}><Package size={48} color="rgba(255,255,255,0.3)" /></div>
                                                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>No purchases yet.</div>
                                                        <button onClick={() => setClubShopSubTab('store')}
                                                            style={{
                                                                marginTop: 12, padding: '10px 24px', borderRadius: 10,
                                                                background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                                                                border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                                            }}>Browse Store</button>
                                                    </div>
                                                ) : (
                                                    <div style={{ overflowX: 'auto' }}>
                                                        <table style={{
                                                            width: '100%', borderCollapse: 'collapse',
                                                            background: 'rgba(255,255,255,0.03)', borderRadius: 12,
                                                        }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Item</th>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Category</th>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Price Paid</th>
                                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Date</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {clubShopPurchases.map(p => {
                                                                    const itemData = clubShopItems.find(i => i.id === p.item_id);
                                                                    const name = p.item_name || itemData?.name || 'Unknown Item';
                                                                    const cat = p.item_category || itemData?.category || 'Time Banks';
                                                                    const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString() : '';
                                                                    return (
                                                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                                            <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>{name}</td>
                                                                            <td style={{ padding: '12px 16px' }}>
                                                                                <span style={{
                                                                                    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                                                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
                                                                                }}>{cat}</span>
                                                                            </td>
                                                                            <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#FFD700' }}>{(p.price_paid || 0).toLocaleString()}</td>
                                                                            <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{dateStr}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Manage Sub-Tab (admin only) */}
                                        {clubShopSubTab === 'manage' && clubShopIsAdmin && (
                                            <>
                                                {/* Admin Stats */}
                                                {(() => {
                                                    const total = clubShopAdminItems.length;
                                                    const active = clubShopAdminItems.filter(i => i.is_active).length;
                                                    const totalSold = clubShopAdminItems.reduce((s, i) => s + (i.purchase_count || 0), 0);
                                                    const totalRev = clubShopAdminItems.reduce((s, i) => s + (i.purchase_count || 0) * i.price, 0);
                                                    return (
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                                                            {[{ label: 'Total Items', val: total }, { label: 'Active', val: active },
                                                              { label: 'Total Sold', val: totalSold }, { label: 'Revenue', val: totalRev.toLocaleString() + ' chips' },
                                                            ].map(s => (
                                                                <div key={s.label} style={{
                                                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                                                                    borderRadius: 12, padding: '16px 14px', textAlign: 'center',
                                                                }}>
                                                                    <div style={{ fontSize: 22, fontWeight: 800, color: '#00D4FF' }}>{s.val}</div>
                                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Create Item Form */}
                                                <div style={{
                                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                                    borderRadius: 14, padding: 20, marginBottom: 24,
                                                }}>
                                                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#E4E6EB', marginBottom: 14 }}>➕ Create Shop Item</h3>
                                                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                                                        <input value={clubShopNewName} onChange={e => setClubShopNewName(e.target.value)}
                                                            placeholder="Item name" maxLength={100}
                                                            style={{ flex: 2, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none' }} />
                                                        <input type="number" value={clubShopNewPrice} onChange={e => setClubShopNewPrice(e.target.value)}
                                                            placeholder="Price (chips)" min="1"
                                                            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none' }} />
                                                    </div>
                                                    <input value={clubShopNewDesc} onChange={e => setClubShopNewDesc(e.target.value)}
                                                        placeholder="Description (optional)" maxLength={500}
                                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
                                                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                                                        <select value={clubShopNewCategory} onChange={e => setClubShopNewCategory(e.target.value)}
                                                            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                                                            {['Time Banks', 'Table Skins', 'Throwables', 'Emotes', 'Avatars', 'Exclusive'].map(c => (
                                                                <option key={c} value={c}>{c}</option>
                                                            ))}
                                                        </select>
                                                        <input value={clubShopNewImage} onChange={e => setClubShopNewImage(e.target.value)}
                                                            placeholder="Image URL (optional)"
                                                            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#E4E6EB', fontSize: 14, outline: 'none' }} />
                                                    </div>
                                                    <button
                                                        disabled={clubShopProcessing || !clubShopNewName.trim() || !clubShopNewPrice}
                                                        onClick={async () => {
                                                            const now = Date.now();
                                                            if (now - clubShopLastCreate < 3000) { showStoreToast('warning', 'Please wait before creating another item'); return; }
                                                            const price = Math.floor(Number(clubShopNewPrice));
                                                            if (!price || price <= 0) { showStoreToast('error', 'Price must be a positive number'); return; }
                                                            if (price > 1000000000) { showStoreToast('error', 'Price exceeds maximum'); return; }
                                                            setClubShopProcessing(true);
                                                            try {
                                                                // Server-side admin CRUD (post-Phase-37 RLS lockdown — anon
                                                                // writes to club_shop_items now blocked by design).
                                                                const token = getAccessToken();
                                                                if (!token) throw new Error('Not authenticated');
                                                                const resp = await fetch('/api/club-arena/shop-items', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                    body: JSON.stringify({
                                                                        action: 'create',
                                                                        clubId: clubShopClubId,
                                                                        name: clubShopNewName.trim(),
                                                                        price,
                                                                        description: clubShopNewDesc.trim() || null,
                                                                        category: clubShopNewCategory,
                                                                        imageUrl: clubShopNewImage.trim() || null
                                                                    })
                                                                });
                                                                const json = await resp.json().catch(() => ({}));
                                                                if (!resp.ok || !json.success) throw new Error(json.error || `HTTP ${resp.status}`);
                                                                setClubShopLastCreate(Date.now());
                                                                setClubShopNewName(''); setClubShopNewPrice(''); setClubShopNewDesc(''); setClubShopNewImage(''); setClubShopNewCategory('Time Banks');
                                                                loadClubShopAdmin();
                                                                clubShopLoadingRef.current = false;
                                                                loadClubShop(true);
                                                            } catch (err) { showStoreToast('error', err.message); } finally { setClubShopProcessing(false); }
                                                        }}
                                                        style={{
                                                            padding: '10px 28px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                                            background: 'linear-gradient(135deg, #1877F2, #4285F4)', border: 'none', color: '#fff',
                                                            opacity: (!clubShopNewName.trim() || !clubShopNewPrice) ? 0.5 : 1,
                                                        }}>
                                                        {clubShopProcessing ? 'Creating...' : 'Create Item'}
                                                    </button>
                                                </div>

                                                {/* Admin Item List */}
                                                {clubShopAdminItems.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                                        <div style={{ marginBottom: 12 }}><Wrench size={48} color="rgba(255,255,255,0.3)" /></div>
                                                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>No shop items yet. Create one above.</div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {clubShopAdminItems.map(item => (
                                                            <div key={item.id} style={{
                                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                                                                borderRadius: 10, padding: '12px 16px',
                                                            }}>
                                                                <div>
                                                                    <div style={{ fontWeight: 700, color: item.is_active ? '#E4E6EB' : '#6B7280', fontSize: 14 }}>{item.name}</div>
                                                                    <div style={{ fontSize: 12, color: '#8b8d91', marginTop: 2 }}>
                                                                        {item.price.toLocaleString()} chips • <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>{item.category || 'Time Banks'}</span> • {item.purchase_count || 0} sold
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 8 }}>
                                                                    <button onClick={async () => {
                                                                        try {
                                                                            const token = getAccessToken();
                                                                            if (!token) throw new Error('Not authenticated');
                                                                            const resp = await fetch('/api/club-arena/shop-items', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                                body: JSON.stringify({ action: 'toggle', clubId: item.club_id, itemId: item.id })
                                                                            });
                                                                            const json = await resp.json().catch(() => ({}));
                                                                            if (!resp.ok || !json.success) throw new Error(json.error || `HTTP ${resp.status}`);
                                                                            loadClubShopAdmin();
                                                                            clubShopLoadingRef.current = false;
                                                                            loadClubShop(true);
                                                                        } catch (err) { showStoreToast('error', err.message); }
                                                                    }} style={{
                                                                        padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                                        background: item.is_active ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
                                                                        border: item.is_active ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,255,255,0.1)',
                                                                        color: item.is_active ? '#00ff88' : 'rgba(255,255,255,0.4)',
                                                                    }}>
                                                                        {item.is_active ? <><CheckCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> Active</> : 'Hidden'}
                                                                    </button>
                                                                    <button onClick={async () => {
                                                                        if (!confirm(`Delete "${item.name}"?`)) return;
                                                                        try {
                                                                            const token = getAccessToken();
                                                                            if (!token) throw new Error('Not authenticated');
                                                                            const resp = await fetch('/api/club-arena/shop-items', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                                body: JSON.stringify({ action: 'delete', clubId: item.club_id, itemId: item.id })
                                                                            });
                                                                            const json = await resp.json().catch(() => ({}));
                                                                            if (!resp.ok || !json.success) throw new Error(json.error || `HTTP ${resp.status}`);
                                                                            loadClubShopAdmin();
                                                                            clubShopLoadingRef.current = false;
                                                                            loadClubShop(true);
                                                                        } catch (err) { showStoreToast('error', err.message); }
                                                                    }} style={{
                                                                        padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                                        background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#ff6b6b',
                                                                    }}>
                                                                        <Trash2 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Delete
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* Legal Note */}
                        <p style={styles.legalNote}>
                            Diamonds are virtual currency and have no real-world cash value.
                            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                            All purchases are final. See our <a href="/terms" style={styles.link}>Terms of Service</a> for details.
                        </p>
                    </div>
                </div>
                  <BottomNavBar />
    </PageTransition>

            {/* Shopping Cart Component */}
            <ShoppingCart onCheckout={handleCheckout} onPayWithDiamonds={handlePayWithDiamonds} />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
        background: '#000000',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.02) 1px, transparent 1px)
            `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%',
        left: '50%',
        width: '100%',
        height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 212, 255, 0.1), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(36, 37, 38, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },
    // TAB NAVIGATION
    tabNav: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(36, 37, 38, 0.95)',
        position: 'sticky',
        top: 0,
        zIndex: 99,
    },
    tabButton: {
        padding: '10px 24px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 10,
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    tabButtonActive: {
        background: 'rgba(0, 212, 255, 0.2)',
        border: '1px solid #00D4FF',
        color: '#00D4FF',
    },
    tabButtonActiveVIP: {
        background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.2), rgba(66, 133, 244, 0.2))',
        border: '1px solid #1877F2',
        color: '#1877F2',
    },
    backButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    pageTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#E4E6EB',
    },
    content: {
        maxWidth: 900,
        margin: '0 auto',
        padding: '32px 24px',
    },
    intro: {
        textAlign: 'center',
        marginBottom: 40,
    },
    introText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: 600,
        margin: '0 auto',
        lineHeight: 1.6,
    },
    packageGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 20,
        marginBottom: 40,
    },
    purchaseSection: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 48,
    },
    selectedInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    selectedLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    selectedName: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
    },
    selectedDiamonds: {
        fontSize: 18,
        fontWeight: 700,
        color: '#00D4FF',
    },
    purchaseButton: {
        padding: '14px 40px',
        background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
    earnSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    earnTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 16,
        textAlign: 'center',
    },
    earnSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 24,
    },
    earnGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
    },
    earnCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '20px 12px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
    },
    earnIcon: {
        fontSize: 28,
    },
    earnLabel: {
        fontSize: 13,
        fontWeight: 500,
        color: '#fff',
    },
    earnReward: {
        fontSize: 12,
        fontWeight: 600,
        color: '#00ff88',
    },
    legalNote: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
        maxWidth: 500,
        margin: '0 auto',
        lineHeight: 1.6,
    },
    link: {
        color: '#00D4FF',
        textDecoration: 'none',
    },
    // YELLOW BALL REWARD SYSTEM STYLES
    rewardSystem: {
        marginBottom: 40,
    },
    capBanner: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 32,
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1))',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 16,
        padding: '20px 32px',
        marginBottom: 32,
    },
    capInfo: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    capNumber: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 36,
        fontWeight: 700,
        color: '#FFD700',
    },
    capLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    capDivider: {
        width: 1,
        height: 50,
        background: 'rgba(255, 215, 0, 0.3)',
    },
    streakMultipliers: {
        display: 'flex',
        gap: 24,
    },
    multiplierItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    multiplierValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#00ff88',
    },
    multiplierValueGold: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#FFD700',
    },
    multiplierLabel: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    payoutSection: {
        marginBottom: 32,
    },
    payoutTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 16,
    },
    payoutGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 12,
    },
    payoutCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
    },
    referralCard: {
        background: 'rgba(0, 255, 136, 0.1)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
    },
    payoutIcon: {
        fontSize: 24,
    },
    payoutInfo: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
    payoutName: {
        fontSize: 14,
        fontWeight: 500,
        color: '#fff',
    },
    payoutNote: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    bypassNote: {
        fontSize: 11,
        color: '#00ff88',
        fontWeight: 600,
    },
    payoutReward: {
        fontSize: 14,
        fontWeight: 600,
        color: '#00D4FF',
    },
    referralReward: {
        fontSize: 14,
        fontWeight: 700,
        color: '#00ff88',
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SMARTER REWARDS SUB-TAB STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    rewardsSubNav: {
        display: 'flex',
        gap: 8,
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(36, 37, 38, 0.95)',
        position: 'sticky',
        top: 80,
        zIndex: 98,
        overflowX: 'auto',
    },
    rewardsSubTab: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        padding: '10px 20px',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
    },
    rewardsSubTabActive: {
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        color: '#fff',
        border: '1px solid transparent',
    },

    // Overview Section
    rewardsOverview: {
        padding: '32px 24px',
    },
    overviewGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
        marginTop: 32,
        marginBottom: 32,
    },
    overviewCard: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 24,
        textAlign: 'center',
    },
    overviewIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    overviewCardTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 12,
    },
    overviewCardText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
    },
    quickStats: {
        display: 'flex',
        justifyContent: 'space-around',
        gap: 20,
        marginTop: 32,
        padding: '24px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    quickStat: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
    },
    quickStatValue: {
        fontSize: 32,
        fontWeight: 700,
        color: '#00ff88',
        fontFamily: 'Orbitron, sans-serif',
    },
    quickStatLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },

    // Diamond Rewards Section
    diamondRewardsSection: {
        padding: '32px 24px',
    },
    rewardCategory: {
        marginBottom: 32,
    },
    categoryTitle: {
        fontSize: 18,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 16,
        fontFamily: 'Orbitron, sans-serif',
    },
    rewardList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    rewardItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 10,
    },
    rewardIcon: {
        fontSize: 24,
        flexShrink: 0,
    },
    rewardDetails: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    rewardName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#E4E6EB',
    },
    rewardNote: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    rewardAmount: {
        fontSize: 14,
        fontWeight: 700,
        color: '#00D4FF',
        flexShrink: 0,
    },
    referralHighlight: {
        background: 'rgba(0, 255, 136, 0.1)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
    },

    // XP System Section
    levelBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 700,
        color: '#fff',
    },
    unlocksList: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
    },
    unlockBadge: {
        display: 'inline-block',
        padding: '4px 10px',
        background: 'rgba(0, 255, 136, 0.15)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
        borderRadius: 6,
        fontSize: 11,
        color: '#00ff88',
        fontWeight: 600,
    },
    noUnlocks: {
        color: 'rgba(255, 255, 255, 0.3)',
    },

    // Easter Eggs Section
    easterEggsSection: {
        padding: '32px 24px',
    },
    eggGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: 20,
        marginTop: 24,
    },
    eggCard: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 20,
        textAlign: 'center',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
    },
    eggIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    eggName: {
        fontSize: 16,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 8,
    },
    eggReward: {
        fontSize: 18,
        fontWeight: 700,
        color: '#FFD700',
        marginBottom: 12,
        fontFamily: 'Orbitron, sans-serif',
    },
    eggTrigger: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: 1.5,
    },
    // Egg Category Styles
    eggCategory: {
        marginBottom: 48,
    },
    eggCategoryTitle: {
        fontSize: 20,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 20,
        fontFamily: 'Orbitron, sans-serif',
    },
    // Rarity Badge Styles
    rarityBadge: {
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        marginBottom: 8,
        letterSpacing: '0.5px',
    },
    rarityCommon: {
        background: 'rgba(158, 158, 158, 0.2)',
        border: '1px solid rgba(158, 158, 158, 0.4)',
        color: '#9E9E9E',
    },
    rarityUncommon: {
        background: 'rgba(76, 175, 80, 0.2)',
        border: '1px solid rgba(76, 175, 80, 0.4)',
        color: '#4CAF50',
    },
    rarityRare: {
        background: 'rgba(33, 150, 243, 0.2)',
        border: '1px solid rgba(33, 150, 243, 0.4)',
        color: '#2196F3',
    },
    rarityEpic: {
        background: 'rgba(156, 39, 176, 0.2)',
        border: '1px solid rgba(156, 39, 176, 0.4)',
        color: '#9C27B0',
    },
    rarityLegendary: {
        background: 'rgba(255, 152, 0, 0.2)',
        border: '1px solid rgba(255, 152, 0, 0.4)',
        color: '#FF9800',
    },

    easterSection: {
        textAlign: 'center',
        marginBottom: 24,
    },
    easterTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 8,
    },
    easterSubtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 20,
    },
    easterGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
    },
    easterCategory: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '16px 12px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid',
        borderRadius: 12,
    },
    categoryRange: {
        fontSize: 11,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
    },
    categoryName: {
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    },
    categoryExample: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.6)',
        fontStyle: 'italic',
    },
    legendaryNote: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.7)',
        background: 'rgba(255, 215, 0, 0.1)',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 10,
        padding: '14px 20px',
        lineHeight: 1.6,
        textAlign: 'center',
    },
    // 5-PILLAR CARD STYLES
    pillarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 24,
    },
    pillarCard: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '2px solid',
        borderRadius: 16,
        padding: 20,
        textAlign: 'left',
    },
    pillarHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    pillarIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
    },
    pillarName: {
        fontSize: 15,
        fontWeight: 600,
        color: '#fff',
    },
    pillarRange: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    pillarExamples: {
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        paddingTop: 12,
    },
    exampleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 8,
    },
    exDiamonds: {
        marginLeft: 'auto',
        color: '#00D4FF',
        fontWeight: 600,
    },
    exDiamondsRare: {
        marginLeft: 'auto',
        color: '#8a2be2',
        fontWeight: 600,
    },
    exDiamondsEpic: {
        marginLeft: 'auto',
        color: '#ff6b9d',
        fontWeight: 600,
    },
    exDiamondsLegendary: {
        marginLeft: 'auto',
        color: '#FFD700',
        fontWeight: 700,
    },
    // VIP MEMBERSHIP STYLES
    vipHero: {
        textAlign: 'center',
        marginBottom: 32,
    },
    vipTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 32,
        fontWeight: 700,
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: 12,
    },
    vipSubtitle: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.7)',
        margin: '0 auto',
        lineHeight: 1.4,
    },
    vipPlansRow: {
        display: 'flex',
        gap: 20,
        marginBottom: 24,
    },
    vipSubscribeSection: {
        textAlign: 'center',
        marginBottom: 40,
    },
    vipSubscribeButton: {
        padding: '16px 48px',
        background: 'linear-gradient(135deg, #1877F2, #4285F4)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        fontSize: 18,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 30px rgba(138, 43, 226, 0.4)',
    },
    vipCancelNote: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 12,
    },
    benefitsSection: {
        marginBottom: 32,
    },
    benefitsTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 20,
        fontWeight: 600,
        color: '#E4E6EB',
        marginBottom: 20,
        textAlign: 'center',
    },
    benefitsCategoryHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 20,
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: '1px solid rgba(255, 215, 0, 0.15)',
    },
    benefitsCategoryIcon: {
        fontSize: 20,
    },
    benefitsCategoryLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 13,
        fontWeight: 700,
        color: '#FFFFFF',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
    },
    benefitsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 12,
    },
    benefitCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: 'rgba(24, 119, 242, 0.1)',
        border: '1px solid rgba(24, 119, 242, 0.2)',
        borderRadius: 10,
    },
    benefitIcon: {
        fontSize: 24,
        width: 40,
        textAlign: 'center',
    },
    benefitInfo: {
        flex: 1,
    },
    benefitTitle: {
        fontSize: 14,
        fontWeight: 600,
        color: '#E4E6EB',
    },
    benefitDesc: {
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    benefitValue: {
        fontSize: 12,
        fontWeight: 600,
        color: '#00ff88',
        textAlign: 'right',
    },
    valueComparison: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        padding: '24px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        marginBottom: 32,
    },
    valueBox: {
        textAlign: 'center',
    },
    valueBoxHighlight: {
        textAlign: 'center',
        padding: '16px 32px',
        background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.2), rgba(66, 133, 244, 0.2))',
        borderRadius: 12,
        border: '2px solid #1877F2',
    },
    valueLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    valueAmount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: 'rgba(255, 255, 255, 0.3)',
        textDecoration: 'line-through',
    },
    vipPrice: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#1877F2',
    },
    valueDivider: {
        fontSize: 24,
        color: 'rgba(255, 255, 255, 0.3)',
    },
    // MERCHANDISE STYLES
    merchTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#E4E6EB',
        marginBottom: 12,
    },
    merchSection: {
        marginBottom: 32,
    },
    merchCategoryTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#E4E6EB',
        marginBottom: 16,
    },
    merchGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
    },
};
