/**
 * 🚨 LEAK FIXER INTERCEPT — Law 1 Implementation
 * ═══════════════════════════════════════════════════════════════════════════
 * Force-routes players to fix detected weaknesses through targeted drills.
 * Shows remediation prompt when high-confidence leaks (≥75%) are detected.
 * Awards 2.5x XP multiplier for successfully passing remediation drills.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import { getClinicForLeak, getRemediationXPMultiplier } from '../../data/TRAINING_CLINICS';

const STORAGE_KEY = 'pokeriq_detected_leaks';

export default function LeakFixerIntercept({ onDismiss, onAccept }) {
    const router = useRouter();
    const [leaks, setLeaks] = useState([]);
    const [topLeak, setTopLeak] = useState(null);
    const [clinic, setClinic] = useState(null);
    const [visible, setVisible] = useState(false);

    // Check for detected leaks on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsedLeaks = JSON.parse(stored);
                if (parsedLeaks?.length > 0) {
                    // Sort by confidence, get the worst leak
                    const sorted = parsedLeaks.sort((a, b) => b.confidence - a.confidence);
                    const worst = sorted[0];

                    // Only show intercept for high-confidence leaks
                    if (worst.confidence >= 0.75) {
                        setLeaks(parsedLeaks);
                        setTopLeak(worst);

                        // Get the corresponding clinic
                        const targetClinic = getClinicForLeak(worst.category);
                        if (targetClinic) {
                            setClinic(targetClinic);
                            setVisible(true);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[LAW 1] Could not load leak data:', e);
        }
    }, []);

    // Handle accept - route to clinic
    const handleAccept = () => {
        if (clinic) {
            // Clear the leak so we don't show again
            localStorage.removeItem(STORAGE_KEY);

            if (onAccept) onAccept(clinic);

            // Route to clinic page
            router.push(`/hub/training/clinic/${clinic.id}`);
        }
    };

    // Handle dismiss - skip this time
    const handleDismiss = () => {
        setVisible(false);
        if (onDismiss) onDismiss();
    };

    if (!visible || !topLeak || !clinic) return null;

    const xpMultiplier = getRemediationXPMultiplier(clinic.id);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={styles.overlay}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    style={styles.card}
                >
                    {/* Warning Icon */}
                    <div style={styles.warningIcon}>⚠️</div>

                    {/* Title */}
                    <h2 style={styles.title}>LEAK DETECTED</h2>

                    {/* Leak Name */}
                    <div style={styles.leakName}>{topLeak.name}</div>

                    {/* Confidence Bar */}
                    <div style={styles.confidenceContainer}>
                        <div style={styles.confidenceLabel}>
                            Detection Confidence: {Math.round(topLeak.confidence * 100)}%
                        </div>
                        <div style={styles.confidenceBarBg}>
                            <motion.div
                                style={{
                                    ...styles.confidenceBar,
                                    background: topLeak.confidence >= 0.9 ? '#FF4444' :
                                        topLeak.confidence >= 0.75 ? '#FF6B35' : '#FFD700'
                                }}
                                initial={{ width: 0 }}
                                animate={{ width: `${topLeak.confidence * 100}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    </div>

                    {/* Clinic Recommendation */}
                    <div style={styles.clinicBox}>
                        <div style={styles.clinicIcon}>{clinic.icon}</div>
                        <div style={styles.clinicInfo}>
                            <div style={styles.clinicName}>{clinic.name}</div>
                            <div style={styles.clinicSubtitle}>{clinic.subtitle}</div>
                        </div>
                    </div>

                    {/* Description */}
                    <p style={styles.description}>{clinic.description}</p>

                    {/* XP Multiplier */}
                    <div style={styles.xpBadge}>
                        🔥 {xpMultiplier}x XP MULTIPLIER
                    </div>

                    {/* Buttons */}
                    <div style={styles.buttonRow}>
                        <motion.button
                            style={styles.dismissButton}
                            onClick={handleDismiss}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            Skip For Now
                        </motion.button>
                        <motion.button
                            style={styles.acceptButton}
                            onClick={handleAccept}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            Fix My Leak
                        </motion.button>
                    </div>

                    {/* Other leaks count */}
                    {leaks.length > 1 && (
                        <div style={styles.otherLeaks}>
                            +{leaks.length - 1} other leak{leaks.length > 2 ? 's' : ''} detected
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
        padding: 20,
    },

    card: {
        width: '100%',
        maxWidth: 400,
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0a0a15 100%)',
        borderRadius: 20,
        padding: '32px 24px',
        border: '2px solid #FF6B35',
        boxShadow: '0 0 60px rgba(255, 107, 53, 0.3)',
        textAlign: 'center',
        fontFamily: 'Inter, -apple-system, sans-serif',
        color: '#fff',
    },

    warningIcon: {
        fontSize: 48,
        marginBottom: 16,
        animation: 'pulse 2s ease-in-out infinite',
    },

    title: {
        fontSize: 24,
        fontWeight: 800,
        margin: '0 0 8px 0',
        color: '#FF6B35',
        letterSpacing: 2,
    },

    leakName: {
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 24,
    },

    confidenceContainer: {
        marginBottom: 24,
    },

    confidenceLabel: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
        marginBottom: 8,
    },

    confidenceBarBg: {
        width: '100%',
        height: 8,
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        overflow: 'hidden',
    },

    confidenceBar: {
        height: '100%',
        borderRadius: 4,
    },

    clinicBox: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        marginBottom: 16,
    },

    clinicIcon: {
        fontSize: 36,
    },

    clinicInfo: {
        textAlign: 'left',
    },

    clinicName: {
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
    },

    clinicSubtitle: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.5)',
    },

    description: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.5,
        margin: '0 0 20px 0',
    },

    xpBadge: {
        display: 'inline-block',
        padding: '8px 16px',
        background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 24,
    },

    buttonRow: {
        display: 'flex',
        gap: 12,
    },

    dismissButton: {
        flex: 1,
        padding: '16px',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 12,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },

    acceptButton: {
        flex: 2,
        padding: '16px',
        background: 'linear-gradient(135deg, #FF6B35, #FF4444)',
        border: 'none',
        borderRadius: 12,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
    },

    otherLeaks: {
        marginTop: 16,
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
    },
};
