/* ═══════════════════════════════════════════════════════════════════════════
   MARKETPLACE — Buy & Sell Poker Items
   Trade avatars, cosmetics, and poker accessories
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState } from 'react';
import { motion } from 'framer-motion';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════
const CATEGORIES = [
    { id: 'avatars', name: 'Avatars', icon: '👤', count: 0 },
    { id: 'card-backs', name: 'Card Backs', icon: '🃏', count: 0 },
    { id: 'tables', name: 'Table Themes', icon: '🎰', count: 0 },
    { id: 'emotes', name: 'Emotes', icon: '😎', count: 0 },
    { id: 'badges', name: 'Badges', icon: '🏆', count: 0 },
    { id: 'effects', name: 'Win Effects', icon: '✨', count: 0 },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MARKETPLACE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function MarketplacePage() {
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState('avatars');
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <PageTransition>
            <Head>
                <title>Marketplace — Smarter.Poker</title>
                <meta name="description" content="Buy and sell poker cosmetics and items" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    .marketplace-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .marketplace-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .marketplace-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .marketplace-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .marketplace-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .marketplace-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="marketplace-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />
                <div style={styles.bgGlow} />

                {/* Header */}
                <UniversalHeader pageDepth={1} />

                <div style={styles.header}>
                    <h1 style={styles.pageTitle}>🛒 Marketplace</h1>
                </div>

                {/* Main Content */}
                <div style={styles.content}>
                    {/* Search Bar */}
                    <div style={styles.searchContainer}>
                        <input
                            type="text"
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={styles.searchInput}
                        />
                        <span style={styles.searchIcon}>🔍</span>
                    </div>

                    {/* Categories */}
                    <div style={styles.categoriesGrid}>
                        {CATEGORIES.map(cat => (
                            <motion.div
                                key={cat.id}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => setSelectedCategory(cat.id)}
                                style={{
                                    ...styles.categoryCard,
                                    borderColor: selectedCategory === cat.id ? '#FFD700' : 'rgba(255, 255, 255, 0.1)',
                                    background: selectedCategory === cat.id ? 'rgba(255, 215, 0, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                                }}
                            >
                                <span style={styles.categoryIcon}>{cat.icon}</span>
                                <span style={styles.categoryName}>{cat.name}</span>
                                <span style={styles.categoryCount}>{cat.count} items</span>
                            </motion.div>
                        ))}
                    </div>

                    {/* Empty State */}
                    <div style={styles.emptyState}>
                        <span style={styles.emptyIcon}>🏪</span>
                        <h2 style={styles.emptyTitle}>Marketplace Opening Soon!</h2>
                        <p style={styles.emptyText}>
                            We're building a vibrant marketplace where you can buy, sell, and trade
                            poker cosmetics using diamonds. Create unique looks and stand out at the tables!
                        </p>
                        <div style={styles.featureGrid}>
                            <div style={styles.featureCard}>
                                <span>👤</span>
                                <span>Custom Avatars</span>
                            </div>
                            <div style={styles.featureCard}>
                                <span>🃏</span>
                                <span>Exclusive Card Backs</span>
                            </div>
                            <div style={styles.featureCard}>
                                <span>🎰</span>
                                <span>Table Themes</span>
                            </div>
                            <div style={styles.featureCard}>
                                <span>✨</span>
                                <span>Win Animations</span>
                            </div>
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
            linear-gradient(rgba(255, 215, 0, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 215, 0, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    bgGlow: {
        position: 'fixed',
        top: '30%', left: '50%',
        width: '100%', height: '100%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(ellipse at center, rgba(255, 215, 0, 0.08), transparent 60%)',
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
    searchContainer: {
        position: 'relative',
        marginBottom: 24,
    },
    searchInput: {
        width: '100%',
        padding: '16px 20px 16px 50px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 12,
        fontSize: 16,
        color: '#fff',
        outline: 'none',
    },
    searchIcon: {
        position: 'absolute',
        left: 18,
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: 18,
    },
    categoriesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 32,
    },
    categoryCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '20px 16px',
        border: '2px solid',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    categoryIcon: {
        fontSize: 28,
    },
    categoryName: {
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
    },
    categoryCount: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    emptyState: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        padding: '60px 40px',
        textAlign: 'center',
    },
    emptyIcon: {
        fontSize: 64,
        display: 'block',
        marginBottom: 24,
    },
    emptyTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        maxWidth: 500,
        margin: '0 auto 32px',
        lineHeight: 1.6,
    },
    featureGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
        maxWidth: 400,
        margin: '0 auto',
    },
    featureCard: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        background: 'rgba(255, 215, 0, 0.1)',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 10,
        fontSize: 14,
        color: '#FFD700',
    },
};
