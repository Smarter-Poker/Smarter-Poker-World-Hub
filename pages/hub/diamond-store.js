/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND STORE — Purchase Diamonds
   Buy diamonds to use across the Smarter.Poker ecosystem
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

// God-Mode Stack
import { useDiamondStoreStore } from '../../src/stores/diamondStoreStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// XP SYSTEM — 55 Levels with Quadratic Progression
// Formula: XP Required = 1000 * level^1.2
// ═══════════════════════════════════════════════════════════════════════════
function generateXPLevels() {
    const levels = [];
    let cumulativeXP = 0;

    for (let level = 1; level <= 55; level++) {
        const xpForNextLevel = level === 55 ? 0 : Math.floor(1000 * Math.pow(level + 1, 1.2));
        const unlocks = [];

        // Define unlocks at key levels
        if (level === 1) unlocks.push('Basic Training Access');
        if (level === 5) unlocks.push('Social Feed Access');
        if (level === 10) unlocks.push('Custom Avatar Unlocked', 'Friend Invites');
        if (level === 15) unlocks.push('GTO Charts Access');
        if (level === 20) unlocks.push('Advanced Training Games', 'Profile Customization');
        if (level === 25) unlocks.push('Tournament Access', 'Leaderboard Visibility');
        if (level === 30) unlocks.push('Club Creation', 'Premium Badges');
        if (level === 35) unlocks.push('Diamond Arena Access');
        if (level === 40) unlocks.push('VIP Lounge Access', 'Exclusive Merch');
        if (level === 45) unlocks.push('Master Training Games');
        if (level === 50) unlocks.push('Legend Status', 'Gold Badge');
        if (level === 55) unlocks.push('Ultimate Champion', 'Platinum Badge', 'All Features Unlocked');

        levels.push({
            level,
            xpRequired: cumulativeXP,
            xpToNext: xpForNextLevel,
            unlocks
        });

        cumulativeXP += xpForNextLevel;
    }

    return levels;
}

const XP_LEVELS = generateXPLevels();

// ═══════════════════════════════════════════════════════════════════════════
// DIAMOND REWARDS — All Ways to Earn Diamonds
// ═══════════════════════════════════════════════════════════════════════════
const DIAMOND_REWARDS = {
    daily: [
        { icon: '📅', name: 'Daily Login', amount: '5-50 💎', note: 'Scales with streak (Day 1: 5💎, Day 7+: 50💎)' },
        { icon: '🎯', name: 'First Training of Day', amount: '+25 💎', note: 'Complete any training game' },
    ],
    training: [
        { icon: '✅', name: 'Level Complete (85%+)', amount: '+10 💎', note: 'Score 85% or higher' },
        { icon: '💯', name: 'Perfect Score Bonus', amount: '+5 💎', note: '100% accuracy bonus' },
        { icon: '🔓', name: 'New Level Unlocked', amount: '+50 💎', note: 'First time completing a level' },
        { icon: '🎓', name: 'Game Mastery', amount: '+100 💎', note: 'Complete all levels in a game' },
    ],
    social: [
        { icon: '💬', name: 'Strategy Comment', amount: '+5 💎', note: 'Post helpful strategy advice' },
        { icon: '📸', name: 'Social Post Share', amount: '+15 💎', note: 'Share your progress' },
        { icon: '❤️', name: 'Engagement Bonus', amount: '+2 💎', note: 'Per 10 likes/comments received' },
    ],
    progression: [
        { icon: '📈', name: 'XP Level Up', amount: '+100 💎', note: 'Each time you level up' },
        { icon: '🏆', name: 'Achievement Unlocked', amount: '+25 💎', note: 'Complete special achievements' },
        { icon: '🔥', name: 'Streak Milestone', amount: '+200 💎', note: 'Every 7-day streak maintained' },
    ],
    referral: [
        { icon: '✅', name: 'Verified Referral', amount: '+500 💎', note: 'Friend completes signup and first training' },
        { icon: '👑', name: 'VIP Referral', amount: '+1,000 💎', note: 'Referred friend purchases VIP' },
    ],
};

