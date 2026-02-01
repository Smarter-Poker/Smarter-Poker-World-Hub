/**
 * Training Settings Menu (Hamburger Menu)
 * ═══════════════════════════════════════════════════════════════════════════
 * Slide-out drawer with training preferences
 * - View Mode: Standard (beginner) / Pro (advanced)
 * - Sound Effects: On/Off
 * - Timer: On/Off
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { useTrainingSettings } from '../../contexts/TrainingSettingsContext';

export default function TrainingSettingsMenu({ onClose }) {
    const [isOpen, setIsOpen] = useState(false);
    const { viewMode, setViewMode, soundEnabled, setSoundEnabled, timerEnabled, setTimerEnabled, autoAdvanceEnabled, setAutoAdvanceEnabled, hintsEnabled, setHintsEnabled } = useTrainingSettings();

    // Auto-open when component mounts (controlled by parent)
    useEffect(() => {
        setIsOpen(true);
    }, []);

    // Close handler
    const handleClose = () => {
        setIsOpen(false);
        setTimeout(() => {
            if (onClose) onClose();
        }, 300); // Wait for animation
    };

    // Close on ESC key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    style={styles.backdrop}
                    onClick={handleClose}
                />
            )}

            {/* Drawer */}
            <div style={{
                ...styles.drawer,
                transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            }}>
                <div style={styles.drawerHeader}>
                    <h2 style={styles.drawerTitle}>Training Settings</h2>
                    <button
                        onClick={handleClose}
                        style={styles.closeButton}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div style={styles.drawerContent}>
                    {/* View Mode Toggle */}
                    <div style={styles.settingGroup}>
                        <label style={styles.settingLabel}>
                            View Mode
                            <span style={styles.settingHint}>
                                {viewMode === 'standard' ? 'Beginner-friendly' : 'Advanced terminology'}
                            </span>
                        </label>
                        <div style={styles.toggleGroup}>
                            <button
                                onClick={() => setViewMode('standard')}
                                style={{
                                    ...styles.toggleButton,
                                    ...(viewMode === 'standard' ? styles.toggleButtonActive : {}),
                                }}
                            >
                                Standard
                            </button>
                            <button
                                onClick={() => setViewMode('pro')}
                                style={{
                                    ...styles.toggleButton,
                                    ...(viewMode === 'pro' ? styles.toggleButtonActive : {}),
                                }}
                            >
                                Pro
                            </button>
                        </div>
                    </div>

                    {/* Sound Effects Toggle */}
                    <div style={styles.settingGroup}>
                        <label style={styles.settingLabel}>
                            Sound Effects
                        </label>
                        <label style={styles.switchContainer}>
                            <input
                                type="checkbox"
                                checked={soundEnabled}
                                onChange={(e) => setSoundEnabled(e.target.checked)}
                                style={styles.switchInput}
                            />
                            <span style={{
                                ...styles.switchSlider,
                                backgroundColor: soundEnabled ? '#10b981' : '#64748b',
                            }} />
                        </label>
                    </div>

                    {/* Timer Toggle */}
                    <div style={styles.settingGroup}>
                        <label style={styles.settingLabel}>
                            Timer
                        </label>
                        <label style={styles.switchContainer}>
                            <input
                                type="checkbox"
                                checked={timerEnabled}
                                onChange={(e) => setTimerEnabled(e.target.checked)}
                                style={styles.switchInput}
                            />
                            <span style={{
                                ...styles.switchSlider,
                                backgroundColor: timerEnabled ? '#10b981' : '#64748b',
                            }} />
                        </label>
                    </div>

                    {/* Auto-Advance Toggle */}
                    <div style={styles.settingGroup}>
                        <label style={styles.settingLabel}>
                            Auto-Advance
                            <span style={styles.settingHint}>
                                Automatically move to next question
                            </span>
                        </label>
                        <label style={styles.switchContainer}>
                            <input
                                type="checkbox"
                                checked={autoAdvanceEnabled}
                                onChange={(e) => setAutoAdvanceEnabled(e.target.checked)}
                                style={styles.switchInput}
                            />
                            <span style={{
                                ...styles.switchSlider,
                                backgroundColor: autoAdvanceEnabled ? '#10b981' : '#64748b',
                            }} />
                        </label>
                    </div>

                    {/* Hints Toggle */}
                    <div style={styles.settingGroup}>
                        <label style={styles.settingLabel}>
                            Hints
                            <span style={styles.settingHint}>
                                Show helpful hints during questions
                            </span>
                        </label>
                        <label style={styles.switchContainer}>
                            <input
                                type="checkbox"
                                checked={hintsEnabled}
                                onChange={(e) => setHintsEnabled(e.target.checked)}
                                style={styles.switchInput}
                            />
                            <span style={{
                                ...styles.switchSlider,
                                backgroundColor: hintsEnabled ? '#10b981' : '#64748b',
                            }} />
                        </label>
                    </div>

                    {/* Info Text */}
                    <div style={styles.infoBox}>
                        <p style={styles.infoText}>
                            <strong>Standard View:</strong> Uses beginner-friendly language like "Your Stack: 150bb"
                        </p>
                        <p style={styles.infoText}>
                            <strong>Pro View:</strong> Uses advanced terminology like "Effective Stack: 150bb"
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

const styles = {
    hamburgerButton: {
        position: 'fixed',
        top: '16px',
        right: '80px',
        zIndex: 998,
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '8px',
        padding: '8px',
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 999,
        animation: 'fadeIn 0.2s ease',
    },
    drawer: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: '400px',
        background: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3a 100%)',
        boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        transition: 'transform 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
    },
    drawerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px',
        borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
    },
    drawerTitle: {
        color: '#fff',
        fontSize: '24px',
        fontWeight: '700',
        margin: 0,
    },
    closeButton: {
        background: 'transparent',
        border: 'none',
        color: '#94a3b8',
        fontSize: '32px',
        cursor: 'pointer',
        padding: '0',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.2s ease',
    },
    drawerContent: {
        flex: 1,
        padding: '24px',
        overflowY: 'auto',
    },
    settingGroup: {
        marginBottom: '32px',
    },
    settingLabel: {
        display: 'block',
        color: '#fff',
        fontSize: '16px',
        fontWeight: '600',
        marginBottom: '12px',
    },
    settingHint: {
        display: 'block',
        color: '#94a3b8',
        fontSize: '14px',
        fontWeight: '400',
        marginTop: '4px',
    },
    toggleGroup: {
        display: 'flex',
        gap: '12px',
    },
    toggleButton: {
        flex: 1,
        padding: '12px 24px',
        background: 'rgba(30, 58, 95, 0.5)',
        border: '2px solid #3b82f6',
        borderRadius: '8px',
        color: '#94a3b8',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    toggleButtonActive: {
        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
        color: '#fff',
        borderColor: '#60a5fa',
    },
    switchContainer: {
        position: 'relative',
        display: 'inline-block',
        width: '60px',
        height: '34px',
        cursor: 'pointer',
    },
    switchInput: {
        opacity: 0,
        width: 0,
        height: 0,
    },
    switchSlider: {
        position: 'absolute',
        cursor: 'pointer',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: '34px',
        transition: 'background-color 0.2s ease',
    },
    infoBox: {
        marginTop: '32px',
        padding: '16px',
        background: 'rgba(59, 130, 246, 0.1)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: '8px',
    },
    infoText: {
        color: '#94a3b8',
        fontSize: '14px',
        lineHeight: '1.6',
        margin: '0 0 8px 0',
    },
};
