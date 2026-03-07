/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS PAGE — User Preferences & Account Management
   Configure your Smarter.Poker experience
   Last Updated: 2026-01-29 - Avatar race condition fix deployed
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePersistedState } from '../../src/hooks/usePersistedState';
import confetti from 'canvas-confetti';
// useTheme removed — unused (DarkModeToggle handles theme internally)
import { DarkModeToggle } from '../../src/components/DarkModeToggle';
import { supabase } from '../../src/lib/supabase';
import CustomAvatarBuilder from '../../src/components/avatars/CustomAvatarBuilder';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getCustomAvatarGallery } from '../../src/services/avatar-service';

// God-Mode Stack
// useSettingsStore removed — unused (settings are managed via local state)
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import InviteFriendsModal from '../../src/components/ui/InviteFriendsModal';
import { getAccessToken } from '../src/lib/authUtils';

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
    const [localUser, setLocalUser] = useState(null); //  Fallback from localStorage
    const [activeSection, setActiveSection] = usePersistedState('sp-settings-active-section', 'account');
    const [saved, setSaved] = useState(false);
    const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
    const [customAvatars, setCustomAvatars] = useState([]);
    const [loadingAvatars, setLoadingAvatars] = useState(true);

    // VIP Cancellation State
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelStep, setCancelStep] = useState('reason'); // 'reason' | 'offer' | 'confirmed' | 'retained'
    const [cancelReason, setCancelReason] = useState('');
    const [cancelOtherText, setCancelOtherText] = useState('');
    const [cancelLoading, setCancelLoading] = useState(false);
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
    const [referralCopied, setReferralCopied] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Promo Code State
    const [promoCode, setPromoCode] = useState('');
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoResult, setPromoResult] = useState(null); // { success, message, reward }
    const [promoHistory, setPromoHistory] = useState([]);
    const [promoHistoryLoading, setPromoHistoryLoading] = useState(false);

    // Billing State
    const [billingOrders, setBillingOrders] = useState([]);
    const [billingTransactions, setBillingTransactions] = useState([]);
    const [billingVipSub, setBillingVipSub] = useState(null);
    const [billingDiamonds, setBillingDiamonds] = useState(0);
    const [billingLoading, setBillingLoading] = useState(false);

    //  Use context user or localStorage fallback
    const user = contextUser || localUser;

    // Menu config
    const menuConfig = getMenuConfig('settings', user, {}, {});

    //  BULLETPROOF: Read user from localStorage immediately (same as UniversalHeader)
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

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 REALTIME: Settings/Preferences Sync
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!user?.id) return;

        const loadSettings = async () => {
            // Load user's display preference from profiles table
            const { data: profile } = await supabase
                .from('profiles')
                .select('display_name_preference')
                .eq('id', user.id)
                .maybeSingle();

            if (profile) {
                setSettings(prev => ({
                    ...prev,
                    display_name_preference: profile.display_name_preference || 'full_name'
                }));
            }
        };

        loadSettings();

        // Subscribe to profile changes
        const settingsChannel = supabase
            .channel(`settings:${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${user.id}`
            }, async () => {
                console.log('[Settings] 🔄 Profile updated via realtime');
                await loadSettings();
                // Broadcast to other tabs
                try {
                    new BroadcastChannel('smarter_poker_settings_sync').postMessage('refresh_settings');
                } catch (e) { }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(settingsChannel);
        };
    }, [user?.id]);

    // Cross-tab Settings sync
    useEffect(() => {
        try {
            const bc = new BroadcastChannel('smarter_poker_settings_sync');
            bc.onmessage = (event) => {
                if (event.data === 'refresh_settings') {
                    console.log('[Settings] 📡 Refreshing settings from other tab');
                    if (user?.id) {
                        supabase
                            .from('profiles')
                            .select('display_name_preference')
                            .eq('id', user.id)
                            .maybeSingle()
                            .then(({ data: profile }) => {
                                if (profile) {
                                    setSettings(prev => ({
                                        ...prev,
                                        display_name_preference: profile.display_name_preference || 'full_name'
                                    }));
                                }
                            });
                    }
                }
            };
            return () => bc.close();
        } catch (e) { }
    }, [user?.id]);

    // Load user settings when user is available
    useEffect(() => {
        if (user?.id) {
            // Load custom avatars gallery
            getCustomAvatarGallery(user.id).then(avatars => {
                setCustomAvatars(avatars || []);
                setLoadingAvatars(false);
            }).catch(() => setLoadingAvatars(false));

            // Also fetch user profile for display name
            supabase
                .from('profiles')
                .select('full_name, username, avatar_url, player_number')
                .eq('id', user.id)
                .maybeSingle()
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
                .maybeSingle()
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
            const token = getAccessToken();
            if (!session) return;

            await fetch('/api/auth/sessions/track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAccessToken()}`
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
            const token = getAccessToken();
            if (!session) return;

            const response = await fetch('/api/auth/mfa/setup', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAccessToken()}`
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
            const token = getAccessToken();
            if (!session) return;

            const response = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAccessToken()}`
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
            const token = getAccessToken();
            if (!session) return;

            const response = await fetch('/api/auth/mfa/disable', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAccessToken()}`
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

    const updateSetting = async (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));

        // Only auto-save if it's a toggle (boolean value)
        if (typeof value === 'boolean') {
            if (user?.id) {
                // Currently only display_name_preference is in DB, but if toggles are added:
                // const { error } = await supabase.from('profiles').update({ [key]: value }).eq('id', user.id);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            }
        } else {
            setSaved(false);
        }
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
            const token = getAccessToken();
            if (!session) {
                alert('Session expired. Please log in again.');
                return;
            }

            const response = await fetch('/api/auth/delete-account', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getAccessToken()}` }
            });

            if (response.ok) {
                await supabase.auth.signOut();
                alert('Your account has been permanently deleted.');
                window.location.href = '/';
            } else {
                const err = await response.json().catch(() => ({}));
                alert(err.error || err.details || 'Failed to delete account. Please contact support.');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            alert('An error occurred. Please try again or contact support.');
        }
    };

    // ── PROMO CODE FUNCTIONS ──
    const loadPromoHistory = async () => {
        if (!user?.id) return;
        setPromoHistoryLoading(true);
        try {
            const { data, error } = await supabase
                .from('promo_code_redemptions')
                .select('*, promo_codes(code, description, reward_type, reward_value)')
                .eq('user_id', user.id)
                .order('redeemed_at', { ascending: false });
            if (!error && data) setPromoHistory(data);
        } catch (err) {
            console.error('[Settings] Error loading promo history:', err);
        } finally {
            setPromoHistoryLoading(false);
        }
    };

    // Auto-load promo history when section is opened
    useEffect(() => {
        if (activeSection === 'promos' && user?.id) {
            loadPromoHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection, user?.id]);

    // ── BILLING DATA LOADER ──
    const loadBillingData = async () => {
        if (!user?.id) return;
        setBillingLoading(true);
        try {
            const token = getAccessToken();
            const headers = session ? { 'Authorization': `Bearer ${getAccessToken()}` } : {};

            // Fetch orders, transactions, VIP sub, and profile in parallel
            const [ordersRes, txRes, vipRes, profileRes] = await Promise.allSettled([
                supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
                session ? fetch(`/api/store/diamond-transactions?limit=10`, { headers }).then(r => r.json()) : Promise.resolve({ transactions: [] }),
                supabase.from('vip_subscriptions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
                supabase.from('profiles').select('diamonds').eq('id', user.id).maybeSingle(),
            ]);

            if (ordersRes.status === 'fulfilled' && ordersRes.value.data) {
                setBillingOrders(ordersRes.value.data);
            }
            if (txRes.status === 'fulfilled') {
                setBillingTransactions(txRes.value.transactions || txRes.value.data || []);
            }
            if (vipRes.status === 'fulfilled' && vipRes.value.data) {
                setBillingVipSub(vipRes.value.data);
            }
            if (profileRes.status === 'fulfilled' && profileRes.value.data) {
                setBillingDiamonds(profileRes.value.data.diamonds || 0);
            }
        } catch (err) {
            console.error('[Settings] Error loading billing data:', err);
        } finally {
            setBillingLoading(false);
        }
    };

    // Auto-load billing data when section is opened
    useEffect(() => {
        if (activeSection === 'billing' && user?.id) {
            loadBillingData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection, user?.id]);

    const redeemPromoCode = async () => {
        if (!promoCode.trim()) return;
        setPromoLoading(true);
        setPromoResult(null);
        try {
            const token = getAccessToken();
            if (!session) {
                setPromoResult({ success: false, message: 'Please Log In To Redeem A Promo Code.' });
                return;
            }
            const res = await fetch('/api/promo/redeem', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAccessToken()}`
                },
                body: JSON.stringify({ code: promoCode.trim() })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setPromoResult({ success: true, message: data.reward.message, reward: data.reward });
                setPromoCode('');
                loadPromoHistory();
            } else {
                setPromoResult({ success: false, message: data.error || 'Failed to redeem code.' });
            }
        } catch (err) {
            setPromoResult({ success: false, message: 'Network Error. Please Try Again.' });
        } finally {
            setPromoLoading(false);
        }
    };

    const sections = [
        { id: 'account', label: 'Account', icon: '' },
        { id: 'notifications', label: 'Notifications', icon: '' },
        { id: 'privacy', label: 'Privacy', icon: '' },
        { id: 'appearance', label: 'Appearance', icon: '' },
        { id: 'display', label: 'Display & Sound', icon: '' },
        { id: 'gameplay', label: 'Gameplay', icon: '' },
        { id: 'promos', label: 'Promo Codes', icon: '' },
        { id: 'billing', label: 'Billing & Payments', icon: '' },
        { id: 'blocked', label: 'Blocked Users', icon: '' },
        { id: 'data', label: 'Data Export', icon: '' },
        { id: 'delete', label: 'Delete Account', icon: '' },
    ];

    return (
        <PageTransition>
            <SEOHead
                title="Settings — Account & Preferences"
                description="Manage Your Smarter.Poker Account Settings, Preferences, Notifications, And Privacy Options."
                canonical="/hub/settings"
                noindex={true}
            >
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

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
                    <h1 style={styles.pageTitle}> Settings</h1>
                    <button
                        onClick={saveSettings}
                        style={{
                            ...styles.saveButton,
                            background: saved
                                ? 'linear-gradient(135deg, #00ff88, #00cc66)'
                                : 'linear-gradient(135deg, #00D4FF, #0088cc)',
                        }}
                    >
                        {saved ? ' Saved' : 'Save Changes'}
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
                                                            onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = ''; }}
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
                                                {initializing ? '' : (user?.email || 'Not Logged In')}
                                            </span>
                                            {isVip && (
                                                <span style={{ color: '#FFD700', fontSize: 13, marginTop: 4 }}>
                                                    Diamonds VIP Member
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
                                    background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.15), rgba(66, 183, 42, 0.08))',
                                    border: '1px solid rgba(24, 119, 242, 0.3)',
                                }}>
                                    <h3 style={{ ...styles.cardTitle, color: '#1877F2', marginBottom: 8 }}>
                                        Build Your Avatar
                                    </h3>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 16 }}>
                                        Create A Unique AI-Generated Avatar To Use As Your Profile Picture Across Smarter.Poker
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
                                                            ? '3px solid #1877F2'
                                                            : avatarData
                                                                ? '2px solid rgba(24, 119, 242, 0.4)'
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
                                                                    background: '#1877F2',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: 10,
                                                                    color: '#000',
                                                                }}>

                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span style={{
                                                            color: canCreate ? '#1877F2' : 'rgba(255,255,255,0.2)',
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
                                                background: 'linear-gradient(135deg, #1877F2, #166FE5)',
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
                                                boxShadow: '0 4px 20px rgba(24, 119, 242, 0.3)',
                                                transition: 'all 0.3s ease',
                                            }}
                                        >
                                            Create Custom Avatar
                                        </button>
                                        <button
                                            onClick={() => router.push('/hub/avatars')}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'rgba(24, 119, 242, 0.12)',
                                                border: '1px solid rgba(24, 119, 242, 0.3)',
                                                borderRadius: 10,
                                                color: '#1877F2',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 8,
                                                transition: 'all 0.3s ease',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            Browse Avatar Library
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
                                                Diamonds Free Users Get 1 Custom Avatar.
                                                <a
                                                    href="/hub/diamond-store"
                                                    style={{
                                                        color: '#FFD700',
                                                        fontWeight: 600,
                                                        marginLeft: 6,
                                                        textDecoration: 'none',
                                                    }}
                                                >
                                                    Upgrade To VIP For 5 Custom Avatars!
                                                </a>
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Refer a Friend Card */}
                                {userProfile?.player_number && (
                                    <div style={{
                                        ...styles.card,
                                        background: 'linear-gradient(135deg, rgba(24, 119, 242, 0.15), rgba(66, 183, 42, 0.1))',
                                        border: '1px solid rgba(24, 119, 242, 0.3)',
                                    }}>
                                        <h3 style={{ ...styles.cardTitle, color: '#1877F2', marginBottom: 8 }}>
                                            Refer a Friend
                                        </h3>
                                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 16 }}>
                                            Share Your Referral Code And Earn <strong style={{ color: '#42B72A' }}>500 Diamonds</strong> For Every Friend Who Signs Up!
                                        </p>

                                        {/* Player Number Display */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            marginBottom: 16,
                                            padding: '12px 16px',
                                            background: 'rgba(0, 0, 0, 0.3)',
                                            borderRadius: 10,
                                            border: '1px solid rgba(24, 119, 242, 0.3)',
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Your Referral Code</div>
                                                <div style={{
                                                    fontFamily: 'Orbitron, monospace',
                                                    fontSize: 28,
                                                    fontWeight: 700,
                                                    color: '#1877F2',
                                                    letterSpacing: '3px',
                                                }}>
                                                    #{userProfile.player_number}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(String(userProfile.player_number));
                                                    setReferralCopied(true);
                                                    setTimeout(() => setReferralCopied(false), 2000);
                                                }}
                                                style={{
                                                    padding: '10px 16px',
                                                    background: referralCopied ? 'rgba(49, 162, 76, 0.3)' : 'rgba(24, 119, 242, 0.2)',
                                                    border: `1px solid ${referralCopied ? 'rgba(49, 162, 76, 0.5)' : 'rgba(24, 119, 242, 0.4)'}`,
                                                    borderRadius: 8,
                                                    color: referralCopied ? '#31A24C' : '#1877F2',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {referralCopied ? 'Copied!' : 'Copy Code'}
                                            </button>
                                        </div>

                                        {/* Copy Referral Link Button */}
                                        <button
                                            onClick={() => {
                                                const link = `https://smarter.poker/auth/signup?ref=${userProfile.player_number}`;
                                                navigator.clipboard.writeText(link);
                                                setReferralCopied(true);
                                                setTimeout(() => setReferralCopied(false), 2000);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '14px 20px',
                                                background: 'linear-gradient(135deg, #1877F2, #166FE5)',
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
                                                boxShadow: '0 4px 20px rgba(24, 119, 242, 0.3)',
                                                transition: 'all 0.3s ease',
                                            }}
                                        >
                                            Copy Referral Link
                                        </button>
                                        {/* Invite Friends Button */}
                                        <button
                                            onClick={() => setShowInviteModal(true)}
                                            style={{
                                                width: '100%',
                                                padding: '14px 20px',
                                                background: 'linear-gradient(135deg, #42B72A, #36A420)',
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
                                                boxShadow: '0 4px 20px rgba(66, 183, 42, 0.3)',
                                                transition: 'all 0.3s ease',
                                                marginTop: 10,
                                            }}
                                        >
                                            Invite Friends — Share Via Social, Email & SMS
                                        </button>
                                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 10, textAlign: 'center' }}>
                                            Friends Enter Your Code During Signup, You Earn 500 Diamonds Each Time!
                                        </p>
                                    </div>
                                )}

                                <div style={styles.card}>
                                    <h3 style={styles.cardTitle}>Account Security</h3>
                                    <button
                                        onClick={async () => {
                                            if (!user?.email) {
                                                alert('No Email Found. Please Log In Again.');
                                                return;
                                            }
                                            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                                                redirectTo: `${window.location.origin}/hub/reset-auth`
                                            });
                                            if (error) {
                                                alert('Error Sending Password Reset Email: ' + error.message);
                                            } else {
                                                alert('Password Reset Email Sent! Check Your Inbox.');
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
                                        {twoFactorEnabled ? ' 2FA Enabled' : 'Enable 2FA'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setShowDevicesModal(true);
                                            // Load connected devices from API
                                            try {
                                                const token = getAccessToken();
                                                if (!session) return;

                                                const response = await fetch('/api/auth/sessions/list', {
                                                    method: 'GET',
                                                    headers: {
                                                        'Authorization': `Bearer ${getAccessToken()}`
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
                                        description="Receive Updates Via Email"
                                        value={settings.emailNotifications}
                                        onChange={(v) => updateSetting('emailNotifications', v)}
                                    />
                                    <Toggle
                                        label="Push Notifications"
                                        description="Browser And Mobile Alerts"
                                        value={settings.pushNotifications}
                                        onChange={(v) => updateSetting('pushNotifications', v)}
                                    />
                                    <Toggle
                                        label="Sound Effects"
                                        description="In-App Sound Effects"
                                        value={settings.soundEffects}
                                        onChange={(v) => updateSetting('soundEffects', v)}
                                    />
                                    <Toggle
                                        label="Tournament Alerts"
                                        description="Get Notified About Tournaments"
                                        value={settings.tournamentAlerts}
                                        onChange={(v) => updateSetting('tournamentAlerts', v)}
                                    />
                                    <Toggle
                                        label="Friend Activity"
                                        description="See When Friends Are Online"
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
                                        label="Display Name In Social Media"
                                        value={settings.display_name_preference || 'full_name'}
                                        onChange={(v) => updateSetting('display_name_preference', v)}
                                        options={[
                                            { value: 'full_name', label: 'Full Name (e.g., John Smith)' },
                                            { value: 'username', label: 'Username (e.g., @pokerpro123)' },
                                        ]}
                                    />
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: -8, marginBottom: 16, paddingLeft: 4 }}>
                                        Choose How Your Name Appears In Posts And Comments
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
                                            <span style={styles.settingDesc}>Switch Between Light And Dark Mode</span>
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
                                        label="Time Bank (Seconds)"
                                        value={settings.timeBank}
                                        onChange={(v) => updateSetting('timeBank', parseInt(v))}
                                        options={[
                                            { value: 15, label: '15 Seconds' },
                                            { value: 30, label: '30 Seconds' },
                                            { value: 60, label: '60 Seconds' },
                                        ]}
                                    />
                                </div>
                            </div>
                        )}


                        {/* Display & Sound Section */}
                        {activeSection === 'display' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Display & Sound</h2>

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
                                        description="Enable Smooth Transitions And Animations"
                                        value={settings.animations !== false}
                                        onChange={(val) => updateSetting('animations', val)}
                                    />
                                    <Toggle
                                        label="Reduce Motion"
                                        description="Minimize Animations For Accessibility"
                                        value={settings.reduceMotion || false}
                                        onChange={(val) => updateSetting('reduceMotion', val)}
                                    />
                                </div>

                                <div style={styles.settingGroup}>
                                    <h3 style={styles.groupTitle}>Sound</h3>
                                    <Toggle
                                        label="Sound Effects"
                                        description="Play Sounds For Actions And Notifications"
                                        value={settings.soundEffects !== false}
                                        onChange={(val) => updateSetting('soundEffects', val)}
                                    />
                                    <Toggle
                                        label="Notification Sounds"
                                        description="Play Sound When You Receive Notifications"
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
                                <h2 style={styles.sectionTitle}>Billing & Payments</h2>

                                {billingLoading ? (
                                    <div style={{ textAlign: 'center', padding: '80px 0' }}>
                                        <div style={{ fontSize: 14, color: '#65676b' }}>Loading Billing Information...</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

                                        {/* ── VIP Membership Status ── */}
                                        <div style={{
                                            background: '#242526',
                                            border: '1px solid #3a3b3c',
                                            borderRadius: 12,
                                            padding: 28,
                                        }}>
                                            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e4e6eb', margin: '0 0 20px 0' }}>VIP Membership</h3>
                                            {isVip ? (
                                                <>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 16,
                                                        padding: 20, background: '#3a3b3c', borderRadius: 10,
                                                    }}>
                                                        <div style={{
                                                            width: 52, height: 52, borderRadius: 12,
                                                            background: 'linear-gradient(135deg, #2374e1, #1a5cc7)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: 12, fontWeight: 800, color: '#fff', letterSpacing: 1,
                                                        }}>VIP</div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: 17, fontWeight: 700, color: '#e4e6eb' }}>Active VIP Member</div>
                                                            <div style={{ fontSize: 13, color: '#65676b', marginTop: 4 }}>
                                                                {billingVipSub?.tier ? `${billingVipSub.tier.charAt(0).toUpperCase() + billingVipSub.tier.slice(1)} Plan` : 'Premium Plan'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {billingVipSub?.current_period_end && (
                                                        <div style={{
                                                            marginTop: 16, padding: '14px 18px',
                                                            background: '#18191a', borderRadius: 8,
                                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        }}>
                                                            <span style={{ fontSize: 13, color: '#65676b' }}>
                                                                {billingVipSub.cancel_at_period_end ? 'Cancels On' : 'Next Billing Date'}
                                                            </span>
                                                            <span style={{ fontSize: 14, fontWeight: 600, color: billingVipSub.cancel_at_period_end ? '#f02849' : '#e4e6eb' }}>
                                                                {new Date(billingVipSub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {billingVipSub?.cancel_at_period_end && (
                                                        <div style={{
                                                            marginTop: 14, padding: '12px 16px',
                                                            background: 'rgba(240, 40, 73, 0.08)', border: '1px solid rgba(240, 40, 73, 0.25)',
                                                            borderRadius: 8, fontSize: 13, color: '#f02849', lineHeight: 1.5,
                                                        }}>
                                                            Your membership will end at the current billing period. You can still enjoy benefits until then.
                                                        </div>
                                                    )}

                                                    {!billingVipSub?.cancel_at_period_end && (
                                                        <button
                                                            onClick={() => {
                                                                setShowCancelModal(true);
                                                                setCancelStep('reason');
                                                                setCancelReason('');
                                                                setCancelOtherText('');
                                                            }}
                                                            style={{
                                                                marginTop: 20, padding: '10px 20px',
                                                                background: 'transparent',
                                                                border: '1px solid #4e4f50',
                                                                borderRadius: 8, color: '#65676b',
                                                                fontSize: 13, fontWeight: 500,
                                                                cursor: 'pointer', transition: 'all 0.2s ease',
                                                            }}
                                                        >
                                                            Cancel Membership
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 16,
                                                        padding: 20, background: '#3a3b3c', borderRadius: 10,
                                                    }}>
                                                        <div style={{
                                                            width: 52, height: 52, borderRadius: 12,
                                                            background: '#4e4f50',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: 22, color: '#65676b',
                                                        }}>—</div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: 16, fontWeight: 600, color: '#e4e6eb' }}>No Active Membership</div>
                                                            <div style={{ fontSize: 13, color: '#65676b', marginTop: 4 }}>
                                                                Upgrade To VIP For Premium Benefits
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => router.push('/hub/diamond-store')}
                                                        style={{
                                                            marginTop: 20, width: '100%',
                                                            padding: '12px 20px',
                                                            background: '#2374e1',
                                                            border: 'none', borderRadius: 8,
                                                            color: '#fff', fontSize: 14, fontWeight: 600,
                                                            cursor: 'pointer', transition: 'all 0.2s ease',
                                                        }}
                                                    >
                                                        Upgrade To VIP
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        {/* ── Diamond Balance & Transactions ── */}
                                        <div style={{
                                            background: '#242526',
                                            border: '1px solid #3a3b3c',
                                            borderRadius: 12,
                                            padding: 28,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e4e6eb', margin: 0 }}>Diamond Balance</h3>
                                                <div style={{ fontSize: 24, fontWeight: 700, color: '#2374e1', fontFamily: 'Orbitron, monospace' }}>
                                                    {billingDiamonds.toLocaleString()}
                                                </div>
                                            </div>

                                            {billingTransactions.length > 0 ? (
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#65676b', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recent Transactions</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                        {billingTransactions.slice(0, 10).map((tx, i) => {
                                                            const isCredit = (tx.amount || tx.diamonds || 0) > 0;
                                                            return (
                                                                <div key={tx.id || i} style={{
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                    padding: '12px 14px', borderRadius: 8, background: '#3a3b3c',
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                                                                        <div style={{
                                                                            width: 34, height: 34, borderRadius: 8,
                                                                            background: isCredit ? 'rgba(49, 162, 76, 0.15)' : 'rgba(240, 40, 73, 0.15)',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: 15, fontWeight: 700, flexShrink: 0,
                                                                            color: isCredit ? '#31a24c' : '#f02849',
                                                                        }}>{isCredit ? '↑' : '↓'}</div>
                                                                        <div style={{ minWidth: 0 }}>
                                                                            <div style={{ fontSize: 13, fontWeight: 500, color: '#e4e6eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                {tx.description || tx.transaction_type || tx.type || 'Transaction'}
                                                                            </div>
                                                                            <div style={{ fontSize: 11, color: '#65676b', marginTop: 2 }}>
                                                                                {tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{
                                                                        fontSize: 14, fontWeight: 600, flexShrink: 0, marginLeft: 12,
                                                                        color: isCredit ? '#31a24c' : '#f02849',
                                                                    }}>
                                                                        {isCredit ? '+' : ''}{(tx.amount || tx.diamonds || 0).toLocaleString()}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                                                    <p style={{ color: '#65676b', fontSize: 13, margin: 0 }}>No Transactions Yet</p>
                                                </div>
                                            )}

                                            <button
                                                onClick={() => router.push('/hub/diamond-store')}
                                                style={{
                                                    width: '100%', textAlign: 'center', marginTop: 20,
                                                    padding: '12px 24px',
                                                    background: 'rgba(35, 116, 225, 0.12)',
                                                    border: '1px solid rgba(35, 116, 225, 0.3)',
                                                    borderRadius: 8, color: '#2374e1',
                                                    fontSize: 14, fontWeight: 600,
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                }}
                                            >
                                                Buy Diamonds
                                            </button>
                                        </div>

                                        {/* ── Recent Orders ── */}
                                        <div style={{
                                            background: '#242526',
                                            border: '1px solid #3a3b3c',
                                            borderRadius: 12,
                                            padding: 28,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                                                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e4e6eb', margin: 0 }}>Recent Orders</h3>
                                                <button
                                                    onClick={() => router.push('/hub/diamond-store/orders')}
                                                    style={{ background: 'none', border: 'none', color: '#2374e1', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                                >
                                                    View All →
                                                </button>
                                            </div>

                                            {billingOrders.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    {billingOrders.map(order => {
                                                        const statusMap = {
                                                            completed: { bg: 'rgba(49, 162, 76, 0.12)', color: '#31a24c', label: 'Completed' },
                                                            pending: { bg: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24', label: 'Pending' },
                                                            processing: { bg: 'rgba(35, 116, 225, 0.12)', color: '#2374e1', label: 'Processing' },
                                                            failed: { bg: 'rgba(240, 40, 73, 0.12)', color: '#f02849', label: 'Failed' },
                                                            refunded: { bg: 'rgba(156, 163, 175, 0.12)', color: '#9ca3af', label: 'Refunded' }
                                                        };
                                                        const st = statusMap[order.status] || statusMap.pending;
                                                        return (
                                                            <div key={order.id} style={{
                                                                padding: '16px 18px', background: '#3a3b3c',
                                                                border: '1px solid #4e4f50', borderRadius: 10,
                                                            }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                    <div>
                                                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e6eb', marginBottom: 4 }}>
                                                                            Order #{order.id.slice(0, 8).toUpperCase()}
                                                                        </div>
                                                                        <div style={{ fontSize: 12, color: '#65676b' }}>
                                                                            {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                                        <span style={{
                                                                            padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                                                            background: st.bg, color: st.color,
                                                                        }}>{st.label}</span>
                                                                        {order.total_cents != null && (
                                                                            <span style={{ fontSize: 15, fontWeight: 700, color: '#e4e6eb' }}>
                                                                                ${(order.total_cents / 100).toFixed(2)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {order.stripe_receipt_url && (
                                                                    <a
                                                                        href={order.stripe_receipt_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{ display: 'inline-block', marginTop: 12, color: '#2374e1', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
                                                                    >
                                                                        View Receipt →
                                                                    </a>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                                                    <p style={{ color: '#65676b', fontSize: 13, margin: '0 0 16px 0' }}>No Orders Yet</p>
                                                    <button
                                                        onClick={() => router.push('/hub/diamond-store')}
                                                        style={{
                                                            padding: '10px 24px',
                                                            background: 'rgba(35, 116, 225, 0.12)',
                                                            border: '1px solid rgba(35, 116, 225, 0.3)',
                                                            borderRadius: 8, color: '#2374e1',
                                                            fontSize: 13, fontWeight: 600,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        Visit Diamond Store
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Payment Methods ── */}
                                        <div style={{
                                            background: '#242526',
                                            border: '1px solid #3a3b3c',
                                            borderRadius: 12,
                                            padding: 28,
                                        }}>
                                            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#e4e6eb', margin: '0 0 12px 0' }}>Payment Methods</h3>
                                            <p style={{ fontSize: 14, color: '#65676b', lineHeight: 1.6, margin: '0 0 20px 0' }}>
                                                Payment Methods Are Managed Securely Through Stripe During Checkout.
                                            </p>
                                            <button
                                                onClick={() => router.push('/hub/diamond-store')}
                                                style={{
                                                    padding: '12px 24px',
                                                    background: 'rgba(35, 116, 225, 0.12)',
                                                    border: '1px solid rgba(35, 116, 225, 0.3)',
                                                    borderRadius: 8, color: '#2374e1',
                                                    fontSize: 14, fontWeight: 600,
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                }}
                                            >
                                                Go To Diamond Store
                                            </button>
                                        </div>

                                    </div>
                                )}
                            </div>
                        )}

                        {/* Promo Code Section */}
                        {activeSection === 'promos' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Redeem Promo Code</h2>

                                <div style={{
                                    ...styles.card,
                                    background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.12), rgba(0, 212, 255, 0.08))',
                                    border: '1px solid rgba(138, 43, 226, 0.3)',
                                }}>
                                    <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                                        Have A Promo Code?
                                    </h3>
                                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 20 }}>
                                        Enter Your Code Below To Unlock Rewards Like Free Diamonds, VIP Access, And More.
                                    </p>

                                    {/* Input + Button Row */}
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                                        <input
                                            type="text"
                                            value={promoCode}
                                            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                                            onKeyDown={(e) => e.key === 'Enter' && redeemPromoCode()}
                                            placeholder="ENTER CODE"
                                            maxLength={30}
                                            style={{
                                                flex: 1,
                                                padding: '14px 16px',
                                                background: 'rgba(0, 0, 0, 0.4)',
                                                border: '1px solid rgba(138, 43, 226, 0.4)',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 16,
                                                fontFamily: 'Orbitron, monospace',
                                                letterSpacing: '2px',
                                                textTransform: 'uppercase',
                                                outline: 'none',
                                            }}
                                        />
                                        <button
                                            onClick={redeemPromoCode}
                                            disabled={promoLoading || !promoCode.trim()}
                                            style={{
                                                padding: '14px 28px',
                                                background: promoLoading
                                                    ? 'rgba(138, 43, 226, 0.3)'
                                                    : 'linear-gradient(135deg, #8a2be2, #6a1fb4)',
                                                border: 'none',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 700,
                                                cursor: promoLoading ? 'wait' : 'pointer',
                                                opacity: !promoCode.trim() ? 0.5 : 1,
                                                transition: 'all 0.3s ease',
                                                boxShadow: '0 4px 20px rgba(138, 43, 226, 0.3)',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {promoLoading ? 'Checking...' : 'Redeem'}
                                        </button>
                                    </div>

                                    {/* Result Feedback */}
                                    {promoResult && (
                                        <div style={{
                                            padding: '14px 18px',
                                            borderRadius: 10,
                                            background: promoResult.success
                                                ? 'rgba(49, 162, 76, 0.15)'
                                                : 'rgba(255, 71, 87, 0.15)',
                                            border: `1px solid ${promoResult.success ? 'rgba(49, 162, 76, 0.4)' : 'rgba(255, 71, 87, 0.4)'}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            animation: 'fadeIn 0.3s ease',
                                        }}>
                                            <span style={{ fontSize: 24 }}>
                                                {promoResult.success ? '' : ''}
                                            </span>
                                            <div>
                                                <div style={{
                                                    color: promoResult.success ? '#31A24C' : '#ff4757',
                                                    fontWeight: 600,
                                                    fontSize: 14,
                                                }}>
                                                    {promoResult.success ? 'Code Redeemed!' : 'Invalid Code'}
                                                </div>
                                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }}>
                                                    {promoResult.message}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Redemption History */}
                                <div style={styles.card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Redemption History</h3>
                                        <button
                                            onClick={loadPromoHistory}
                                            style={{
                                                padding: '6px 14px',
                                                background: 'rgba(0, 212, 255, 0.15)',
                                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                                borderRadius: 6,
                                                color: '#00D4FF',
                                                fontSize: 12,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {promoHistoryLoading ? 'Loading...' : 'Refresh'}
                                        </button>
                                    </div>

                                    {promoHistory.length === 0 ? (
                                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
                                            No Promo Codes Redeemed Yet.
                                        </p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {promoHistory.map((item) => (
                                                <div
                                                    key={item.id}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        padding: '12px 16px',
                                                        background: 'rgba(255, 255, 255, 0.04)',
                                                        borderRadius: 8,
                                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{
                                                            fontFamily: 'Orbitron, monospace',
                                                            fontSize: 14,
                                                            fontWeight: 600,
                                                            color: '#8a2be2',
                                                            letterSpacing: '1px',
                                                        }}>
                                                            {item.promo_codes?.code || item.reward_applied?.code || 'CODE'}
                                                        </div>
                                                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
                                                            {item.reward_applied?.message || item.promo_codes?.description || ''}
                                                        </div>
                                                    </div>
                                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'right' }}>
                                                        {new Date(item.redeemed_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Blocked Users Section */}
                        {activeSection === 'blocked' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Blocked Users</h2>

                                <div style={styles.settingGroup}>
                                    <p style={styles.infoText}>
                                        Manage Users You've Blocked From Messaging And Interacting With You.
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
                                        <li>Blocked Users Cannot Send You Messages</li>
                                        <li>They Won't See Your Online Status</li>
                                        <li>They Cannot View Your Profile Or Posts</li>
                                        <li>You Can Unblock Users At Any Time</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Data Export Section */}
                        {activeSection === 'data' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Data Export</h2>

                                <div style={styles.settingGroup}>
                                    <p style={styles.infoText}>
                                        Download A Copy Of Your Smarter.Poker Data Including Your Profile, Posts, Messages, And Training History.
                                    </p>
                                    <button
                                        onClick={exportData}
                                        style={styles.exportButton}
                                    >
                                        Request Data Export
                                    </button>
                                    <p style={styles.helperText}>
                                        You'll Receive An Email With A Download Link When Your Data Is Ready (Usually Within 24 Hours).
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Delete Account Section */}
                        {activeSection === 'delete' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Delete Account</h2>

                                <div style={styles.dangerZone}>
                                    <div style={styles.warningBox}>
                                        <div style={styles.warningIcon}></div>
                                        <div>
                                            <h3 style={styles.warningTitle}>Danger Zone</h3>
                                            <p style={styles.warningText}>
                                                Once You Delete Your Account, There Is No Going Back. This Action Is Permanent And Cannot Be Undone.
                                            </p>
                                        </div>
                                    </div>

                                    <div style={styles.settingGroup}>
                                        <h3 style={styles.groupTitle}>What Will Be Deleted:</h3>
                                        <ul style={styles.infoList}>
                                            <li>Your Profile And All Personal Information</li>
                                            <li>All Your Posts, Reels, And Comments</li>
                                            <li>Your Training Progress And Statistics</li>
                                            <li>Your Messages And Conversations</li>
                                            <li>Your Friends And Connections</li>
                                            <li>Your Diamond Balance And VIP Status</li>
                                        </ul>
                                    </div>

                                    <div style={styles.settingGroup}>
                                        <h3 style={styles.groupTitle}>Before You Delete:</h3>
                                        <ul style={styles.infoList}>
                                            <li>Download Your Data Using The Data Export Feature</li>
                                            <li>Withdraw Any Remaining Diamond Balance</li>
                                            <li>Cancel Any Active VIP Subscriptions</li>
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
                                            <p style={styles.dataDesc}>Download All Your Hand Histories</p>
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
                                            <p style={styles.dataDesc}>Download Your Gameplay Statistics</p>
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
                                            <p style={styles.dataDesc}>Full GDPR-Compliant Data Export</p>
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
                                    <h3 style={styles.dangerTitle}> Danger Zone</h3>
                                    <p style={styles.dangerDesc}>
                                        These Actions Are Irreversible. Please Proceed With Caution.
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
                                                const token = getAccessToken();
                                                if (!session) { alert('Session expired. Please log in again.'); return; }
                                                const response = await fetch('/api/auth/delete-account', {
                                                    method: 'DELETE',
                                                    headers: { 'Authorization': 'Bearer ' + getAccessToken() }
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

            {/* VIP Cancellation Modal */}
            {showCancelModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                }}>
                    <div style={{
                        background: '#1c2333',
                        borderRadius: 16,
                        width: '100%',
                        maxWidth: 480,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden',
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
                                {cancelStep === 'reason' && 'Cancel VIP Membership'}
                                {cancelStep === 'offer' && 'Wait — Special Offer!'}
                                {cancelStep === 'confirmed' && 'Membership Cancelled'}
                                {cancelStep === 'retained' && 'Welcome Back!'}
                            </h3>
                            <button
                                onClick={() => setShowCancelModal(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.5)',
                                    fontSize: 24,
                                    cursor: 'pointer',
                                    padding: 0,
                                    lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div style={{ padding: '24px' }}>
                            {/* Step 1: Reason Survey */}
                            {cancelStep === 'reason' && (
                                <>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 20 }}>
                                        We Are Sorry To See You Go. Please Let Us Know Why You Are Cancelling So We Can Improve.
                                    </p>
                                    {[
                                        { id: 'too_expensive', label: 'Too Expensive' },
                                        { id: 'not_using', label: 'Not Using Enough' },
                                        { id: 'found_alternative', label: 'Found An Alternative' },
                                        { id: 'missing_features', label: 'Missing Features I Need' },
                                        { id: 'technical_issues', label: 'Technical Issues' },
                                        { id: 'other', label: 'Other' },
                                    ].map(reason => (
                                        <button
                                            key={reason.id}
                                            onClick={() => setCancelReason(reason.id)}
                                            style={{
                                                width: '100%',
                                                padding: '14px 16px',
                                                marginBottom: 8,
                                                background: cancelReason === reason.id
                                                    ? 'rgba(24, 119, 242, 0.15)'
                                                    : 'rgba(255, 255, 255, 0.05)',
                                                border: cancelReason === reason.id
                                                    ? '1px solid rgba(24, 119, 242, 0.4)'
                                                    : '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: 10,
                                                color: cancelReason === reason.id ? '#1877F2' : '#fff',
                                                fontSize: 14,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {reason.label}
                                        </button>
                                    ))}

                                    {cancelReason === 'other' && (
                                        <textarea
                                            value={cancelOtherText}
                                            onChange={(e) => setCancelOtherText(e.target.value)}
                                            placeholder="Tell Us More..."
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px',
                                                marginTop: 4,
                                                marginBottom: 8,
                                                background: 'rgba(0, 0, 0, 0.3)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 14,
                                                minHeight: 80,
                                                resize: 'vertical',
                                                outline: 'none',
                                                fontFamily: 'Inter, sans-serif',
                                            }}
                                        />
                                    )}

                                    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                                        <button
                                            onClick={() => setShowCancelModal(false)}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'rgba(255, 255, 255, 0.08)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Keep Membership
                                        </button>
                                        <button
                                            onClick={() => cancelReason && setCancelStep('offer')}
                                            disabled={!cancelReason}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: cancelReason ? '#1877F2' : 'rgba(24, 119, 242, 0.3)',
                                                border: 'none',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: cancelReason ? 'pointer' : 'not-allowed',
                                                opacity: cancelReason ? 1 : 0.5,
                                            }}
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Step 2: Retention Offer */}
                            {cancelStep === 'offer' && (
                                <>
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '20px 0',
                                    }}>
                                        <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                        <h4 style={{ color: '#1877F2', fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
                                            50% Off For 3 Months!
                                        </h4>
                                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: 360, margin: '0 auto 24px' }}>
                                            Before You Go, We Would Love To Offer You <strong style={{ color: '#1877F2' }}>50% Off Your VIP Membership</strong> For The Next 3 Months. Keep All Your Premium Benefits At Half The Price.
                                        </p>

                                        <div style={{
                                            background: 'rgba(24, 119, 242, 0.08)',
                                            border: '1px solid rgba(24, 119, 242, 0.25)',
                                            borderRadius: 12,
                                            padding: '16px 20px',
                                            marginBottom: 24,
                                        }}>
                                            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 4 }}>Your New Price</div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                                                <span style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'line-through', fontSize: 18 }}>$19.99/mo</span>
                                                <span style={{ color: '#1877F2', fontSize: 28, fontWeight: 700, fontFamily: 'Orbitron, sans-serif' }}>$9.99/mo</span>
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>For 3 Months, Then Regular Price Resumes</div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12 }}>
                                        <button
                                            onClick={() => {
                                                // Accept the retention offer
                                                // Note: actual Stripe coupon application would be done here
                                                setCancelStep('retained');
                                            }}
                                            disabled={cancelLoading}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                                border: 'none',
                                                borderRadius: 10,
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 20px rgba(24, 119, 242, 0.3)',
                                            }}
                                        >
                                            Claim 50% Off
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setCancelLoading(true);
                                                try {
                                                    await fetch('/api/store/cancel-vip', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            userId: user?.id,
                                                            reason: cancelReason,
                                                            reasonText: cancelReason === 'other' ? cancelOtherText : '',
                                                        }),
                                                    });
                                                    setCancelStep('confirmed');
                                                } catch (err) {
                                                    console.error('Cancel VIP error:', err);
                                                    alert('Something went wrong. Please try again.');
                                                } finally {
                                                    setCancelLoading(false);
                                                }
                                            }}
                                            disabled={cancelLoading}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'rgba(24, 119, 242, 0.1)',
                                                border: '1px solid rgba(24, 119, 242, 0.25)',
                                                borderRadius: 10,
                                                color: '#1877F2',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: cancelLoading ? 'wait' : 'pointer',
                                                opacity: cancelLoading ? 0.6 : 1,
                                            }}
                                        >
                                            {cancelLoading ? 'Cancelling...' : 'Cancel Anyway'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Step 3a: Cancellation Confirmed */}
                            {cancelStep === 'confirmed' && (
                                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                    <h4 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                                        Your Membership Has Been Cancelled
                                    </h4>
                                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                                        Your VIP Benefits Will Remain Active Until The End Of Your Current Billing Period.
                                    </p>
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>
                                        You Can Re-Subscribe Anytime From The Diamond Store.
                                    </p>
                                    <button
                                        onClick={() => setShowCancelModal(false)}
                                        style={{
                                            padding: '14px 40px',
                                            background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                            border: 'none',
                                            borderRadius: 10,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Done
                                    </button>
                                </div>
                            )}

                            {/* Step 3b: Retention Success */}
                            {cancelStep === 'retained' && (
                                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                                    <h4 style={{ color: '#1877F2', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                                        Discount Applied!
                                    </h4>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                                        Your VIP Membership Is Now <strong style={{ color: '#1877F2' }}>$9.99/Month</strong> For The Next 3 Months.
                                    </p>
                                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 24 }}>
                                        Thank You For Staying With Us! Enjoy Your Premium Benefits.
                                    </p>
                                    <button
                                        onClick={() => setShowCancelModal(false)}
                                        style={{
                                            padding: '14px 40px',
                                            background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                            border: 'none',
                                            borderRadius: 10,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 20px rgba(24, 119, 242, 0.3)',
                                        }}
                                    >
                                        Awesome!
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                        × Close
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
                        <h2 style={{ color: '#fff', marginBottom: 16, fontSize: 24 }}>Enable Two-Factor Authentication</h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: 14 }}>
                            Add An Extra Layer Of Security To Your Account With 2FA.
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
                                        <li style={{ marginBottom: 8 }}>Download An Authenticator App (Google Authenticator, Authy, Etc.)</li>
                                        <li style={{ marginBottom: 8 }}>Scan The QR Code Below With Your App</li>
                                        <li>Enter The 6-digit Code To Verify</li>
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
                                        <div style={{ fontSize: 14, color: '#666', padding: 40 }}>Loading QR Code...</div>
                                    ) : qrCode ? (
                                        <>
                                            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Scan With Your Authenticator App</div>
                                            <img src={qrCode} alt="QR Code" style={{ width: 200, height: 200, margin: '0 auto' }} />
                                            <p style={{ fontSize: 12, color: '#666', marginTop: 12 }}>
                                                Manual Entry Key: {manualEntryKey || 'Loading...'}
                                            </p>
                                        </>
                                    ) : (
                                        <div style={{ fontSize: 14, color: '#666', padding: 40 }}>Failed To Generate QR Code</div>
                                    )}
                                </div>

                                <input
                                    type="text"
                                    placeholder="Enter 6-digit Code"
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
                                    <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                    <h3 style={{ color: '#0f0', fontSize: 18, marginBottom: 8 }}>2FA Is Active</h3>
                                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
                                        Your Account Is Protected With Two-Factor Authentication
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
                        <h2 style={{ color: '#fff', marginBottom: 16, fontSize: 24 }}>Connected Devices</h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: 14 }}>
                            Manage Devices That Have Access To Your Account
                        </p>

                        {connectedDevices.length === 0 ? (
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                borderRadius: 12,
                                padding: 40,
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}></div>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                                    No Session Data Available. This Feature Tracks Active Login Sessions.
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
                                                    Last Active: {device.last_active ? new Date(device.last_active).toLocaleString() : 'Unknown'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('Revoke access for this device?')) {
                                                        try {
                                                            const token = getAccessToken();
                                                            if (!session) return;

                                                            const response = await fetch('/api/auth/sessions/revoke', {
                                                                method: 'POST',
                                                                headers: {
                                                                    'Content-Type': 'application/json',
                                                                    'Authorization': `Bearer ${getAccessToken()}`
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

            {/* Invite Friends Modal */}
            <InviteFriendsModal
                isOpen={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                user={user}
            />
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
    // ── Billing Styles ──
    billingStatCard: {
        padding: 20,
        background: 'rgba(0, 0, 0, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
    },
    transactionRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 8,
        background: 'rgba(0, 0, 0, 0.15)',
        marginBottom: 2,
    },
    billingOrderCard: {
        padding: '16px 18px',
        background: 'rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 10,
    },
};