// ═══════════════════════════════════════════════════════════════════════════
// EASTER EGGS — Hidden Achievements
// ═══════════════════════════════════════════════════════════════════════════
const EASTER_EGGS = [
    { id: 'konami', icon: '🎮', name: 'Konami Code', reward: '+100 💎', trigger: 'Enter the classic code: ↑↑↓↓←→←→BA' },
    { id: 'night_owl', icon: '🦉', name: 'Night Owl', reward: '+50 💎', trigger: 'Complete training between 2-4 AM' },
    { id: 'early_bird', icon: '🐦', name: 'Early Bird', reward: '+50 💎', trigger: 'Complete training between 5-6 AM' },
    { id: 'perfect_week', icon: '💯', name: 'Perfect Week', reward: '+500 💎', trigger: 'Score 100% on 7 consecutive days' },
    { id: 'speed_demon', icon: '⚡', name: 'Speed Demon', reward: '+75 💎', trigger: 'Complete a level in under 60 seconds' },
    { id: 'comeback_kid', icon: '🔄', name: 'Comeback Kid', reward: '+150 💎', trigger: 'Return after 30+ day absence' },
    { id: 'social_butterfly', icon: '🦋', name: 'Social Butterfly', reward: '+200 💎', trigger: 'Make 100 friends' },
    { id: 'content_creator', icon: '📹', name: 'Content Creator', reward: '+300 💎', trigger: 'Post 50 strategy articles' },
    { id: 'helping_hand', icon: '🤝', name: 'Helping Hand', reward: '+250 💎', trigger: 'Help 25 users with strategy advice' },
    { id: 'jackpot', icon: '🎰', name: 'The Jackpot', reward: '+777 💎', trigger: 'Random 0.1% chance after any action' },
];

