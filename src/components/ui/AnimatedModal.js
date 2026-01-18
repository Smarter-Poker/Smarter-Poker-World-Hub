/**
 * 🎨 ANIMATED MODAL
 * Reusable modal with backdrop and content animations
 */

import { motion, AnimatePresence } from 'framer-motion';
import { modalBackdrop, modalContent } from '../../utils/animations';

export default function AnimatedModal({
    isOpen,
    onClose,
    children,
    maxWidth = 600,
    closeOnBackdrop = true,
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        variants={modalBackdrop}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        onClick={closeOnBackdrop ? onClose : undefined}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 9998,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 20,
                        }}
                    >
                        {/* Modal Content */}
                        <motion.div
                            variants={modalContent}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'linear-gradient(135deg, #1a1f3a 0%, #0d0d2e 100%)',
                                borderRadius: 16,
                                padding: 32,
                                maxWidth,
                                width: '100%',
                                maxHeight: '90vh',
                                overflow: 'auto',
                                position: 'relative',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                            }}
                        >
                            {/* Close button */}
                            <button
                                onClick={onClose}
                                style={{
                                    position: 'absolute',
                                    top: 16,
                                    right: 16,
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: 32,
                                    height: 32,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#fff',
                                    fontSize: 20,
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                }}
                            >
                                ✕
                            </button>

                            {children}
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
