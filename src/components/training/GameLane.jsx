/**
 * 🎬 GAME LANE — Exact Mockup Match
 * ═══════════════════════════════════════════════════════════════════════════
 * Horizontal scrolling lane matching reference design
 * With ">>" prefix on titles and "BELOW 70%!" urgency badge
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useRef, useState, useEffect } from 'react';
import GameCard from './GameCard';

export default function GameLane({
    title,
    subtitle,
    games = [],
    userMastery = {},
    userLevels = {},
    onGameClick,
    isUrgent = false,
}) {
    const scrollRef = useRef(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(true);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const updateArrows = () => {
            setShowLeftArrow(container.scrollLeft > 20);
            setShowRightArrow(
                container.scrollLeft < container.scrollWidth - container.clientWidth - 20
            );
        };

        updateArrows();
        container.addEventListener('scroll', updateArrows);
        return () => container.removeEventListener('scroll', updateArrows);
    }, [games]);

    const scroll = (direction) => {
        const container = scrollRef.current;
        if (!container) return;
        container.scrollBy({ left: direction === 'left' ? -350 : 350, behavior: 'smooth' });
    };

    if (!games || games.length === 0) return null;

    return (
        <div
            style={styles.container}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Lane header */}
            <div style={styles.header}>
                <div style={styles.titleRow}>
                    <span style={styles.chevron}>&gt;&gt;</span>
                    <h2 style={{
                        ...styles.title,
                        color: isUrgent ? '#FF6B35' : '#fff',
                    }}>
                        {title.toUpperCase()}
                    </h2>
                    {/* Urgency badge for Fix Your Leaks */}
                    {isUrgent && (
                        <div style={styles.urgencyBadge}>
                            BELOW 70%!
                        </div>
                    )}
                </div>
                {subtitle && (
                    <span style={styles.subtitle}>{subtitle}</span>
                )}
            </div>

            {/* Scroll container */}
            <div style={styles.scrollWrapper}>
                {/* Left arrow */}
                {showLeftArrow && isHovered && (
                    <button
                        onClick={() => scroll('left')}
                        style={{ ...styles.arrowButton, left: 0 }}
                    >
                        ‹
                    </button>
                )}

                {/* Cards */}
                <div ref={scrollRef} style={styles.scrollContainer}>
                    {games.map((game, index) => (
                        <GameCard
                            key={game.id || index}
                            game={game}
                            mastery={userMastery[game.id] || 0}
                            levelsCompleted={userLevels[game.id] || 0}
                            onClick={onGameClick}
                        />
                    ))}
                    <div style={{ width: 40, flexShrink: 0 }} />
                </div>

                {/* Right arrow */}
                {showRightArrow && isHovered && (
                    <button
                        onClick={() => scroll('right')}
                        style={{ ...styles.arrowButton, right: 0 }}
                    >
                        ›
                    </button>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        marginBottom: 28,
        position: 'relative',
    },

    header: {
        padding: '0 40px',
        marginBottom: 12,
    },

    titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },

    chevron: {
        color: '#FF6B35',
        fontSize: 14,
        fontWeight: 700,
    },

    title: {
        fontSize: 16,
        fontWeight: 700,
        margin: 0,
        letterSpacing: 1,
    },

    urgencyBadge: {
        padding: '4px 10px',
        background: 'linear-gradient(135deg, #FF6B35, #E53935)',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 800,
        color: '#fff',
        letterSpacing: 0.5,
        marginLeft: 12,
    },

    subtitle: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 24,
    },

    scrollWrapper: {
        position: 'relative',
    },

    scrollContainer: {
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        overflowY: 'hidden',
        paddingLeft: 40,
        paddingBottom: 8,
        scrollBehavior: 'smooth',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
    },

    arrowButton: {
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        width: 36,
        height: 36,
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '50%',
        color: '#fff',
        fontSize: 24,
        cursor: 'pointer',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
};
