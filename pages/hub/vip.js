/**
 * VIP MEMBERSHIP PAGE
 * Premium membership tiers with benefits, current status, and upgrade options.
 * Route: /hub/vip
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import PageTransition from '../../src/components/transitions/PageTransition';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import { purchaseVipWithDiamonds, VIP_DIAMOND_COST } from '../../src/lib/gates/premiumFeatureGate';

const C = {
    bg: '#0a0a0a',
    card: '#1a1a1a',
    cardHover: '#252525',
    text: '#FFFFFF',
    textSec: '#9ca3af',
    border: '#2a2a2a',
    blue: '#3b82f6',
    green: '#22c55e',
    gold: '#d4a853',
    goldBright: '#FFD700',
    purple: '#8b5cf6',
};

const TIERS = [
    {
        id: 'free',
        name: 'Free',
        price: '$0',
        period: 'forever',
        color: '#6b7280',
        gradient: 'linear-gradient(135deg, #374151, #6b7280)',
        features: [
            'Access to Social Hub',
            'Poker Near Me (basic)',
            '3 Training Games per day',
            'Diamond Arcade (limited)',
            'Community forums',
        ],
        notIncluded: [
            'Ad-free experience',
            'Advanced training tools',
            'Priority matchmaking',
            'Exclusive tournaments',
            'Personal assistant',
        ],
    },
    {
        id: 'silver',
        name: 'Silver',
        price: '$9.99',
        period: '/month',
        yearlyPrice: '$99.99/year',
        yearlySavings: 'Save 17%',
        color: '#C0C0C0',
        gradient: 'linear-gradient(135deg, #9CA3AF, #D1D5DB)',
        popular: false,
        features: [
            'Everything in Free',
            'Ad-free experience',
            'Unlimited Training Games',
            '500 bonus diamonds/month',
            'Advanced Poker Near Me filters',
            'Bankroll Manager (full)',
            'Priority support',
        ],
        notIncluded: [
            'GTO Personal Assistant',
            'Exclusive tournaments',
            'VIP badge on profile',
        ],
    },
    {
        id: 'gold',
        name: 'Gold',
        price: '$19.99',
        period: '/month',
        yearlyPrice: '$199.99/year',
        yearlySavings: 'Save 17%',
        color: '#FFD700',
        gradient: 'linear-gradient(135deg, #d4a853, #FFD700)',
        popular: true,
        features: [
            'Everything in Silver',
            'GTO Personal Assistant',
            '2,000 bonus diamonds/month',
            'Exclusive VIP tournaments',
            'Gold VIP badge on profile',
            'Priority matchmaking in Arena',
            'Advanced leak finder',
            'Custom profile themes',
        ],
        notIncluded: [
            'Platinum-only events',
        ],
    },
    {
        id: 'platinum',
        name: 'Platinum',
        price: '$49.99',
        period: '/month',
        yearlyPrice: '$499.99/year',
        yearlySavings: 'Save 17%',
        color: '#E5E4E2',
        gradient: 'linear-gradient(135deg, #B8B8B8, #E8E8E8)',
        features: [
            'Everything in Gold',
            '10,000 bonus diamonds/month',
            'Platinum VIP badge + frame',
            'Private coaching sessions',
            'Exclusive Platinum events',
            'Early access to new features',
            'Custom club arena themes',
            'Dedicated account manager',
            'HendonMob data integration',
        ],
        notIncluded: [],
    },
];

const TESTIMONIALS = [
    { name: 'Mike T.', tier: 'Gold', quote: 'The GTO assistant alone is worth 10x the price. My win rate went up 15% in the first month.' },
    { name: 'Sarah K.', tier: 'Platinum', quote: 'The exclusive tournaments and early feature access make this the best poker investment I have made.' },
    { name: 'James R.', tier: 'Silver', quote: 'Going ad-free and getting unlimited training games was a game changer for my study routine.' },
];

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

export default function VipPage() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [billingCycle, setBillingCycle] = useState('monthly');
    const [currentTier, setCurrentTier] = useState('free');
    const [expandedFaq, setExpandedFaq] = useState(null);
    const [user, setUser] = useState(null);
    const [diamonds, setDiamonds] = useState(0);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [purchaseResult, setPurchaseResult] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);

    const menuConfig = getMenuConfig('vip', user, {}, {});

    // Load user's current VIP status from Supabase (with localStorage fallback)
    useEffect(() => {
        async function loadVipStatus() {
            const authUser = getAuthUser();
            setUser(authUser);

            // Try localStorage first for instant feedback
            if (typeof window !== 'undefined') {
                const saved = localStorage.getItem('sp-vip-tier');
                if (saved) setCurrentTier(saved);
            }

            // Then sync from Supabase if user is logged in
            if (authUser?.id) {
                try {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('vip_tier, diamonds, is_vip')
                        .eq('id', authUser.id)
                        .single();

                    if (!error && data) {
                        if (data.vip_tier) {
                            setCurrentTier(data.vip_tier);
                            if (typeof window !== 'undefined') {
                                localStorage.setItem('sp-vip-tier', data.vip_tier);
                            }
                        }
                        setDiamonds(data.diamonds || 0);
                    }
                } catch (e) {
                    console.warn('[VIP] Failed to load VIP status from Supabase:', e);
                }
            }
        }
        loadVipStatus();
    }, []);

    const handleSubscribe = async (tierId) => {
        if (tierId === 'free') return;
        router.push('/hub/diamond-store?vip=' + tierId + '&cycle=' + billingCycle);
    };

    const handleDiamondPurchase = async () => {
        if (!user?.id) { router.push('/auth/login'); return; }
        setIsPurchasing(true);
        setPurchaseResult(null);
        const result = await purchaseVipWithDiamonds(user.id);
        setIsPurchasing(false);
        if (result.success) {
            setPurchaseResult({ success: true, expiresAt: result.expiresAt });
            setDiamonds(result.newBalance);
            setCurrentTier('diamond');
            setShowConfirm(false);
        } else {
            setPurchaseResult({ success: false, error: result.error });
        }
    };


    const faqs = [
        { q: 'Can I cancel anytime?', a: 'Yes. Cancel anytime from your Settings page. Your benefits remain active until the end of your billing period.' },
        { q: 'Do diamonds carry over?', a: 'Yes, bonus diamonds are added monthly and never expire. They accumulate in your diamond balance.' },
        { q: 'Can I switch tiers?', a: 'You can upgrade or downgrade at any time. Upgrades take effect immediately. Downgrades take effect at the next billing cycle.' },
        { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, debit cards, Apple Pay, and Google Pay through our secure Stripe checkout.' },
        { q: 'Is there a free trial?', a: 'New members get a 7-day free trial on any paid tier. Cancel before the trial ends and you will not be charged.' },
    ];

    return (
        <>
            <Head>
                <title>VIP Membership | Smarter.Poker</title>
                <meta name="description" content="Unlock premium poker training tools, exclusive tournaments, and VIP benefits." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />
            <HamburgerMenu
                isOpen={menuOpen}
                onClose={() => setMenuOpen(false)}
                direction="right"
                theme="dark"
                user={user}
                menuItems={menuConfig.menuItems}
                bottomLinks={menuConfig.bottomLinks}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: C.bg, paddingTop: 80, paddingBottom: 60 }}>
                    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 16px' }}>

                        {/* Hero */}
                        <div style={{ textAlign: 'center', marginBottom: 40, padding: '20px 0' }}>
                            <div style={{
                                width: 72, height: 72, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #d4a853, #FFD700)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 20px',
                                boxShadow: '0 0 30px rgba(212,168,83,0.3)'
                            }}>
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                            </div>
                            <h1 style={{
                                fontSize: 36, fontWeight: 800, color: C.text,
                                margin: '0 0 12px', letterSpacing: '-0.02em'
                            }}>
                                VIP Membership
                            </h1>
                            <p style={{
                                fontSize: 16, color: C.textSec, margin: 0, maxWidth: 500,
                                lineHeight: 1.6, marginLeft: 'auto', marginRight: 'auto'
                            }}>
                                Level up your poker game with premium tools, exclusive tournaments, and VIP benefits.
                            </p>
                        </div>

                        {/* Billing Toggle */}
                        <div style={{
                            display: 'flex', justifyContent: 'center', gap: 4,
                            marginBottom: 32, background: C.card, borderRadius: 12,
                            padding: 4, width: 'fit-content', margin: '0 auto 32px',
                            border: `1px solid ${C.border}`
                        }}>
                            <button
                                onClick={() => setBillingCycle('monthly')}
                                style={{
                                    padding: '10px 24px', border: 'none', borderRadius: 8,
                                    background: billingCycle === 'monthly' ? C.blue : 'transparent',
                                    color: billingCycle === 'monthly' ? '#fff' : C.textSec,
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >Monthly</button>
                            <button
                                onClick={() => setBillingCycle('yearly')}
                                style={{
                                    padding: '10px 24px', border: 'none', borderRadius: 8,
                                    background: billingCycle === 'yearly' ? C.blue : 'transparent',
                                    color: billingCycle === 'yearly' ? '#fff' : C.textSec,
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Yearly
                                <span style={{
                                    marginLeft: 6, fontSize: 11, padding: '2px 6px',
                                    background: billingCycle === 'yearly' ? 'rgba(255,255,255,0.2)' : C.green + '30',
                                    color: billingCycle === 'yearly' ? '#fff' : C.green,
                                    borderRadius: 6
                                }}>Save 17%</span>
                            </button>
                        </div>

                        {/* Pricing Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: 16, marginBottom: 48
                        }}>
                            {TIERS.map((tier, idx) => {
                                const isCurrentTier = currentTier === tier.id;
                                const displayPrice = billingCycle === 'yearly' && tier.yearlyPrice
                                    ? tier.yearlyPrice.split('/')[0]
                                    : tier.price;
                                const displayPeriod = billingCycle === 'yearly' && tier.yearlyPrice
                                    ? '/year'
                                    : tier.period;

                                return (
                                    <motion.div
                                        key={tier.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.1, duration: 0.4 }}
                                        style={{
                                            background: C.card,
                                            borderRadius: 16,
                                            border: tier.popular
                                                ? `2px solid ${C.gold}`
                                                : isCurrentTier
                                                    ? `2px solid ${C.green}`
                                                    : `1px solid ${C.border}`,
                                            padding: 24,
                                            position: 'relative',
                                            overflow: 'hidden',
                                            boxShadow: tier.popular ? `0 0 30px ${C.gold}15` : 'none'
                                        }}
                                    >
                                        {/* Popular badge */}
                                        {tier.popular && (
                                            <div style={{
                                                position: 'absolute', top: 12, right: -28,
                                                background: C.gold, color: '#000',
                                                fontSize: 11, fontWeight: 700, padding: '4px 32px',
                                                transform: 'rotate(45deg)',
                                                letterSpacing: '0.05em'
                                            }}>POPULAR</div>
                                        )}

                                        {/* Current badge */}
                                        {isCurrentTier && (
                                            <div style={{
                                                position: 'absolute', top: 12, left: 12,
                                                background: C.green, color: '#fff',
                                                fontSize: 10, fontWeight: 700, padding: '3px 8px',
                                                borderRadius: 6
                                            }}>CURRENT</div>
                                        )}

                                        {/* Tier color bar */}
                                        <div style={{
                                            width: 40, height: 4, borderRadius: 2,
                                            background: tier.gradient, marginBottom: 16,
                                            marginTop: tier.popular || isCurrentTier ? 16 : 0
                                        }} />

                                        <h3 style={{
                                            fontSize: 20, fontWeight: 700, color: C.text,
                                            margin: '0 0 4px'
                                        }}>{tier.name}</h3>

                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
                                            <span style={{
                                                fontSize: 32, fontWeight: 800,
                                                color: tier.id === 'free' ? C.textSec : C.text
                                            }}>{displayPrice}</span>
                                            <span style={{ fontSize: 14, color: C.textSec }}>{displayPeriod}</span>
                                        </div>

                                        {/* Features */}
                                        <div style={{ marginBottom: 20 }}>
                                            {tier.features.map((f, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                                    marginBottom: 8
                                                }}>
                                                    <span style={{ marginTop: 2, flexShrink: 0 }}><CheckIcon /></span>
                                                    <span style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{f}</span>
                                                </div>
                                            ))}
                                            {tier.notIncluded.map((f, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                                    marginBottom: 8, opacity: 0.5
                                                }}>
                                                    <span style={{ marginTop: 2, flexShrink: 0 }}><XIcon /></span>
                                                    <span style={{ fontSize: 13, color: C.textSec, lineHeight: 1.4 }}>{f}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* CTA Button */}
                                        <button
                                            onClick={() => handleSubscribe(tier.id)}
                                            disabled={isCurrentTier}
                                            style={{
                                                width: '100%', padding: '12px 20px',
                                                background: isCurrentTier
                                                    ? C.border
                                                    : tier.popular
                                                        ? C.gold
                                                        : tier.id === 'free'
                                                            ? 'transparent'
                                                            : C.blue,
                                                color: isCurrentTier
                                                    ? C.textSec
                                                    : tier.popular
                                                        ? '#000'
                                                        : tier.id === 'free'
                                                            ? C.textSec
                                                            : '#fff',
                                                border: tier.id === 'free' ? `1px solid ${C.border}` : 'none',
                                                borderRadius: 10, fontSize: 14, fontWeight: 700,
                                                cursor: isCurrentTier ? 'default' : 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {isCurrentTier ? 'Current Plan' : tier.id === 'free' ? 'Get Started' : 'Upgrade Now'}
                                        </button>

                                        {/* Free trial note */}
                                        {tier.id !== 'free' && !isCurrentTier && (
                                            <p style={{
                                                fontSize: 11, color: C.textSec, textAlign: 'center',
                                                margin: '8px 0 0'
                                            }}>7-day free trial included</p>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* ═══ Diamond VIP Purchase Option ═══ */}
                        {currentTier === 'free' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                style={{
                                    marginBottom: 48, padding: 32, borderRadius: 20,
                                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                                    border: '2px solid rgba(0,212,255,0.3)',
                                    boxShadow: '0 0 40px rgba(0,212,255,0.1)',
                                    textAlign: 'center', position: 'relative', overflow: 'hidden'
                                }}
                            >
                                {/* Shimmer effect */}
                                <div style={{
                                    position: 'absolute', top: 0, left: '-100%', width: '200%', height: '100%',
                                    background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.05), transparent)',
                                    animation: 'premium-shimmer 3s infinite',
                                    pointerEvents: 'none'
                                }} />

                                <div style={{
                                    fontSize: 40, marginBottom: 12
                                }}>💎</div>

                                <h3 style={{
                                    fontSize: 22, fontWeight: 800, color: '#fff',
                                    margin: '0 0 8px', letterSpacing: '-0.01em'
                                }}>Buy VIP with Diamonds</h3>

                                <p style={{
                                    fontSize: 15, color: 'rgba(255,255,255,0.7)', margin: '0 0 6px',
                                    lineHeight: 1.6
                                }}>
                                    Unlock <strong style={{ color: '#FFD700' }}>full VIP benefits</strong> for 30 days
                                    using your diamond balance.
                                </p>

                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20
                                }}>
                                    Your balance: <span style={{ color: '#00D4FF', fontWeight: 700 }}>{diamonds.toLocaleString()} 💎</span>
                                </div>

                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => setShowConfirm(true)}
                                        disabled={diamonds < VIP_DIAMOND_COST || isPurchasing}
                                        style={{
                                            padding: '14px 32px', border: 'none', borderRadius: 12,
                                            background: diamonds >= VIP_DIAMOND_COST
                                                ? 'linear-gradient(135deg, #00D4FF, #0084FF)'
                                                : '#333',
                                            color: diamonds >= VIP_DIAMOND_COST ? '#000' : '#666',
                                            fontSize: 16, fontWeight: 800, cursor: diamonds >= VIP_DIAMOND_COST ? 'pointer' : 'not-allowed',
                                            letterSpacing: '0.02em',
                                            boxShadow: diamonds >= VIP_DIAMOND_COST ? '0 0 20px rgba(0,212,255,0.3)' : 'none',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        💎 {VIP_DIAMOND_COST.toLocaleString()} — Buy 30 Days VIP
                                    </button>
                                </div>

                                {diamonds < VIP_DIAMOND_COST && (
                                    <p style={{ fontSize: 12, color: '#ef4444', marginTop: 10 }}>
                                        You need {(VIP_DIAMOND_COST - diamonds).toLocaleString()} more diamonds
                                    </p>
                                )}

                                {/* Success banner */}
                                {purchaseResult?.success && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        style={{
                                            marginTop: 20, padding: '16px 24px', borderRadius: 12,
                                            background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                                            color: '#22c55e', fontSize: 14, fontWeight: 600
                                        }}
                                    >
                                        🎉 VIP Activated! Expires {purchaseResult.expiresAt?.toLocaleDateString()}
                                    </motion.div>
                                )}

                                {/* Error banner */}
                                {purchaseResult && !purchaseResult.success && (
                                    <div style={{
                                        marginTop: 12, padding: '10px 16px', borderRadius: 8,
                                        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                                        color: '#ef4444', fontSize: 13
                                    }}>{purchaseResult.error}</div>
                                )}
                            </motion.div>
                        )}

                        {/* Confirmation modal */}
                        {showConfirm && (
                            <div style={{
                                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                                backdropFilter: 'blur(8px)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                zIndex: 10000, padding: 16
                            }}>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    style={{
                                        width: '100%', maxWidth: 400, background: '#1a1a2e',
                                        border: '2px solid rgba(0,212,255,0.3)', borderRadius: 20,
                                        padding: 32, textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>👑</div>
                                    <h3 style={{
                                        fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 12px'
                                    }}>Confirm VIP Purchase</h3>
                                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 8px' }}>
                                        You are about to spend <strong style={{ color: '#00D4FF' }}>{VIP_DIAMOND_COST.toLocaleString()} 💎</strong> for
                                        30 days of VIP membership.
                                    </p>
                                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px' }}>
                                        Remaining balance: {(diamonds - VIP_DIAMOND_COST).toLocaleString()} 💎
                                    </p>
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <button
                                            onClick={() => { setShowConfirm(false); setPurchaseResult(null); }}
                                            style={{
                                                flex: 1, padding: '12px 20px', background: '#333',
                                                border: '1px solid #555', borderRadius: 10,
                                                color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                                            }}
                                        >Cancel</button>
                                        <button
                                            onClick={handleDiamondPurchase}
                                            disabled={isPurchasing}
                                            style={{
                                                flex: 1, padding: '12px 20px',
                                                background: 'linear-gradient(135deg, #00D4FF, #0084FF)',
                                                border: 'none', borderRadius: 10,
                                                color: '#000', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                                                opacity: isPurchasing ? 0.6 : 1
                                            }}
                                        >{isPurchasing ? 'Processing...' : 'Confirm Purchase'}</button>
                                    </div>
                                </motion.div>
                            </div>
                        )}

                        {/* Testimonials */}
                        <div style={{ marginBottom: 48 }}>
                            <h2 style={{
                                fontSize: 22, fontWeight: 700, color: C.text,
                                textAlign: 'center', marginBottom: 24
                            }}>What Members Say</h2>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: 16
                            }}>
                                {TESTIMONIALS.map((t, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 + i * 0.1 }}
                                        style={{
                                            background: C.card, borderRadius: 12,
                                            padding: 20, border: `1px solid ${C.border}`
                                        }}
                                    >
                                        <p style={{
                                            fontSize: 14, color: C.text, lineHeight: 1.6,
                                            margin: '0 0 12px', fontStyle: 'italic'
                                        }}>"{t.quote}"</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%',
                                                background: t.tier === 'Gold' ? C.gold : t.tier === 'Platinum' ? '#E5E4E2' : '#C0C0C0',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 14, fontWeight: 700, color: '#000'
                                            }}>{t.name.charAt(0)}</div>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.name}</div>
                                                <div style={{ fontSize: 11, color: C.textSec }}>{t.tier} Member</div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* FAQ */}
                        <div style={{ maxWidth: 640, margin: '0 auto', marginBottom: 40 }}>
                            <h2 style={{
                                fontSize: 22, fontWeight: 700, color: C.text,
                                textAlign: 'center', marginBottom: 24
                            }}>Frequently Asked Questions</h2>
                            {faqs.map((faq, i) => (
                                <div key={i} style={{
                                    background: C.card, borderRadius: 12,
                                    border: `1px solid ${C.border}`, marginBottom: 8,
                                    overflow: 'hidden'
                                }}>
                                    <button
                                        onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                                        style={{
                                            width: '100%', padding: '14px 16px',
                                            background: 'transparent', border: 'none',
                                            color: C.text, fontSize: 14, fontWeight: 600,
                                            textAlign: 'left', cursor: 'pointer',
                                            display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                    >
                                        {faq.q}
                                        <span style={{
                                            transform: expandedFaq === i ? 'rotate(180deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.2s', fontSize: 18, color: C.textSec
                                        }}>v</span>
                                    </button>
                                    {expandedFaq === i && (
                                        <div style={{
                                            padding: '0 16px 14px',
                                            fontSize: 13, color: C.textSec, lineHeight: 1.6
                                        }}>
                                            {faq.a}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Bottom CTA */}
                        <div style={{
                            textAlign: 'center', padding: '32px 20px',
                            background: C.card, borderRadius: 16,
                            border: `1px solid ${C.border}`
                        }}>
                            <h3 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
                                Ready to level up?
                            </h3>
                            <p style={{ fontSize: 14, color: C.textSec, margin: '0 0 20px' }}>
                                Start your 7-day free trial today. Cancel anytime.
                            </p>
                            <button
                                onClick={() => handleSubscribe('gold')}
                                style={{
                                    padding: '14px 40px', background: C.gold, color: '#000',
                                    border: 'none', borderRadius: 10, fontSize: 16,
                                    fontWeight: 700, cursor: 'pointer'
                                }}
                            >Start Free Trial</button>
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