// ═══════════════════════════════════════════════════════════════════════════
// DIAMOND PACKAGES — 1 Diamond = 1 Cent ($0.01)
// 5% bonus on purchases of $100 or more
// ═══════════════════════════════════════════════════════════════════════════
const DIAMOND_PACKAGES = [
    {
        id: 'micro',
        name: 'Micro',
        diamonds: 100,
        price: 1.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'small',
        name: 'Small',
        diamonds: 500,
        price: 5.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'medium',
        name: 'Medium',
        diamonds: 1000,
        price: 10.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'standard',
        name: 'Standard',
        diamonds: 2500,
        price: 25.00,
        popular: true,
        bonus: 0,
    },
    {
        id: 'large',
        name: 'Large',
        diamonds: 5000,
        price: 50.00,
        popular: false,
        bonus: 0,
    },
    {
        id: 'value',
        name: 'Value',
        diamonds: 10000,
        price: 100.00,
        popular: false,
        bonus: 500, // 5% bonus
        hasDiscount: true,
    },
    {
        id: 'premium',
        name: 'Premium',
        diamonds: 25000,
        price: 250.00,
        popular: false,
        bonus: 1250, // 5% bonus
        hasDiscount: true,
    },
    {
        id: 'whale',
        name: 'Whale',
        diamonds: 50000,
        price: 500.00,
        popular: false,
        bonus: 2500, // 5% bonus
        hasDiscount: true,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// VIP MEMBERSHIP — $19.99/month for all features
// ═══════════════════════════════════════════════════════════════════════════
const VIP_MEMBERSHIP = {
    monthly: {
        id: 'vip-monthly',
        name: 'VIP Monthly',
        price: 19.99,
        interval: 'month',
        popular: true,
    },
    annual: {
        id: 'vip-annual',
        name: 'VIP Annual',
        price: 199.99,
        interval: 'year',
        savings: 39.89, // 2 months free
        popular: false,
    },
};

const VIP_BENEFITS = [
    // GOLD TIER CARD FEATURES
    { icon: '📊', title: 'Show Stack in BBs', description: 'Display chip stacks in big blinds for better decisions', value: 'Gold' },
    { icon: '🐰', title: 'Rabbit Hunting', description: 'See what cards would have come after folding', value: 'Gold' },
    { icon: '🛡️', title: 'Offline Protection', description: 'Protection when disconnected during hands', value: 'Gold' },
    { icon: '⏱️', title: 'Auto Time Bank', description: 'Automatic time bank activation', value: 'Gold' },
    { icon: '🕐', title: 'Free Time Bank', description: '+120 seconds of free time bank', value: '+120' },
    { icon: '🎨', title: 'Available Themes', description: '3 exclusive table themes to choose from', value: '+3' },
    { icon: '🏠', title: 'Club Creation Limit', description: 'Create up to 3 private clubs', value: '+3' },
    { icon: '😀', title: 'Free Emojis', description: '1,200 free emojis to use at the tables', value: '+1200' },
    { icon: '🏷️', title: 'Player Tags', description: '1,000 tags to track and label opponents', value: '+1000' },
    { icon: '📈', title: 'Leaderboard Boost', description: '6% score boost on all leaderboards', value: '+6%' },
    // SMARTER.POKER EXCLUSIVES
    { icon: '🎟️', title: 'Free Roll Entries', description: 'Free entry to all Diamond Arena freeroll tournaments', value: 'Unlimited' },
    { icon: '🧠', title: 'Premium Training', description: 'Full access to all training modules & drills', value: '$50/mo' },
    { icon: '🤖', title: 'AI Personal Assistant', description: 'Priority AI coaching & hand analysis', value: '$100/mo' },
    { icon: '🎁', title: 'Daily Diamond Bonus', description: '+25 💎 free every day ($7.50/mo value)', value: '$7.50/mo' },
    { icon: '✨', title: 'VIP Badge & Flair', description: 'Exclusive Gold VIP profile badge and cosmetics', value: 'Exclusive' },
    { icon: '🚀', title: '2x XP Boost', description: 'Double XP earnings on all activities', value: '$25/mo' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANDISE — Physical goods
// ═══════════════════════════════════════════════════════════════════════════
const MERCHANDISE = [
    {
        id: 'card-protector-gold',
        name: 'Gold Card Protector',
        description: 'Premium weighted card protector with Smarter.Poker logo',
        price: 24.99,
        image: '/merch/card-protector-gold.jpg',
        category: 'accessories',
    },
    {
        id: 'card-protector-black',
        name: 'Stealth Card Protector',
        description: 'Matte black weighted card protector',
        price: 24.99,
        image: '/merch/card-protector-black.jpg',
        category: 'accessories',
    },
    {
        id: 'hoodie-neural',
        name: 'Neural Network Hoodie',
        description: 'Premium hoodie with neural poker design',
        price: 59.99,
        image: '/merch/hoodie-neural.jpg',
        category: 'apparel',
    },
    {
        id: 'tshirt-gto',
        name: 'GTO Wizard Tee',
        description: '100% cotton tee with GTO brain graphic',
        price: 29.99,
        image: '/merch/tshirt-gto.jpg',
        category: 'apparel',
    },
    {
        id: 'hat-diamond',
        name: 'Diamond Dad Hat',
        description: 'Embroidered diamond logo cap',
        price: 34.99,
        image: '/merch/hat-diamond.jpg',
        category: 'apparel',
    },
    {
        id: 'deck-premium',
        name: 'Premium Playing Cards',
        description: 'Casino-quality Smarter.Poker deck',
        price: 14.99,
        image: '/merch/deck-premium.jpg',
        category: 'accessories',
    },
    {
        id: 'chip-set-100',
        name: '100-Chip Travel Set',
        description: 'Clay composite chips in aluminum case',
        price: 79.99,
        image: '/merch/chip-set-100.jpg',
        category: 'accessories',
    },
    {
        id: 'chip-set-500',
        name: '500-Chip Pro Set',
        description: 'Full tournament set with dealer button',
        price: 199.99,
        image: '/merch/chip-set-500.jpg',
        category: 'accessories',
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// PACKAGE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function PackageCard({ pkg, onSelect, isSelected }) {
    const totalDiamonds = pkg.diamonds + pkg.bonus;

    return (
        <div
            onClick={() => onSelect(pkg.id)}
            style={{
                position: 'relative',
                background: isSelected
                    ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(138, 43, 226, 0.2))'
                    : 'rgba(255, 255, 255, 0.05)',
                border: isSelected
                    ? '2px solid #00D4FF'
                    : pkg.popular
                        ? '2px solid rgba(255, 215, 0, 0.5)'
                        : pkg.hasDiscount
                            ? '2px solid rgba(0, 255, 136, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 16,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
            }}
        >
            {/* Popular Badge */}
            {pkg.popular && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    right: 16,
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    color: '#0a1628',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                }}>
                    Popular
                </div>
            )}

            {/* 5% Discount Badge */}
            {pkg.hasDiscount && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    right: 16,
                    background: 'linear-gradient(135deg, #00ff88, #00cc66)',
                    color: '#0a1628',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                }}>
                    +5% Bonus
                </div>
            )}

            {/* Diamond Count */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
            }}>
                <span style={{ fontSize: 32 }}>💎</span>
                <div>
                    <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 24,
                        fontWeight: 700,
                        color: '#00D4FF',
                    }}>
                        {totalDiamonds.toLocaleString()}
                    </div>
                    {pkg.bonus > 0 && (
                        <div style={{
                            fontSize: 11,
                            color: '#00ff88',
                            fontWeight: 600,
                        }}>
                            ({pkg.diamonds.toLocaleString()} + {pkg.bonus.toLocaleString()} bonus)
                        </div>
                    )}
                </div>
            </div>

            {/* Package Name */}
            <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#fff',
                marginBottom: 6,
            }}>
                {pkg.name}
            </div>

            {/* Price - 1 diamond = 1 cent */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <span style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#fff',
                }}>
                    ${pkg.price.toFixed(2)}
                </span>
                <span style={{
                    fontSize: 10,
                    color: 'rgba(255, 255, 255, 0.5)',
                }}>
                    1💎 = $0.01
                </span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VIP MEMBERSHIP CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function VIPCard({ plan, isSelected, onSelect }) {
    return (
        <div
            onClick={() => onSelect(plan.id)}
            style={{
                position: 'relative',
                background: isSelected
                    ? 'linear-gradient(135deg, rgba(24, 119, 242, 0.3), rgba(66, 133, 244, 0.3))'
                    : 'linear-gradient(135deg, rgba(24, 119, 242, 0.1), rgba(66, 133, 244, 0.1))',
                border: isSelected
                    ? '2px solid #1877F2'
                    : plan.popular
                        ? '2px solid rgba(24, 119, 242, 0.5)'
                        : '1px solid rgba(24, 119, 242, 0.3)',
                borderRadius: 16,
                padding: 24,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                flex: 1,
            }}
        >
            {plan.popular && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    right: 16,
                    background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                }}>
                    Recommended
                </div>
            )}

            {plan.savings && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    left: 16,
                    background: 'linear-gradient(135deg, #00ff88, #00cc66)',
                    color: '#0a1628',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 10,
                }}>
                    Save ${plan.savings.toFixed(2)}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 36 }}>👑</span>
                <div>
                    <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 20,
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        {plan.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
                        All features included
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>
                    ${plan.price.toFixed(2)}
                </span>
                <span style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.5)' }}>
                    /{plan.interval}
                </span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MERCHANDISE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function MerchCard({ item, onSelect }) {
    return (
        <div
            onClick={() => onSelect(item.id)}
            style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 12,
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
            }}
        >
            {/* Product Image Placeholder */}
            <div style={{
                height: 120,
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(138, 43, 226, 0.1))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
            }}>
                {item.category === 'apparel' ? '👕' : '🎴'}
            </div>

            <div style={{ padding: 14 }}>
                <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#fff',
                    marginBottom: 4,
                }}>
                    {item.name}
                </div>
                <div style={{
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.5)',
                    marginBottom: 8,
                    lineHeight: 1.4,
                }}>
                    {item.description}
                </div>
                <div style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#00D4FF',
                }}>
                    ${item.price.toFixed(2)}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAMOND STORE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function DiamondStorePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('diamonds'); // diamonds, vip, merch, rewards
    const [rewardsSubTab, setRewardsSubTab] = useState('overview'); // overview, diamonds, xp, eggs
    const [selectedPackage, setSelectedPackage] = useState('standard');
    const [selectedVIP, setSelectedVIP] = useState('vip-monthly');
    const [isProcessing, setIsProcessing] = useState(false);

    // 🎬 INTRO VIDEO STATE - Video plays while page loads in background
    // Only show once per session (not on every reload)
    const [showIntro, setShowIntro] = useState(() => {
        if (typeof window !== 'undefined') {
            return !sessionStorage.getItem('marketplace-intro-seen');
        }
        return false;
    });
    const introVideoRef = useRef(null);

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

    const handleDiamondPurchase = () => {
        if (!selectedPackage) return;
        setIsProcessing(true);
        // TODO: Stripe Checkout for one-time payment
        setTimeout(() => {
            setIsProcessing(false);
            alert('Stripe checkout coming soon! Diamonds will be added to your account after purchase.');
        }, 1000);
    };

    const handleVIPSubscribe = () => {
        if (!selectedVIP) return;
        setIsProcessing(true);
        // TODO: Stripe Subscription checkout
        setTimeout(() => {
            setIsProcessing(false);
            alert('Stripe subscription coming soon! VIP access will be activated after payment.');
        }, 1000);
    };

    const handleMerchPurchase = (itemId) => {
        // TODO: Stripe Checkout for merchandise
        alert(`Merch store coming soon! Item: ${itemId}`);
    };

    const selectedPkg = DIAMOND_PACKAGES.find(p => p.id === selectedPackage);
    const selectedVIPPlan = selectedVIP === 'vip-monthly' ? VIP_MEMBERSHIP.monthly : VIP_MEMBERSHIP.annual;

    return (
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
                            objectFit: 'cover'
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
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
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
                <div style={styles.header}>
                    <div style={{ width: 100 }} />
                    <h1 style={styles.pageTitle}>💎 Store</h1>
                    <div style={{ width: 100 }} />
                </div>

                {/* Tab Navigation */}
                <div style={styles.tabNav}>
                    <button
                        onClick={() => setActiveTab('diamonds')}
                        style={{
                            ...styles.tabButton,
                            ...(activeTab === 'diamonds' ? styles.tabButtonActive : {}),
                        }}
                    >
                        💎 Diamonds
                    </button>
                    <button
                        onClick={() => setActiveTab('vip')}
                        style={{
                            ...styles.tabButton,
                            ...(activeTab === 'vip' ? styles.tabButtonActiveVIP : {}),
                        }}
                    >
                        👑 VIP Membership
                    </button>
                    <button
                        onClick={() => setActiveTab('merch')}
                        style={{
                            ...styles.tabButton,
                            ...(activeTab === 'merch' ? styles.tabButtonActive : {}),
                        }}
                    >
                        🛍️ Merch
                    </button>
                    <button
                        onClick={() => setActiveTab('rewards')}
                        style={{
                            ...styles.tabButton,
                            ...(activeTab === 'rewards' ? styles.tabButtonActive : {}),
                        }}
                    >
                        🎁 Smarter Rewards
                    </button>
                </div>

                {/* Main Content */}
                <div style={styles.content}>

                    {/* ═══════════════════════════════════════════════════════════════════ */}
                    {/* DIAMONDS TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════ */}
                    {activeTab === 'diamonds' && (
                        <>
                            {/* Intro */}
                            <div style={styles.intro}>
                                <p style={styles.introText}>
                                    <strong>1 Diamond = $0.01</strong> — Use diamonds for tournament entries,
                                    premium training, cosmetics, and more. <span style={{ color: '#00ff88' }}>5% bonus on $100+ purchases!</span>
                                </p>
                            </div>

                            {/* Package Grid */}
                            <div style={styles.packageGrid}>
                                {DIAMOND_PACKAGES.map(pkg => (
                                    <PackageCard
                                        key={pkg.id}
                                        pkg={pkg}
                                        isSelected={selectedPackage === pkg.id}
                                        onSelect={setSelectedPackage}
                                    />
                                ))}
                            </div>

                            {/* Purchase Section */}
                            <div style={styles.purchaseSection}>
                                <div style={styles.selectedInfo}>
                                    {selectedPkg && (
                                        <>
                                            <span style={styles.selectedLabel}>Selected:</span>
                                            <span style={styles.selectedName}>{selectedPkg.name}</span>
                                            <span style={styles.selectedDiamonds}>
                                                💎 {(selectedPkg.diamonds + selectedPkg.bonus).toLocaleString()}
                                            </span>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={handleDiamondPurchase}
                                    disabled={!selectedPackage || isProcessing}
                                    style={{
                                        ...styles.purchaseButton,
                                        opacity: (!selectedPackage || isProcessing) ? 0.6 : 1,
                                    }}
                                >
                                    {isProcessing ? 'Processing...' : `Purchase for $${selectedPkg?.price.toFixed(2) || '0.00'}`}
                                </button>
                            </div>
                        </>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════════ */}
                    {/* VIP MEMBERSHIP TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════ */}
                    {activeTab === 'vip' && (
                        <>
                            {/* VIP Hero */}
                            <div style={styles.vipHero}>
                                <h2 style={styles.vipTitle}>👑 VIP Membership</h2>
                                <p style={styles.vipSubtitle}>
                                    Unlock <strong>everything</strong> for one low monthly price. No diamond costs, no limits.
                                </p>
                            </div>

                            {/* VIP Plan Selection */}
                            <div style={styles.vipPlansRow}>
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

                            {/* Subscribe Button */}
                            <div style={styles.vipSubscribeSection}>
                                <button
                                    onClick={handleVIPSubscribe}
                                    disabled={isProcessing}
                                    style={{
                                        ...styles.vipSubscribeButton,
                                        opacity: isProcessing ? 0.6 : 1,
                                    }}
                                >
                                    {isProcessing ? 'Processing...' : `Subscribe for $${selectedVIPPlan.price.toFixed(2)}/${selectedVIPPlan.interval}`}
                                </button>
                                <p style={styles.vipCancelNote}>Cancel anytime. No commitment required.</p>
                            </div>

                            {/* VIP Benefits Table */}
                            <div style={styles.benefitsSection}>
                                <h3 style={styles.benefitsTitle}>Everything Included with VIP</h3>
                                <div style={styles.benefitsGrid}>
                                    {VIP_BENEFITS.map((benefit, idx) => (
                                        <div key={idx} style={styles.benefitCard}>
                                            <span style={styles.benefitIcon}>{benefit.icon}</span>
                                            <div style={styles.benefitInfo}>
                                                <div style={styles.benefitTitle}>{benefit.title}</div>
                                                <div style={styles.benefitDesc}>{benefit.description}</div>
                                            </div>
                                            <div style={styles.benefitValue}>{benefit.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Value Comparison */}
                            <div style={styles.valueComparison}>
                                <div style={styles.valueBox}>
                                    <div style={styles.valueLabel}>Total Feature Value</div>
                                    <div style={styles.valueAmount}>$200+/mo</div>
                                </div>
                                <div style={styles.valueDivider}>→</div>
                                <div style={styles.valueBoxHighlight}>
                                    <div style={styles.valueLabel}>VIP Price</div>
                                    <div style={styles.vipPrice}>$19.99/mo</div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════════ */}
                    {/* MERCHANDISE TAB */}
                    {/* ═══════════════════════════════════════════════════════════════════ */}
                    {activeTab === 'merch' && (
                        <>
                            <div style={styles.intro}>
                                <h2 style={styles.merchTitle}>🛍️ Official Merch</h2>
                                <p style={styles.introText}>
                                    Rep the Smarter.Poker brand at the tables. Premium quality gear for serious players.
                                </p>
                            </div>

                            {/* Apparel Section */}
                            <div style={styles.merchSection}>
                                <h3 style={styles.merchCategoryTitle}>👕 Apparel</h3>
                                <div style={styles.merchGrid}>
                                    {MERCHANDISE.filter(m => m.category === 'apparel').map(item => (
                                        <MerchCard key={item.id} item={item} onSelect={handleMerchPurchase} />
                                    ))}
                                </div>
                            </div>

                            {/* Accessories Section */}
                            <div style={styles.merchSection}>
                                <h3 style={styles.merchCategoryTitle}>🎴 Accessories</h3>
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
                            {/* Sub-Tab Navigation */}
                            <div style={styles.rewardsSubNav}>
                                <button
                                    onClick={() => setRewardsSubTab('overview')}
                                    style={{
                                        ...styles.rewardsSubTab,
                                        ...(rewardsSubTab === 'overview' ? styles.rewardsSubTabActive : {}),
                                    }}
                                >
                                    📋 Overview
                                </button>
                                <button
                                    onClick={() => setRewardsSubTab('diamonds')}
                                    style={{
                                        ...styles.rewardsSubTab,
                                        ...(rewardsSubTab === 'diamonds' ? styles.rewardsSubTabActive : {}),
                                    }}
                                >
                                    💎 Diamond Rewards
                                </button>
                                <button
                                    onClick={() => setRewardsSubTab('xp')}
                                    style={{
                                        ...styles.rewardsSubTab,
                                        ...(rewardsSubTab === 'xp' ? styles.rewardsSubTabActive : {}),
                                    }}
                                >
                                    📈 XP System
                                </button>
                                <button
                                    onClick={() => setRewardsSubTab('eggs')}
                                    style={{
                                        ...styles.rewardsSubTab,
                                        ...(rewardsSubTab === 'eggs' ? styles.rewardsSubTabActive : {}),
                                    }}
                                >
                                    🎁 Easter Eggs
                                </button>
                            </div>

                            {/* OVERVIEW SUB-TAB */}
                            {rewardsSubTab === 'overview' && (
                                <div style={styles.rewardsOverview}>
                                    <h2 style={styles.earnTitle}>🎁 Smarter Rewards</h2>
                                    <p style={styles.introText}>
                                        Welcome to the Smarter Rewards system! Earn diamonds and XP by playing, training, and engaging with the community.
                                    </p>

                                    <div style={styles.overviewGrid}>
                                        <div style={styles.overviewCard}>
                                            <div style={styles.overviewIcon}>💎</div>
                                            <h3 style={styles.overviewCardTitle}>Diamond Rewards</h3>
                                            <p style={styles.overviewCardText}>
                                                Earn diamonds through daily logins, training, social engagement, and referrals.
                                                <strong style={{ color: '#00ff88' }}> Daily cap: 500 💎</strong> with streak multipliers!
                                            </p>
                                        </div>

                                        <div style={styles.overviewCard}>
                                            <div style={styles.overviewIcon}>📈</div>
                                            <h3 style={styles.overviewCardTitle}>XP System</h3>
                                            <p style={styles.overviewCardText}>
                                                Progress through <strong>55 levels</strong> by earning XP. Each level unlocks new features,
                                                badges, and exclusive content. Level up to become a legend!
                                            </p>
                                        </div>

                                        <div style={styles.overviewCard}>
                                            <div style={styles.overviewIcon}>🎁</div>
                                            <h3 style={styles.overviewCardTitle}>Easter Eggs</h3>
                                            <p style={styles.overviewCardText}>
                                                Discover <strong>hidden achievements</strong> throughout the platform.
                                                From the Konami Code to perfect week streaks, find them all for bonus rewards!
                                            </p>
                                        </div>
                                    </div>

                                    <div style={styles.quickStats}>
                                        <div style={styles.quickStat}>
                                            <span style={styles.quickStatValue}>500 💎</span>
                                            <span style={styles.quickStatLabel}>Daily Cap</span>
                                        </div>
                                        <div style={styles.quickStat}>
                                            <span style={styles.quickStatValue}>55</span>
                                            <span style={styles.quickStatLabel}>XP Levels</span>
                                        </div>
                                        <div style={styles.quickStat}>
                                            <span style={styles.quickStatValue}>10+</span>
                                            <span style={styles.quickStatLabel}>Easter Eggs</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DIAMOND REWARDS SUB-TAB */}
                            {rewardsSubTab === 'diamonds' && (
                                <div style={styles.diamondRewardsSection}>
                                    <h2 style={styles.earnTitle}>💎 Diamond Rewards</h2>
                                    <p style={styles.introText}>
                                        All the ways you can earn diamonds on Smarter.Poker
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

                                    {/* Daily Rewards */}
                                    <div style={styles.rewardCategory}>
                                        <h3 style={styles.categoryTitle}>📅 Daily Rewards</h3>
                                        <div style={styles.rewardList}>
                                            {DIAMOND_REWARDS.daily.map((reward, idx) => (
                                                <div key={idx} style={styles.rewardItem}>
                                                    <span style={styles.rewardIcon}>{reward.icon}</span>
                                                    <div style={styles.rewardDetails}>
                                                        <span style={styles.rewardName}>{reward.name}</span>
                                                        <span style={styles.rewardNote}>{reward.note}</span>
                                                    </div>
                                                    <span style={styles.rewardAmount}>{reward.amount}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Training Rewards */}
                                    <div style={styles.rewardCategory}>
                                        <h3 style={styles.categoryTitle}>🎯 Training Rewards</h3>
                                        <div style={styles.rewardList}>
                                            {DIAMOND_REWARDS.training.map((reward, idx) => (
                                                <div key={idx} style={styles.rewardItem}>
                                                    <span style={styles.rewardIcon}>{reward.icon}</span>
                                                    <div style={styles.rewardDetails}>
                                                        <span style={styles.rewardName}>{reward.name}</span>
                                                        <span style={styles.rewardNote}>{reward.note}</span>
                                                    </div>
                                                    <span style={styles.rewardAmount}>{reward.amount}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Social Rewards */}
                                    <div style={styles.rewardCategory}>
                                        <h3 style={styles.categoryTitle}>💬 Social Rewards</h3>
                                        <div style={styles.rewardList}>
                                            {DIAMOND_REWARDS.social.map((reward, idx) => (
                                                <div key={idx} style={styles.rewardItem}>
                                                    <span style={styles.rewardIcon}>{reward.icon}</span>
                                                    <div style={styles.rewardDetails}>
                                                        <span style={styles.rewardName}>{reward.name}</span>
                                                        <span style={styles.rewardNote}>{reward.note}</span>
                                                    </div>
                                                    <span style={styles.rewardAmount}>{reward.amount}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Progression Rewards */}
                                    <div style={styles.rewardCategory}>
                                        <h3 style={styles.categoryTitle}>📈 Progression Rewards</h3>
                                        <div style={styles.rewardList}>
                                            {DIAMOND_REWARDS.progression.map((reward, idx) => (
                                                <div key={idx} style={styles.rewardItem}>
                                                    <span style={styles.rewardIcon}>{reward.icon}</span>
                                                    <div style={styles.rewardDetails}>
                                                        <span style={styles.rewardName}>{reward.name}</span>
                                                        <span style={styles.rewardNote}>{reward.note}</span>
                                                    </div>
                                                    <span style={styles.rewardAmount}>{reward.amount}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Referral Rewards */}
                                    <div style={styles.rewardCategory}>
                                        <h3 style={styles.categoryTitle}>👥 Referral Rewards (Bypasses Cap!)</h3>
                                        <div style={styles.rewardList}>
                                            {DIAMOND_REWARDS.referral.map((reward, idx) => (
                                                <div key={idx} style={{ ...styles.rewardItem, ...styles.referralHighlight }}>
                                                    <span style={styles.rewardIcon}>{reward.icon}</span>
                                                    <div style={styles.rewardDetails}>
                                                        <span style={styles.rewardName}>{reward.name}</span>
                                                        <span style={styles.rewardNote}>{reward.note}</span>
                                                    </div>
                                                    <span style={styles.referralReward}>{reward.amount}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* XP SYSTEM SUB-TAB */}
                            {rewardsSubTab === 'xp' && (
                                <div style={styles.xpSystemSection}>
                                    <h2 style={styles.earnTitle}>📈 XP System - 55 Levels</h2>
                                    <p style={styles.introText}>
                                        Progress through 55 levels by earning XP. Formula: <code style={styles.formula}>1000 × level^1.2</code>
                                    </p>

                                    <div style={styles.xpTableContainer}>
                                        <table style={styles.xpTable}>
                                            <thead>
                                                <tr style={styles.xpTableHeader}>
                                                    <th style={styles.xpTableHeaderCell}>Level</th>
                                                    <th style={styles.xpTableHeaderCell}>Total XP Required</th>
                                                    <th style={styles.xpTableHeaderCell}>XP to Next</th>
                                                    <th style={styles.xpTableHeaderCell}>Unlocks</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {XP_LEVELS.map((levelData) => (
                                                    <tr key={levelData.level} style={styles.xpTableRow}>
                                                        <td style={styles.xpTableCell}>
                                                            <span style={styles.levelBadge}>Lv {levelData.level}</span>
                                                        </td>
                                                        <td style={styles.xpTableCell}>
                                                            {levelData.xpRequired.toLocaleString()} XP
                                                        </td>
                                                        <td style={styles.xpTableCell}>
                                                            {levelData.xpToNext > 0 ? `${levelData.xpToNext.toLocaleString()} XP` : 'MAX'}
                                                        </td>
                                                        <td style={styles.xpTableCell}>
                                                            {levelData.unlocks.length > 0 ? (
                                                                <div style={styles.unlocksList}>
                                                                    {levelData.unlocks.map((unlock, idx) => (
                                                                        <span key={idx} style={styles.unlockBadge}>{unlock}</span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span style={styles.noUnlocks}>—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* EASTER EGGS SUB-TAB */}
                            {rewardsSubTab === 'eggs' && (
                                <div style={styles.easterEggsSection}>
                                    <h2 style={styles.earnTitle}>🎁 Easter Eggs - Hidden Achievements</h2>
                                    <p style={styles.introText}>
                                        Discover hidden achievements throughout Smarter.Poker for bonus rewards!
                                    </p>

                                    <div style={styles.eggGrid}>
                                        {EASTER_EGGS.map((egg) => (
                                            <div key={egg.id} style={styles.eggCard}>
                                                <div style={styles.eggIcon}>{egg.icon}</div>
                                                <h3 style={styles.eggName}>{egg.name}</h3>
                                                <div style={styles.eggReward}>{egg.reward}</div>
                                                <p style={styles.eggTrigger}>{egg.trigger}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Legal Note */}
                    <p style={styles.legalNote}>
                        Diamonds are virtual currency and have no real-world cash value.
                        All purchases are final. See our <a href="/terms" style={styles.link}>Terms of Service</a> for details.
                    </p>
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#18191A',
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
    xpSystemSection: {
        padding: '32px 24px',
    },
    formula: {
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '2px 8px',
        borderRadius: 4,
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#00D4FF',
    },
    xpTableContainer: {
        marginTop: 24,
        overflowX: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        background: 'rgba(255, 255, 255, 0.02)',
    },
    xpTable: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    xpTableHeader: {
        background: 'rgba(255, 255, 255, 0.05)',
        borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
    },
    xpTableHeaderCell: {
        padding: '16px',
        textAlign: 'left',
        fontSize: 12,
        fontWeight: 700,
        color: '#E4E6EB',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    xpTableRow: {
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        transition: 'background 0.2s ease',
    },
    xpTableCell: {
        padding: '16px',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
    },
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
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: 500,
        margin: '0 auto',
        lineHeight: 1.6,
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
