/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS PAGE — User Preferences & Account Management
   Configure your Smarter.Poker experience
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useTheme } from '../../src/providers/ThemeProvider';
import { DarkModeToggle } from '../../src/components/DarkModeToggle';
import { supabase } from '../../src/lib/supabase';

// God-Mode Stack
import { useSettingsStore } from '../../src/stores/settingsStore';
import PageTransition from '../../src/components/transitions/PageTransition';

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE SWITCH COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function Toggle({ value, onChange, label, description }) {
    return (
        <div style={styles.settingRow}>
            <div style={styles.settingInfo}>
                <span style={styles.settingLabel}>{label}</span>
                {description && <span style={styles.settingDesc}>{description}</span>}
            </div>
            <button
                onClick={() => onChange(!value)}
                style={{
                    ...styles.toggle,
                    background: value
                        ? 'linear-gradient(135deg, #00D4FF, #0088cc)'
                        : 'rgba(255, 255, 255, 0.1)',
                }}
            >
                <div style={{
                    ...styles.toggleKnob,
                    transform: value ? 'translateX(20px)' : 'translateX(0)',
                }} />
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function Select({ value, onChange, options, label }) {
    return (
        <div style={styles.settingRow}>
            <span style={styles.settingLabel}>{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={styles.select}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
    const router = useRouter();
    const [activeSection, setActiveSection] = useState('account');
    const [user, setUser] = useState(null);
    const [saved, setSaved] = useState(false);

    // Settings State
    const [settings, setSettings] = useState({
        // Notifications
        emailNotifications: true,
        pushNotifications: true,
        soundEffects: true,
        tournamentAlerts: true,
        friendActivity: false,

        // Privacy
        postIdentity: 'realname', // 'realname' or 'alias'
        profileVisibility: 'public',
        showOnlineStatus: true,
        showHandHistory: true,
        showStats: true,

        // Appearance
        theme: 'dark',
        cardStyle: 'modern',
        tableColor: 'green',
        animationSpeed: 'normal',

        // Gameplay
        autoMuck: true,
        showBetSizing: true,
        confirmAllIn: true,
        timeBank: 30,
    });

    useEffect(() => {
        // Check for logged in user
        supabase.auth.getUser().then(({ data }) => {
            setUser(data?.user || null);
        });
    }, []);

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setSaved(false);
    };

    const saveSettings = () => {
        // TODO: Save to Supabase
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/');
    };

    const sections = [
        { id: 'account', label: 'Account', icon: '👤' },
        { id: 'notifications', label: 'Notifications', icon: '🔔' },
        { id: 'privacy', label: 'Privacy', icon: '🔒' },
        { id: 'appearance', label: 'Appearance', icon: '🎨' },
        { id: 'gameplay', label: 'Gameplay', icon: '🎮' },
        { id: 'data', label: 'Data Export', icon: '📦' },
    ];

    return (
        <PageTransition>
            <Head>
                <title>Settings — Smarter.Poker</title>
                <meta name="description" content="Configure your Smarter.Poker experience" />
                <meta name="viewport" content="width=800, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .settings-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
                    @media (max-width: 500px) { .settings-page { zoom: 0.5; } }
                    @media (min-width: 501px) and (max-width: 700px) { .settings-page { zoom: 0.75; } }
                    @media (min-width: 701px) and (max-width: 900px) { .settings-page { zoom: 0.95; } }
                    @media (min-width: 901px) { .settings-page { zoom: 1.2; } }
                    @media (min-width: 1400px) { .settings-page { zoom: 1.5; } }
                `}</style>
            </Head>

            <div className="settings-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />

                {/* Header */}
                <div style={styles.header}>
                    <button onClick={() => router.push('/hub')} style={styles.backButton}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        <span>Hub</span>
                    </button>

                    <h1 style={styles.pageTitle}>⚙️ Settings</h1>

                    <button
                        onClick={saveSettings}
                        style={{
                            ...styles.saveButton,
                            background: saved
                                ? 'linear-gradient(135deg, #00ff88, #00cc66)'
                                : 'linear-gradient(135deg, #00D4FF, #0088cc)',
                        }}
                    >
                        {saved ? '✓ Saved' : 'Save Changes'}
                    </button>
                </div>

                {/* Layout */}
                <div style={styles.layout}>
                    {/* Sidebar */}
                    <nav style={styles.sidebar}>
                        {sections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                style={{
                                    ...styles.sidebarItem,
                                    ...(activeSection === section.id ? styles.sidebarItemActive : {}),
                                }}
                            >
                                <span style={styles.sidebarIcon}>{section.icon}</span>
                                <span>{section.label}</span>
                            </button>
                        ))}

                        <div style={styles.sidebarDivider} />

                        <button onClick={handleLogout} style={styles.logoutButton}>
                            <span>🚪</span>
                            <span>Log Out</span>
                        </button>
                    </nav>

                    {/* Content */}
                    <div style={styles.content}>
                        {activeSection === 'account' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Account Settings</h2>

                                <div style={styles.card}>
                                    <div style={styles.profileRow}>
                                        <div style={styles.profileAvatar}>👤</div>
                                        <div style={styles.profileInfo}>
                                            <span style={styles.profileName}>
                                                {user?.email || 'Guest User'}
                                            </span>
                                            <span style={styles.profileEmail}>
                                                {user?.email || 'Not logged in'}
                                            </span>
                                        </div>
                                        <button style={styles.editButton}>Edit Profile</button>
                                    </div>
                                </div>

                                <div style={styles.card}>
                                    <h3 style={styles.cardTitle}>Account Security</h3>
                                    <button style={styles.secondaryButton}>Change Password</button>
                                    <button style={styles.secondaryButton}>Enable 2FA</button>
                                    <button style={styles.secondaryButton}>Connected Devices</button>
                                </div>
                            </div>
                        )}

                        {activeSection === 'notifications' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Notification Preferences</h2>

                                <div style={styles.card}>
                                    <Toggle
                                        label="Email Notifications"
                                        description="Receive updates via email"
                                        value={settings.emailNotifications}
                                        onChange={(v) => updateSetting('emailNotifications', v)}
                                    />
                                    <Toggle
                                        label="Push Notifications"
                                        description="Browser and mobile alerts"
                                        value={settings.pushNotifications}
                                        onChange={(v) => updateSetting('pushNotifications', v)}
                                    />
                                    <Toggle
                                        label="Sound Effects"
                                        description="In-app sound effects"
                                        value={settings.soundEffects}
                                        onChange={(v) => updateSetting('soundEffects', v)}
                                    />
                                    <Toggle
                                        label="Tournament Alerts"
                                        description="Get notified about tournaments"
                                        value={settings.tournamentAlerts}
                                        onChange={(v) => updateSetting('tournamentAlerts', v)}
                                    />
                                    <Toggle
                                        label="Friend Activity"
                                        description="See when friends are online"
                                        value={settings.friendActivity}
                                        onChange={(v) => updateSetting('friendActivity', v)}
                                    />
                                </div>
                            </div>
                        )}

                        {activeSection === 'privacy' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Privacy Settings</h2>

                                <div style={styles.card}>
                                    <Select
                                        label="Post As"
                                        value={settings.postIdentity || 'realname'}
                                        onChange={(v) => updateSetting('postIdentity', v)}
                                        options={[
                                            { value: 'realname', label: 'Real Name (e.g., John Smith)' },
                                            { value: 'alias', label: 'Alias/Username (e.g., @pokerpro123)' },
                                        ]}
                                    />
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: -8, marginBottom: 16, paddingLeft: 4 }}>
                                        Choose how your name appears on posts and comments
                                    </div>
                                    <Select
                                        label="Profile Visibility"
                                        value={settings.profileVisibility}
                                        onChange={(v) => updateSetting('profileVisibility', v)}
                                        options={[
                                            { value: 'public', label: 'Public' },
                                            { value: 'friends', label: 'Friends Only' },
                                            { value: 'private', label: 'Private' },
                                        ]}
                                    />
                                    <Toggle
                                        label="Show Online Status"
                                        value={settings.showOnlineStatus}
                                        onChange={(v) => updateSetting('showOnlineStatus', v)}
                                    />
                                    <Toggle
                                        label="Show Hand History"
                                        value={settings.showHandHistory}
                                        onChange={(v) => updateSetting('showHandHistory', v)}
                                    />
                                    <Toggle
                                        label="Show Statistics"
                                        value={settings.showStats}
                                        onChange={(v) => updateSetting('showStats', v)}
                                    />
                                </div>
                            </div>
                        )}

                        {activeSection === 'appearance' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Appearance</h2>

                                <div style={styles.card}>
                                    {/* Theme Toggle - Uses global ThemeProvider */}
                                    <div style={styles.settingRow}>
                                        <div style={styles.settingInfo}>
                                            <span style={styles.settingLabel}>Theme</span>
                                            <span style={styles.settingDesc}>Switch between light and dark mode</span>
                                        </div>
                                        <DarkModeToggle size="medium" />
                                    </div>
                                    <Select
                                        label="Card Style"
                                        value={settings.cardStyle}
                                        onChange={(v) => updateSetting('cardStyle', v)}
                                        options={[
                                            { value: 'modern', label: 'Modern' },
                                            { value: 'classic', label: 'Classic' },
                                            { value: 'minimal', label: 'Minimal' },
                                        ]}
                                    />
                                    <Select
                                        label="Animation Speed"
                                        value={settings.animationSpeed}
                                        onChange={(v) => updateSetting('animationSpeed', v)}
                                        options={[
                                            { value: 'slow', label: 'Slow' },
                                            { value: 'normal', label: 'Normal' },
                                            { value: 'fast', label: 'Fast' },
                                        ]}
                                    />
                                </div>
                            </div>
                        )}

                        {activeSection === 'gameplay' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Gameplay Settings</h2>

                                <div style={styles.card}>
                                    <Toggle
                                        label="Auto Muck Losing Hands"
                                        value={settings.autoMuck}
                                        onChange={(v) => updateSetting('autoMuck', v)}
                                    />
                                    <Toggle
                                        label="Show Bet Sizing Hints"
                                        value={settings.showBetSizing}
                                        onChange={(v) => updateSetting('showBetSizing', v)}
                                    />
                                    <Toggle
                                        label="Confirm All-In Bets"
                                        value={settings.confirmAllIn}
                                        onChange={(v) => updateSetting('confirmAllIn', v)}
                                    />
                                    <Select
                                        label="Time Bank (seconds)"
                                        value={settings.timeBank}
                                        onChange={(v) => updateSetting('timeBank', parseInt(v))}
                                        options={[
                                            { value: 15, label: '15 seconds' },
                                            { value: 30, label: '30 seconds' },
                                            { value: 60, label: '60 seconds' },
                                        ]}
                                    />
                                </div>
                            </div>
                        )}

                        {activeSection === 'data' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Data & Export</h2>

                                <div style={styles.card}>
                                    <div style={styles.dataRow}>
                                        <div>
                                            <h4 style={styles.dataTitle}>Export Hand History</h4>
                                            <p style={styles.dataDesc}>Download all your hand histories</p>
                                        </div>
                                        <button style={styles.exportButton}>Export</button>
                                    </div>
                                    <div style={styles.dataRow}>
                                        <div>
                                            <h4 style={styles.dataTitle}>Export Statistics</h4>
                                            <p style={styles.dataDesc}>Download your gameplay statistics</p>
                                        </div>
                                        <button style={styles.exportButton}>Export</button>
                                    </div>
                                    <div style={styles.dataRow}>
                                        <div>
                                            <h4 style={styles.dataTitle}>Export All Data</h4>
                                            <p style={styles.dataDesc}>Full GDPR-compliant data export</p>
                                        </div>
                                        <button style={styles.exportButton}>Request</button>
                                    </div>
                                </div>

                                <div style={styles.dangerCard}>
                                    <h3 style={styles.dangerTitle}>⚠️ Danger Zone</h3>
                                    <p style={styles.dangerDesc}>
                                        These actions are irreversible. Please proceed with caution.
                                    </p>
                                    <button style={styles.dangerButton}>Delete Account</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a1628',
        fontFamily: 'Inter, -apple-system, sans-serif',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
            linear-gradient(rgba(136, 136, 136, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(136, 136, 136, 0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'sticky',
        top: 0,
        background: 'rgba(10, 22, 40, 0.95)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
    },
    backButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    pageTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
    },
    saveButton: {
        padding: '10px 20px',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    layout: {
        display: 'flex',
        minHeight: 'calc(100vh - 80px)',
    },
    sidebar: {
        width: 240,
        padding: 20,
        borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(0, 0, 0, 0.2)',
    },
    sidebarItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 14,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginBottom: 4,
        textAlign: 'left',
    },
    sidebarItemActive: {
        background: 'rgba(0, 212, 255, 0.15)',
        color: '#00D4FF',
    },
    sidebarIcon: {
        fontSize: 18,
    },
    sidebarDivider: {
        height: 1,
        background: 'rgba(255, 255, 255, 0.1)',
        margin: '16px 0',
    },
    logoutButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '12px 16px',
        background: 'transparent',
        border: 'none',
        borderRadius: 8,
        color: '#ff4757',
        fontSize: 14,
        cursor: 'pointer',
        textAlign: 'left',
    },
    content: {
        flex: 1,
        padding: '24px 40px',
        overflowY: 'auto',
    },
    section: {},
    sectionTitle: {
        fontSize: 24,
        fontWeight: 700,
        color: '#fff',
        marginBottom: 24,
    },
    card: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#fff',
        marginBottom: 16,
    },
    settingRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    },
    settingInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    settingLabel: {
        fontSize: 15,
        fontWeight: 500,
        color: '#fff',
    },
    settingDesc: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
    },
    toggle: {
        width: 48,
        height: 28,
        borderRadius: 14,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.2s ease',
    },
    toggleKnob: {
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: 3,
        left: 3,
        transition: 'transform 0.2s ease',
    },
    select: {
        padding: '10px 16px',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer',
        minWidth: 150,
    },
    profileRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
    },
    profileAvatar: {
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #00D4FF, #8a2be2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
    },
    profileInfo: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    profileName: {
        fontSize: 18,
        fontWeight: 600,
        color: '#fff',
    },
    profileEmail: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    editButton: {
        padding: '10px 20px',
        background: 'rgba(0, 212, 255, 0.15)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    secondaryButton: {
        display: 'block',
        width: '100%',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer',
        marginBottom: 8,
        textAlign: 'left',
    },
    dataRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    },
    dataTitle: {
        fontSize: 15,
        fontWeight: 500,
        color: '#fff',
        margin: '0 0 4px',
    },
    dataDesc: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        margin: 0,
    },
    exportButton: {
        padding: '8px 20px',
        background: 'rgba(0, 212, 255, 0.15)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
    },
    dangerCard: {
        background: 'rgba(255, 71, 87, 0.1)',
        border: '1px solid rgba(255, 71, 87, 0.3)',
        borderRadius: 16,
        padding: 24,
    },
    dangerTitle: {
        fontSize: 18,
        fontWeight: 600,
        color: '#ff4757',
        marginBottom: 8,
    },
    dangerDesc: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: 16,
    },
    dangerButton: {
        padding: '12px 24px',
        background: '#ff4757',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
};
