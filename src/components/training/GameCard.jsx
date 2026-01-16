/**
 * GameCard - Slanted design with neon badge
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

const CATEGORY_COLORS = {
    MTT: '#FF6B35',
    CASH: '#4CAF50',
    SPINS: '#FFD700',
    PSYCHOLOGY: '#9C27B0',
    ADVANCED: '#2196F3',
};

export default function GameCard({
    game,
    progress = null,
    onClick,
    index = 0,
    image = null,
}) {
    const [isHovered, setIsHovered] = useState(false);

    if (!game) return null;

    const categoryColor = CATEGORY_COLORS[game.category] || '#FF6B35';
    const mastery = progress?.mastery || 0;

    const getTagLabel = () => {
        if (mastery >= 95) return 'S-RANK';
        if (mastery >= 85) return 'A-RANK';
        if (mastery >= 70) return 'B-RANK';
        if (mastery >= 50) return 'C-RANK';
        if (mastery > 0) return 'D-RANK';
        return game.category;
    };

    return (
        <motion.div
            onClick={() => onClick?.(game)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                padding: '10px 20px 10px 10px',
            }}
        >
            {/* ANGLED CARD - parallelogram shape like reference */}
            <div
                style={{
                    position: 'relative',
                    width: 200,
                    height: 120,
                    background: '#1a2744',
                    border: `3px solid ${categoryColor}`,
                    borderRadius: 10,
                    boxShadow: `0 0 20px ${categoryColor}50, 0 8px 20px rgba(0,0,0,0.6)`,
                    overflow: 'hidden',
                    transform: 'rotateY(-8deg)',
                    transformStyle: 'preserve-3d',
                }}
            >
                {/* IMAGE */}
                {(image || game.image) ? (
                    <motion.img
                        src={image || game.image}
                        alt={game.name}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                        animate={isHovered ? { scale: 1.1 } : { scale: 1 }}
                    />
                ) : (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 40,
                    }}>
                        {game.icon}
                    </div>
                )}
            </div>

            {/* NEON S-RANK BADGE - Upper Right - OUTSIDE card to avoid transform */}
            <div
                style={{
                    position: 'absolute',
                    top: 16,
                    right: 2,
                    padding: '6px 16px 6px 20px',
                    background: 'rgba(20, 20, 20, 0.9)',
                    border: '3px solid #FFD700',
                    borderRadius: 5,
                    clipPath: 'polygon(12% 0%, 100% 0%, 100% 100%, 12% 100%, 0% 50%)',
                    boxShadow: '0 0 20px #FFD700, 0 0 40px #FFD700, 0 0 60px rgba(255,215,0,0.6)',
                    zIndex: 10,
                }}
            >
                <span style={{
                    fontSize: 11,
                    fontWeight: 900,
                    color: '#fff',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}>
                    S-RANK
                </span>
            </div>

            {/* TITLE BELOW */}
            <h3 style={{
                margin: '8px 0 0 0',
                fontSize: 14,
                fontWeight: 800,
                color: '#fff',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}>
                {game.name}
            </h3>
        </motion.div>
    );
}
