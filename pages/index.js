/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — MARKETING LANDING PAGE
   Cyan/Electric Blue Aesthetic | Deep Navy Background
   Gateway to the PokerIQ Empire
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 MAIN LANDING PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [glowPulse, setGlowPulse] = useState(0);

    // Animated glow effect
    useEffect(() => {
        let frame;
        const start = Date.now();
        const animate = () => {
            const elapsed = (Date.now() - start) / 1000;
            setGlowPulse((Math.sin(elapsed * 2) + 1) / 2);
            frame = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(frame);
    }, []);

    const handleEnterHub = () => {
        setIsLoading(true);
        router.push('/auth/signin');
    };

    const handleSignUp = () => {
        router.push('/auth/signup');
    };

    if (isLoading) {
        return <LoadingScreen />;
    }

    return (
        <>
            <Head>
                <title>Smarter.Poker — Master Your GTO Game</title>
                <meta name="description" content="The ultimate poker training platform. AI-powered GTO drills, strategic analysis, and Diamond rewards." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.container}>
                {/* Animated Background */}
                <div style={styles.bgGrid} />
                <div style={{
                    ...styles.bgGlow,
                    opacity: 0.3 + glowPulse * 0.2,
                }} />

                {/* Navigation */}
                <nav style={styles.nav}>
                    <div style={styles.logo}>
                        <BrainIcon size={32} />
                        <span style={styles.logoText}>SMARTER POKER</span>
                    </div>
                    <div style={styles.navLinks}>
                        <button onClick={handleSignUp} style={styles.navButton}>
                            Sign Up
                        </button>
                        <button onClick={handleEnterHub} style={styles.navButtonPrimary}>
                            Sign In
                        </button>
                    </div>
                </nav>

                {/* Hero Section */}
                <main style={styles.hero}>
                    <div style={styles.heroContent}>
                        <div style={styles.tagline}>
                            <DiamondIcon size={16} />
                            <span>THE FUTURE OF POKER TRAINING</span>
                        </div>

                        <h1 style={styles.heroTitle}>
                            Master <span style={styles.gradientText}>GTO Strategy</span>
                            <br />Like Never Before
                        </h1>

                        <p style={styles.heroSubtitle}>
                            AI-powered training drills, real-time leak detection, and a
                            Diamond economy that rewards your progression. Level up your game.
                        </p>

                        <div style={styles.heroButtons}>
                            <button
                                onClick={handleEnterHub}
                                style={{
                                    ...styles.ctaButton,
                                    boxShadow: `0 0 ${20 + glowPulse * 20}px rgba(0, 212, 255, ${0.4 + glowPulse * 0.3})`,
                                }}
                            >
                                <span>Enter The Hub</span>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </button>
                            <button onClick={handleSignUp} style={styles.secondaryButton}>
                                Create Free Account
                            </button>
                        </div>

                        {/* Stats Preview */}
                        <div style={styles.statsBar}>
                            <StatItem label="Active Players" value="12,450+" />
                            <StatItem label="Drills Completed" value="2.1M" />
                            <StatItem label="Win Rate Increase" value="+18%" />
                        </div>
                    </div>

                    {/* Hero Visual - Phone mockup with hub preview */}
                    <div style={styles.heroVisual}>
                        <div style={{
                            ...styles.phoneFrame,
                            boxShadow: `0 0 60px rgba(0, 212, 255, ${0.2 + glowPulse * 0.15})`,
                        }}>
                            <div style={styles.phoneScreen}>
                                <img
                                    src="/hub-preview.png"
                                    alt="Smarter Poker Hub"
                                    style={styles.phoneImage}
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                    }}
                                />
                                <div style={styles.phonePlaceholder}>
                                    <BrainIcon size={48} />
                                    <span style={styles.phonePlaceholderText}>World Hub</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Features Section - Orb Study Previews */}
                <section style={styles.features}>
                    <h2 style={styles.sectionTitle}>
                        <DiamondIcon size={20} />
                        <span>10 Worlds. Infinite Possibilities.</span>
                    </h2>

                    <div style={styles.featureGrid}>
                        <FeatureCard
                            icon="🎯"
                            title="GTO Training"
                            description="AI-generated drills with solver-backed solutions. Hit 85% mastery to unlock new levels."
                            color="#00D4FF"
                        />
                        <FeatureCard
                            icon="💎"
                            title="Diamond Economy"
                            description="Earn Diamonds through training. Stake them in competitions. Build your bankroll."
                            color="#00BFFF"
                        />
                        <FeatureCard
                            icon="🧠"
                            title="Memory Games"
                            description="Pattern recognition drills that build your poker intuition at the subconscious level."
                            color="#9d4edd"
                        />
                        <FeatureCard
                            icon="📊"
                            title="Leak Detection"
                            description="Real-time analysis flags your weak spots. Get targeted remediation paths."
                            color="#ff4d4d"
                        />
                        <FeatureCard
                            icon="🏆"
                            title="Club Arena"
                            description="Train with your club. Compete in Arena Wars. Climb the territorial leaderboards."
                            color="#00ff66"
                        />
                        <FeatureCard
                            icon="🤖"
                            title="AI Assistant"
                            description="A team of expert assistants with complete system knowledge. Available 24/7."
                            color="#00D4FF"
                        />
                    </div>
                </section>

                {/* Diamond Multiplier Preview */}
                <section style={styles.multiplierSection}>
                    <div style={styles.multiplierContent}>
                        <h2 style={styles.multiplierTitle}>
                            Daily Streak <span style={styles.cyanText}>Multipliers</span>
                        </h2>
                        <p style={styles.multiplierDesc}>
                            Log in every day and watch your Diamond rewards multiply.
                            The longer your streak, the bigger your earnings.
                        </p>

                        <div style={styles.multiplierGrid}>
                            <MultiplierCard day={1} multiplier="1x" active />
                            <MultiplierCard day={3} multiplier="1.5x" />
                            <MultiplierCard day={7} multiplier="2x" />
                            <MultiplierCard day={14} multiplier="2.5x" />
                            <MultiplierCard day={30} multiplier="3x" />
                        </div>
                    </div>
                </section>

                {/* Final CTA */}
                <section style={styles.finalCta}>
                    <h2 style={styles.finalCtaTitle}>Ready to Level Up?</h2>
                    <p style={styles.finalCtaDesc}>
                        Join thousands of players mastering GTO strategy with Smarter.Poker
                    </p>
                    <button
                        onClick={handleSignUp}
                        style={{
                            ...styles.ctaButton,
                            boxShadow: `0 0 ${20 + glowPulse * 20}px rgba(0, 212, 255, ${0.4 + glowPulse * 0.3})`,
                        }}
                    >
                        <span>Start Training Free</span>
                        <DiamondIcon size={16} />
                    </button>
                </section>

                {/* Footer */}
                <footer style={styles.footer}>
                    <div style={styles.footerContent}>
                        <div style={styles.footerLogo}>
                            <BrainIcon size={24} />
                            <span style={styles.footerLogoText}>SMARTER POKER</span>
                        </div>
                        <p style={styles.footerCopyright}>
                            © 2026 Smarter Poker. All rights reserved.
                        </p>
                    </div>
                </footer>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAIN ICON (Smarter Poker Logo)
