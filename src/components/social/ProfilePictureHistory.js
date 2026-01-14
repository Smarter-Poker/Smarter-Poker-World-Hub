/**
 * 👤 PROFILE PICTURE HISTORY COMPONENT
 * Scrollable carousel of previous profile pictures
 * src/components/social/ProfilePictureHistory.js
 */

import { useState, useEffect, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const C = {
    bg: '#0a0a0f',
    surface: 'rgba(255, 255, 255, 0.05)',
    surfaceHover: 'rgba(255, 255, 255, 0.1)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#ffffff',
    textMuted: 'rgba(255, 255, 255, 0.6)',
    accent: '#00d4ff',
    accentGlow: 'rgba(0, 212, 255, 0.3)',
};

const styles = {
    container: {
        marginTop: 16,
    },

    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },

    title: {
        fontSize: 14,
        fontWeight: 600,
        color: C.textMuted,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },

    viewAllBtn: {
        fontSize: 13,
        color: C.accent,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
    },

    carousel: {
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 8,
        scrollSnapType: 'x mandatory',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
    },

    item: (isCurrent) => ({
        flexShrink: 0,
        width: 64,
        height: 64,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        border: isCurrent ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
        boxShadow: isCurrent ? `0 0 16px ${C.accentGlow}` : 'none',
        scrollSnapAlign: 'start',
        transition: 'all 0.2s',
        position: 'relative',
    }),

    image: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },

    currentBadge: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: C.accent,
        color: '#000',
        fontSize: 9,
        fontWeight: 700,
        textAlign: 'center',
        padding: '2px 0',
    },

    date: {
        position: 'absolute',
        bottom: 2,
        left: 0,
        right: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        fontSize: 8,
        textAlign: 'center',
        padding: '2px 0',
    },

    emptyState: {
        padding: 16,
        textAlign: 'center',
        color: C.textMuted,
        fontSize: 13,
        background: C.surface,
        borderRadius: 12,
    },

    // Tooltip for restore option
    tooltip: {
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1a1a2e',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 12,
        whiteSpace: 'nowrap',
        zIndex: 100,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        marginBottom: 8,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// 👤 PROFILE PICTURE HISTORY COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function ProfilePictureHistory({
    userId,
    supabase,
    onSelectPicture,
    onViewAll,
    limit = 8,
}) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hoveredId, setHoveredId] = useState(null);

    // Fetch profile picture history
    const fetchHistory = useCallback(async () => {
        if (!userId || !supabase) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .rpc('get_profile_picture_history', { p_user_id: userId });

            if (error) throw error;

            // Limit results
            setHistory((data || []).slice(0, limit));
        } catch (err) {
            console.error('Error fetching profile picture history:', err);
            setHistory([]);
        } finally {
            setLoading(false);
        }
    }, [userId, supabase, limit]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Format date
    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        if (days < 30) return `${Math.floor(days / 7)}w ago`;
        if (days < 365) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    // Handle click on a picture
    const handleClick = async (item) => {
        if (item.is_current) return; // Already current

        if (onSelectPicture) {
            onSelectPicture(item);
        } else {
            // Default behavior: restore this picture
            try {
                const { error } = await supabase.rpc('set_profile_picture', {
                    p_media_id: item.media_id
                });

                if (error) throw error;

                fetchHistory(); // Refresh
            } catch (err) {
                console.error('Error restoring profile picture:', err);
            }
        }
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.emptyState}>Loading history...</div>
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div style={styles.container}>
                <div style={styles.emptyState}>
                    📷 No profile picture history yet
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.title}>
                    🕐 Previous Profile Pictures
                </div>
                {onViewAll && history.length > 3 && (
                    <button style={styles.viewAllBtn} onClick={onViewAll}>
                        View All →
                    </button>
                )}
            </div>

            {/* Carousel */}
            <div style={styles.carousel}>
                {history.map((item) => (
                    <div
                        key={item.media_id}
                        style={styles.item(item.is_current)}
                        onClick={() => handleClick(item)}
                        onMouseEnter={() => setHoveredId(item.media_id)}
                        onMouseLeave={() => setHoveredId(null)}
                    >
                        <img
                            src={item.thumbnail_url || item.public_url}
                            alt=""
                            style={styles.image}
                        />

                        {item.is_current ? (
                            <div style={styles.currentBadge}>CURRENT</div>
                        ) : (
                            <div style={styles.date}>{formatDate(item.set_at)}</div>
                        )}

                        {/* Hover tooltip */}
                        {hoveredId === item.media_id && !item.is_current && (
                            <div style={styles.tooltip}>
                                Click to restore
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Hide scrollbar CSS */}
            <style jsx>{`
                div::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
        </div>
    );
}

export default ProfilePictureHistory;
