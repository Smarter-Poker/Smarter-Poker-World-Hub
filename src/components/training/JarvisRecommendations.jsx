/**
 * JARVIS RECOMMENDATIONS WIDGET
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * AI-powered training game recommendations based on user's weak areas
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function JarvisRecommendations({ userId, onGameClick }) {
    const [recommendations, setRecommendations] = useState([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) {
            fetchRecommendations();
        }
    }, [userId]);

    const fetchRecommendations = async () => {
        try {
            const res = await fetch(`/api/training/recommendations?userId=${userId}`);
            const data = await res.json();
            if (data.success) {
                setRecommendations(data.recommendations || []);
                setMessage(data.message || '');
            }
        } catch (e) {
            console.warn('[JarvisRecommendations] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <span style={styles.jarvisIcon}>●</span>
                    <span style={styles.loadingText}>Jarvis Is Analyzing Your Game...</span>
                </div>
            </div>
        );
    }

    if (recommendations.length === 0) {
        return null;
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <span style={styles.jarvisIcon}>●</span>
                    <span style={styles.title}>Jarvis Recommends</span>
                </div>
            </div>

            {message && (
                <motion.div
                    style={styles.message}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    "{message}"
                </motion.div>
            )}

            <div style={styles.gamesList}>
                {recommendations.slice(0, 3).map((game, i) => (
                    <motion.div
                        key={game.id}
                        style={styles.gameCard}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onGameClick?.(game)}
                    >
                        <div style={styles.gameInfo}>
                            <div style={styles.gameName}>{game.name}</div>
                            <div style={styles.gameReason}>{game.reason}</div>
                            <div style={styles.gameMeta}>
                                <span style={{
                                    ...styles.difficultyBadge,
                                    background: game.difficulty === 'beginner' ? 'rgba(49, 162, 76, 0.2)' :
                                        game.difficulty === 'intermediate' ? 'rgba(255, 184, 0, 0.2)' :
                                            'rgba(255, 68, 68, 0.2)',
                                    color: game.difficulty === 'beginner' ? '#31A24C' :
                                        game.difficulty === 'intermediate' ? '#FFB800' :
                                            '#FF4444'
                                }}>
                                    {game.difficulty}
                                </span>
                                <span style={styles.categoryBadge}>{game.category}</span>
                            </div>
                        </div>
                        <div style={styles.playButton}>
                            ▶
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    container: {
        margin: '16px',
        background: 'linear-gradient(180deg, rgba(0, 224, 255, 0.05), transparent)',
        borderRadius: '16px',
        padding: '16px',
        border: '1px solid rgba(0, 224, 255, 0.2)'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    jarvisIcon: {
        fontSize: '24px',
        color: '#00E0FF',
    },
    title: {
        fontSize: '16px',
        fontWeight: 700,
        color: '#00E0FF'
    },
    message: {
        fontSize: '13px',
        color: '#9ca3af',
        fontStyle: 'italic',
        marginBottom: '16px',
        padding: '10px 12px',
        background: 'rgba(0, 224, 255, 0.05)',
        borderRadius: '8px',
        borderLeft: '3px solid #00E0FF'
    },
    gamesList: {
        display: 'grid',
        gap: '10px'
    },
    gameCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: '#1a1a1a',
        padding: '14px',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        transition: 'background 0.2s'
    },
    gameInfo: {
        flex: 1
    },
    gameName: {
        fontSize: '15px',
        fontWeight: 600,
        marginBottom: '4px',
        color: '#fff'
    },
    gameReason: {
        fontSize: '12px',
        color: '#9ca3af',
        marginBottom: '8px'
    },
    gameMeta: {
        display: 'flex',
        gap: '8px'
    },
    difficultyBadge: {
        fontSize: '10px',
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: '4px',
        textTransform: 'capitalize'
    },
    categoryBadge: {
        fontSize: '10px',
        fontWeight: 500,
        padding: '3px 8px',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.1)',
        color: '#9ca3af',
        textTransform: 'capitalize'
    },
    playButton: {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #00E0FF, #0099FF)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        color: '#fff',
        paddingLeft: '2px'
    },
    loadingContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px'
    },
    loadingText: {
        fontSize: '14px',
        color: '#9ca3af'
    }
};
