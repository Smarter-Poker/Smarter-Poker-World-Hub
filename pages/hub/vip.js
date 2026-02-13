/**
 * VIP MEMBERSHIP PAGE
 * Single VIP tier with billing toggle: $19.99/month or $199/year
 * Plus diamond purchase: 1,999 diamonds for 30 days
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
    text: '#FFFFFF',
    textSec: '#9ca3af',
    border: '#2a2a2a',
    gold: '#FFD700',
    goldDim: '#d4a853',
    cyan: '#00D4FF',
    green: '#22c55e',
    red: '#ef4444',
};

const VIP_BENEFITS = [
    // Club Arena Table Features
    'Unlimited Rabbit Hunting — see what cards would have come',
    'Show Stack in BBs — always-on big blind display',
    'Unlimited Offline Protection during hands',
    'Auto Time Bank activation when needed',
    '120 seconds of free time bank each month',
    '1,200 interactive emojis per month',
    '3 exclusive table themes unlocked',
    'Create up to 3 private clubs',
    '1,000 player tags per month to track opponents',
    '6% leaderboard score boost',
    // Smarter.Poker Platform
    'Ad-free experience across the entire platform',
    'Unlimited Training & Trivia games (no diamond cost)',
    'Full access to GTO AI Personal Assistant',
    'Advanced Leak Finder analysis tools',
    'Bankroll Manager Pro — all session tracking & analytics',
    'Advanced Poker Near Me filters & venue intelligence',
    'Free entry to all Diamond Arena freeroll tournaments',
    // Bonus Perks
    '2,000 bonus diamonds credited every month',
    'Up to 5 custom AI-generated avatars',
    'Exclusive Gold VIP profile badge & cosmetic flair',
    'Priority support with fast-track assistance',
];

function CheckIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

export default function VipPage() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [billingCycle, setBillingCycle] = useState('monthly'); // monthly or annual
    const [user, setUser] = useState(null);
    const [isVip, setIsVip] = useState(false);
    const [diamonds, setDiamonds] = useState(0);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [purchaseResult, setPurchaseResult] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [expandedFaq, setExpandedFaq] = useState(null);

    const menuConfig = getMenuConfig('vip', user, {}, {});

    useEffect(() => {
        async function loadStatus() {
            const authUser = getAuthUser();
            setUser(authUser);
            if (authUser?.id) {
                try {
                    const { data } = await supabase
                        .from('profiles')
                        .select('is_vip, diamonds')
                        .eq('id', authUser.id)
                        .single();
                    if (data) {
                        setIsVip(!!data.is_vip);
                        setDiamonds(data.diamonds || 0);
                    }
                } catch (e) {
                    console.warn('[VIP] Load error:', e);
                }
            }
        }
        loadStatus();
    }, []);

    const handleStripePurchase = () => {
        const tier = billingCycle === 'annual' ? 'vip-annual' : 'vip-monthly';
        router.push('/hub/diamond-store?vip=' + tier + '&cycle=' + billingCycle);
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
            setIsVip(true);
            setShowConfirm(false);
        } else {
            setPurchaseResult({ success: false, error: result.error });
        }
    };

    const priceDisplay = billingCycle === 'annual' ? '$199' : '$19.99';
    const intervalDisplay = billingCycle === 'annual' ? '/year' : '/month';
    const savingsNote = billingCycle === 'annual' ? 'Save $40.88 vs monthly' : null;

    const faqs = [
        { q: 'Can I cancel anytime?', a: 'Yes. Cancel anytime from your Settings page. Benefits remain active until the end of your billing period.' },
        { q: 'What happens when my diamond VIP expires?', a: 'After 30 days, your VIP status expires. You can renew with another 1,999 diamonds or subscribe via Stripe for auto-renewal.' },
        { q: 'Do I keep my bonus diamonds?', a: 'Yes, bonus diamonds are added to your balance and never expire. They accumulate even if your VIP lapses.' },
        { q: 'Can I switch between monthly and annual?', a: 'Yes — you can switch billing cycles from your account settings at any time.' },
        { q: 'What payment methods are accepted?', a: 'All major credit cards, debit cards, Apple Pay, and Google Pay through our secure Stripe checkout.' },
    ];

    return (
        <>
            <Head>
                <title>VIP Membership | Smarter.Poker</title>
                <meta name="description" content="Unlock premium poker training tools, unlimited games, and VIP benefits." />
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
                    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>

                        {/* Hero */}
                        <div style={{ textAlign: 'center', marginBottom: 40, padding: '20px 0' }}>
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.5 }}
                                style={{
                                    width: 80, height: 80, borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${C.goldDim}, ${C.gold})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 20px',
                                    boxShadow: '0 0 40px rgba(255,215,0,0.25)'
                                }}
                            >
                                <span style={{ fontSize: 36 }}>👑</span>
                            </motion.div>
                            <h1 style={{
                                fontSize: 32, fontWeight: 800, color: C.text,
                                margin: '0 0 10px', letterSpacing: '-0.02em'
                            }}>
                                VIP Membership
                            </h1>
                            <p style={{
                                fontSize: 16, color: C.textSec, margin: 0,
                                lineHeight: 1.6
                            }}>
                                Unlock the full Smarter.Poker experience
                            </p>
                        </div>

                        {/* ═══ VIP Status Banner (for active VIPs) ═══ */}
                        {isVip && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    marginBottom: 32, padding: '20px 24px', borderRadius: 16,
                                    background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05))',
                                    border: `2px solid ${C.green}`,
                                    textAlign: 'center'
                                }}
                            >
                                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: C.green, marginBottom: 4 }}>
                                    You are a VIP Member
                                </div>
                                <div style={{ fontSize: 13, color: C.textSec }}>
                                    You have full access to all premium features
                                </div>
                            </motion.div>
                        )}

                        {/* ═══ Billing Toggle ═══ */}
                        {!isVip && (
                            <div style={{
                                display: 'flex', justifyContent: 'center', marginBottom: 20, gap: 4,
                                background: '#151515', borderRadius: 12, padding: 4,
                                maxWidth: 280, margin: '0 auto 20px'
                            }}>
                                <button
                                    onClick={() => setBillingCycle('monthly')}
                                    style={{
                                        flex: 1, padding: '10px 16px', borderRadius: 10,
                                        background: billingCycle === 'monthly' ? '#2a2a2a' : 'transparent',
                                        border: 'none', color: billingCycle === 'monthly' ? '#fff' : '#888',
                                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >Monthly</button>
                                <button
                                    onClick={() => setBillingCycle('annual')}
                                    style={{
                                        flex: 1, padding: '10px 16px', borderRadius: 10,
                                        background: billingCycle === 'annual' ? '#2a2a2a' : 'transparent',
                                        border: 'none', color: billingCycle === 'annual' ? '#fff' : '#888',
                                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                                        transition: 'all 0.2s', position: 'relative'
                                    }}
                                >
                                    Annual
                                    <span style={{
                                        position: 'absolute', top: -8, right: -4,
                                        background: C.green, color: '#000',
                                        fontSize: 9, fontWeight: 800, padding: '2px 6px',
                                        borderRadius: 6, letterSpacing: '0.04em'
                                    }}>SAVE</span>
                                </button>
                            </div>
                        )}

                        {/* ═══ Main VIP Card ═══ */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            style={{
                                background: C.card,
                                borderRadius: 20,
                                border: `2px solid ${C.gold}40`,
                                overflow: 'hidden',
                                marginBottom: 32,
                                boxShadow: '0 0 40px rgba(255,215,0,0.08)'
                            }}
                        >
                            {/* Card header */}
                            <div style={{
                                background: `linear-gradient(135deg, ${C.goldDim}15, ${C.gold}10)`,
                                padding: '24px 24px 20px',
                                borderBottom: `1px solid ${C.gold}20`
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                    <span style={{ fontSize: 24 }}>👑</span>
                                    <span style={{
                                        fontSize: 11, fontWeight: 700, padding: '3px 10px',
                                        background: C.gold, color: '#000', borderRadius: 6,
                                        letterSpacing: '0.08em', textTransform: 'uppercase'
                                    }}>VIP</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
                                    <span style={{ fontSize: 36, fontWeight: 800, color: C.text }}>{priceDisplay}</span>
                                    <span style={{ fontSize: 15, color: C.textSec }}>{intervalDisplay}</span>
                                </div>
                                {savingsNote && (
                                    <div style={{
                                        fontSize: 12, color: C.green, fontWeight: 600, marginTop: 6
                                    }}>{savingsNote}</div>
                                )}
                            </div>

                            {/* Benefits list */}
                            <div style={{ padding: '24px' }}>
                                {VIP_BENEFITS.map((benefit, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 + i * 0.04 }}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 10,
                                            marginBottom: 12
                                        }}
                                    >
                                        <span style={{ marginTop: 2, flexShrink: 0 }}><CheckIcon /></span>
                                        <span style={{ fontSize: 14, color: C.text, lineHeight: 1.5 }}>{benefit}</span>
                                    </motion.div>
                                ))}
                            </div>

                            {/* ═══ Payment Options ═══ */}
                            {!isVip && (
                                <div style={{
                                    padding: '20px 24px 24px',
                                    borderTop: `1px solid ${C.border}`,
                                    display: 'flex', flexDirection: 'column', gap: 10
                                }}>
                                    {/* Stripe button */}
                                    <button
                                        onClick={handleStripePurchase}
                                        style={{
                                            width: '100%', padding: '14px 20px',
                                            background: `linear-gradient(135deg, ${C.goldDim}, ${C.gold})`,
                                            border: 'none', borderRadius: 12,
                                            color: '#000', fontSize: 15, fontWeight: 800,
                                            cursor: 'pointer', letterSpacing: '0.02em',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 4px 16px rgba(255,215,0,0.2)'
                                        }}
                                    >
                                        Subscribe — {priceDisplay}{intervalDisplay}
                                    </button>

                                    {/* Divider */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0'
                                    }}>
                                        <div style={{ flex: 1, height: 1, background: C.border }} />
                                        <span style={{ fontSize: 12, color: C.textSec, fontWeight: 600 }}>OR</span>
                                        <div style={{ flex: 1, height: 1, background: C.border }} />
                                    </div>

                                    {/* Diamond purchase button */}
                                    <button
                                        onClick={() => {
                                            if (!user?.id) { router.push('/auth/login'); return; }
                                            setShowConfirm(true);
                                        }}
                                        disabled={diamonds < VIP_DIAMOND_COST}
                                        style={{
                                            width: '100%', padding: '14px 20px',
                                            background: diamonds >= VIP_DIAMOND_COST
                                                ? `linear-gradient(135deg, ${C.cyan}, #0084FF)`
                                                : '#252525',
                                            border: diamonds >= VIP_DIAMOND_COST
                                                ? 'none'
                                                : `1px solid ${C.border}`,
                                            borderRadius: 12,
                                            color: diamonds >= VIP_DIAMOND_COST ? '#000' : '#666',
                                            fontSize: 15, fontWeight: 800,
                                            cursor: diamonds >= VIP_DIAMOND_COST ? 'pointer' : 'not-allowed',
                                            letterSpacing: '0.02em',
                                            transition: 'all 0.2s',
                                            boxShadow: diamonds >= VIP_DIAMOND_COST
                                                ? '0 4px 16px rgba(0,212,255,0.2)'
                                                : 'none'
                                        }}
                                    >
                                        💎 Buy with {VIP_DIAMOND_COST.toLocaleString()} Diamonds — 30 Days
                                    </button>

                                    {/* Balance display */}
                                    <div style={{
                                        textAlign: 'center', fontSize: 12, color: C.textSec, marginTop: 2
                                    }}>
                                        Your balance: <span style={{
                                            color: diamonds >= VIP_DIAMOND_COST ? C.cyan : C.red,
                                            fontWeight: 700
                                        }}>{diamonds.toLocaleString()} 💎</span>
                                        {diamonds < VIP_DIAMOND_COST && (
                                            <span style={{ color: C.red }}>
                                                {' '}— need {(VIP_DIAMOND_COST - diamonds).toLocaleString()} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Success banner */}
                            {purchaseResult?.success && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    style={{
                                        padding: '16px 24px',
                                        background: 'rgba(34,197,94,0.1)',
                                        borderTop: `1px solid rgba(34,197,94,0.3)`,
                                        textAlign: 'center', color: C.green,
                                        fontSize: 14, fontWeight: 600
                                    }}
                                >
                                    🎉 VIP Activated! Expires {purchaseResult.expiresAt?.toLocaleDateString()}
                                </motion.div>
                            )}

                            {/* Error banner */}
                            {purchaseResult && !purchaseResult.success && (
                                <div style={{
                                    padding: '12px 24px',
                                    background: 'rgba(239,68,68,0.1)',
                                    borderTop: `1px solid rgba(239,68,68,0.3)`,
                                    textAlign: 'center', color: C.red, fontSize: 13
                                }}>{purchaseResult.error}</div>
                            )}
                        </motion.div>

                        {/* ═══ Marketplace Link ═══ */}
                        <div style={{
                            textAlign: 'center', marginBottom: 32
                        }}>
                            <Link href="/hub/diamond-store?tab=vip" style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '12px 24px', borderRadius: 12,
                                background: '#151515', border: `1px solid ${C.border}`,
                                color: C.cyan, fontSize: 14, fontWeight: 600,
                                textDecoration: 'none', transition: 'all 0.2s'
                            }}>
                                🛒 View in Marketplace
                                <span style={{ fontSize: 16 }}>→</span>
                            </Link>
                        </div>

                        {/* ═══ Confirmation Modal ═══ */}
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
                                        width: '100%', maxWidth: 400,
                                        background: '#1a1a2e',
                                        border: `2px solid ${C.cyan}40`,
                                        borderRadius: 20, padding: 32, textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>👑</div>
                                    <h3 style={{
                                        fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 12px'
                                    }}>Confirm VIP Purchase</h3>
                                    <p style={{
                                        fontSize: 14, color: 'rgba(255,255,255,0.7)',
                                        lineHeight: 1.6, margin: '0 0 8px'
                                    }}>
                                        Spend <strong style={{ color: C.cyan }}>{VIP_DIAMOND_COST.toLocaleString()} 💎</strong> for
                                        30 days of VIP membership.
                                    </p>
                                    <p style={{
                                        fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px'
                                    }}>
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
                                                background: `linear-gradient(135deg, ${C.cyan}, #0084FF)`,
                                                border: 'none', borderRadius: 10,
                                                color: '#000', fontSize: 14, fontWeight: 800,
                                                cursor: 'pointer',
                                                opacity: isPurchasing ? 0.6 : 1
                                            }}
                                        >{isPurchasing ? 'Processing...' : 'Confirm Purchase'}</button>
                                    </div>
                                </motion.div>
                            </div>
                        )}

                        {/* ═══ FAQ ═══ */}
                        <div style={{ marginBottom: 40 }}>
                            <h2 style={{
                                fontSize: 20, fontWeight: 700, color: C.text,
                                textAlign: 'center', marginBottom: 20
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
                                        }}>▾</span>
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

                    </div>
                </div>
            </PageTransition>
        </>
    );
}
