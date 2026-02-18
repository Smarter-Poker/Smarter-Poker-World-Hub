/**
 * <img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/> COSMETIC SHOP - The Diamond Exchange
 * 
 * Where diamonds become style. Features:
 * - Card Skins
 * - Table Felts
 * - Avatar Sets
 * - Immediate equip after purchase
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type CosmeticCategory = 'card_skins' | 'table_felts' | 'avatars' | 'emotes';

export interface CosmeticItem {
    id: string;
    name: string;
    description: string;
    category: CosmeticCategory;
    price: number;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    previewImage: string;
    previewColor: string;
}

export interface UserProfile {
    diamonds: number;
    unlockedAssets: string[];
    equippedAssets: {
        cardSkin: string;
        tableFelt: string;
        avatar: string;
    };
}

interface CosmeticShopProps {
    isOpen: boolean;
    onClose: () => void;
    userProfile: UserProfile;
    onPurchase: (itemId: string, price: number) => void;
    onEquip: (itemId: string, category: CosmeticCategory) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOP INVENTORY
// ═══════════════════════════════════════════════════════════════════════════

export const SHOP_INVENTORY: CosmeticItem[] = [
    // Card Skins
    {
        id: 'skin_classic',
        name: 'Classic Fade',
        description: 'The Timeless Look. Elegant and Understated.',
        category: 'card_skins',
        price: 0, // Free default
        rarity: 'common',
        previewImage: '/cosmetics/cards/classic.png',
        previewColor: '#1a1a2e'
    },
    {
        id: 'skin_cyberpunk',
        name: 'Cyberpunk Neon',
        description: 'Neon Edges and Holographic Finish. the Future is Now.',
        category: 'card_skins',
        price: 2500,
        rarity: 'epic',
        previewImage: '/cosmetics/cards/cyberpunk.png',
        previewColor: '#00d4ff'
    },
    {
        id: 'skin_golden_foil',
        name: 'Golden Foil',
        description: 'Pure Luxury. 24k Gold-plated Visual Treatment.',
        category: 'card_skins',
        price: 5000,
        rarity: 'legendary',
        previewImage: '/cosmetics/cards/golden.png',
        previewColor: '#FFD700'
    },
    {
        id: 'skin_midnight',
        name: 'Midnight Obsidian',
        description: 'Dark as the Void. for the Mysterious Grinder.',
        category: 'card_skins',
        price: 1500,
        rarity: 'rare',
        previewImage: '/cosmetics/cards/midnight.png',
        previewColor: '#2a2a4a'
    },
    {
        id: 'skin_phoenix',
        name: 'Phoenix Fire',
        description: 'Rise From the Ashes. Burning Edge Effects.',
        category: 'card_skins',
        price: 3500,
        rarity: 'epic',
        previewImage: '/cosmetics/cards/phoenix.png',
        previewColor: '#f59e0b'
    },

    // Table Felts
    {
        id: 'felt_green',
        name: 'Tournament Green',
        description: 'The Classic Tournament Look.',
        category: 'table_felts',
        price: 0,
        rarity: 'common',
        previewImage: '/cosmetics/felts/green.png',
        previewColor: '#166534'
    },
    {
        id: 'felt_midnight',
        name: 'Midnight Black',
        description: 'Pure Stealth. the Pros Choice.',
        category: 'table_felts',
        price: 1000,
        rarity: 'rare',
        previewImage: '/cosmetics/felts/midnight.png',
        previewColor: '#0a0a1a'
    },
    {
        id: 'felt_blue',
        name: 'Tournament Blue',
        description: 'Cool and Focused. High Stakes Energy.',
        category: 'table_felts',
        price: 1000,
        rarity: 'rare',
        previewImage: '/cosmetics/felts/blue.png',
        previewColor: '#1e40af'
    },
    {
        id: 'felt_orange',
        name: 'S.P. Orange',
        description: 'Official Smarter Poker Signature Felt.',
        category: 'table_felts',
        price: 2000,
        rarity: 'epic',
        previewImage: '/cosmetics/felts/orange.png',
        previewColor: '#f59e0b'
    },
    {
        id: 'felt_void',
        name: 'The Void',
        description: 'Pure Darkness with Floating Particle Effects.',
        category: 'table_felts',
        price: 4000,
        rarity: 'legendary',
        previewImage: '/cosmetics/felts/void.png',
        previewColor: '#000000'
    },

    // Avatar Sets
    {
        id: 'avatar_classic',
        name: 'Classic Pros',
        description: 'Professional Headshots. Clean and Serious.',
        category: 'avatars',
        price: 0,
        rarity: 'common',
        previewImage: '/cosmetics/avatars/classic.png',
        previewColor: '#6b7280'
    },
    {
        id: 'avatar_animals',
        name: 'Wild Animals',
        description: 'Lion, Eagle, Wolf, and More. Unleash Your Spirit Animal.',
        category: 'avatars',
        price: 1500,
        rarity: 'rare',
        previewImage: '/cosmetics/avatars/animals.png',
        previewColor: '#84cc16'
    },
    {
        id: 'avatar_mythical',
        name: 'Mythical Creatures',
        description: 'Werewolf, Wizard, Dragon. Fantasy at the Felt.',
        category: 'avatars',
        price: 3000,
        rarity: 'epic',
        previewImage: '/cosmetics/avatars/mythical.png',
        previewColor: '#a855f7'
    },
    {
        id: 'avatar_warriors',
        name: 'Battle Warriors',
        description: 'Samurai, Viking, Gladiator. Fight for the Pot.',
        category: 'avatars',
        price: 3000,
        rarity: 'epic',
        previewImage: '/cosmetics/avatars/warriors.png',
        previewColor: '#ef4444'
    },
    {
        id: 'avatar_cyber',
        name: 'Cyber Hackers',
        description: 'AI Bots and Hackers. Digital Domination.',
        category: 'avatars',
        price: 2500,
        rarity: 'epic',
        previewImage: '/cosmetics/avatars/cyber.png',
        previewColor: '#00d4ff'
    },
    {
        id: 'avatar_legends',
        name: 'Poker Legends',
        description: 'Inspired by the Greatest. VIP Exclusive.',
        category: 'avatars',
        price: 10000,
        rarity: 'legendary',
        previewImage: '/cosmetics/avatars/legends.png',
        previewColor: '#FFD700'
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// COLORS & STYLES
// ═══════════════════════════════════════════════════════════════════════════

const RARITY_COLORS = {
    common: { bg: '#6b7280', glow: 'rgba(107, 114, 128, 0.3)' },
    rare: { bg: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)' },
    epic: { bg: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
    legendary: { bg: '#FFD700', glow: 'rgba(255, 215, 0, 0.5)' }
};

const CATEGORY_LABELS: Record<CosmeticCategory, { label: string; emoji: string }> = {
    card_skins: { label: 'Card Skins', emoji: '🃏' },
    table_felts: { label: 'Table Felts', emoji: '🎱' },
    avatars: { label: 'Avatar Sets', emoji: '👤' },
    emotes: { label: 'Emotes', emoji: '😎' }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function CosmeticShop({
    isOpen,
    onClose,
    userProfile,
    onPurchase,
    onEquip
}: CosmeticShopProps) {
    const [activeCategory, setActiveCategory] = useState<CosmeticCategory>('card_skins');
    const [selectedItem, setSelectedItem] = useState<CosmeticItem | null>(null);
    const [justPurchased, setJustPurchased] = useState<string | null>(null);

    const filteredItems = useMemo(() =>
        SHOP_INVENTORY.filter(item => item.category === activeCategory),
        [activeCategory]
    );

    const handlePurchase = (item: CosmeticItem) => {
        if (userProfile.diamonds >= item.price) {
            onPurchase(item.id, item.price);
            setJustPurchased(item.id);
        }
    };

    const handleEquip = (item: CosmeticItem) => {
        onEquip(item.id, item.category);
        setJustPurchased(null);
    };

    const isOwned = (itemId: string) =>
        userProfile.unlockedAssets.includes(itemId) ||
        SHOP_INVENTORY.find(i => i.id === itemId)?.price === 0;

    const isEquipped = (item: CosmeticItem) => {
        switch (item.category) {
            case 'card_skins':
                return userProfile.equippedAssets.cardSkin === item.id;
            case 'table_felts':
                return userProfile.equippedAssets.tableFelt === item.id;
            case 'avatars':
                return userProfile.equippedAssets.avatar === item.id;
            default:
                return false;
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10000,
                    padding: '24px'
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 30 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 30 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: '100%',
                        maxWidth: '1000px',
                        maxHeight: '90vh',
                        background: 'linear-gradient(135deg, #0a0a1a, #1a1a3a)',
                        borderRadius: '24px',
                        border: '2px solid rgba(245, 158, 11, 0.5)',
                        boxShadow: '0 0 60px rgba(245, 158, 11, 0.3)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '20px 28px',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.2), transparent)',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <h2 style={{
                                fontSize: '24px',
                                fontWeight: 800,
                                margin: 0,
                                color: '#fff'
                            }}>
                                <img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/> Diamond Exchange
                            </h2>
                            <p style={{ fontSize: '13px', color: '#888', margin: '4px 0 0' }}>
                                Turn your grind into style
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                                padding: '8px 16px',
                                background: 'rgba(0,212,255,0.2)',
                                borderRadius: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '20px' }}><img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/></span>
                                <span style={{
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    color: '#00d4ff'
                                }}>
                                    {userProfile.diamonds.toLocaleString()}
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    background: 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    color: '#fff',
                                    fontSize: '20px',
                                    cursor: 'pointer'
                                }}
                            >
                                ×
                            </button>
                        </div>
                    </div>

                    {/* Category Tabs */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        padding: '16px 28px',
                        borderBottom: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {Object.entries(CATEGORY_LABELS).map(([key, { label, emoji }]) => (
                            <button
                                key={key}
                                onClick={() => setActiveCategory(key as CosmeticCategory)}
                                style={{
                                    padding: '10px 20px',
                                    background: activeCategory === key
                                        ? 'rgba(245,158,11,0.2)'
                                        : 'rgba(255,255,255,0.05)',
                                    border: activeCategory === key
                                        ? '2px solid #f59e0b'
                                        : '2px solid transparent',
                                    borderRadius: '10px',
                                    color: activeCategory === key ? '#f59e0b' : '#888',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <span>{emoji}</span>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Items Grid */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '24px 28px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '20px',
                        alignContent: 'start'
                    }}>
                        {filteredItems.map(item => (
                            <ShopItemCard
                                key={item.id}
                                item={item}
                                isOwned={isOwned(item.id)}
                                isEquipped={isEquipped(item)}
                                justPurchased={justPurchased === item.id}
                                canAfford={userProfile.diamonds >= item.price}
                                onSelect={() => setSelectedItem(item)}
                                onPurchase={() => handlePurchase(item)}
                                onEquip={() => handleEquip(item)}
                            />
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHOP ITEM CARD
// ═══════════════════════════════════════════════════════════════════════════

interface ShopItemCardProps {
    item: CosmeticItem;
    isOwned: boolean;
    isEquipped: boolean;
    justPurchased: boolean;
    canAfford: boolean;
    onSelect: () => void;
    onPurchase: () => void;
    onEquip: () => void;
}

function ShopItemCard({
    item,
    isOwned,
    isEquipped,
    justPurchased,
    canAfford,
    onSelect,
    onPurchase,
    onEquip
}: ShopItemCardProps) {
    const rarityStyle = RARITY_COLORS[item.rarity];

    return (
        <motion.div
            whileHover={{ scale: 1.03, y: -5 }}
            style={{
                background: 'rgba(20, 20, 40, 0.8)',
                borderRadius: '16px',
                border: `2px solid ${isEquipped ? '#22c55e' : rarityStyle.bg}`,
                boxShadow: `0 0 20px ${isEquipped ? 'rgba(34,197,94,0.4)' : rarityStyle.glow}`,
                overflow: 'hidden',
                cursor: 'pointer'
            }}
            onClick={onSelect}
        >
            {/* Preview */}
            <div style={{
                height: '120px',
                background: `linear-gradient(135deg, ${item.previewColor}44, #0a0a1a)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
            }}>
                {/* Rarity Badge */}
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    padding: '3px 10px',
                    background: rarityStyle.bg,
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: item.rarity === 'legendary' ? '#000' : '#fff',
                    textTransform: 'uppercase'
                }}>
                    {item.rarity}
                </div>

                {/* Owned/Equipped Badge */}
                {isEquipped && (
                    <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        padding: '3px 10px',
                        background: '#22c55e',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#fff'
                    }}>
                        EQUIPPED
                    </div>
                )}

                {/* Preview Visual */}
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '12px',
                    background: item.previewColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                    boxShadow: `0 0 30px ${item.previewColor}66`
                }}>
                    {getCategoryEmoji(item.category)}
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: '14px' }}>
                <h4 style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    margin: '0 0 4px',
                    color: '#fff'
                }}>
                    {item.name}
                </h4>
                <p style={{
                    fontSize: '11px',
                    color: '#888',
                    margin: '0 0 12px',
                    lineHeight: 1.4
                }}>
                    {item.description}
                </p>

                {/* Action Button */}
                {justPurchased ? (
                    <motion.button
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={(e) => { e.stopPropagation(); onEquip(); }}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        ✓ Equip Now!
                    </motion.button>
                ) : isOwned ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); onEquip(); }}
                        disabled={isEquipped}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: isEquipped
                                ? 'rgba(34,197,94,0.2)'
                                : 'rgba(255,255,255,0.1)',
                            border: isEquipped
                                ? '1px solid #22c55e'
                                : '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            color: isEquipped ? '#22c55e' : '#fff',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: isEquipped ? 'default' : 'pointer'
                        }}
                    >
                        {isEquipped ? '✓ Equipped' : 'Equip'}
                    </button>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPurchase(); }}
                        disabled={!canAfford}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: canAfford
                                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                : 'rgba(100,100,100,0.3)',
                            border: 'none',
                            borderRadius: '8px',
                            color: canAfford ? '#fff' : '#666',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: canAfford ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                        }}
                    >
                        <span><img src="/images/diamond.png" alt="Diamond" style={{width:20,height:20,display:"inline-block",verticalAlign:"middle"}}/></span>
                        {item.price === 0 ? 'FREE' : item.price.toLocaleString()}
                    </button>
                )}
            </div>
        </motion.div>
    );
}

function getCategoryEmoji(category: CosmeticCategory): string {
    switch (category) {
        case 'card_skins': return '🃏';
        case 'table_felts': return '🎱';
        case 'avatars': return '👤';
        case 'emotes': return '😎';
        default: return '✨';
    }
}

export default CosmeticShop;
