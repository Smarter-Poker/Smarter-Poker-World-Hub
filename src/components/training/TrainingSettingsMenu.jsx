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

export default function TrainingSettingsMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const { viewMode, setViewMode, soundEnabled, setSoundEnabled, timerEnabled, setTimerEnabled } = useTrainingSettings();

    // Close on ESC key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    return (
        <>
            {/* Hamburger Button */}
            <button
                onClick={() => setIsOpen(true)}
                style={styles.hamburgerButton}
                aria-label="Training Settings"
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>

            {/* Backdrop */}
            {isOpen && (
                <div
                    style={styles.backdrop}
                    onClick={() => setIsOpen(false)}
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
                        onClick={() => setIsOpen(false)}
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
        top: '20px',
        right: '20px',
        zIndex: 998,
        background: 'rgba(30, 58, 95, 0.9)',
        border: '2px solid #3b82f6',
        borderRadius: '8px',
        padding: '12px',
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