// ─────────────────────────────────────────────────────────────────────────────
function BrainIcon({ size = 24 }) {
    return (
        <div style={{
            width: size,
            height: size,
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
            border: '2px solid #00D4FF',
            boxShadow: `0 0 ${size / 2}px rgba(0, 212, 255, 0.6)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}>
            <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2">
                <path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 110 8h-8a4 4 0 110-8h2V9.5A4 4 0 018 6a4 4 0 014-4z" />
            </svg>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 💎 DIAMOND ICON
// ─────────────────────────────────────────────────────────────────────────────
function DiamondIcon({ size = 16 }) {
    return (
        <div style={{
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="#00D4FF">
                <path d="M12 2L2 9l10 13 10-13-10-7z" />
            </svg>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 📊 STAT ITEM
// ─────────────────────────────────────────────────────────────────────────────
function StatItem({ label, value }) {
    return (
        <div style={styles.statItem}>
            <span style={styles.statValue}>{value}</span>
            <span style={styles.statLabel}>{label}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎴 FEATURE CARD
// ─────────────────────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, description, color }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            style={{
                ...styles.featureCard,
                transform: isHovered ? 'translateY(-8px) scale(1.02)' : 'translateY(0) scale(1)',
                borderColor: isHovered ? color : 'rgba(0, 212, 255, 0.2)',
                boxShadow: isHovered ? `0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px ${color}30` : styles.featureCard.boxShadow,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <span style={styles.featureIcon}>{icon}</span>
            <h3 style={{ ...styles.featureTitle, color: isHovered ? color : '#ffffff' }}>{title}</h3>
            <p style={styles.featureDesc}>{description}</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 💎 MULTIPLIER CARD
// ─────────────────────────────────────────────────────────────────────────────
function MultiplierCard({ day, multiplier, active }) {
    return (
        <div style={{
            ...styles.multiplierCard,
            borderColor: active ? '#00D4FF' : 'rgba(0, 212, 255, 0.2)',
            background: active ? 'rgba(0, 212, 255, 0.1)' : 'rgba(10, 22, 40, 0.6)',
        }}>
            <span style={styles.multiplierDay}>Day {day}</span>
            <span style={{
                ...styles.multiplierValue,
                color: active ? '#00D4FF' : '#ffffff',
            }}>{multiplier}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⏳ LOADING SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoadingScreen() {
    return (
        <div style={styles.loadingScreen}>
            <BrainIcon size={60} />
            <p style={styles.loadingText}>Entering the Hub...</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 STYLES - CYAN/ELECTRIC BLUE THEME
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        color: '#ffffff',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
    },
    bgGrid: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
        zIndex: 0,
    },
    bgGlow: {
        position: 'fixed',
        top: '-50%',
        left: '50%',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at center, rgba(0, 212, 255, 0.15), transparent 60%)',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 0,
    },
    nav: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 40px',
        position: 'relative',
        zIndex: 10,
    },
    logo: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    logoText: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '20px',
        fontWeight: 700,
        letterSpacing: '2px',
        color: '#ffffff',
    },
    navLinks: {
        display: 'flex',
        gap: '12px',
    },
    navButton: {
        padding: '10px 24px',
        background: 'transparent',
        border: '2px solid rgba(0, 212, 255, 0.5)',
        borderRadius: '8px',
        color: '#ffffff',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    navButtonPrimary: {
        padding: '10px 24px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: '8px',
        color: '#000000',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '13px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    hero: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '60px 40px 80px',
        maxWidth: '1400px',
        margin: '0 auto',
        gap: '60px',
        position: 'relative',
        zIndex: 5,
    },
    heroContent: {
        flex: 1,
        maxWidth: '600px',
    },
    tagline: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '100px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '2px',
        color: '#00D4FF',
        marginBottom: '24px',
    },
    heroTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '48px',
        fontWeight: 800,
        lineHeight: 1.1,
        marginBottom: '24px',
        color: '#ffffff',
    },
    gradientText: {
        background: 'linear-gradient(135deg, #00D4FF, #00BFFF)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    heroSubtitle: {
        fontSize: '18px',
        lineHeight: 1.6,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: '32px',
    },
    heroButtons: {
        display: 'flex',
        gap: '16px',
        marginBottom: '48px',
    },
    ctaButton: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '16px 32px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: '12px',
        color: '#000000',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '15px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    secondaryButton: {
        padding: '16px 32px',
        background: 'transparent',
        border: '2px solid rgba(0, 212, 255, 0.5)',
        borderRadius: '12px',
        color: '#ffffff',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '15px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    statsBar: {
        display: 'flex',
        gap: '40px',
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
        color: '#00D4FF',
    },
    statLabel: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    heroVisual: {
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
    },
    phoneFrame: {
        width: '320px',
        height: '640px',
        background: 'linear-gradient(180deg, #0a1628, #061018)',
        borderRadius: '40px',
        border: '4px solid rgba(0, 212, 255, 0.3)',
        overflow: 'hidden',
        position: 'relative',
    },
    phoneScreen: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    phoneImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    phonePlaceholder: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
    },
    phonePlaceholderText: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    features: {
        padding: '80px 40px',
        maxWidth: '1200px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 5,
    },
    sectionTitle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '48px',
        textAlign: 'center',
    },
    featureGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
    },
    featureCard: {
        padding: '32px',
        background: 'rgba(10, 22, 40, 0.6)',
        borderRadius: '16px',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
    },
    featureIcon: {
        fontSize: '40px',
        marginBottom: '16px',
        display: 'block',
    },
    featureTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        marginBottom: '12px',
        transition: 'color 0.3s ease',
    },
    featureDesc: {
        fontSize: '14px',
        lineHeight: 1.6,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    multiplierSection: {
        padding: '80px 40px',
        background: 'linear-gradient(180deg, rgba(0, 212, 255, 0.05), transparent)',
        position: 'relative',
        zIndex: 5,
    },
    multiplierContent: {
        maxWidth: '800px',
        margin: '0 auto',
        textAlign: 'center',
    },
    multiplierTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '32px',
        fontWeight: 700,
        marginBottom: '16px',
    },
    cyanText: {
        color: '#00D4FF',
    },
    multiplierDesc: {
        fontSize: '16px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: '40px',
    },
    multiplierGrid: {
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        flexWrap: 'wrap',
    },
    multiplierCard: {
        padding: '20px 28px',
        background: 'rgba(10, 22, 40, 0.6)',
        border: '2px solid',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.3s ease',
    },
    multiplierDay: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    },
    multiplierValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
    },
    finalCta: {
        padding: '80px 40px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 5,
    },
    finalCtaTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '36px',
        fontWeight: 800,
        marginBottom: '16px',
    },
    finalCtaDesc: {
        fontSize: '16px',
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: '32px',
    },
    footer: {
        padding: '40px',
        borderTop: '1px solid rgba(0, 212, 255, 0.1)',
        position: 'relative',
        zIndex: 5,
    },
    footerContent: {
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerLogo: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    footerLogoText: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        letterSpacing: '2px',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    footerCopyright: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.3)',
    },
    loadingScreen: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1628',
        gap: '24px',
    },
    loadingText: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        color: '#00D4FF',
    },
};
