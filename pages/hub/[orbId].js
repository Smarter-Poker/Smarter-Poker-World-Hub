/* ═══════════════════════════════════════════════════════════════════════════
   DYNAMIC ORB PAGE — Handles all /hub/[orbId] routes
   Routes to the appropriate orb world based on URL parameter
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { POKER_IQ_ORBS, getOrbById } from '../../src/orbs/manifest/registry';

// God-Mode Stack
import { useOrbPageStore } from '../../src/stores/orbPageStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ORB METADATA — Descriptions and icons for each orb world
const ORB_METADATA = {
    'social-media': {
        title: 'Social Media',
        description: 'Connect with Fellow Poker Players, Share Hands, and Build Your Network',
        emoji: '',
        color: '#ff4d4d',
        features: ['Friend Feed', 'Hand Sharing', 'Player Connections', 'Notifications', 'Messages'],
    },
    'club-arena': {
        title: 'Club Arena',
        description: 'Join Poker Clubs, Compete in Club Tournaments, and Climb the Leaderboards',
        emoji: '',
        color: '#ff9900',
        features: ['Club Discovery', 'Club Tournaments', 'Member Rankings', 'Club Chat', 'Club Wars'],
    },
    'diamond-arena': {
        title: 'Diamond Arena',
        description: 'High-stakes Competitive Play with Diamond Entry Fees and Massive Prize Pools',
        emoji: 'Diamonds',
        color: '#ffee00',
        features: ['Diamond Tournaments', 'Prize Pools', 'Leaderboards', 'Buy-ins', 'Payouts'],
    },
    'training': {
        title: 'GTO Training',
        description: 'Master Game Theory Optimal Play with AI-powered Drills and Scenarios',
        emoji: '',
        color: '#00ff66',
        features: ['GTO Drills', 'Hand Analysis', 'Leak Detection', 'Skill Levels 1-10', '85% Mastery Gate'],
    },
    'memory-games': {
        title: 'Memory Games',
        description: 'Sharpen Your Poker Memory with Range Recall and Pattern Recognition Games',
        emoji: '',
        color: '#00ffff',
        features: ['Range Memory', 'Pattern Recognition', 'Speed Drills', 'Memory Challenges', 'Brain Training'],
    },
    'personal-assistant': {
        title: 'Personal Assistant',
        description: 'Your AI-powered Poker Coach and Strategic Advisor',
        emoji: '🤖',
        color: '#0088ff',
        features: ['AI Coach', 'Hand Review', 'Strategy Tips', 'Real-time Advice', 'Leak Analysis'],
    },
    'diamond-arcade': {
        title: 'Diamond Arcade',
        description: 'Risk Diamonds. Test Skills. Beat the House in Fast-paced Poker Games!',
        emoji: '',
        color: '#9900ff',
        features: ['Speed Games', 'Jackpot Games', 'Daily Rotation', 'Progressive Jackpot', 'Leaderboards'],
    },
    'bankroll-manager': {
        title: 'Bankroll Manager',
        description: 'Track Your Poker Finances, Manage Your Bankroll, and Analyze Your Results',
        emoji: '',
        color: '#ff00ff',
        features: ['Bankroll Tracking', 'Session Logs', 'Profit/Loss Charts', 'Stop-Loss Alerts', 'Tilt Detection'],
    },
    'poker-near-me': {
        title: 'Poker Near Me',
        description: 'Find Live Poker Games, Casinos, and Home Games in Your Area',
        emoji: '',
        color: '#ffffff',
        features: ['Live Game Finder', 'Casino Directory', 'Home Game Network', 'Game Ratings', 'Travel Mode'],
    },
    'trivia': {
        title: 'Poker Trivia',
        description: 'Test Your Poker Knowledge with Trivia Questions and Earn Rewards',
        emoji: '❓',
        color: '#00ccff',
        features: ['Daily Trivia', 'Poker History', 'Rules Quiz', 'Pro Knowledge', 'XP Rewards'],
    },
    'settings': {
        title: 'Settings',
        description: 'Customize Your Smarter.Poker Experience',
        emoji: '',
        color: '#888888',
        features: ['Account Settings', 'Privacy Controls', 'Notifications', 'Theme Options', 'Data Export'],
    },
};

export default function OrbPage() {
    const router = useRouter();
    const { orbId } = router.query;
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Redirect to dedicated pages for completed orbs
    useEffect(() => {
        if (!mounted || !orbId) return;
        const key = Array.isArray(orbId) ? orbId[0] : orbId;

        // Orbs with dedicated pages - redirect to them
        const dedicatedPages = {
            'diamond-arcade': '/hub/diamond-arcade',
            'trivia': '/hub/trivia',
        };

        if (dedicatedPages[key]) {
            router.replace(dedicatedPages[key]);
        }
    }, [mounted, orbId, router]);

    if (!mounted || !orbId) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}>⟳</div>
                <p style={styles.loadingText}>Loading...</p>
            </div>
        );
    }

    const orbKey = Array.isArray(orbId) ? orbId[0] : orbId;
    const orbMeta = ORB_METADATA[orbKey] || {
        title: 'Unknown World',
        description: 'This World is Being Built...',
        emoji: '🌍',
        color: '#666666',
        features: [],
    };

    // Get orb config from registry (for additional data)
    const orbConfig = getOrbById(orbKey);

    return (
        <PageTransition>
            <SEOHead
                title="Smarter.Poker Feature"
                description="Explore This Smarter.Poker Feature."
                noindex={true}
            >
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

            <div className="dynamic-orb-page" style={styles.container}>
                {/* Background grid */}
                <div style={styles.bgGrid} />
                <div style={{
                    ...styles.bgGlow,
                    background: `radial-gradient(ellipse at center, ${orbMeta.color}22, transparent 60%)`,
                }} />

                {/* UniversalHeader */}
                <UniversalHeader pageDepth={1} />

                {/* Main content */}
                <div style={styles.content}>
                    {/* Orb Header */}
                    <div style={styles.header}>
                        <div style={{
                            ...styles.orbIcon,
                            background: `linear-gradient(135deg, ${orbMeta.color}44, ${orbMeta.color}22)`,
                            borderColor: orbMeta.color,
                            boxShadow: `0 0 30px ${orbMeta.color}44`,
                        }}>
                            <span style={styles.emoji}>{orbMeta.emoji}</span>
                        </div>
                        <h1 style={styles.title}>{orbMeta.title}</h1>
                        <p style={styles.description}>{orbMeta.description}</p>
                    </div>

                    {/* Coming Soon Badge */}
                    <div style={styles.comingSoonBadge}>
                         COMING SOON
                    </div>

                    {/* Features Preview */}
                    <div style={styles.featuresSection}>
                        <h2 style={styles.featuresTitle}>Features</h2>
                        <div style={styles.featuresGrid}>
                            {orbMeta.features.map((feature, index) => (
                                <div key={index} style={{
                                    ...styles.featureCard,
                                    borderColor: `${orbMeta.color}44`,
                                }}>
                                    <span style={styles.featureIcon}></span>
                                    <span style={styles.featureName}>{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div style={styles.actions}>
                        <Link href="/hub" style={styles.primaryButton}>
                            Return to Hub
                        </Link>
                    </div>
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
        padding: '40px 20px',
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
    },
    bgGlow: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: '100%',
        height: '100%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
    },
    backButton: {
        position: 'fixed',
        top: '24px',
        left: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: '8px',
        color: '#00D4FF',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        zIndex: 100,
    },
    loadingContainer: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1628',
    },
    loadingSpinner: {
        fontSize: '48px',
        color: '#00D4FF',
        animation: 'spin 1s linear infinite',
    },
    loadingText: {
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: '16px',
    },
    content: {
        maxWidth: '800px',
        margin: '0 auto',
        paddingTop: '80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    header: {
        textAlign: 'center',
        marginBottom: '32px',
    },
    orbIcon: {
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px',
        border: '3px solid',
    },
    emoji: {
        fontSize: '56px',
    },
    title: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '36px',
        fontWeight: 800,
        color: '#ffffff',
        marginBottom: '12px',
        textShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
    description: {
        fontSize: '18px',
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: '500px',
        margin: '0 auto',
    },
    comingSoonBadge: {
        background: 'linear-gradient(135deg, #00D4FF22, #8a2be222)',
        border: '2px solid #00D4FF',
        borderRadius: '12px',
        padding: '16px 32px',
        fontSize: '24px',
        fontFamily: 'Orbitron, sans-serif',
        fontWeight: 700,
        color: '#00D4FF',
        textShadow: '0 0 10px rgba(0, 212, 255, 0.5)',
        marginBottom: '48px',
    },
    featuresSection: {
        width: '100%',
        marginBottom: '48px',
    },
    featuresTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '20px',
        fontWeight: 600,
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: '24px',
    },
    featuresGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
    },
    featureCard: {
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    featureIcon: {
        fontSize: '20px',
    },
    featureName: {
        fontSize: '14px',
        fontWeight: 500,
        color: 'rgba(255, 255, 255, 0.9)',
    },
    actions: {
        display: 'flex',
        gap: '16px',
    },
    primaryButton: {
        background: 'linear-gradient(135deg, #00D4FF, #0088cc)',
        color: '#ffffff',
        padding: '14px 32px',
        borderRadius: '12px',
        fontSize: '16px',
        fontWeight: 600,
        textDecoration: 'none',
        display: 'inline-block',
        transition: 'all 0.2s ease',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
};
