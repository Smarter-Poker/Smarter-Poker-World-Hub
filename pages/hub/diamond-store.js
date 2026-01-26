/* ═══════════════════════════════════════════════════════════════════════════
   DIAMOND STORE — Purchase Diamonds
   Buy diamonds to use across the Smarter.Poker ecosystem
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

// God-Mode Stack
import { useDiamondStoreStore } from '../../src/stores/diamondStoreStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

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
                    ? 'linear-gradient(135deg, rgba(138, 43, 226, 0.3), rgba(255, 107, 157, 0.3))'
                    : 'linear-gradient(135deg, rgba(138, 43, 226, 0.1), rgba(255, 107, 157, 0.1))',
                border: isSelected
                    ? '2px solid #8a2be2'
                    : plan.popular
                        ? '2px solid rgba(138, 43, 226, 0.5)'
                        : '1px solid rgba(138, 43, 226, 0.3)',
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
                    background: 'linear-gradient(135deg, #8a2be2, #ff6b9d)',
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
    const [activeTab, setActiveTab] = useState('diamonds'); // diamonds, vip, merch
    const [selectedPackage, setSelectedPackage] = useState('standard');
    const [selectedVIP, setSelectedVIP] = useState('vip-monthly');
    const [isProcessing, setIsProcessing] = useState(false);

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
            <Head>
                <title>Diamond Store — Smarter.Poker</title>
                <meta name="description" content="Purchase diamonds to unlock premium features" />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .diamond-store-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .diamond-store-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .diamond-store-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .diamond-store-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .diamond-store-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .diamond-store-page { zoom: 1.5; } }
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

                    {/* YELLOW BALL: DIAMOND REWARD SYSTEM V1.0 */}
                    <div style={styles.rewardSystem}>
                        <h2 style={styles.earnTitle}>💰 Diamond Reward System</h2>

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

                        {/* Standard Payouts */}
                        <div style={styles.payoutSection}>
                            <h3 style={styles.payoutTitle}>📊 Standard Payouts</h3>
                            <div style={styles.payoutGrid}>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>📅</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>Daily Login</span>
                                        <span style={styles.payoutNote}>Scales with streak</span>
                                    </div>
                                    <span style={styles.payoutReward}>5-50 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>🎯</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>First Training of Day</span>
                                    </div>
                                    <span style={styles.payoutReward}>+25 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>✅</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>Level Complete (85%+)</span>
                                    </div>
                                    <span style={styles.payoutReward}>+10 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>💯</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>Perfect Score Bonus</span>
                                    </div>
                                    <span style={styles.payoutReward}>+5 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>🔓</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>New Level Unlocked</span>
                                    </div>
                                    <span style={styles.payoutReward}>+50 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>📝</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>Social Post Share</span>
                                    </div>
                                    <span style={styles.payoutReward}>+15 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>💬</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>Strategy Comment</span>
                                    </div>
                                    <span style={styles.payoutReward}>+5 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>⬆️</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>XP Level Up</span>
                                    </div>
                                    <span style={styles.payoutReward}>+100 💎</span>
                                </div>
                                <div style={styles.payoutCard}>
                                    <span style={styles.payoutIcon}>📊</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>GTO Chart Study (3+ min)</span>
                                    </div>
                                    <span style={styles.payoutReward}>+10 💎</span>
                                </div>
                                <div style={{ ...styles.payoutCard, ...styles.referralCard }}>
                                    <span style={styles.payoutIcon}>👥</span>
                                    <div style={styles.payoutInfo}>
                                        <span style={styles.payoutName}>Referral Success</span>
                                        <span style={styles.bypassNote}>⚡ Bypasses Cap!</span>
                                    </div>
                                    <span style={styles.referralReward}>+500 💎</span>
                                </div>
                            </div>
                        </div>

                        {/* 5-PILLAR EASTER EGG SYSTEM */}
                        <div style={styles.easterSection}>
                            <h3 style={styles.easterTitle}>🎯 5-Pillar Achievement System</h3>
                            <p style={styles.easterSubtitle}>100 hidden achievements across 5 legendary pillars!</p>

                            <div style={styles.pillarGrid}>
                                {/* PILLAR 1: Arena Meta */}
                                <div style={{ ...styles.pillarCard, borderColor: '#00D4FF' }}>
                                    <div style={styles.pillarHeader}>
                                        <span style={{ ...styles.pillarIcon, background: 'linear-gradient(135deg, #00D4FF, #0088cc)' }}>🏟️</span>
                                        <div>
                                            <div style={styles.pillarName}>Arena Meta & Interaction</div>
                                            <div style={styles.pillarRange}>Pillar 1 • 20 Achievements</div>
                                        </div>
                                    </div>
                                    <div style={styles.pillarExamples}>
                                        <div style={styles.exampleRow}><span>🔍</span> The Searcher <span style={styles.exDiamonds}>+10</span></div>
                                        <div style={styles.exampleRow}><span>💻</span> Terminal Pro <span style={styles.exDiamondsEpic}>+100</span></div>
                                        <div style={styles.exampleRow}><span>🖥️</span> Hardware Flex <span style={styles.exDiamondsEpic}>+100</span></div>
                                    </div>
                                </div>

                                {/* PILLAR 2: Social Velocity */}
                                <div style={{ ...styles.pillarCard, borderColor: '#00ff88' }}>
                                    <div style={styles.pillarHeader}>
                                        <span style={{ ...styles.pillarIcon, background: 'linear-gradient(135deg, #00ff88, #00cc66)' }}>📢</span>
                                        <div>
                                            <div style={styles.pillarName}>Social Velocity & Recruitment</div>
                                            <div style={styles.pillarRange}>Pillar 2 • 20 Achievements</div>
                                        </div>
                                    </div>
                                    <div style={styles.pillarExamples}>
                                        <div style={styles.exampleRow}><span>✅</span> Verified Referral <span style={styles.exDiamondsEpic}>+500</span></div>
                                        <div style={styles.exampleRow}><span>🎖️</span> The Recruiter <span style={styles.exDiamondsLegendary}>+1,000</span></div>
                                        <div style={styles.exampleRow}><span>👑</span> Legacy Recruiter <span style={styles.exDiamondsEpic}>+250</span></div>
                                    </div>
                                </div>

                                {/* PILLAR 3: GTO Mastery */}
                                <div style={{ ...styles.pillarCard, borderColor: '#8a2be2' }}>
                                    <div style={styles.pillarHeader}>
                                        <span style={{ ...styles.pillarIcon, background: 'linear-gradient(135deg, #8a2be2, #6a1ba2)' }}>🧠</span>
                                        <div>
                                            <div style={styles.pillarName}>GTO & Theory Mastery</div>
                                            <div style={styles.pillarRange}>Pillar 3 • 20 Achievements</div>
                                        </div>
                                    </div>
                                    <div style={styles.pillarExamples}>
                                        <div style={styles.exampleRow}><span>📚</span> Deep Study <span style={styles.exDiamonds}>+20</span></div>
                                        <div style={styles.exampleRow}><span>🎯</span> Zero Assistance <span style={styles.exDiamondsRare}>+50</span></div>
                                        <div style={styles.exampleRow}><span>💪</span> The Grinder <span style={styles.exDiamondsEpic}>+100</span></div>
                                    </div>
                                </div>

                                {/* PILLAR 4: Streak & Loyalty */}
                                <div style={{ ...styles.pillarCard, borderColor: '#ff6b9d' }}>
                                    <div style={styles.pillarHeader}>
                                        <span style={{ ...styles.pillarIcon, background: 'linear-gradient(135deg, #ff6b9d, #cc5577)' }}>📈</span>
                                        <div>
                                            <div style={styles.pillarName}>Streak & Loyalty</div>
                                            <div style={styles.pillarRange}>Pillar 4 • 20 Achievements</div>
                                        </div>
                                    </div>
                                    <div style={styles.pillarExamples}>
                                        <div style={styles.exampleRow}><span>🔒</span> Loyalty Lock (7-day) <span style={styles.exDiamondsRare}>+100</span></div>
                                        <div style={styles.exampleRow}><span>5️⃣0️⃣</span> Half-Century <span style={styles.exDiamondsLegendary}>+500</span></div>
                                        <div style={styles.exampleRow}><span>💯</span> The Centurion <span style={styles.exDiamondsLegendary}>+1,000</span></div>
                                    </div>
                                </div>

                                {/* PILLAR 5: Arena Challenges */}
                                <div style={{ ...styles.pillarCard, borderColor: '#FFD700' }}>
                                    <div style={styles.pillarHeader}>
                                        <span style={{ ...styles.pillarIcon, background: 'linear-gradient(135deg, #FFD700, #cc9900)' }}>🎰</span>
                                        <div>
                                            <div style={styles.pillarName}>Arena Challenges & Easter Eggs</div>
                                            <div style={styles.pillarRange}>Pillar 5 • 20 Achievements</div>
                                        </div>
                                    </div>
                                    <div style={styles.pillarExamples}>
                                        <div style={styles.exampleRow}><span>🎰</span> The Jackpot (0.1%) <span style={styles.exDiamondsLegendary}>+777</span></div>
                                        <div style={styles.exampleRow}><span>🎮</span> Konami Code <span style={styles.exDiamondsEpic}>+100</span></div>
                                        <div style={styles.exampleRow}><span>🐋</span> The Whale <span style={styles.exDiamondsLegendary}>+5,000</span></div>
                                    </div>
                                </div>
                            </div>

                            <div style={styles.legendaryNote}>
                                🏆 <strong>LEGENDARY DISCOVERIES:</strong> The Recruiter (+1,000 💎), Half-Century (+500 💎),
                                The Centurion (+1,000 💎), Gold Member (+1,000 💎), The Whale (+5,000 💎), The Architect (+1,000 💎)
                            </div>
                        </div>
                    </div>

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
        background: '#0a1628',
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
        background: 'rgba(10, 22, 40, 0.95)',
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
        background: 'rgba(10, 22, 40, 0.8)',
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
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(255, 107, 157, 0.2))',
        border: '1px solid #8a2be2',
        color: '#ff6b9d',
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
        color: '#fff',
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
        background: 'linear-gradient(135deg, #8a2be2, #ff6b9d)',
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
        background: 'linear-gradient(135deg, #8a2be2, #ff6b9d)',
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
        color: '#fff',
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
        background: 'rgba(138, 43, 226, 0.1)',
        border: '1px solid rgba(138, 43, 226, 0.2)',
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
        color: '#fff',
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
        background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.2), rgba(255, 107, 157, 0.2))',
        borderRadius: 12,
        border: '2px solid #8a2be2',
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
        color: '#ff6b9d',
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
        color: '#fff',
        marginBottom: 12,
    },
    merchSection: {
        marginBottom: 32,
    },
    merchCategoryTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 16,
    },
    merchGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
    },
};
