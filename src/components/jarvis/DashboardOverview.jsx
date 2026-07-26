import { motion } from 'framer-motion';
import { useRouter } from 'next/router';
import { History, Layers, Droplet, FlaskConical } from 'lucide-react';

/**
 * DashboardOverview - Stats cards for Personal Assistant
 * Shows quick overview of Sessions Reviewed, Hands Analyzed, Active Leaks,
 * and Sandbox Sessions.
 *
 * Props contract: { stats: { sessionsReviewed, handsAnalyzed, leaksFound,
 * resolvedLeaks, sandboxSessions, avgEvLoss }, isLoading: boolean } — the
 * exact shape returned by GET /api/assistant/stats via useAssistantStats().
 */
export default function DashboardOverview({ stats, isLoading }) {
    const router = useRouter();

    const cards = [
        {
            title: 'Sessions Reviewed',
            value: stats?.sessionsReviewed || 0,
            label: 'Total Reviewed',
            Icon: History,
            color: '#00D4FF',
            onClick: () => router.push('/hub/personal-assistant/sandbox'),
        },
        {
            title: 'Hands Analyzed',
            value: stats?.handsAnalyzed || 0,
            label: 'GTO Checked',
            Icon: Layers,
            color: '#4CAF50',
            onClick: () => router.push('/hub/personal-assistant/leaks'),
        },
        {
            title: 'Active Leaks',
            value: stats?.leaksFound || 0,
            label: `${(stats?.resolvedLeaks || 0).toLocaleString()} Resolved`,
            Icon: Droplet,
            color: '#FF9800',
            onClick: () => router.push('/hub/personal-assistant/leaks'),
        },
        {
            title: 'Sandbox Sessions',
            value: stats?.sandboxSessions || 0,
            label: 'Scenarios Explored',
            Icon: FlaskConical,
            color: '#8B5CF6',
            onClick: () => router.push('/hub/personal-assistant/sandbox'),
        },
    ];

    // Sign-aware value formatting: '-$150' instead of '$-150' when a prefixed
    // card ever carries a negative value; thousands separators throughout.
    const formatValue = (card) => {
        const v = Number(card.value) || 0;
        const prefix = card.prefix || '';
        return `${v < 0 ? '-' : ''}${prefix}${Math.abs(v).toLocaleString()}`;
    };

    if (isLoading) {
        return (
            <div style={styles.container}>
                <style>{`@keyframes shimmer { 0% { left: -100%; } 100% { left: 100%; } }`}</style>
                <h2 style={styles.title}>Dashboard Overview</h2>
                <div style={styles.grid}>
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} style={styles.loadingCard}>
                            <div style={styles.loadingShimmer} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <h2 style={styles.title}>Dashboard Overview</h2>
            <div style={styles.grid}>
                {cards.map((card, index) => (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.02, y: -4 }}
                        onClick={card.onClick}
                        style={{
                            ...styles.card,
                            borderColor: card.color + '40',
                        }}
                    >
                        <div style={styles.cardHeader}>
                            <span style={styles.icon}>
                                <card.Icon size={28} color={card.color} aria-hidden="true" />
                            </span>
                            <h3 style={styles.cardTitle}>{card.title}</h3>
                        </div>

                        <div style={styles.cardBody}>
                            <div style={styles.valueContainer}>
                                <span style={{ ...styles.value, color: card.color }}>
                                    {formatValue(card)}
                                </span>
                            </div>
                            <p style={styles.label}>{card.label}</p>
                        </div>

                        <div style={styles.cardFooter}>
                            <span style={{ ...styles.viewLink, color: card.color }}>
                                View Details →
                            </span>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    container: {
        marginBottom: 48,
    },
    title: {
        fontSize: 24,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 24,
        fontFamily: 'Inter, sans-serif',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 20,
    },
    card: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid',
        borderRadius: 16,
        padding: 24,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    cardHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    icon: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.9)',
        margin: 0,
    },
    cardBody: {
        marginBottom: 16,
    },
    valueContainer: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
        marginBottom: 8,
    },
    value: {
        fontSize: 36,
        fontWeight: 700,
        fontFamily: 'Inter, sans-serif',
    },
    label: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        margin: 0,
    },
    cardFooter: {
        paddingTop: 16,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },
    viewLink: {
        fontSize: 13,
        fontWeight: 500,
        transition: 'opacity 0.2s',
    },
    loadingCard: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: 24,
        height: 180,
        position: 'relative',
        overflow: 'hidden',
    },
    loadingShimmer: {
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
        animation: 'shimmer 1.5s infinite',
    },
};
