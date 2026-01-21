/**
 * 🎨 GOD-MODE DEMO PAGE
 * Demonstrates all God-Mode components in action
 */

import { useState } from 'react';
import Head from 'next/head';
import { motion } from 'framer-motion';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import AnimatedButton from '../../src/components/ui/AnimatedButton';
import AnimatedCard from '../../src/components/ui/AnimatedCard';
import AnimatedModal from '../../src/components/ui/AnimatedModal';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import { SkeletonBox, SkeletonCard, SkeletonAvatar } from '../../src/components/ui/SkeletonLoader';
import toast from '../../src/stores/toastStore';
import {
    masteryCelebration,
    achievementCelebration,
    streakCelebration,
    levelUpCelebration,
    fireworksCelebration
} from '../../src/utils/confetti';
import { staggerContainer, staggerItem } from '../../src/utils/animations';

export default function GodModeDemoPage() {
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    const handleToastDemo = (type) => {
        switch (type) {
            case 'success':
                toast.success('Success! Operation completed perfectly!');
                break;
            case 'error':
                toast.error('Error! Something went wrong.');
                break;
            case 'info':
                toast.info('Info: Here\'s some helpful information.');
                break;
            case 'warning':
                toast.warning('Warning: Please review this action.');
                break;
        }
    };

    const handleConfettiDemo = (type) => {
        switch (type) {
            case 'mastery':
                masteryCelebration();
                toast.success('Mastery Achieved! 🏆');
                break;
            case 'achievement':
                achievementCelebration();
                toast.success('Achievement Unlocked! ⭐');
                break;
            case 'streak':
                streakCelebration(10);
                toast.success('10-Day Streak! 🔥');
                break;
            case 'levelup':
                levelUpCelebration();
                toast.success('Level Up! 🚀');
                break;
            case 'fireworks':
                fireworksCelebration();
                toast.success('Epic Celebration! 🎆');
                break;
        }
    };

    const simulateLoading = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            toast.success('Loading complete!');
        }, 3000);
    };

    return (
        <PageTransition>
            <Head>
                <title>God-Mode Demo | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0a0a15 0%, #1a1f3a 100%)',
                padding: '40px 20px',
            }}>
                {/* UniversalHeader */}
                <UniversalHeader pageDepth={2} />

                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    {/* Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ textAlign: 'center', marginBottom: 60 }}
                    >
                        <h1 style={{
                            fontSize: 48,
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #00d4ff, #00ff88)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            marginBottom: 16,
                        }}>
                            God-Mode Components
                        </h1>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 18 }}>
                            All premium UI components in action
                        </p>
                    </motion.div>

                    {/* Toast Notifications Section */}
                    <motion.div variants={staggerContainer} initial="initial" animate="animate">
                        <motion.div variants={staggerItem}>
                            <AnimatedCard hoverable style={{ marginBottom: 40, padding: 32 }}>
                                <h2 style={{ color: '#fff', fontSize: 24, marginBottom: 24 }}>
                                    🔔 Toast Notifications
                                </h2>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    <AnimatedButton variant="success" onClick={() => handleToastDemo('success')}>
                                        Success Toast
                                    </AnimatedButton>
                                    <AnimatedButton variant="danger" onClick={() => handleToastDemo('error')}>
                                        Error Toast
                                    </AnimatedButton>
                                    <AnimatedButton variant="primary" onClick={() => handleToastDemo('info')}>
                                        Info Toast
                                    </AnimatedButton>
                                    <AnimatedButton variant="secondary" onClick={() => handleToastDemo('warning')}>
                                        Warning Toast
                                    </AnimatedButton>
                                </div>
                            </AnimatedCard>
                        </motion.div>

                        {/* Confetti Celebrations Section */}
                        <motion.div variants={staggerItem}>
                            <AnimatedCard hoverable style={{ marginBottom: 40, padding: 32 }}>
                                <h2 style={{ color: '#fff', fontSize: 24, marginBottom: 24 }}>
                                    🎉 Confetti Celebrations
                                </h2>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    <AnimatedButton variant="primary" onClick={() => handleConfettiDemo('mastery')}>
                                        Mastery 🏆
                                    </AnimatedButton>
                                    <AnimatedButton variant="success" onClick={() => handleConfettiDemo('achievement')}>
                                        Achievement ⭐
                                    </AnimatedButton>
                                    <AnimatedButton variant="danger" onClick={() => handleConfettiDemo('streak')}>
                                        Streak 🔥
                                    </AnimatedButton>
                                    <AnimatedButton variant="primary" onClick={() => handleConfettiDemo('levelup')}>
                                        Level Up 🚀
                                    </AnimatedButton>
                                    <AnimatedButton variant="success" onClick={() => handleConfettiDemo('fireworks')}>
                                        Fireworks 🎆
                                    </AnimatedButton>
                                </div>
                            </AnimatedCard>
                        </motion.div>

                        {/* Loading States Section */}
                        <motion.div variants={staggerItem}>
                            <AnimatedCard hoverable style={{ marginBottom: 40, padding: 32 }}>
                                <h2 style={{ color: '#fff', fontSize: 24, marginBottom: 24 }}>
                                    ⏳ Loading States
                                </h2>

                                {loading ? (
                                    <div>
                                        <h3 style={{ color: '#fff', marginBottom: 16 }}>Skeleton Loaders:</h3>
                                        <SkeletonBox width="60%" height={24} style={{ marginBottom: 12 }} />
                                        <SkeletonBox width="40%" height={20} style={{ marginBottom: 24 }} />
                                        <SkeletonCard style={{ marginBottom: 16 }} />
                                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                            <SkeletonAvatar size={48} />
                                            <div style={{ flex: 1 }}>
                                                <SkeletonBox width="50%" height={16} style={{ marginBottom: 8 }} />
                                                <SkeletonBox width="30%" height={14} />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 style={{ color: '#fff', marginBottom: 16 }}>Spinners:</h3>
                                        <div style={{ display: 'flex', gap: 32, marginBottom: 24 }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <LoadingSpinner variant="circle" size={40} />
                                                <p style={{ color: '#fff', fontSize: 12, marginTop: 8 }}>Circle</p>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <LoadingSpinner variant="dots" size={40} />
                                                <p style={{ color: '#fff', fontSize: 12, marginTop: 8 }}>Dots</p>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <LoadingSpinner variant="pulse" size={40} />
                                                <p style={{ color: '#fff', fontSize: 12, marginTop: 8 }}>Pulse</p>
                                            </div>
                                        </div>
                                        <AnimatedButton variant="primary" onClick={simulateLoading}>
                                            Simulate Loading (3s)
                                        </AnimatedButton>
                                    </div>
                                )}
                            </AnimatedCard>
                        </motion.div>

                        {/* Modal Section */}
                        <motion.div variants={staggerItem}>
                            <AnimatedCard hoverable style={{ marginBottom: 40, padding: 32 }}>
                                <h2 style={{ color: '#fff', fontSize: 24, marginBottom: 24 }}>
                                    📱 Animated Modal
                                </h2>
                                <AnimatedButton variant="primary" onClick={() => setModalOpen(true)}>
                                    Open Modal
                                </AnimatedButton>
                            </AnimatedCard>
                        </motion.div>

                        {/* Button Variants Section */}
                        <motion.div variants={staggerItem}>
                            <AnimatedCard hoverable style={{ padding: 32 }}>
                                <h2 style={{ color: '#fff', fontSize: 24, marginBottom: 24 }}>
                                    🎨 Button Variants
                                </h2>
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    <AnimatedButton variant="primary">Primary</AnimatedButton>
                                    <AnimatedButton variant="secondary">Secondary</AnimatedButton>
                                    <AnimatedButton variant="success">Success</AnimatedButton>
                                    <AnimatedButton variant="danger">Danger</AnimatedButton>
                                </div>
                            </AnimatedCard>
                        </motion.div>
                    </motion.div>
                </div>
            </div>

            {/* Modal */}
            <AnimatedModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                maxWidth={500}
            >
                <h2 style={{ color: '#fff', fontSize: 24, marginBottom: 16 }}>
                    Animated Modal
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24 }}>
                    This modal has smooth backdrop blur and scale animations powered by Framer Motion.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                    <AnimatedButton variant="primary" onClick={() => {
                        setModalOpen(false);
                        toast.success('Modal action confirmed!');
                    }}>
                        Confirm
                    </AnimatedButton>
                    <AnimatedButton variant="secondary" onClick={() => setModalOpen(false)}>
                        Cancel
                    </AnimatedButton>
                </div>
            </AnimatedModal>
        </PageTransition>
    );
}
