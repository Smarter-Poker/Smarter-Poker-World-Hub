import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/router';

/**
 * JarvisChatWidget - Floating chat button that opens messenger
 * Provides quick access to Jarvis from any page
 */
export default function JarvisChatWidget({ user }) {
    const router = useRouter();
    const [isHovered, setIsHovered] = useState(false);

    const handleClick = () => {
        // Navigate to messenger and auto-select Jarvis
        router.push('/hub/messenger?chat=jarvis');
    };

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
            style={{
                position: 'fixed',
                bottom: 24,
                right: 24,
                zIndex: 1000,
            }}
        >
            <motion.button
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #00D4FF 0%, #0096FF 100%)',
                    border: '3px solid rgba(0, 212, 255, 0.3)',
                    boxShadow: '0 4px 20px rgba(0, 212, 255, 0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'visible',
                }}
            >
                {/* Jarvis Avatar */}
                <img
                    src="/images/jarvis-avatar.png"
                    alt="Chat With Jarvis"
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        objectFit: 'cover',
                    }}
                />

                {/* Pulse animation */}
                <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        opacity: [0.5, 0, 0.5],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                    style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        background: '#00D4FF',
                        zIndex: -1,
                    }}
                />

                {/* Online indicator */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#4CAF50',
                        border: '2px solid white',
                    }}
                />
            </motion.button>

            {/* Tooltip */}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        style={{
                            position: 'absolute',
                            right: 80,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'rgba(0, 0, 0, 0.9)',
                            color: '#00D4FF',
                            padding: '8px 16px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                        }}
                    >
                        Chat with Jarvis
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
