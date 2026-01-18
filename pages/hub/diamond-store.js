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

// ═══════════════════════════════════════════════════════════════════════════
// DIAMOND PACKAGES — Available for purchase
// ═══════════════════════════════════════════════════════════════════════════
const DIAMOND_PACKAGES = [
    {
        id: 'starter',
        name: 'Starter Pack',
        diamonds: 100,
        price: 0.99,
        popular: false,
        bonus: 0,
    },
    {
        id: 'essential',
        name: 'Essential Pack',
        diamonds: 500,
        price: 3.99,
        popular: false,
        bonus: 50,
    },
    {
        id: 'popular',
        name: 'Popular Pack',
        diamonds: 1200,
        price: 8.99,
        popular: true,
        bonus: 200,
    },
    {
        id: 'value',
        name: 'Value Pack',
        diamonds: 2500,
        price: 16.99,
        popular: false,
        bonus: 500,
    },
    {
        id: 'premium',
        name: 'Premium Pack',
        diamonds: 6500,
        price: 39.99,
        popular: false,
        bonus: 1500,
    },
    {
        id: 'ultimate',
        name: 'Ultimate Pack',
        diamonds: 15000,
        price: 79.99,
        popular: false,
        bonus: 5000,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// PACKAGE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function PackageCard({ pkg, onSelect, isSelected }) {
    const totalDiamonds = pkg.diamonds + pkg.bonus;
    const pricePerDiamond = (pkg.price / totalDiamonds).toFixed(4);

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
                        : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 16,
                padding: 24,
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
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 10,
                    textTransform: 'uppercase',
                }}>
                    Most Popular
                </div>
            )}

            {/* Diamond Count */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
            }}>
                <span style={{ fontSize: 40 }}>💎</span>
                <div>
                    <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 28,
                        fontWeight: 700,
                        color: '#00D4FF',
                    }}>
                        {totalDiamonds.toLocaleString()}
                    </div>
                    {pkg.bonus > 0 && (
                        <div style={{
                            fontSize: 12,
                            color: '#00ff88',
                            fontWeight: 600,
                        }}>
                            +{pkg.bonus.toLocaleString()} BONUS
                        </div>
                    )}
                </div>
            </div>

            {/* Package Name */}
            <div style={{
                fontSize: 18,
                fontWeight: 600,
                color: '#fff',
                marginBottom: 8,
            }}>
                {pkg.name}
            </div>

            {/* Price */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <span style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#fff',
                }}>
                    ${pkg.price.toFixed(2)}
                </span>
                <span style={{
                    fontSize: 11,
                    color: 'rgba(255, 255, 255, 0.5)',
                }}>
                    ${pricePerDiamond}/💎
                </span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAMOND STORE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function DiamondStorePage() {
    const router = useRouter();
    const [selectedPackage, setSelectedPackage] = useState('popular');
    const [isProcessing, setIsProcessing] = useState(false);

    const handlePurchase = () => {
        if (!selectedPackage) return;

        setIsProcessing(true);

        // TODO: Integrate with payment processor (Stripe, etc.)
        setTimeout(() => {
            setIsProcessing(false);
            alert('Payment integration coming soon! Diamonds will be added to your account after purchase.');
        }, 1000);
    };

    const selectedPkg = DIAMOND_PACKAGES.find(p => p.id === selectedPackage);

    return (
        <>
            <Head>
                <title>Diamond Store — Smarter.Poker</title>
                <meta name="description" content="Purchase diamonds to unlock premium features" />
                <meta name="viewport" content="width=800, user-scalable=no" />
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
                <div style={styles.header}>
                    <button onClick={() => router.push('/hub')} style={styles.backButton}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span>Hub</span>
                    </button>

                    <h1 style={styles.pageTitle}>💎 Diamond Store</h1>

                    <div style={{ width: 100 }} /> {/* Spacer for centering */}
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {/* Intro */}
                    <div style={styles.intro}>
                        <p style={styles.introText}>
                            Diamonds power your poker journey. Use them for tournament entries,
                            premium training, cosmetics, and more!
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
                            onClick={handlePurchase}
                            disabled={!selectedPackage || isProcessing}
                            style={{
                                ...styles.purchaseButton,
                                opacity: (!selectedPackage || isProcessing) ? 0.6 : 1,
                            }}
                        >
                            {isProcessing ? 'Processing...' : `Purchase for $${selectedPkg?.price.toFixed(2) || '0.00'}`}
                        </button>
                    </div>

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
        </>
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
        position: 'sticky',
        top: 0,
        background: 'rgba(10, 22, 40, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
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
};
