/**
 * Training Settings Menu (Hamburger Menu)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Slide-out drawer from LEFT with training preferences
 * SmarterPoker Dark Theme
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useEffect } from 'react';
import { useTrainingSettings } from '../../contexts/TrainingSettingsContext';

export default function TrainingSettingsMenu({ onClose }) {
    const [isOpen, setIsOpen] = useState(false);
    const { viewMode, setViewMode, soundEnabled, setSoundEnabled, timerEnabled, setTimerEnabled, hintsEnabled, setHintsEnabled } = useTrainingSettings();

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
                <button
                    type="button"
                    aria-label="Close Training Settings"
                    style={{ ...styles.backdrop, border: 'none', padding: 0 }}
                    onClick={handleClose}
                />
            )}

            {/* Drawer - Opens from LEFT - #SMARTERDESIGN Brushed Chrome */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Training Settings"
                className="sp-training-modal-surface"
                style={{
                    ...styles.drawer,
                    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                }}
            >
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

                    {/* Hints Toggle */}
                    <div style={styles.settingGroup}>
                        <div style={styles.settingRow}>
                            <div>
                                <label style={styles.settingLabel}>Hints</label>
                                <span style={styles.settingHintSmall}>
                                    Levels 1-3 Only
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
                            <strong>Beginner:</strong> "Your Chips: 150BB"
                        </p>
                        <p style={styles.infoText}>
                            <strong>Pro:</strong> "Effective Stack: 150BB"
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}

// #SMARTERDESIGN Brushed-Chrome Metallic Hardware Tokens
const CHROME_RIM = 'linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%)';
const CHROME_FACE = 'linear-gradient(180deg, #34434c 0%, #0d1b25 12%, #030a0e 52%, #07151d 86%, #142e3b 100%)';
const CHROME_BLUE = 'linear-gradient(180deg, #51c9ff 0%, #0873ff 10%, #0648e2 38%, #022695 82%, #0b71c4 100%)';

const SD_THEME = {
    bg: 'linear-gradient(165deg, #0c2031 0%, #040d18 100%)',
    card: 'linear-gradient(180deg, #102438 0%, #06111c 100%)',
    border: '#688299',
    textPrimary: '#f3f7fb',
    textSecondary: '#c4d2df',
    accent: '#087cfa',
    ice: '#8de6ff',
};

const styles = {
    backdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(1, 9, 19, 0.78)',
        backdropFilter: 'blur(6px)',
        zIndex: 999,
    },
    drawer: {
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%',
        maxWidth: '330px',
        background: SD_THEME.bg,
        borderRight: '2px solid #688299',
        boxShadow: '8px 0 36px rgba(0, 0, 0, 0.75)',
        zIndex: 1000,
        transition: 'transform 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
    },
    drawerHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 18px',
        background: 'linear-gradient(180deg, #102b40, #061723)',
        borderBottom: `1px solid ${SD_THEME.border}`,
    },
    drawerTitle: {
        color: SD_THEME.textPrimary,
        fontSize: '22px',
        fontWeight: '800',
        margin: 0,
        fontFamily: "var(--font-rajdhani, 'Rajdhani'), sans-serif",
    },
    closeButton: {
        background: `${CHROME_FACE} padding-box, ${CHROME_RIM} border-box`,
        border: '2px solid transparent',
        color: SD_THEME.textPrimary,
        fontSize: '18px',
        fontWeight: '700',
        cursor: 'pointer',
        padding: '0',
        width: '44px',
        height: '44px',
        minWidth: '44px',
        minHeight: '44px',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'box-shadow 0.2s ease',
    },
    drawerContent: {
        flex: 1,
        padding: '18px',
        overflowY: 'auto',
    },
    settingGroup: {
        marginBottom: '20px',
    },
    settingRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 14px',
        background: SD_THEME.card,
        border: `1px solid ${SD_THEME.border}`,
        borderTopColor: '#aec0d0',
        borderRadius: '10px',
    },
    settingLabel: {
        display: 'block',
        color: SD_THEME.textPrimary,
        fontSize: '15px',
        fontWeight: '600',
        marginBottom: '0',
    },
    settingHint: {
        display: 'block',
        color: SD_THEME.textSecondary,
        fontSize: '13px',
        fontWeight: '400',
        marginTop: '4px',
        marginBottom: '10px',
    },
    settingHintSmall: {
        display: 'block',
        color: SD_THEME.textSecondary,
        fontSize: '12px',
        fontWeight: '400',
        marginTop: '2px',
    },
    toggleGroup: {
        display: 'flex',
        gap: '8px',
        background: '#030d16',
        border: `1px solid ${SD_THEME.border}`,
        borderRadius: '12px',
        padding: '5px',
    },
    toggleButton: {
        flex: 1,
        minHeight: '44px',
        padding: '8px 14px',
        background: `${CHROME_FACE} padding-box, ${CHROME_RIM} border-box`,
        border: '2px solid transparent',
        borderRadius: '9px',
        color: SD_THEME.textPrimary,
        fontSize: '14px',
        fontWeight: '700',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    toggleButtonActive: {
        background: `${CHROME_BLUE} padding-box, ${CHROME_RIM} border-box`,
        color: '#ffffff',
        boxShadow: 'inset 0 1px 2px #b9efff, 0 0 12px rgba(6, 115, 199, 0.3)',
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
        border: '1px solid #688299',
        transition: 'background-color 0.2s ease',
        position: 'relative',
    },
    switchKnob: {
        position: 'absolute',
        top: '2px',
        width: '22px',
        height: '22px',
        background: '#f3f7fb',
        borderRadius: '50%',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
        transition: 'transform 0.2s ease',
    },
    infoBox: {
        marginTop: '22px',
        padding: '14px 16px',
        background: SD_THEME.card,
        border: `1px solid ${SD_THEME.border}`,
        borderLeft: `3px solid ${SD_THEME.ice}`,
        borderRadius: '10px',
    },
    infoText: {
        color: SD_THEME.textSecondary,
        fontSize: '13px',
        lineHeight: '1.5',
        margin: '0 0 6px 0',
    },
};
