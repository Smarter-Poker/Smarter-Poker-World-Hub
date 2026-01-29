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
import CustomAvatarBuilder from '../../src/components/avatars/CustomAvatarBuilder';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getCustomAvatarGallery } from '../../src/services/avatar-service';

// God-Mode Stack
import { useSettingsStore } from '../../src/stores/settingsStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

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
    const { avatar, isVip, user, initializing } = useAvatar();
    const [userProfile, setUserProfile] = useState(null);
    const [activeSection, setActiveSection] = useState('account');
    const [saved, setSaved] = useState(false);
    const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
    const [customAvatars, setCustomAvatars] = useState([]);
    const [loadingAvatars, setLoadingAvatars] = useState(true);

    // Settings State
    const [settings, setSettings] = useState({
        // Notifications
        emailNotifications: true,
        pushNotifications: true,
        soundEffects: true,
        tournamentAlerts: true,
        friendActivity: false,

        // Privacy
        display_name_preference: 'full_name', // 'full_name' or 'username'
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

    // Load user settings when user is available
    useEffect(() => {
        if (user?.id) {
            // Load user's display preference from profiles table
            supabase
                .from('profiles')
                .select('display_name_preference')
                .eq('id', user.id)
                .single()
                .then(({ data: profile }) => {
                    if (profile) {
                        setSettings(prev => ({
                            ...prev,
                            display_name_preference: profile.display_name_preference || 'full_name'
                        }));
                    }
                });
            // Load custom avatars gallery
            getCustomAvatarGallery(user.id).then(avatars => {
                setCustomAvatars(avatars || []);
                setLoadingAvatars(false);
            }).catch(() => setLoadingAvatars(false));

            // Also fetch user profile for display name
            supabase
                .from('profiles')
                .select('full_name, username, avatar_url')
                .eq('id', user.id)
                .single()
                .then(({ data: profile }) => {
                    if (profile) {
                        setUserProfile(profile);
                    }
                });
        }
    }, [user?.id]);

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setSaved(false);
    };

    const saveSettings = async () => {
        if (!user?.id) return;

        const { error } = await supabase
            .from('profiles')
            .update({
                display_name_preference: settings.display_name_preference
            })
            .eq('id', user.id);

        if (error) {
            console.error('Error saving settings:', error);
            return;
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            // Force hard redirect to clear all cached state
            window.location.href = '/';
        } catch (error) {
            console.error('Logout error:', error);
            // Even if there's an error, redirect anyway
            window.location.href = '/';
        }
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
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .settings-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
                    
                    
                    
                    
                    
                `}</style>
            </Head>

            <div className="settings-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />

                {/* Header - Universal Header */}
                <UniversalHeader pageDepth={2} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
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

                                {/* Profile Card with Avatar */}
                                <div style={styles.card}>
                                    <div style={styles.profileRow}>
                                        {(() => {
                                            // Determine which avatar to display
                                            // avatar from useAvatar is an object with .imageUrl, not a string URL
                                            // Wait for BOTH context initialization AND local avatar loading to complete
                                            const isStillLoading = initializing || loadingAvatars;
                                            const displayAvatar = avatar?.imageUrl || customAvatars[0]?.image_url || null;
                                            const defaultPlaceholder = '/default-avatar.png';

                                            return (
                                                <div style={{
                                                    width: 80,
                                                    height: 80,
                                                    borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, #00D4FF, #8a2be2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 40,
                                                    overflow: 'hidden',
                                                    border: '3px solid rgba(0, 212, 255, 0.5)',
                                                    boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
                                                }}>
                                                    {isStillLoading ? (
                                                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>...</span>
                                                    ) : displayAvatar ? (
                                                        <img
                                                            src={displayAvatar}
                                                            alt="Your Avatar"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <img
                                                            src={defaultPlaceholder}
                                                            alt="Default Avatar"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '👤'; }}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        <div style={styles.profileInfo}>
                                            <span style={styles.profileName}>
                                                {initializing ? 'Loading...' : (userProfile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest User')}
                                            </span>
                                            <span style={styles.profileEmail}>
                                                {initializing ? '' : (user?.email || 'Not logged in')}
                                            </span>
                                            {isVip && (
                                                <span style={{ color: '#FFD700', fontSize: 13, marginTop: 4 }}>
                                                    💎 VIP Member
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => router.push('/hub/profile')}
                                            style={styles.editButton}
                                        >
                                            Edit Profile
                                        </button>
                                    </div>
                                </div>

                                {/* Build Your Avatar Card */}
                                <div style={{
                                    ...styles.card,
                                    background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.15), rgba(0, 212, 255, 0.15))',
                                    border: '1px solid rgba(138, 43, 226, 0.4)',
                                }}>
                                    <h3 style={{ ...styles.cardTitle, color: '#00D4FF', marginBottom: 8 }}>
                                        🎨 Build Your Avatar
                                    </h3>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 16 }}>
                                        Create a unique AI-generated avatar to use as your profile picture across Smarter.Poker
                                    </p>

                                    {/* 5 Avatar Boxes */}
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                                        {[0, 1, 2, 3, 4].map((index) => {
                                            const avatarData = customAvatars[index];
                                            const isActive = avatar && avatarData && avatar === avatarData.image_url;
                                            const canCreate = isVip ? customAvatars.length < 5 : customAvatars.length < 1;

                                            return (
                                                <div
                                                    key={index}
                                                    onClick={() => {
                                                        if (avatarData) {
                                                            // Could implement select as active here
                                                        } else if (canCreate) {
                                                            setShowAvatarBuilder(true);
                                                        }
                                                    }}
                                                    style={{
                                                        width: 64,
                                                        height: 64,
                                                        borderRadius: 12,
                                                        background: avatarData
                                                            ? 'transparent'
                                                            : 'rgba(255, 255, 255, 0.05)',
                                                        border: isActive
                                                            ? '3px solid #00D4FF'
                                                            : avatarData
                                                                ? '2px solid rgba(138, 43, 226, 0.5)'
                                                                : '2px dashed rgba(255, 255, 255, 0.2)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: (avatarData || canCreate) ? 'pointer' : 'not-allowed',
                                                        opacity: (!avatarData && !canCreate) ? 0.4 : 1,
                                                        overflow: 'hidden',
                                                        transition: 'all 0.2s ease',
                                                        position: 'relative',
                                                    }}
                                                >
                                                    {loadingAvatars ? (
                                                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>...</span>
                                                    ) : avatarData ? (
                                                        <>
                                                            <img
                                                                src={avatarData.image_url}
                                                                alt={`Avatar ${index + 1}`}
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            />
                                                            {isActive && (
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    bottom: 2,
                                                                    right: 2,
                                                                    width: 16,
                                                                    height: 16,
                                                                    borderRadius: '50%',
                                                                    background: '#00D4FF',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: 10,
                                                                    color: '#000',
                                                                }}>
                                                                    ✓
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span style={{
                                                            color: canCreate ? '#8a2be2' : 'rgba(255,255,255,0.2)',
                                                            fontSize: 24,
                                                            fontWeight: 300,
                                                        }}>
                                                            +
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Equal-sized buttons */}
                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <button
                                            onClick={() => setShowAvatarBuilder(true)}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'linear-gradient(135deg, #8a2be2, #00D4FF)',
                                                border: 'none',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                boxShadow: '0 4px 20px rgba(138, 43, 226, 0.3)',
                                                transition: 'all 0.3s ease',
                                            }}
                                        >
                                            ✨ Create Custom Avatar
                                        </button>
                                        <button
                                            onClick={() => router.push('/hub/avatars-complete')}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'rgba(0, 212, 255, 0.15)',
                                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                                borderRadius: 10,
                                                color: '#00D4FF',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                transition: 'all 0.3s ease',
                                            }}
                                        >
                                            📚 Browse Avatar Library
                                        </button>
                                    </div>

                                    {/* VIP Upgrade Link for non-VIP users */}
                                    {!isVip && (
                                        <div style={{
                                            marginTop: 16,
                                            padding: '12px 16px',
                                            background: 'rgba(255, 215, 0, 0.1)',
                                            borderRadius: 8,
                                            border: '1px solid rgba(255, 215, 0, 0.2)',
                                        }}>
                                            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                                                💎 Free users get 1 custom avatar.
                                                <a
                                                    href="/hub/vip"
                                                    style={{
                                                        color: '#FFD700',
                                                        fontWeight: 600,
                                                        marginLeft: 6,
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    Upgrade to VIP for 5 custom avatars!
                                                </a>
                                            </span>
                                        </div>
                                    )}
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
                                        label="Display Name in Social Media"
                                        value={settings.display_name_preference || 'full_name'}
                                        onChange={(v) => updateSetting('display_name_preference', v)}
                                        options={[
                                            { value: 'full_name', label: 'Full Name (e.g., John Smith)' },
                                            { value: 'username', label: 'Username (e.g., @pokerpro123)' },
                                        ]}
                                    />
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: -8, marginBottom: 16, paddingLeft: 4 }}>
                                        Choose how your name appears in posts and comments
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

            {/* Custom Avatar Builder Modal */}
            {showAvatarBuilder && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.95)',
                    zIndex: 1000,
                    overflow: 'auto',
                    padding: '40px 20px'
                }}>
                    <button
                        onClick={() => setShowAvatarBuilder(false)}
                        style={{
                            position: 'fixed',
                            top: '20px',
                            right: '20px',
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '12px 24px',
                            color: '#fff',
                            fontSize: '16px',
                            cursor: 'pointer',
                            zIndex: 1001
                        }}
                    >
                        ✕ Close
                    </button>
                    <CustomAvatarBuilder isVip={isVip} onClose={() => setShowAvatarBuilder(false)} />
                </div>
            )}
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
