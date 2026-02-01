/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS PAGE — User Preferences & Account Management
   Configure your Smarter.Poker experience
   Last Updated: 2026-01-29 - Avatar race condition fix deployed
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
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

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
    const { avatar, isVip, user: contextUser, initializing } = useAvatar();
    const [userProfile, setUserProfile] = useState(null);
    const [localUser, setLocalUser] = useState(null); // 🛡️ Fallback from localStorage
    const [activeSection, setActiveSection] = useState('account');
    const [saved, setSaved] = useState(false);
    const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
    const [customAvatars, setCustomAvatars] = useState([]);
    const [loadingAvatars, setLoadingAvatars] = useState(true);
    const [show2FAModal, setShow2FAModal] = useState(false);
    const [showDevicesModal, setShowDevicesModal] = useState(false);
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [manualEntryKey, setManualEntryKey] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [backupCodes, setBackupCodes] = useState([]);
    const [connectedDevices, setConnectedDevices] = useState([]);
    const [loadingMFA, setLoadingMFA] = useState(false);

    // Hamburger Menu State
    const [menuOpen, setMenuOpen] = useState(false);

    // Menu config
    const menuConfig = getMenuConfig('settings', user, {}, {});

    // 🛡️ Use context user or localStorage fallback
    const user = contextUser || localUser;

    // 🛡️ BULLETPROOF: Read user from localStorage immediately (same as UniversalHeader)
    useEffect(() => {
        if (typeof window !== 'undefined' && !contextUser) {
            try {
                // Check explicit storage key first
                const explicitAuth = localStorage.getItem('smarter-poker-auth');
                if (explicitAuth) {
                    const tokenData = JSON.parse(explicitAuth);
                    if (tokenData?.user) {
                        setLocalUser(tokenData.user);
                        console.log('[Settings] User loaded from localStorage:', tokenData.user.email);
                    }
                }
                // Fallback to legacy sb-* keys
                if (!localUser) {
                    const sbKeys = Object.keys(localStorage).filter(
                        k => k.startsWith('sb-') && k.endsWith('-auth-token')
                    );
                    if (sbKeys.length > 0) {
                        const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                        if (tokenData?.user) {
                            setLocalUser(tokenData.user);
                            console.log('[Settings] User loaded from legacy auth key:', tokenData.user.email);
                        }
                    }
                }
            } catch (e) {
                console.warn('[Settings] Error reading localStorage:', e);
            }
        }
    }, [contextUser]);

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

            // Load 2FA status
            supabase
                .from('user_mfa_factors')
                .select('enabled')
                .eq('user_id', user.id)
                .single()
                .then(({ data: mfaData }) => {
                    if (mfaData) {
                        setTwoFactorEnabled(mfaData.enabled || false);
                    }
                });

            // Track current session
            trackCurrentSession();
        }
    }, [user?.id]);

    // Track current session function
    const trackCurrentSession = async () => {
        if (!user?.id) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            await fetch('/api/auth/sessions/track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({})
            });
        } catch (error) {
            console.error('Error tracking session:', error);
        }
    };

    // Call setup API when 2FA modal opens
    useEffect(() => {
        if (show2FAModal && !twoFactorEnabled && !qrCode) {
            setup2FA();
        }
    }, [show2FAModal]);

    const setup2FA = async () => {
        setLoadingMFA(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch('/api/auth/mfa/setup', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setQrCode(data.qrCode);
                setManualEntryKey(data.manualEntryKey);
            } else {
                alert('Failed to setup 2FA. Please try again.');
            }
        } catch (error) {
            console.error('Error setting up 2FA:', error);
            alert('Error setting up 2FA');
        } finally {
            setLoadingMFA(false);
        }
    };

    const verify2FA = async () => {
        if (verificationCode.length !== 6) {
            alert('Please enter a valid 6-digit code');
            return;
        }

        setLoadingMFA(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ code: verificationCode })
            });

            if (response.ok) {
                const data = await response.json();
                setTwoFactorEnabled(true);
                setBackupCodes(data.backupCodes);
                setVerificationCode('');
                alert('2FA successfully enabled! Save your backup codes in a safe place.');
            } else {
                const error = await response.json();
                alert(error.error || 'Invalid verification code');
            }
        } catch (error) {
            console.error('Error verifying 2FA:', error);
            alert('Error verifying 2FA');
        } finally {
            setLoadingMFA(false);
        }
    };

    const disable2FA = async () => {
        if (!confirm('Are you sure you want to disable 2FA? This will make your account less secure.')) {
            return;
        }

        setLoadingMFA(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch('/api/auth/mfa/disable', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (response.ok) {
                setTwoFactorEnabled(false);
                setQrCode('');
                setManualEntryKey('');
                setBackupCodes([]);
                setShow2FAModal(false);
                alert('2FA has been disabled');
            } else {
                alert('Failed to disable 2FA');
            }
        } catch (error) {
            console.error('Error disabling 2FA:', error);
            alert('Error disabling 2FA');
        } finally {
            setLoadingMFA(false);
        }
    };

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

    const exportData = async () => {
        try {
            // TODO: Implement data export API endpoint
            alert('Data export requested! You will receive an email when your data is ready.');
        } catch (error) {
            console.error('Error requesting data export:', error);
            alert('Failed to request data export. Please try again.');
        }
    };

    const handleDeleteAccount = async () => {
        try {
            // TODO: Implement account deletion API endpoint
            const { error } = await supabase.auth.signOut();
            if (error) throw error;

            // Redirect to homepage
            window.location.href = '/';
        } catch (error) {
            console.error('Error deleting account:', error);
            alert('Failed to delete account. Please contact support.');
        }
    };

    const sections = [
        { id: 'account', label: 'Account', icon: '👤' },
        { id: 'notifications', label: 'Notifications', icon: '🔔' },
        { id: 'privacy', label: 'Privacy', icon: '🔒' },
        { id: 'appearance', label: 'Appearance', icon: '🎨' },
        { id: 'display', label: 'Display & Sound', icon: '🎵' },
        { id: 'gameplay', label: 'Gameplay', icon: '🎮' },
        { id: 'billing', label: 'Billing & Payments', icon: '💳' },
        { id: 'blocked', label: 'Blocked Users', icon: '🚫' },
        { id: 'data', label: 'Data Export', icon: '📦' },
        { id: 'delete', label: 'Delete Account', icon: '⚠️' },
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
                <UniversalHeader
                    pageDepth={2}
                    onMenuClick={() => setMenuOpen(true)}
                />

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={user}
                    showProfile={true}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />
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
                                    <button
                                        onClick={async () => {
                                            if (!user?.email) {
                                                alert('No email found. Please log in again.');
                                                return;
                                            }
                                            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                                                redirectTo: `${window.location.origin}/hub/reset-auth`
                                            });
                                            if (error) {
                                                alert('Error sending password reset email: ' + error.message);
                                            } else {
                                                alert('Password reset email sent! Check your inbox.');
                                            }
                                        }}
                                        style={styles.secondaryButton}
                                    >
                                        Change Password
                                    </button>
                                    <button
                                        onClick={() => setShow2FAModal(true)}
                                        style={styles.secondaryButton}
                                    >
                                        {twoFactorEnabled ? '✓ 2FA Enabled' : 'Enable 2FA'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setShowDevicesModal(true);
                                            // Load connected devices from API
                                            try {
                                                const { data: { session } } = await supabase.auth.getSession();
                                                if (!session) return;

                                                const response = await fetch('/api/auth/sessions/list', {
                                                    method: 'GET',
                                                    headers: {
                                                        'Authorization': `Bearer ${session.access_token}`
                                                    }
                                                });

                                                if (response.ok) {
                                                    const data = await response.json();
                                                    setConnectedDevices(data.sessions || []);
                                                }
                                            } catch (err) {
                                                console.error('Error loading devices:', err);
                                            }
                                        }}
                                        style={styles.secondaryButton}
                                    >
                                        Connected Devices
                                    </button>
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


                        {/* Display & Sound Section */}
                        {activeSection === 'display' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>🎵 Display & Sound</h2>

                                <div style={styles.settingGroup}>
                                    <h3 style={styles.groupTitle}>Display</h3>
                                    <Select
                                        label="Font Size"
                                        value={settings.fontSize || 'medium'}
                                        onChange={(val) => updateSetting('fontSize', val)}
                                        options={[
                                            { value: 'small', label: 'Small' },
                                            { value: 'medium', label: 'Medium' },
                                            { value: 'large', label: 'Large' },
                                            { value: 'xlarge', label: 'Extra Large' }
                                        ]}
                                    />
                                    <Toggle
                                        label="Animations"
                                        description="Enable smooth transitions and animations"
                                        value={settings.animations !== false}
                                        onChange={(val) => updateSetting('animations', val)}
                                    />
                                    <Toggle
                                        label="Reduce Motion"
                                        description="Minimize animations for accessibility"
                                        value={settings.reduceMotion || false}
                                        onChange={(val) => updateSetting('reduceMotion', val)}
                                    />
                                </div>

                                <div style={styles.settingGroup}>
                                    <h3 style={styles.groupTitle}>Sound</h3>
                                    <Toggle
                                        label="Sound Effects"
                                        description="Play sounds for actions and notifications"
                                        value={settings.soundEffects !== false}
                                        onChange={(val) => updateSetting('soundEffects', val)}
                                    />
                                    <Toggle
                                        label="Notification Sounds"
                                        description="Play sound when you receive notifications"
                                        value={settings.notificationSounds !== false}
                                        onChange={(val) => updateSetting('notificationSounds', val)}
                                    />
                                    <div style={styles.settingRow}>
                                        <span style={styles.settingLabel}>Master Volume</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={settings.masterVolume || 50}
                                            onChange={(e) => updateSetting('masterVolume', parseInt(e.target.value))}
                                            style={styles.slider}
                                        />
                                        <span style={styles.volumeLabel}>{settings.masterVolume || 50}%</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Billing & Payments Section */}
                        {activeSection === 'billing' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>💳 Billing & Payments</h2>

                                <div style={styles.settingGroup}>
                                    <h3 style={styles.groupTitle}>Payment Methods</h3>
                                    <p style={styles.infoText}>
                                        Manage your payment methods in the Diamond Store checkout.
                                    </p>
                                    <button
                                        onClick={() => router.push('/hub/diamond-store')}
                                        style={styles.linkButton}
                                    >
                                        Go to Diamond Store →
                                    </button>
                                </div>

                                <div style={styles.settingGroup}>
                                    <h3 style={styles.groupTitle}>Order History</h3>
                                    <p style={styles.infoText}>
                                        View your past orders and download receipts.
                                    </p>
                                    <button
                                        onClick={() => router.push('/hub/diamond-store/orders')}
                                        style={styles.linkButton}
                                    >
                                        View Orders →
                                    </button>
                                </div>

                                {isVip && (
                                    <div style={styles.settingGroup}>
                                        <h3 style={styles.groupTitle}>VIP Membership</h3>
                                        <div style={styles.vipBadge}>
                                            <span style={styles.vipIcon}>👑</span>
                                            <div>
                                                <div style={styles.vipTitle}>Active VIP Member</div>
                                                <div style={styles.vipSubtitle}>Enjoying premium benefits</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Blocked Users Section */}
                        {activeSection === 'blocked' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>🚫 Blocked Users</h2>

                                <div style={styles.settingGroup}>
                                    <p style={styles.infoText}>
                                        Manage users you've blocked from messaging and interacting with you.
                                    </p>
                                    <button
                                        onClick={() => router.push('/hub/messenger/blocked')}
                                        style={styles.linkButton}
                                    >
                                        Manage Blocked Users →
                                    </button>
                                </div>

                                <div style={styles.settingGroup}>
                                    <h3 style={styles.groupTitle}>Blocking Information</h3>
                                    <ul style={styles.infoList}>
                                        <li>Blocked users cannot send you messages</li>
                                        <li>They won't see your online status</li>
                                        <li>They cannot view your profile or posts</li>
                                        <li>You can unblock users at any time</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Data Export Section */}
                        {activeSection === 'data' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>📦 Data Export</h2>

                                <div style={styles.settingGroup}>
                                    <p style={styles.infoText}>
                                        Download a copy of your Smarter.Poker data including your profile, posts, messages, and training history.
                                    </p>
                                    <button
                                        onClick={exportData}
                                        style={styles.exportButton}
                                    >
                                        📥 Request Data Export
                                    </button>
                                    <p style={styles.helperText}>
                                        You'll receive an email with a download link when your data is ready (usually within 24 hours).
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Delete Account Section */}
                        {activeSection === 'delete' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>⚠️ Delete Account</h2>

                                <div style={styles.dangerZone}>
                                    <div style={styles.warningBox}>
                                        <div style={styles.warningIcon}>⚠️</div>
                                        <div>
                                            <h3 style={styles.warningTitle}>Danger Zone</h3>
                                            <p style={styles.warningText}>
                                                Once you delete your account, there is no going back. This action is permanent and cannot be undone.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={styles.settingGroup}>
                                        <h3 style={styles.groupTitle}>What will be deleted:</h3>
                                        <ul style={styles.infoList}>
                                            <li>Your profile and all personal information</li>
                                            <li>All your posts, reels, and comments</li>
                                            <li>Your training progress and statistics</li>
                                            <li>Your messages and conversations</li>
                                            <li>Your friends and connections</li>
                                            <li>Your Diamond balance and VIP status</li>
                                        </ul>
                                    </div>

                                    <div style={styles.settingGroup}>
                                        <h3 style={styles.groupTitle}>Before you delete:</h3>
                                        <ul style={styles.infoList}>
                                            <li>Download your data using the Data Export feature</li>
                                            <li>Withdraw any remaining Diamond balance</li>
                                            <li>Cancel any active VIP subscriptions</li>
                                        </ul>
                                    </div>

                                    <button
                                        onClick={() => {
                                            if (confirm('Are you absolutely sure you want to delete your account? This action cannot be undone.\n\nType DELETE in the next prompt to confirm.')) {
                                                const confirmation = prompt('Type DELETE to confirm account deletion:');
                                                if (confirmation === 'DELETE') {
                                                    handleDeleteAccount();
                                                } else {
                                                    alert('Account deletion cancelled.');
                                                }
                                            }
                                        }}
                                        style={styles.deleteButton}
                                    >
                                        Delete My Account
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Original Data Export Section - keeping for backward compatibility */}
                        {activeSection === 'data_old' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Data & Export</h2>

                                <div style={styles.card}>
                                    <div style={styles.dataRow}>
                                        <div>
                                            <h4 style={styles.dataTitle}>Export Hand History</h4>
                                            <p style={styles.dataDesc}>Download all your hand histories</p>
                                        </div>
                                        <button
                                            style={styles.exportButton}
                                            onClick={async () => {
                                                if (!user?.id) { alert('Please log in to export data.'); return; }
                                                try {
                                                    const { data, error } = await supabase
                                                        .from('hand_histories')
                                                        .select('*')
                                                        .eq('user_id', user.id);
                                                    const rows = data || [];
                                                    if (rows.length === 0) { alert('No hand history data found.'); return; }
                                                    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url; a.download = 'hand-history-export.json'; a.click();
                                                    URL.revokeObjectURL(url);
                                                } catch (err) {
                                                    console.error('Export error:', err);
                                                    alert('Export failed. Please try again.');
                                                }
                                            }}
                                        >Export</button>
                                    </div>
                                    <div style={styles.dataRow}>
                                        <div>
                                            <h4 style={styles.dataTitle}>Export Statistics</h4>
                                            <p style={styles.dataDesc}>Download your gameplay statistics</p>
                                        </div>
                                        <button
                                            style={styles.exportButton}
                                            onClick={async () => {
                                                if (!user?.id) { alert('Please log in to export data.'); return; }
                                                try {
                                                    const { data, error } = await supabase
                                                        .from('user_stats')
                                                        .select('*')
                                                        .eq('user_id', user.id);
                                                    const rows = data || [];
                                                    if (rows.length === 0) { alert('No statistics data found.'); return; }
                                                    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url; a.download = 'statistics-export.json'; a.click();
                                                    URL.revokeObjectURL(url);
                                                } catch (err) {
                                                    console.error('Export error:', err);
                                                    alert('Export failed. Please try again.');
                                                }
                                            }}
                                        >Export</button>
                                    </div>
                                    <div style={styles.dataRow}>
                                        <div>
                                            <h4 style={styles.dataTitle}>Export All Data</h4>
                                            <p style={styles.dataDesc}>Full GDPR-compliant data export</p>
                                        </div>
                                        <button
                                            style={styles.exportButton}
                                            onClick={async () => {
                                                if (!user?.id) { alert('Please log in to export data.'); return; }
                                                try {
                                                    const allData = {};
                                                    const tables = ['profiles', 'hand_histories', 'user_stats', 'user_settings'];
                                                    for (const table of tables) {
                                                        const { data } = await supabase.from(table).select('*').eq(table === 'profiles' ? 'id' : 'user_id', user.id);
                                                        if (data && data.length > 0) allData[table] = data;
                                                    }
                                                    allData.email = user.email;
                                                    allData.export_date = new Date().toISOString();
                                                    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url; a.download = 'smarter-poker-full-export.json'; a.click();
                                                    URL.revokeObjectURL(url);
                                                } catch (err) {
                                                    console.error('Export error:', err);
                                                    alert('Export failed. Please try again.');
                                                }
                                            }}
                                        >Request</button>
                                    </div>
                                </div>

                                <div style={styles.dangerCard}>
                                    <h3 style={styles.dangerTitle}>⚠️ Danger Zone</h3>
                                    <p style={styles.dangerDesc}>
                                        These actions are irreversible. Please proceed with caution.
                                    </p>
                                    <button
                                        style={styles.dangerButton}
                                        onClick={async () => {
                                            if (!user?.id) { alert('Please log in first.'); return; }
                                            const confirmed = confirm(
                                                'Are you sure you want to delete your account?\n\n' +
                                                'This action is PERMANENT and cannot be undone.\n' +
                                                'All your data, avatars, and history will be deleted.'
                                            );
                                            if (!confirmed) return;
                                            const doubleConfirm = confirm(
                                                'This is your FINAL confirmation.\n\n' +
                                                'Type OK to permanently delete your account and all associated data.'
                                            );
                                            if (!doubleConfirm) return;
                                            try {
                                                const { data: { session } } = await supabase.auth.getSession();
                                                if (!session) { alert('Session expired. Please log in again.'); return; }
                                                const response = await fetch('/api/auth/delete-account', {
                                                    method: 'DELETE',
                                                    headers: { 'Authorization': 'Bearer ' + session.access_token }
                                                });
                                                if (response.ok) {
                                                    await supabase.auth.signOut();
                                                    alert('Your account has been scheduled for deletion.');
                                                    window.location.href = '/';
                                                } else {
                                                    const err = await response.json().catch(() => ({}));
                                                    alert(err.error || 'Failed to delete account. Please contact support.');
                                                }
                                            } catch (err) {
                                                console.error('Delete account error:', err);
                                                alert('An error occurred. Please try again or contact support.');
                                            }
                                        }}
                                    >Delete Account</button>
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

            {/* 2FA Setup Modal */}
            {show2FAModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.9)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 16,
                        padding: 32,
                        maxWidth: 500,
                        width: '100%',
                        border: '1px solid rgba(0, 212, 255, 0.2)'
                    }}>
                        <h2 style={{ color: '#fff', marginBottom: 16, fontSize: 24 }}>🔐 Enable Two-Factor Authentication</h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: 14 }}>
                            Add an extra layer of security to your account with 2FA.
                        </p>

                        {!twoFactorEnabled ? (
                            <>
                                <div style={{
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: 12,
                                    padding: 20,
                                    marginBottom: 20
                                }}>
                                    <h3 style={{ color: '#00D4FF', fontSize: 16, marginBottom: 12 }}>Setup Instructions:</h3>
                                    <ol style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, paddingLeft: 20, margin: 0 }}>
                                        <li style={{ marginBottom: 8 }}>Download an authenticator app (Google Authenticator, Authy, etc.)</li>
                                        <li style={{ marginBottom: 8 }}>Scan the QR code below with your app</li>
                                        <li>Enter the 6-digit code to verify</li>
                                    </ol>
                                </div>

                                <div style={{
                                    background: '#fff',
                                    padding: 20,
                                    borderRadius: 12,
                                    marginBottom: 20,
                                    textAlign: 'center'
                                }}>
                                    {loadingMFA ? (
                                        <div style={{ fontSize: 14, color: '#666', padding: 40 }}>Loading QR code...</div>
                                    ) : qrCode ? (
                                        <>
                                            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Scan with your authenticator app</div>
                                            <img src={qrCode} alt="QR Code" style={{ width: 200, height: 200, margin: '0 auto' }} />
                                            <p style={{ fontSize: 12, color: '#666', marginTop: 12 }}>
                                                Manual entry key: {manualEntryKey || 'Loading...'}
                                            </p>
                                        </>
                                    ) : (
                                        <div style={{ fontSize: 14, color: '#666', padding: 40 }}>Failed to generate QR code</div>
                                    )}
                                </div>

                                <input
                                    type="text"
                                    placeholder="Enter 6-digit code"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: 8,
                                        color: '#fff',
                                        fontSize: 16,
                                        marginBottom: 20,
                                        textAlign: 'center',
                                        letterSpacing: 4
                                    }}
                                />

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        onClick={verify2FA}
                                        disabled={loadingMFA || verificationCode.length !== 6}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: loadingMFA || verificationCode.length !== 6 ? '#666' : '#00D4FF',
                                            border: 'none',
                                            borderRadius: 8,
                                            color: loadingMFA || verificationCode.length !== 6 ? '#999' : '#000',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: loadingMFA || verificationCode.length !== 6 ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {loadingMFA ? 'Verifying...' : 'Verify & Enable'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShow2FAModal(false);
                                            setVerificationCode('');
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            borderRadius: 8,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{
                                    background: 'rgba(0, 255, 0, 0.1)',
                                    border: '1px solid rgba(0, 255, 0, 0.3)',
                                    borderRadius: 12,
                                    padding: 20,
                                    marginBottom: 20,
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
                                    <h3 style={{ color: '#0f0', fontSize: 18, marginBottom: 8 }}>2FA is Active</h3>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
                                        Your account is protected with two-factor authentication
                                    </p>
                                </div>

                                <button
                                    onClick={disable2FA}
                                    disabled={loadingMFA}
                                    style={{
                                        width: '100%',
                                        padding: '12px 24px',
                                        background: loadingMFA ? '#999' : '#ff4757',
                                        border: 'none',
                                        borderRadius: 8,
                                        color: '#fff',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: loadingMFA ? 'not-allowed' : 'pointer',
                                        marginBottom: 12
                                    }}
                                >
                                    {loadingMFA ? 'Disabling...' : 'Disable 2FA'}
                                </button>

                                <button
                                    onClick={() => setShow2FAModal(false)}
                                    style={{
                                        width: '100%',
                                        padding: '12px 24px',
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                        borderRadius: 8,
                                        color: '#fff',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Close
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Connected Devices Modal */}
            {showDevicesModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.9)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 16,
                        padding: 32,
                        maxWidth: 600,
                        width: '100%',
                        maxHeight: '80vh',
                        overflow: 'auto',
                        border: '1px solid rgba(0, 212, 255, 0.2)'
                    }}>
                        <h2 style={{ color: '#fff', marginBottom: 16, fontSize: 24 }}>💻 Connected Devices</h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: 14 }}>
                            Manage devices that have access to your account
                        </p>

                        {connectedDevices.length === 0 ? (
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: 12,
                                padding: 40,
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                                    No session data available. This feature tracks active login sessions.
                                </p>
                            </div>
                        ) : (
                            <div style={{ marginBottom: 20 }}>
                                {connectedDevices.map((device, index) => (
                                    <div key={index} style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: 12,
                                        padding: 16,
                                        marginBottom: 12
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                                                    {device.device_name || 'Unknown Device'}
                                                </div>
                                                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 4 }}>
                                                    {device.ip_address || 'IP not recorded'}
                                                </div>
                                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                                    Last active: {device.last_active ? new Date(device.last_active).toLocaleString() : 'Unknown'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('Revoke access for this device?')) {
                                                        try {
                                                            const { data: { session } } = await supabase.auth.getSession();
                                                            if (!session) return;

                                                            const response = await fetch('/api/auth/sessions/revoke', {
                                                                method: 'POST',
                                                                headers: {
                                                                    'Content-Type': 'application/json',
                                                                    'Authorization': `Bearer ${session.access_token}`
                                                                },
                                                                body: JSON.stringify({ sessionId: device.id })
                                                            });

                                                            if (response.ok) {
                                                                setConnectedDevices(prev => prev.filter(d => d.id !== device.id));
                                                                alert('Device access revoked');
                                                            } else {
                                                                alert('Failed to revoke device access');
                                                            }
                                                        } catch (err) {
                                                            console.error('Error revoking session:', err);
                                                            alert('Error revoking device access');
                                                        }
                                                    }
                                                }}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: '#ff4757',
                                                    border: 'none',
                                                    borderRadius: 6,
                                                    color: '#fff',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Revoke
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => setShowDevicesModal(false)}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: 8,
                                color: '#fff',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>
                    </div>
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
    // New styles for added sections
    slider: {
        flex: 1,
        margin: '0 16px',
        accentColor: '#00D4FF',
    },
    volumeLabel: {
        minWidth: '50px',
        textAlign: 'right',
        fontSize: 14,
        color: '#00D4FF',
        fontWeight: 600,
    },
    infoText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
        marginBottom: 16,
    },
    helperText: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        marginTop: 12,
        fontStyle: 'italic',
    },
    linkButton: {
        padding: '12px 24px',
        background: 'rgba(0, 212, 255, 0.15)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        borderRadius: 8,
        color: '#00D4FF',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    infoList: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.8,
        paddingLeft: 24,
        margin: 0,
    },
    vipBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1))',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: 12,
    },
    vipIcon: {
        fontSize: 32,
    },
    vipTitle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#FFD700',
        marginBottom: 4,
    },
    vipSubtitle: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    dangerZone: {
        background: 'rgba(255, 71, 87, 0.05)',
        border: '1px solid rgba(255, 71, 87, 0.2)',
        borderRadius: 16,
        padding: 24,
    },
    warningBox: {
        display: 'flex',
        gap: 16,
        padding: 20,
        background: 'rgba(255, 165, 0, 0.1)',
        border: '1px solid rgba(255, 165, 0, 0.3)',
        borderRadius: 12,
        marginBottom: 24,
    },
    warningIcon: {
        fontSize: 32,
    },
    warningTitle: {
        fontSize: 18,
        fontWeight: 600,
        color: '#FFA500',
        marginBottom: 8,
    },
    warningText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
    },
    deleteButton: {
        padding: '14px 28px',
        background: '#ff4757',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        marginTop: 24,
        transition: 'all 0.2s',
    },
};
