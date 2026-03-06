/* ═══════════════════════════════════════════════════════════════════════════════
 CLUB ARENA — Marketplace | FULLY WIRED
 Facebook Dark Theme | Club Shop with Real Items & Purchases
 ═══════════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useCallback } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';

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
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

// Facebook Dark Color Scheme
const FB = {
    primary: '#2374E1',
    background: '#18191A',
    cardBg: '#242526',
    textPrimary: '#E4E6EB',
    textSecondary: '#B0B3B8',
    border: '#3E4042',
    success: '#31A24C',
    danger: '#FA383E',
    gold: '#F7C52A',
    hover: '#3A3B3C',
};

// Default shop items (used if no custom items in database)
const DEFAULT_ITEMS = [
    { id: 'custom_avatar', name: 'Custom Avatar Frame', description: 'Stand Out with a Premium Avatar Frame', price: 500, category: 'cosmetic' },
    { id: 'table_theme_gold', name: 'Gold Table Theme', description: 'Exclusive Gold-themed Table Design', price: 1000, category: 'theme' },
    { id: 'card_back_premium', name: 'Premium Card Back', description: 'Custom Card Back Design', price: 300, category: 'cosmetic' },
    { id: 'seat_preference', name: 'Seat Preference', description: 'Always Get Your Preferred Seat', price: 750, category: 'perk' },
    { id: 'emoji_pack', name: 'Premium Emoji Pack', description: 'Unlock 50+ Exclusive Table Emojis', price: 400, category: 'cosmetic' },
    { id: 'vip_badge', name: 'VIP Badge', description: 'Display a VIP Badge on Your Profile', price: 2000, category: 'badge' },
];

const CATEGORIES = [
    { id: 'all', label: 'All Items' },
    { id: 'cosmetic', label: 'Cosmetics' },
    { id: 'theme', label: 'Themes' },
    { id: 'perk', label: 'Perks' },
    { id: 'badge', label: 'Badges' },
];

export default function Marketplace() {
    const router = useRouter();
    const clubIdParam = router.query?.club || null;

    // State
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [membership, setMembership] = useState(null);
    const [chipBalance, setChipBalance] = useState(0);
    const [items, setItems] = useState([]);
    const [ownedItems, setOwnedItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [category, setCategory] = useState('all');
    const [tab, setTab] = useState('shop'); // 'shop' | 'owned'

    // Modal
    const [selectedItem, setSelectedItem] = useState(null);
    const [processing, setProcessing] = useState(false);

    // Toast
    const [toast, setToast] = useState(null);
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
            setUser(authUser);

            // Get club data
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clubIdParam);
            const { data: clubData } = await supabase
                .from('clubs')
                .select('*')
                .eq(isUUID ? 'id' : 'club_id', clubIdParam)
                .single();

            if (clubData) {
                setClub(clubData);

                // Get membership and chip balance
                if (authUser) {
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

                    // Try to get custom shop items from database
                    const { data: shopItems } = await supabase
                        .from('club_shop_items')
                        .select('*')
                        .eq('club_id', clubData.id)
                        .eq('is_active', true)
                        .order('price', { ascending: true })
                        .limit(100) // shop items

                    // Use database items or fallback to defaults
                    if (shopItems && shopItems.length > 0) {
                        setItems(shopItems);
                    } else {
                        // Use default items with club context
                        setItems(DEFAULT_ITEMS.map(item => ({
                            ...item,
                            club_id: clubData.id,
                        })));
                    }

                    // Get user's owned items
                    const { data: purchases } = await supabase
                        .from('club_shop_purchases')
                        .select('*, item:item_id(*)')
                        .eq('buyer_id', authUser.id)
                        .eq('club_id', clubData.id)
                        .limit(50) // purchase history

                    if (purchases) {
                        setOwnedItems(purchases.map(p => p.item_id || p.item?.id));
                    }
                }
            }
        } catch (e) {
            console.error('[Marketplace] Error loading data:', e);
            // Still set default items on error
            setItems(DEFAULT_ITEMS);
        } finally {
            setIsLoading(false);
        }
    }, [clubIdParam]);

    useEffect(() => { const _c = new AbortController(); loadData(_c.signal); return () => _c.abort(); }, [loadData]);

    // ═══════════════════════════════════════════════════════════════════════════
    // PURCHASE ITEM
    // ═══════════════════════════════════════════════════════════════════════════
    const purchaseItem = async () => {
        if (!selectedItem || !membership) return;

        if (chipBalance < selectedItem.price) {
            showToast('Not enough chips!', 'error');
            return;
        }

        if (ownedItems.includes(selectedItem.id)) {
            showToast('You already own this item!', 'error');
            return;
        }

        setProcessing(true);
        try {
            const result = await apiCall('/api/club-arena/marketplace-purchase', {
                clubId: club.id,
                itemId: selectedItem.id,
                itemName: selectedItem.name,
                price: selectedItem.price,
            });

            showToast(`Purchased ${selectedItem.name}!`);
            setSelectedItem(null);
            setOwnedItems([...ownedItems, selectedItem.id]);
            setChipBalance(result.newBalance ?? (chipBalance - selectedItem.price));
        } catch (e) {
            console.error('[Marketplace] Purchase error:', e);
            showToast(e.message || 'Purchase failed. Try again.', 'error');
        } finally {
            setProcessing(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // FILTER ITEMS
    // ═══════════════════════════════════════════════════════════════════════════
    const filteredItems = items.filter(item => {
        if (tab === 'owned') return ownedItems.includes(item.id);
        if (category === 'all') return true;
        return item.category === category;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STYLES
    // ═══════════════════════════════════════════════════════════════════════════
    const S = {
        page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
        container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' },
        backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 },
        pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '8px' },
        pageSubtitle: { fontSize: '14px', color: FB.textSecondary, marginBottom: '20px' },
        loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' },
        emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary },

        // Balance bar
        balanceBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', marginBottom: '16px' },
        balanceLabel: { fontSize: '14px', color: FB.textSecondary },
        balanceValue: { fontSize: '18px', fontWeight: 700, color: FB.primary },

        // Tabs
        tabs: { display: 'flex', gap: '8px', marginBottom: '16px' },
        tab: { flex: 1, padding: '10px', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },

        // Category pills
        categoryRow: { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' },
        categoryPill: { padding: '8px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', border: 'none' },

        // Item grid
        itemGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
        itemCard: { padding: '16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, cursor: 'pointer', transition: 'all 0.2s', position: 'relative' },
        itemIcon: { fontSize: '32px', marginBottom: '10px', display: 'block' },
        itemName: { fontSize: '14px', fontWeight: 600, color: FB.textPrimary, marginBottom: '4px' },
        itemDesc: { fontSize: '12px', color: FB.textSecondary, marginBottom: '8px', lineHeight: 1.4 },
        itemPrice: { fontSize: '14px', fontWeight: 700, color: FB.gold },
        ownedBadge: { position: 'absolute', top: '8px', right: '8px', background: FB.success, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '4px 8px', borderRadius: '4px' },

        // Modal
        modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
        modal: { background: FB.cardBg, borderRadius: '12px', width: '100%', maxWidth: '400px', overflow: 'hidden', border: `1px solid ${FB.border}` },
        modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${FB.border}` },
        modalTitle: { fontSize: '18px', fontWeight: 700, color: FB.textPrimary },
        modalClose: { background: 'none', border: 'none', color: FB.textSecondary, fontSize: '24px', cursor: 'pointer', lineHeight: 1 },
        modalBody: { padding: '24px', textAlign: 'center' },
        modalIcon: { fontSize: '64px', marginBottom: '16px', display: 'block' },
        modalName: { fontSize: '20px', fontWeight: 700, color: FB.textPrimary, marginBottom: '8px' },
        modalDesc: { fontSize: '14px', color: FB.textSecondary, marginBottom: '16px' },
        modalPrice: { fontSize: '24px', fontWeight: 700, color: FB.gold, marginBottom: '8px' },
        modalBalance: { fontSize: '13px', color: FB.textSecondary },
        modalFooter: { padding: '16px 20px', borderTop: `1px solid ${FB.border}` },
        modalBtn: { width: '100%', padding: '14px', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 600, cursor: 'pointer' },

        // Toast
        toast: { position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, zIndex: 10000, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' },
    };

    return (
        <>
            <SEOHead
                title="Club Arena — Marketplace"
                description="Browse The Club Arena Marketplace."
                canonical="/hub/club-arena/marketplace"
                noindex={true}
            />

            <div style={S.page}>
                <UniversalHeader pageDepth={2} />

                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <h1 style={S.pageTitle}>Marketplace</h1>
                    <p style={S.pageSubtitle}>Spend Your Chips On Exclusive Items</p>

                    {isLoading ? (
                        <div style={S.loading}>Loading Shop...</div>
                    ) : !user ? (
                        <div style={S.emptyState}><p>Sign In To Shop</p></div>
                    ) : (
                        <>
                            {/* Balance Bar */}
                            <div style={S.balanceBar}>
                                <span style={S.balanceLabel}>Your Chips</span>
                                <span style={S.balanceValue}>{chipBalance.toLocaleString()} </span>
                            </div>

                            {/* Tabs */}
                            <div style={S.tabs}>
                                <button
                                    style={{
                                        ...S.tab,
                                        background: tab === 'shop' ? FB.primary : FB.hover,
                                        color: tab === 'shop' ? '#fff' : FB.textSecondary,
                                    }}
                                    onClick={() => setTab('shop')}
                                >
                                    Shop
                                </button>
                                <button
                                    style={{
                                        ...S.tab,
                                        background: tab === 'owned' ? FB.primary : FB.hover,
                                        color: tab === 'owned' ? '#fff' : FB.textSecondary,
                                    }}
                                    onClick={() => setTab('owned')}
                                >
                                    Owned ({ownedItems.length})
                                </button>
                            </div>

                            {/* Category Filter (Shop only) */}
                            {tab === 'shop' && (
                                <div style={S.categoryRow}>
                                    {CATEGORIES.map(cat => (
                                        <button
                                            key={cat.id}
                                            style={{
                                                ...S.categoryPill,
                                                background: category === cat.id ? FB.primary : FB.hover,
                                                color: category === cat.id ? '#fff' : FB.textSecondary,
                                            }}
                                            onClick={() => setCategory(cat.id)}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Item Grid */}
                            {filteredItems.length > 0 ? (
                                <div style={S.itemGrid}>
                                    {filteredItems.map(item => {
                                        const isOwned = ownedItems.includes(item.id);
                                        return (
                                            <div
                                                key={item.id}
                                                style={{
                                                    ...S.itemCard,
                                                    opacity: isOwned && tab === 'shop' ? 0.6 : 1,
                                                }}
                                                onClick={() => !isOwned && setSelectedItem(item)}
                                                onMouseEnter={e => e.currentTarget.style.borderColor = FB.primary}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = FB.border}
                                            >
                                                {isOwned && <span style={S.ownedBadge}>OWNED</span>}
                                                <span style={S.itemIcon}></span>
                                                <div style={S.itemName}>{item.name}</div>
                                                <div style={S.itemDesc}>{item.description}</div>
                                                <div style={S.itemPrice}>{item.price.toLocaleString()} chips</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={S.emptyState}>
                                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>
                                        {tab === 'owned' ? '' : ''}
                                    </span>
                                    <p>{tab === 'owned' ? "You don't own any items yet" : 'No items in this category'}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <ClubArenaBottomNav clubId={clubIdParam} activePage="cashier" userRole={membership?.role} />
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════
 PURCHASE MODAL
 ═══════════════════════════════════════════════════════════════════════ */}
            {selectedItem && (
                <div style={S.modalOverlay} onClick={() => !processing && setSelectedItem(null)}>
                    <div style={S.modal} onClick={e => e.stopPropagation()}>
                        <div style={S.modalHeader}>
                            <span style={S.modalTitle}>Purchase Item</span>
                            <button style={S.modalClose} onClick={() => !processing && setSelectedItem(null)}>&times;</button>
                        </div>
                        <div style={S.modalBody}>
                            <div style={S.modalName}>{selectedItem.name}</div>
                            <div style={S.modalDesc}>{selectedItem.description}</div>
                            <div style={S.modalPrice}>{selectedItem.price.toLocaleString()} chips</div>
                            <div style={S.modalBalance}>
                                Your balance: {chipBalance.toLocaleString()} chips
                                {chipBalance < selectedItem.price && (
                                    <span style={{ color: FB.danger, display: 'block', marginTop: '4px' }}>
                                        Not enough chips!
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={S.modalFooter}>
                            <button
                                style={{
                                    ...S.modalBtn,
                                    background: chipBalance >= selectedItem.price ? FB.success : FB.hover,
                                    color: chipBalance >= selectedItem.price ? '#fff' : FB.textSecondary,
                                    opacity: processing ? 0.5 : 1,
                                }}
                                onClick={purchaseItem}
                                disabled={processing || chipBalance < selectedItem.price}
                            >
                                {processing ? 'Processing...' : chipBalance >= selectedItem.price ? 'Confirm Purchase' : 'Not Enough Chips'}
                            </button>
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
