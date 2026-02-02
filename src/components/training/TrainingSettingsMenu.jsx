/**
 * Training Settings Menu (Hamburger Menu)
 * ═══════════════════════════════════════════════════════════════════════════
 * Slide-out drawer from LEFT with training preferences
 * Facebook Dark Theme
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

    // Toggle Switch Component with proper knob
    const ToggleSwitch = ({ enabled, onToggle }) => (
        <label style={styles.switchContainer}>
            <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onToggle(e.target.checked)}
                style={styles.switchInput}
            />
            <span style={{
                ...styles.switchTrack,
                backgroundColor: enabled ? '#31A24C' : '#3E4042',
            }}>
                <span style={{
                    ...styles.switchKnob,
                    transform: enabled ? 'translateX(26px)' : 'translateX(2px)',
                }} />
            </span>
        </label>
    );

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    style={styles.backdrop}
                    onClick={handleClose}
                />
            )}

            {/* Drawer - Opens from LEFT - Facebook Dark Theme */}
            <div style={{
                ...styles.drawer,
                transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
            }}>
                <div style={styles.drawerHeader}>
                    <h2 style={styles.drawerTitle}>Settings</h2>
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
                            Language Mode
                            <span style={styles.settingHint}>
                                {viewMode === 'standard' ? 'Simple terms for beginners' : 'Pro poker terms'}
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
                                Beginner
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
                        <div style={styles.settingRow}>
                            <label style={styles.settingLabel}>Sound</label>
                            <ToggleSwitch
                                enabled={soundEnabled}
                                onToggle={setSoundEnabled}
                            />
                        </div>
                    </div>

                    {/* Timer Toggle */}
                    <div style={styles.settingGroup}>
                        <div style={styles.settingRow}>
                            <label style={styles.settingLabel}>Timer</label>
                            <ToggleSwitch
                                enabled={timerEnabled}
                                onToggle={setTimerEnabled}
                            />
                        </div>
                    </div>

                    {/* Auto-Advance Toggle */}
                    <div style={styles.settingGroup}>
                        <div style={styles.settingRow}>
                            <div>
                                <label style={styles.settingLabel}>Auto-Next</label>
                                <span style={styles.settingHintSmall}>
                                    Skip to next question automatically
                                </span>
                            </div>
                            <ToggleSwitch
                                enabled={autoAdvanceEnabled}
                                onToggle={setAutoAdvanceEnabled}
                            />
                        </div>
                    </div>

                    {/* Hints Toggle */}
                    <div style={styles.settingGroup}>
                        <div style={styles.settingRow}>
                            <div>
                                <label style={styles.settingLabel}>Hints</label>
                                <span style={styles.settingHintSmall}>
                                    Levels 1-3 only
                                </span>
                            </div>
                            <ToggleSwitch
                                enabled={hintsEnabled}
                                onToggle={setHintsEnabled}
                            />
                        </div>
                    </div>

                    {/* Info Text */}
                    <div style={styles.infoBox}>
                        <p style={styles.infoText}>
                            <strong>Beginner:</strong> "Your Chips: 150bb"
                        </p>
                        <p style={styles.infoText}>
                            <strong>Pro:</strong> "Effective Stack: 150bb"
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

// Facebook Dark Theme Colors
const FB_DARK = {
    bg: '#18191A',           // Main background
    card: '#242526',         // Card/container background
    elevated: '#3A3B3C',     // Elevated elements
    border: '#3E4042',       // Borders
    textPrimary: '#E4E6EB',  // Primary text
    textSecondary: '#B0B3B8', // Secondary text
    accent: '#2374E1',       // Facebook blue
    success: '#31A24C',      // Green for toggles
};

const styles = {
    backdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        zIndex: 999,
    },
    drawer: {
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%',
        maxWidth: '320px',
        background: FB_DARK.bg,
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        transition: 'transform 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
    },
    drawerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px',
        borderBottom: `1px solid ${FB_DARK.border}`,
    },
    drawerTitle: {
        color: FB_DARK.textPrimary,
        fontSize: '20px',
        fontWeight: '700',
        margin: 0,
    },
    closeButton: {
        background: FB_DARK.elevated,
        border: 'none',
        color: FB_DARK.textSecondary,
        fontSize: '18px',
        cursor: 'pointer',
        padding: '0',
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s ease',
    },
    drawerContent: {
        flex: 1,
        padding: '20px',
        overflowY: 'auto',
    },
    settingGroup: {
        marginBottom: '24px',
    },
    settingRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 16px',
        background: FB_DARK.card,
        borderRadius: '8px',
    },
    settingLabel: {
        display: 'block',
        color: FB_DARK.textPrimary,
        fontSize: '15px',
        fontWeight: '500',
        marginBottom: '0',
    },
    settingHint: {
        display: 'block',
        color: FB_DARK.textSecondary,
        fontSize: '13px',
        fontWeight: '400',
        marginTop: '4px',
        marginBottom: '12px',
    },
    settingHintSmall: {
        display: 'block',
        color: FB_DARK.textSecondary,
        fontSize: '12px',
        fontWeight: '400',
        marginTop: '2px',
    },
    toggleGroup: {
        display: 'flex',
        gap: '8px',
        background: FB_DARK.card,
        borderRadius: '8px',
        padding: '4px',
    },
    toggleButton: {
        flex: 1,
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        borderRadius: '6px',
        color: FB_DARK.textSecondary,
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    toggleButtonActive: {
        background: FB_DARK.accent,
        color: '#fff',
    },
    // Toggle Switch Styles (with proper knob)
    switchContainer: {
        position: 'relative',
        display: 'inline-block',
        cursor: 'pointer',
        flexShrink: 0,
    },
    switchInput: {
        opacity: 0,
        width: 0,
        height: 0,
        position: 'absolute',
    },
    switchTrack: {
        display: 'block',
        width: '52px',
        height: '28px',
        borderRadius: '14px',
        transition: 'background-color 0.2s ease',
        position: 'relative',
    },
    switchKnob: {
        position: 'absolute',
        top: '2px',
        width: '24px',
        height: '24px',
        background: '#fff',
        borderRadius: '50%',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
        transition: 'transform 0.2s ease',
    },
    infoBox: {
        marginTop: '24px',
        padding: '16px',
        background: FB_DARK.card,
        borderRadius: '8px',
        borderLeft: `3px solid ${FB_DARK.accent}`,
    },
    infoText: {
        color: FB_DARK.textSecondary,
        fontSize: '13px',
        lineHeight: '1.5',
        margin: '0 0 6px 0',
    },
};
