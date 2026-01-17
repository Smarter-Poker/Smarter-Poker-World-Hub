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
            style={{
                position: 'relative',
                cursor: 'pointer',
                flexShrink: 0,
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    width: 160,
                    height: 160,
                    background: '#1a2744',
                    border: `3px solid ${categoryColor}`,
                    borderRadius: 10,
                    boxShadow: `0 0 20px ${categoryColor}, 0 0 40px ${categoryColor}80, 0 8px 20px rgba(0,0,0,0.6)`,
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

            <h3 style={{
                margin: '8px 0 0 0',
                fontSize: 14,
                fontWeight: 800,
                color: '#fff',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                textAlign: 'center',
                width: '100%',
                maxWidth: 160,
            }}>
                {game.name}
            </h3>
        </motion.div>
    );
}
