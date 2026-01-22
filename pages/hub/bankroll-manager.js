/* ═══════════════════════════════════════════════════════════════════════════
   BANKROLL MANAGER — Track Your Poker Finances
   Monitor your bankroll, set goals, and track your poker journey
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BANKROLL MANAGER PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function BankrollManagerPage() {
    const router = useRouter();
    const [bankroll, setBankroll] = useState(5000);
    const [sessions, setSessions] = useState([]);

    return (
        <PageTransition>
            <Head>
                <title>Bankroll Manager — Smarter.Poker</title>
                <meta name="description" content="Track your poker bankroll and manage your finances" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    .bankroll-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .bankroll-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .bankroll-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .bankroll-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .bankroll-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .bankroll-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="bankroll-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Header */}
                <UniversalHeader pageDepth={1} />

                <div style={styles.header}>
                    <h1 style={styles.pageTitle}>💰 Bankroll Manager</h1>
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {/* Current Bankroll */}
                    <div style={styles.bankrollCard}>
                        <div style={styles.bankrollLabel}>Current Bankroll</div>
                        <div style={styles.bankrollAmount}>${bankroll.toLocaleString()}</div>
                    </div>

                    {/* Quick Stats */}
                    <div style={styles.statsGrid}>
                        <div style={styles.statCard}>
                            <span style={styles.statIcon}>📈</span>
                            <div style={styles.statInfo}>
                                <span style={styles.statValue}>+$0</span>
                                <span style={styles.statLabel}>This Month</span>
                            </div>
                        </div>
                        <div style={styles.statCard}>
                            <span style={styles.statIcon}>🎯</span>
                            <div style={styles.statInfo}>
                                <span style={styles.statValue}>0</span>
                                <span style={styles.statLabel}>Sessions</span>
                            </div>
                        </div>
                        <div style={styles.statCard}>
                            <span style={styles.statIcon}>⏱️</span>
                            <div style={styles.statInfo}>
                                <span style={styles.statValue}>0h</span>
                                <span style={styles.statLabel}>Hours Played</span>
                            </div>
                        </div>
                        <div style={styles.statCard}>
                            <span style={styles.statIcon}>💵</span>
                            <div style={styles.statInfo}>
                                <span style={styles.statValue}>$0/hr</span>
                                <span style={styles.statLabel}>Win Rate</span>
                            </div>
                        </div>
                    </div>

                    {/* Coming Soon Notice */}
                    <div style={styles.comingSoon}>
                        <span style={styles.comingSoonIcon}>🚀</span>
                        <h2 style={styles.comingSoonTitle}>Full Features Coming Soon!</h2>
                        <p style={styles.comingSoonText}>
                            Track sessions, set bankroll goals, analyze your results,
                            and get personalized stake recommendations based on your performance.
                        </p>
                        <div style={styles.featureList}>
                            <div style={styles.featureItem}>✅ Session Logging</div>
                            <div style={styles.featureItem}>✅ Goal Setting</div>
                            <div style={styles.featureItem}>✅ Performance Charts</div>
                            <div style={styles.featureItem}>✅ Stake Calculator</div>
                            <div style={styles.featureItem}>✅ Tilt Tracking</div>
                        </div>
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
    },
    bgGrid: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(0, 212, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 212, 255, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(0, 255, 136, 0.1), transparent 60%)',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'sticky',
        top: 0,
        background: 'rgba(10, 22, 40, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },
    pageTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 28,
        fontWeight: 700,
        color: '#fff',
    },
    content: {
        maxWidth: 800,
        margin: '0 auto',
        padding: '32px 24px',
    },
    bankrollCard: {
        background: 'linear-gradient(135deg, rgba(0, 255, 136, 0.1), rgba(0, 200, 100, 0.1))',
        border: '2px solid rgba(0, 255, 136, 0.3)',
        borderRadius: 20,
        padding: '40px',
        textAlign: 'center',
        marginBottom: 32,
    },
    bankrollLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        textTransform: 'uppercase',
        letterSpacing: 2,
        marginBottom: 8,
    },
    bankrollAmount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 56,
        fontWeight: 700,
        color: '#00ff88',
        textShadow: '0 0 30px rgba(0, 255, 136, 0.5)',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 40,
    },
    statCard: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
    },
    statIcon: {
        fontSize: 28,
    },
    statInfo: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 20,
        fontWeight: 700,
        color: '#00D4FF',
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    comingSoon: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        padding: '48px',
        textAlign: 'center',
    },
    comingSoonIcon: {
        fontSize: 48,
        display: 'block',
        marginBottom: 16,
    },
    comingSoonTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 16,
    },
    comingSoonText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: 500,
        margin: '0 auto 24px',
        lineHeight: 1.6,
    },
    featureList: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
    },
    featureItem: {
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        padding: '8px 16px',
        fontSize: 14,
        color: '#00D4FF',
    },
};
