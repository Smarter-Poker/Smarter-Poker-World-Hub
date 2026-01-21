/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — PREMIUM MARKETING LANDING PAGE
   Cyan/Electric Blue Aesthetic | Deep Navy Background
   Gateway to the PokerIQ Empire
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import PageTransition from '../src/components/transitions/PageTransition';
import Head from 'next/head';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import confetti from 'canvas-confetti';

// God-Mode Stack
import { useLandingStore } from '../src/stores/landingStore';

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 MAIN LANDING PAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function LandingPage() {
    const router = useRouter();

    // Zustand Global State
    const isLoading = useLandingStore((s) => s.isLoading);
    const setLoading = useLandingStore((s) => s.setLoading);
    const glowIntensity = useLandingStore((s) => s.glowIntensity);
    const setGlowIntensity = useLandingStore((s) => s.setGlowIntensity);
    const incrementCtaClicks = useLandingStore((s) => s.incrementCtaClicks);

    // Refs for GSAP animations
    const heroTitleRef = useRef();
    const heroSubtitleRef = useRef();
    const heroButtonsRef = useRef();
    const statsBarRef = useRef();

    // GSAP: Infinite glow pulse
    useEffect(() => {
        gsap.to({}, {
            duration: 2,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            onUpdate: function () {
                setGlowIntensity(this.progress());
            }
        });
    }, [setGlowIntensity]);

    // GSAP: Hero entrance animation timeline
    useEffect(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        tl.from(heroTitleRef.current, {
            y: 50,
            opacity: 0,
            duration: 1,
        })
            .from(heroSubtitleRef.current, {
                y: 30,
                opacity: 0,
                duration: 0.8,
            }, '-=0.5')
            .from(heroButtonsRef.current?.children || [], {
                y: 20,
                opacity: 0,
                duration: 0.6,
                stagger: 0.1,
            }, '-=0.4')
            .from(statsBarRef.current?.children || [], {
                scale: 0.8,
                opacity: 0,
                duration: 0.5,
                stagger: 0.1,
            }, '-=0.3');
    }, []);

    const handleEnterHub = () => {
        incrementCtaClicks();
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#00D4FF', '#0066FF', '#00BFFF']
        });
        setLoading(true);
        router.push('/auth/signin');
    };

    const handleSignUp = () => {
        router.push('/auth/signup');
    };

    if (isLoading) {
        return <LoadingScreen />;
    }

    return (
        <PageTransition>
            <Head>
                <title>Smarter.Poker — Master Your GTO Game</title>
                <meta name="description" content="The ultimate poker training platform. AI-powered GTO drills, strategic analysis, and Diamond rewards. Join thousands mastering poker strategy." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.container}>
                {/* Animated Background */}
                <div style={styles.bgGrid} />
                <div style={{
                    ...styles.bgGlow,
                    opacity: 0.3 + glowIntensity * 0.2,
                }} />

                {/* Navigation */}
                <nav className="landing-nav" style={styles.nav}>
                    <div style={styles.logo}>
                        <img
                            src="/smarter-poker-logo.png"
                            alt="Smarter Poker"
                            style={{ height: 40, filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.5))' }}
                        />
                        <span className="landing-logo-text" style={styles.logoText}>SMARTER POKER</span>
                    </div>
                    <div className="landing-nav-links" style={styles.navLinks}>
                        <button className="landing-nav-button" onClick={handleSignUp} style={styles.navButton}>
                            Sign Up
                        </button>
                        <button className="landing-nav-button" onClick={handleEnterHub} style={styles.navButtonPrimary}>
                            Sign In
                        </button>
                    </div>
                </nav>

                {/* Hero Section */}
                <main className="landing-hero" style={styles.hero}>
                    <div className="landing-hero-content" style={styles.heroContent}>
                        <div className="landing-tagline" style={styles.tagline}>
                            <DiamondIcon size={16} />
                            <span>THE FUTURE OF POKER TRAINING</span>
                        </div>

                        <h1 ref={heroTitleRef} className="landing-hero-title" style={styles.heroTitle}>
                            Transform Your <span style={styles.gradientText}>Poker Game</span>
                            <br />With AI-Powered Training
                        </h1>

                        <p ref={heroSubtitleRef} className="landing-hero-subtitle" style={styles.heroSubtitle}>
                            Master GTO strategy through intelligent drills, real-time feedback, and a revolutionary Diamond economy.
                            Join the next generation of elite poker players.
                        </p>

                        <div ref={heroButtonsRef} className="landing-hero-buttons" style={styles.heroButtons}>
                            <motion.button
                                onClick={handleEnterHub}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                                style={{
                                    ...styles.ctaButton,
                                    boxShadow: `0 0 ${20 + glowIntensity * 20}px rgba(0, 212, 255, ${0.4 + glowIntensity * 0.3})`,
                                }}
                            >
                                <span>Enter The Hub</span>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </motion.button>
                            <motion.button
                                onClick={handleSignUp}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                                style={styles.secondaryButton}
                            >
                                Create Free Account
                            </motion.button>
                        </div>

                        {/* Stats Preview */}
                        <div ref={statsBarRef} className="landing-stats-bar" style={styles.statsBar}>
                            <StatItem label="Active Players" value="12,450+" />
                            <StatItem label="Drills Completed" value="2.1M" />
                            <StatItem label="Win Rate Increase" value="+18%" />
                        </div>
                    </div>

                    {/* Hero Visual - Premium Card Display */}
                    <div className="landing-hero-visual" style={styles.heroVisual}>
                        <div className="landing-hero-card-stack" style={styles.heroCardStack}>
                            <motion.div
                                className="landing-hero-card"
                                style={styles.heroCard}
                                animate={{
                                    y: [0, -10, 0],
                                    rotateZ: [-2, 2, -2],
                                }}
                                transition={{
                                    duration: 4,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            >
                                <div className="landing-card-inner" style={styles.cardInner}>
                                    <div style={styles.cardHeader}>
                                        <DiamondIcon size={24} />
                                        <span style={styles.cardHeaderText}>GTO TRAINER</span>
                                    </div>
                                    <div style={styles.cardBody}>
                                        <div style={styles.cardStat}>
                                            <span style={styles.cardStatLabel}>Your Accuracy</span>
                                            <span className="landing-card-stat-value" style={styles.cardStatValue}>87%</span>
                                        </div>
                                        <div style={styles.progressBar}>
                                            <div style={styles.progressFill} />
                                        </div>
                                        <div style={styles.cardMastery}>
                                            <span style={styles.masteryBadge}>ELITE</span>
                                            <span style={styles.masteryText}>Top 5% of Players</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Floating Elements */}
                            <motion.div
                                className="landing-floating-chip"
                                style={styles.floatingChip}
                                animate={{
                                    y: [0, -15, 0],
                                    rotate: [0, 360],
                                }}
                                transition={{
                                    y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
                                    rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                                }}
                            >
                                💎
                            </motion.div>

                            <motion.div
                                className="landing-floating-card"
                                style={styles.floatingCard}
                                animate={{
                                    y: [0, 10, 0],
                                    x: [0, 5, 0],
                                }}
                                transition={{
                                    duration: 3.5,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            >
                                🂡
                            </motion.div>

                            <motion.div
                                className="landing-floating-card-right"
                                style={styles.floatingCardRight}
                                animate={{
                                    y: [0, -8, 0],
                                    x: [0, -5, 0],
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            >
                                🂮
                            </motion.div>
                        </div>
                    </div>
                </main>

                {/* What is Smarter.Poker Section */}
                <section className="landing-about-section" style={styles.aboutSection}>
                    <div style={styles.aboutContent}>
                        <h2 className="landing-about-title" style={styles.aboutTitle}>
                            What is <span style={styles.cyanText}>Smarter.Poker</span>?
                        </h2>
                        <p className="landing-about-description" style={styles.aboutDescription}>
                            Smarter.Poker is the world's most advanced poker training ecosystem. Built by professional players
                            and powered by cutting-edge AI, we've created a comprehensive platform that takes you from novice
                            to elite through proven, systematic training methods.
                        </p>
                        <div className="landing-about-grid" style={styles.aboutGrid}>
                            <div className="landing-about-card" style={styles.aboutCard}>
                                <span style={styles.aboutIcon}>🎯</span>
                                <h3 style={styles.aboutCardTitle}>Precision Training</h3>
                                <p style={styles.aboutCardDesc}>
                                    Every drill is backed by solver-verified solutions. Practice the exact spots that matter most.
                                </p>
                            </div>
                            <div className="landing-about-card" style={styles.aboutCard}>
                                <span style={styles.aboutIcon}>🧠</span>
                                <h3 style={styles.aboutCardTitle}>AI-Powered Analysis</h3>
                                <p style={styles.aboutCardDesc}>
                                    Real-time leak detection identifies your weaknesses and provides targeted remediation.
                                </p>
                            </div>
                            <div className="landing-about-card" style={styles.aboutCard}>
                                <span style={styles.aboutIcon}>💎</span>
                                <h3 style={styles.aboutCardTitle}>Diamond Economy</h3>
                                <p style={styles.aboutCardDesc}>
                                    Earn and stake Diamonds as you progress. Your training investments compound over time.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section - Orb Study Previews */}
                <section className="landing-features" style={styles.features}>
                    <h2 className="landing-section-title" style={styles.sectionTitle}>
                        <DiamondIcon size={20} />
                        <span>10 Worlds. Infinite Possibilities.</span>
                    </h2>

                    <div className="landing-feature-grid" style={styles.featureGrid}>
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
                <section className="landing-multiplier-section" style={styles.multiplierSection}>
                    <div style={styles.multiplierContent}>
                        <h2 className="landing-multiplier-title" style={styles.multiplierTitle}>
                            Daily Streak <span style={styles.cyanText}>Multipliers</span>
                        </h2>
                        <p style={styles.multiplierDesc}>
                            Log in every day and watch your Diamond rewards multiply.
                            The longer your streak, the bigger your earnings.
                        </p>

                        <div className="landing-multiplier-grid" style={styles.multiplierGrid}>
                            <MultiplierCard day={1} multiplier="1x" active />
                            <MultiplierCard day={3} multiplier="1.5x" />
                            <MultiplierCard day={7} multiplier="2x" />
                            <MultiplierCard day={14} multiplier="2.5x" />
                            <MultiplierCard day={30} multiplier="3x" />
                        </div>
                    </div>
                </section>

                {/* Testimonials Section */}
                <section className="landing-testimonial-section" style={styles.testimonialSection}>
                    <h2 className="landing-section-title" style={styles.sectionTitle}>
                        <span>What Players Are Saying</span>
                    </h2>
                    <div className="landing-testimonial-grid" style={styles.testimonialGrid}>
                        <TestimonialCard
                            quote="I went from break-even to consistent winner in 3 months. The leak detection alone is worth 10x the price."
                            author="Mike R."
                            role="Tournament Pro"
                        />
                        <TestimonialCard
                            quote="The Diamond economy keeps me coming back. It gamifies improvement in a way that actually works."
                            author="Sarah L."
                            role="Cash Game Regular"
                        />
                        <TestimonialCard
                            quote="Training with my club on Smarter.Poker has made us all better. The competition drives real growth."
                            author="James K."
                            role="Club Captain"
                        />
                    </div>
                </section>

                {/* Final CTA */}
                <section className="landing-final-cta" style={styles.finalCta}>
                    <h2 className="landing-final-cta-title" style={styles.finalCtaTitle}>Ready to Level Up?</h2>
                    <p style={styles.finalCtaDesc}>
                        Join thousands of players mastering GTO strategy with Smarter.Poker
                    </p>
                    <motion.button
                        onClick={handleSignUp}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                        style={{
                            ...styles.ctaButton,
                            boxShadow: `0 0 ${20 + glowIntensity * 20}px rgba(0, 212, 255, ${0.4 + glowIntensity * 0.3})`,
                        }}
                    >
                        <span>Start Training Free</span>
                        <DiamondIcon size={16} />
                    </motion.button>
                </section>

                {/* Footer */}
                <footer className="landing-footer" style={styles.footer}>
                    <div className="landing-footer-content" style={styles.footerContent}>
                        <div style={styles.footerLogo}>
                            <img
                                src="/smarter-poker-logo.png"
                                alt="Smarter Poker"
                                style={{ height: 28, opacity: 0.8 }}
                            />
                            <span style={styles.footerLogoText}>SMARTER POKER</span>
                        </div>
                        <p style={styles.footerCopyright}>
                            © 2026 Smarter.Poker. All rights reserved.
                        </p>
                    </div>
                </footer>
            </div>
        </PageTransition>
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
            <span className="landing-stat-value" style={styles.statValue}>{value}</span>
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
            className="landing-feature-card"
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
        <div className="landing-multiplier-card" style={{
            ...styles.multiplierCard,
            borderColor: active ? '#00D4FF' : 'rgba(0, 212, 255, 0.2)',
            background: active ? 'rgba(0, 212, 255, 0.1)' : 'rgba(10, 22, 40, 0.6)',
        }}>
            <span style={styles.multiplierDay}>Day {day}</span>
            <span className="landing-multiplier-value" style={{
                ...styles.multiplierValue,
                color: active ? '#00D4FF' : '#ffffff',
            }}>{multiplier}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 💬 TESTIMONIAL CARD
// ─────────────────────────────────────────────────────────────────────────────
function TestimonialCard({ quote, author, role }) {
    return (
        <div className="landing-testimonial-card" style={styles.testimonialCard}>
            <p style={styles.testimonialQuote}>"{quote}"</p>
            <div style={styles.testimonialAuthor}>
                <span style={styles.testimonialName}>{author}</span>
                <span style={styles.testimonialRole}>{role}</span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⏳ LOADING SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoadingScreen() {
    return (
        <div style={styles.loadingScreen}>
            <img
                src="/smarter-poker-logo.png"
                alt="Smarter Poker"
                style={{ height: 60, filter: 'drop-shadow(0 0 20px rgba(0, 212, 255, 0.5))' }}
            />
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
        overflowX: 'hidden',
        overflowY: 'auto',
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
        flexWrap: 'wrap',
    },
    heroContent: {
        flex: 1,
        maxWidth: '600px',
        minWidth: '300px',
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
        fontSize: 'clamp(28px, 5vw, 48px)',
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
        fontSize: 'clamp(15px, 2vw, 18px)',
        lineHeight: 1.6,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: '32px',
    },
    heroButtons: {
        display: 'flex',
        gap: '16px',
        marginBottom: '48px',
        flexWrap: 'wrap',
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
        flexWrap: 'wrap',
    },
    statItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 'clamp(20px, 3vw, 24px)',
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
        minWidth: '300px',
    },
    heroCardStack: {
        position: 'relative',
        width: '350px',
        height: '400px',
    },
    heroCard: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '280px',
        background: 'linear-gradient(135deg, rgba(10, 22, 40, 0.95), rgba(0, 30, 60, 0.9))',
        borderRadius: '20px',
        border: '2px solid rgba(0, 212, 255, 0.4)',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.2)',
        overflow: 'hidden',
    },
    cardInner: {
        padding: '24px',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
    },
    cardHeaderText: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        letterSpacing: '2px',
        color: '#00D4FF',
    },
    cardBody: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
    },
    cardStat: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
    },
    cardStatLabel: {
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.6)',
    },
    cardStatValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '36px',
        fontWeight: 800,
        color: '#00D4FF',
    },
    progressBar: {
        height: '8px',
        background: 'rgba(0, 212, 255, 0.2)',
        borderRadius: '4px',
        overflow: 'hidden',
    },
    progressFill: {
        width: '87%',
        height: '100%',
        background: 'linear-gradient(90deg, #00D4FF, #0066FF)',
        borderRadius: '4px',
    },
    cardMastery: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        paddingTop: '8px',
    },
    masteryBadge: {
        padding: '6px 12px',
        background: 'linear-gradient(135deg, #FFD700, #FFA500)',
        borderRadius: '6px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 700,
        color: '#000000',
    },
    masteryText: {
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.6)',
    },
    floatingChip: {
        position: 'absolute',
        top: '10%',
        right: '10%',
        fontSize: '40px',
        filter: 'drop-shadow(0 0 15px rgba(0, 212, 255, 0.5))',
    },
    floatingCard: {
        position: 'absolute',
        bottom: '15%',
        left: '5%',
        fontSize: '50px',
        filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.3))',
    },
    floatingCardRight: {
        position: 'absolute',
        top: '25%',
        right: '0%',
        fontSize: '45px',
        filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.3))',
    },
    aboutSection: {
        padding: '80px 40px',
        background: 'linear-gradient(180deg, transparent, rgba(0, 212, 255, 0.03), transparent)',
        position: 'relative',
        zIndex: 5,
    },
    aboutContent: {
        maxWidth: '1100px',
        margin: '0 auto',
        textAlign: 'center',
    },
    aboutTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 'clamp(24px, 4vw, 36px)',
        fontWeight: 700,
        marginBottom: '20px',
    },
    aboutDescription: {
        fontSize: 'clamp(15px, 2vw, 17px)',
        lineHeight: 1.7,
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: '800px',
        margin: '0 auto 48px',
    },
    aboutGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
    },
    aboutCard: {
        padding: '32px',
        background: 'rgba(10, 22, 40, 0.6)',
        borderRadius: '16px',
        border: '1px solid rgba(0, 212, 255, 0.15)',
        backdropFilter: 'blur(10px)',
        textAlign: 'left',
    },
    aboutIcon: {
        fontSize: '36px',
        marginBottom: '16px',
        display: 'block',
    },
    aboutCardTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        marginBottom: '12px',
        color: '#00D4FF',
    },
    aboutCardDesc: {
        fontSize: '14px',
        lineHeight: 1.6,
        color: 'rgba(255, 255, 255, 0.6)',
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
        fontSize: 'clamp(20px, 3.5vw, 28px)',
        fontWeight: 700,
        marginBottom: '48px',
        textAlign: 'center',
        flexWrap: 'wrap',
    },
    featureGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
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
        fontSize: 'clamp(24px, 4vw, 32px)',
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
        minWidth: '80px',
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
    testimonialSection: {
        padding: '80px 40px',
        maxWidth: '1200px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 5,
    },
    testimonialGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '24px',
    },
    testimonialCard: {
        padding: '32px',
        background: 'rgba(10, 22, 40, 0.6)',
        borderRadius: '16px',
        border: '1px solid rgba(0, 212, 255, 0.15)',
        backdropFilter: 'blur(10px)',
    },
    testimonialQuote: {
        fontSize: '15px',
        lineHeight: 1.7,
        color: 'rgba(255, 255, 255, 0.8)',
        fontStyle: 'italic',
        marginBottom: '20px',
    },
    testimonialAuthor: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    },
    testimonialName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#00D4FF',
    },
    testimonialRole: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    finalCta: {
        padding: '80px 40px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 5,
    },
    finalCtaTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 'clamp(24px, 4vw, 36px)',
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
        flexWrap: 'wrap',
        gap: '20px',
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
