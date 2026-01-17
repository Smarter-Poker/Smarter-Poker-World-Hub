/**
 * GAME CARD — Viewport-Scaled Component
 * Uses CSS classes for viewport-based sizing so 5 cards ALWAYS fit at any screen size
 * The entire layout scales proportionally like a photograph
 */

import { motion } from 'framer-motion';

export default function GameCard({ game, onClick, index = 0, image }) {
    if (!game) return null;

    const CATEGORY_COLORS = {
        MTT: '#FF6B35',
        CASH: '#4CAF50',
        SPINS: '#FFD700',
        PSYCHOLOGY: '#9C27B0',
        ADVANCED: '#2196F3',
    };

    const categoryColor = CATEGORY_COLORS[game.category] || '#FF6B35';

    return (
        <motion.div
            onClick={() => onClick?.(game)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="training-card"
            style={{
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                padding: '0.5vw',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
            }}
        >
            <div
                className="training-card-image"
                style={{
                    position: 'relative',
                    background: '#1a2744',
                    border: `3px solid ${categoryColor}`,
                    borderRadius: '0.8vw',
                    boxShadow: `0 0 2vw ${categoryColor}, 0 0 4vw ${categoryColor}80, 0 0.8vw 2vw rgba(0,0,0,0.6)`,
                    overflow: 'hidden',
                }}
            >
                {(image || game.image) && (
                    <img
                        src={image || game.image}
                        alt={game.name}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                )}
            </div>

            <h3
                className="training-card-title"
                style={{
                    margin: '0.5vw 0 0 0',
                    fontWeight: 800,
                    color: '#fff',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    textAlign: 'center',
                    width: '100%',
                }}
            >
                {game.name}
            </h3>
        </motion.div>
    );
}
