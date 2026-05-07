/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS PAGE — User Preferences & Account Management
   Configure your Smarter.Poker experience
   Last Updated: 2026-03-23 - Phase 3: +8 improvements (Toggle role=switch, Select aria-label, promo icons, export success feedback, mfaFeedback clear, deleteFeedback, linkCopied isolation, modal cleanup on close)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect } from 'react';
import { usePersistedState } from '../../src/hooks/usePersistedState';
// useTheme removed — unused (DarkModeToggle handles theme internally)
import { DarkModeToggle } from '../../src/components/DarkModeToggle';
import dynamic from 'next/dynamic';
import { supabase } from '../../src/lib/supabase';
// CustomAvatarBuilder statically imported is a heavy bundle hit. Lazy load it.
const CustomAvatarBuilder = dynamic(() => import('../../src/components/avatars/CustomAvatarBuilder'), { ssr: false });
import { useAvatar } from '../../src/contexts/AvatarContext';
import { getCustomAvatarGallery } from '../../src/services/avatar-service';

// God-Mode Stack
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
// InviteFriendsModal is loaded dynamically
const InviteFriendsModal = dynamic(() => import('../../src/components/ui/InviteFriendsModal'), { ssr: false });
const ReferralCrewCard = dynamic(() => import('../../src/components/social/ReferralCrewCard'), { ssr: false });
import { getAccessToken } from '../../src/lib/authUtils';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { broadcastSyncDebounced, listenBroadcast, BROADCAST_TAB_ID } from '../../src/lib/broadcastSync';
import { getBlockedUsers, unblockUser } from '../../src/services/privacy-service';
import BottomNavBar from '../../src/components/ui/BottomNavBar';
import styles from '../../src/components/settings/settingsStyles';

// Phase 2: Hoisted to module scope — static array, no need to re-create on every render
const SETTINGS_SECTIONS = [
    { id: 'account', label: 'Account' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'display', label: 'Display & Sound' },
    { id: 'gameplay', label: 'Gameplay' },
    { id: 'club_arena', label: 'Club Arena' },
    { id: 'promos', label: 'Promo Codes' },
    { id: 'billing', label: 'Billing & Payments' },
    { id: 'blocked', label: 'Blocked Users' },
    { id: 'data', label: 'Data Export' },
    { id: 'delete', label: 'Delete Account' },
];

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
                role="switch"
                aria-checked={!!value}
                aria-label={label}
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
                aria-label={label}
                style={{ ...styles.select, colorScheme: 'dark' }}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value} style={{ background: '#1a1a2e', color: '#fff' }}>{opt.label}</option>
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
    useTrainingBus('settings');
    const { avatar, isVip, user: contextUser, initializing, setActiveAvatar } = useAvatar();
    // SWR: Read cached profile from localStorage for instant UI (same pattern as UniversalHeader)
    const [userProfile, setUserProfile] = useState(() => {
        if (typeof window === 'undefined') return null;
        try {
            const cached = localStorage.getItem('sp-cached-settings-profile');
            if (cached) return JSON.parse(cached);
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return null;
    });
    const [localUser, setLocalUser] = useState(() => {
        //  BULLETPROOF: Read from localStorage immediately to prevent "Not Logged In" flash
        if (typeof window === 'undefined') return null;
        try {
            const explicitAuth = localStorage.getItem('smarter-poker-auth');
            if (explicitAuth) {
                const tokenData = JSON.parse(explicitAuth);
                if (tokenData?.user) return tokenData.user;
            }
        } catch (_) {}
        return null;
    });
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

    // Improvement: 2FA disable confirmation modal (replaces native confirm)
    const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);
    // Improvement: Device revoke confirmation (replaces native confirm)
    const [revokeDeviceTarget, setRevokeDeviceTarget] = useState(null); // device object to revoke
    // Improvement: Password reset inline feedback (replaces alert)
    const [passwordResetStatus, setPasswordResetStatus] = useState(null); // 'sent' | 'error' | null
    // Improvement: Devices loading indicator
    const [devicesLoading, setDevicesLoading] = useState(false);
    // Phase 2: MFA inline feedback (replaces remaining alert() calls)
    const [mfaFeedback, setMfaFeedback] = useState(null); // { type: 'success'|'error', message }
    // Phase 2: VIP cancel inline feedback
    const [cancelFeedback, setCancelFeedback] = useState(null); // { type: 'success'|'error', message }
    // Phase 2: Data export inline feedback
    const [exportFeedback, setExportFeedback] = useState(null); // { type: 'success'|'error', message }
    // Phase 2: Backup codes copied state
    const [backupCodesCopied, setBackupCodesCopied] = useState(false);
    // Phase 2: Promo history dedup guard
    const [promoHistoryLoaded, setPromoHistoryLoaded] = useState(false);
    // Phase 3: Separate state for referral link copy vs code copy
    const [linkCopied, setLinkCopied] = useState(false);
    // Phase 3: Delete modal inline feedback
    const [deleteFeedback, setDeleteFeedback] = useState(null);

    // Delete Account Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);

    // PWA Push Notification Preferences State
    const [notificationPrefs, setNotificationPrefs] = useState({
        tournament_reminders: true,
        social_mentions: true,
        friend_activity: true,
        venue_alerts: true,
        daily_challenges: true,
        messenger_alerts: true,
        diamond_rewards: true,
        club_updates: true,
        live_notifications: true,
    });
    const [notificationsLoaded, setNotificationsLoaded] = useState(false);

    // Mobile Responsive State
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth < 768;
    });

    // Data Export State
    const [exportLoading, setExportLoading] = useState(false);

    // Hamburger Menu State
    const [menuOpen, setMenuOpen] = useState(false);
    const [referralCopied, setReferralCopied] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Promo Code State
    const [promoCode, setPromoCode] = useState('');
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoResult, setPromoResult] = useState(null); // { success, message, reward }
    const [promoHistory, setPromoHistory] = useState([]);
    // NOTE: promoHistoryLoaded is declared above (Phase 2 block)
    const [promoHistoryLoading, setPromoHistoryLoading] = useState(false);

    // Billing State
    const [billingOrders, setBillingOrders] = useState([]);
    const [billingTransactions, setBillingTransactions] = useState([]);
    const [billingVipSub, setBillingVipSub] = useState(null);
    const [billingDiamonds, setBillingDiamonds] = useState(0);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingLoaded, setBillingLoaded] = useState(false); // Dedup guard

    // Blocked Users State
    const [blockedList, setBlockedList] = useState([]);
    const [blockedLoading, setBlockedLoading] = useState(false);
    const [blockedLoaded, setBlockedLoaded] = useState(false);
    const [unblockingId, setUnblockingId] = useState(null);

    // Volume slider local state (for smooth drag without spamming DB)
    const [localVolume, setLocalVolume] = useState(null); // null = use settings.masterVolume

    //  Use context user or localStorage fallback
    const user = contextUser || localUser;

    // Hoisted above menuConfig to avoid TDZ — menuConfig passes this as onSignOut
    const handleLogout = async () => {
        try {
            // Clear ALL profile caches so next user doesn't see stale data from previous account
            try { localStorage.removeItem('sp-social-user'); } catch (_) {}
            try { localStorage.removeItem('sp-vip-status'); } catch (_) {}
            try { localStorage.removeItem('sp-cached-header-user'); } catch (_) {} // BUG FIX: clear avatar cache
            try { localStorage.removeItem('sp-cached-settings-profile'); } catch (_) {}
            try { localStorage.removeItem('sp-notif-count'); } catch (_) {}
            await supabase.auth.signOut();
            // BUG FIX: Use window.top to navigate the PARENT window, not just the iframe.
            // When Settings opens inside FullScreenPageOverlay, `window` is the iframe context.
            // Navigating `window.location` only changes the iframe URL — the parent overlay
            // stays open and the parent SPA remains on the old authenticated page.
            // window.top navigates the entire browser tab, tearing down both iframe and SPA.
            const target = (typeof window !== 'undefined' && window.top) ? window.top : window;
            target.location.href = '/';
        } catch (error) {
            console.warn('Logout error:', error);
            // Even if there's an error, redirect anyway
            const target = (typeof window !== 'undefined' && window.top) ? window.top : window;
            target.location.href = '/';
        }
    };

    // Menu config
    const menuConfig = getMenuConfig('settings', user, {}, { onSignOut: () => handleLogout() });

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
                        return; // found user, done
                    }
                }
                // Fallback to legacy sb-* keys
                const sbKeys = Object.keys(localStorage || {}).filter(
                    k => k.startsWith('sb-') && k.endsWith('-auth-token')
                );
                if (sbKeys.length > 0) {
                    let tokenData = {};
                    try { tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}'); } catch { /* corrupted */ }
                    if (tokenData?.user) {
                        setLocalUser(tokenData.user);
                    }
                }
            } catch (e) {
                console.warn('[Settings] Error reading localStorage:', e);
            }
        }
    }, [contextUser]);

    // ── URL Deep-Link: Sync activeSection with ?section= query param ──
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const sectionParam = params.get('section');
        const validSections = ['account','notifications','privacy','appearance','display','gameplay','club_arena','promos','billing','blocked','data','delete'];
        if (sectionParam && validSections.includes(sectionParam)) {
            setActiveSection(sectionParam);
        }
    }, []);

    // Update URL when section changes (without page reload)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        url.searchParams.set('section', activeSection);
        window.history.replaceState({}, '', url.toString());
    }, [activeSection]);

    // Mobile responsive listener
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Settings State — persisted to localStorage for cross-reload survival
    const SETTINGS_DEFAULTS = {
        // Notifications
        emailNotifications: true,
        pushNotifications: true,
        soundEffects: true,
        tournamentAlerts: true,
        bountyAlerts: true,
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

        // Display & Sound
        fontSize: 'medium',
        animations: true,
        reduceMotion: false,
        notificationSounds: true,
        masterVolume: 80,
    };
    const [settings, setSettings] = useState(() => {
        if (typeof window === 'undefined') return SETTINGS_DEFAULTS;
        try {
            const cached = localStorage.getItem('sp-user-settings');
            if (cached) return { ...SETTINGS_DEFAULTS, ...JSON.parse(cached) };
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        return SETTINGS_DEFAULTS;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // TIER 3 REALTIME: Settings/Preferences Sync
    // ═══════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!user?.id) return;

        const loadSettings = async () => {
            // Load user's display preference AND app_settings from profiles table
            const { data: profile } = await supabase
                .from('profiles')
                .select('display_name_preference, app_settings')
                .eq('id', user.id)
                .maybeSingle();

            if (profile) {
                const dbSettings = profile.app_settings || {};
                setSettings(prev => ({
                    ...prev,
                    ...dbSettings,
                    display_name_preference: profile.display_name_preference || dbSettings.display_name_preference || 'full_name'
                }));
                // Also update localStorage cache with DB values
                try {
                    localStorage.setItem('sp-user-settings', JSON.stringify({ ...SETTINGS_DEFAULTS, ...dbSettings, display_name_preference: profile.display_name_preference || 'full_name' }));
                } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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
                await loadSettings();
                // Broadcast to other tabs (debounced to coalesce rapid profile changes)
                broadcastSyncDebounced('smarter_poker_settings_sync', { action: 'refresh_settings', tabId: BROADCAST_TAB_ID });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(settingsChannel);
        };
    }, [user?.id]);

    // Cross-tab Settings sync (with self-tab suppression)
    useEffect(() => {
        const cleanup = listenBroadcast('smarter_poker_settings_sync', (msg) => {
            // Support both legacy string payloads and new object payloads
            const isRefresh = msg === 'refresh_settings' || msg?.action === 'refresh_settings';
            const isSameTab = msg?.tabId === BROADCAST_TAB_ID;
            if (isRefresh && !isSameTab) {
                if (user?.id) {
                    supabase
                        .from('profiles')
                        .select('display_name_preference, app_settings')
                        .eq('id', user.id)
                        .maybeSingle()
                        .then(({ data: profile }) => {
                            if (profile) {
                                const dbSettings = profile.app_settings || {};
                                setSettings(prev => ({
                                    ...prev,
                                    ...dbSettings,
                                    display_name_preference: profile.display_name_preference || dbSettings.display_name_preference || 'full_name'
                                }));
                            }
                        });
                }
            }
        });
        return cleanup;
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
                .select('full_name, first_name, last_name, username, avatar_url, player_number')
                .eq('id', user.id)
                .maybeSingle()
                .then(({ data: profile }) => {
                    if (profile) {
                        setUserProfile(profile);
                        // SWR: Cache for instant render on next visit
                        try {
                            localStorage.setItem('sp-cached-settings-profile', JSON.stringify(profile));
                        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
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

            await fetch('/api/auth/sessions/track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAccessToken()}`
                },
                body: JSON.stringify({})
            });
        } catch (error) {
            console.warn('Error tracking session:', error);
        }
    };

    // Call setup API when 2FA modal opens
    useEffect(() => {
        if (show2FAModal && !twoFactorEnabled && !qrCode) {
            setup2FA();
        }
        // Phase 3: Clear MFA feedback and disable-confirm when modal opens fresh
        if (show2FAModal) {
            setMfaFeedback(null);
            setShowDisable2FAConfirm(false);
        }
    }, [show2FAModal]);

    const setup2FA = async () => {
        setLoadingMFA(true);
        try {

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
                setMfaFeedback(null);
            } else {
                setMfaFeedback({ type: 'error', message: 'Failed To Setup 2FA. Please Try Again.' });
            }
        } catch (error) {
            console.warn('Error setting up 2FA:', error);
            setMfaFeedback({ type: 'error', message: 'Error Setting Up 2FA. Check Your Connection.' });
        } finally {
            setLoadingMFA(false);
        }
    };

    const verify2FA = async () => {
        if (verificationCode.length !== 6) {
            setMfaFeedback({ type: 'error', message: 'Please Enter A Valid 6-Digit Code.' });
            return;
        }

        setLoadingMFA(true);
        try {

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
                setBackupCodes(data.backupCodes || []);
                setVerificationCode('');
                setMfaFeedback({ type: 'success', message: '2FA Enabled Successfully!' });
                // Backup codes are now displayed in the modal UI instead of alert
            } else {
                const error = await response.json().catch(() => ({}));
                setMfaFeedback({ type: 'error', message: error.error || 'Invalid Verification Code.' });
            }
        } catch (error) {
            console.warn('Error verifying 2FA:', error);
            setMfaFeedback({ type: 'error', message: 'Error Verifying 2FA. Please Try Again.' });
        } finally {
            setLoadingMFA(false);
        }
    };

    const disable2FA = async () => {
        // Now triggered by showDisable2FAConfirm confirmation UI instead of confirm()
        setShowDisable2FAConfirm(false);

        setLoadingMFA(true);
        try {

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
                setMfaFeedback({ type: 'success', message: '2FA Has Been Disabled.' });
            } else {
                setMfaFeedback({ type: 'error', message: 'Failed To Disable 2FA. Please Try Again.' });
            }
        } catch (error) {
            console.warn('Error disabling 2FA:', error);
            setMfaFeedback({ type: 'error', message: 'Error Disabling 2FA. Check Your Connection.' });
        } finally {
            setLoadingMFA(false);
        }
    };

    const updateSetting = async (key, value) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        // Persist all settings to localStorage (fast cache)
        try {
            localStorage.setItem('sp-user-settings', JSON.stringify(newSettings));
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // If posting name preference changed, immediately notify social media page
        // (social page listens for smarter_poker_settings_sync to recompute user.name)
        if (key === 'display_name_preference') {
            broadcastSyncDebounced('smarter_poker_settings_sync', { action: 'refresh_settings', tabId: BROADCAST_TAB_ID });
        }

        // Persist ALL settings to Supabase profiles.app_settings (cross-device)
        if (user?.id) {
            // Build the update payload — always save app_settings JSONB
            const updatePayload = { app_settings: newSettings };
            // If display_name_preference changed, also update the dedicated column
            if (key === 'display_name_preference') {
                updatePayload.display_name_preference = value;
            }
            const { error } = await supabase.from('profiles').update(updatePayload).eq('id', user.id);
            if (error) {
                console.warn('[Settings] Failed to save settings to DB:', error);
                // Revert optimistic update on failure
                if (key === 'display_name_preference') {
                    setSettings(prev => ({ ...prev, display_name_preference: prev.display_name_preference }));
                }
            }
        }

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };


    const exportData = async () => {
        if (!user?.id) {
            setExportFeedback({ type: 'error', message: 'Please Log In To Export Your Data.' });
            return;
        }
        setExportLoading(true);
        try {
            const [profileRes, settingsData, promoRes, avatarRes, clubsRes, ordersRes, vipRes, blockedRes] = await Promise.allSettled([
                // Use RPC because phone/email columns are blocked at the DB layer
                // for direct table SELECTs. RPC returns the user's own full row
                // including sensitive columns. Adapter normalizes the SETOF
                // result back to a single row for downstream consumers.
                supabase.rpc('get_my_full_profile').then(r => ({ ...r, data: Array.isArray(r.data) ? r.data[0] : r.data })),
                Promise.resolve(settings),
                supabase.from('promo_code_redemptions').select('*, promo_codes(code, description, reward_type, reward_value)').eq('user_id', user.id).order('redeemed_at', { ascending: false }),
                supabase.from('user_avatars').select('*').eq('user_id', user.id),
                supabase.from('club_members').select('club_id, role, joined_at').eq('user_id', user.id),
                supabase.from('orders').select('id, status, total_cents, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
                supabase.from('vip_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
                supabase.from('blocked_users').select('blocked_id, created_at').eq('blocker_id', user.id),
            ]);

            const exportPayload = {
                exported_at: new Date().toISOString(),
                user_id: user.id,
                email: user.email,
                profile: profileRes.status === 'fulfilled' ? profileRes.value.data : null,
                settings: settingsData.status === 'fulfilled' ? settingsData.value : settings,
                promo_history: promoRes.status === 'fulfilled' ? promoRes.value.data : [],
                avatars: avatarRes.status === 'fulfilled' ? avatarRes.value.data : [],
                club_memberships: clubsRes.status === 'fulfilled' ? clubsRes.value.data : [],
                orders: ordersRes.status === 'fulfilled' ? ordersRes.value.data : [],
                vip_subscription: vipRes.status === 'fulfilled' ? vipRes.value.data : null,
                blocked_users: blockedRes.status === 'fulfilled' ? blockedRes.value.data : [],
            };

            const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `smarter-poker-data-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setExportFeedback({ type: 'success', message: 'Data Exported Successfully!' });
            setTimeout(() => setExportFeedback(null), 4000);
        } catch (error) {
            console.warn('Error exporting data:', error);
            setExportFeedback({ type: 'error', message: 'Failed To Export Data. Please Try Again.' });
        } finally {
            setExportLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        try {
            if (!user?.id) {
                setDeleteFeedback({ type: 'error', message: 'Session Expired. Please Log In Again.' });
                return;
            }

            const response = await fetch('/api/auth/delete-account', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getAccessToken()}` }
            });

            if (response.ok) {
                await supabase.auth.signOut();
                // BUG FIX (same as handleLogout): clear all caches, then navigate window.top
                // so the parent window is torn down, not just the settings iframe.
                try { localStorage.removeItem('sp-social-user'); } catch (_) {}
                try { localStorage.removeItem('sp-vip-status'); } catch (_) {}
                try { localStorage.removeItem('sp-cached-header-user'); } catch (_) {}
                try { localStorage.removeItem('sp-cached-settings-profile'); } catch (_) {}
                try { localStorage.removeItem('sp-notif-count'); } catch (_) {}
                const target = (typeof window !== 'undefined' && window.top) ? window.top : window;
                target.location.href = '/';
            } else {
                const err = await response.json().catch(() => ({}));
                setDeleteFeedback({ type: 'error', message: err.error || err.details || 'Failed To Delete Account. Contact Support.' });
            }
        } catch (error) {
            console.warn('Error deleting account:', error);
            setDeleteFeedback({ type: 'error', message: 'An Error Occurred. Please Try Again Or Contact Support.' });
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
            console.warn('[Settings] Error loading promo history:', err);
        } finally {
            setPromoHistoryLoading(false);
        }
    };

    // Auto-load promo history when section is opened
    useEffect(() => {
        if (activeSection === 'promos' && user?.id && !promoHistoryLoaded) {
            loadPromoHistory().then(() => setPromoHistoryLoaded(true));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection, user?.id, promoHistoryLoaded]);

    // ── CLUB ARENA DATA (agent roles + commission rates) ──
    const [caRoles, setCaRoles] = useState(null);
    const [caRolesLoading, setCaRolesLoading] = useState(false);

    useEffect(() => {
        if (activeSection !== 'club_arena' || !user?.id) return;
        if (caRoles) return; // already loaded
        setCaRolesLoading(true);
        const load = async () => {
            try {
                // Load agent records, club memberships, and union memberships
                const [{ data: agentRows }, { data: memberRows }] = await Promise.all([
                    supabase.from('agents').select('id, role, commission_rate, is_prepaid, status, rakeback_percentage, club_id, clubs(name, club_id)').eq('user_id', user.id).limit(20),
                    supabase.from('club_members').select('role, club_id, clubs(name, club_id, union_id)').eq('user_id', user.id).limit(20),
                ]);
                // Union admin rows
                const { data: unionRows } = await supabase
                    .from('union_admins').select('role, union_id, unions(name, code)').eq('user_id', user.id).limit(10);
                setCaRoles({ agents: agentRows || [], members: memberRows || [], unionAdmins: unionRows || [] });
            } catch (e) {
                console.warn('[settings club_arena]', e);
                setCaRoles({ agents: [], members: [], unionAdmins: [] });
            } finally {
                setCaRolesLoading(false);
            }
        };
        load();
    }, [activeSection, user?.id, caRoles]);

    // ── BILLING DATA LOADER ──
    const loadBillingData = async () => {
        if (!user?.id) return;
        setBillingLoading(true);
        try {
            const headers = { 'Authorization': `Bearer ${getAccessToken()}` };

            // Fetch orders, transactions, VIP sub, and profile in parallel
            const [ordersRes, txRes, vipRes, profileRes] = await Promise.allSettled([
                supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
                fetch(`/api/store/diamond-transactions?limit=10`, { headers }).then(r => r.json()),
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
            console.warn('[Settings] Error loading billing data:', err);
        } finally {
            setBillingLoading(false);
            setBillingLoaded(true);
        }
    };

    // Auto-load billing data when section is opened (with dedup guard)
    useEffect(() => {
        if (activeSection === 'billing' && user?.id && !billingLoaded) {
            loadBillingData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSection, user?.id, billingLoaded]);

    // Load blocked users when section is activated
    useEffect(() => {
        if (activeSection === 'blocked' && user?.id && !blockedLoaded) {
            setBlockedLoading(true);
            getBlockedUsers(user.id).then(list => {
                setBlockedList(list || []);
                setBlockedLoading(false);
                setBlockedLoaded(true);
            }).catch(() => {
                setBlockedLoading(false);
                setBlockedLoaded(true);
            });
        }
    }, [activeSection, user?.id, blockedLoaded]);

    // Load notification preferences when section is activated
    useEffect(() => {
        if (activeSection === 'notifications' && user?.id && !notificationsLoaded) {
            supabase
                .from('user_notification_preferences')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle()
                .then(({ data }) => {
                    if (data) {
                        setNotificationPrefs(data);
                    } else {
                        // Create default row
                        supabase
                            .from('user_notification_preferences')
                            .insert({ user_id: user.id })
                            .select()
                            .maybeSingle()
                            .then(({ data: newPrefs }) => {
                                if (newPrefs) setNotificationPrefs(newPrefs);
                            });
                    }
                    setNotificationsLoaded(true);
                })
                .catch(err => console.warn('[Settings] Error loading notification prefs:', err));
        }
    }, [activeSection, user?.id, notificationsLoaded]);

    const updateNotificationPref = async (key, value) => {
        const newPrefs = { ...notificationPrefs, [key]: value };
        setNotificationPrefs(newPrefs); // Optimistic UI
        
        if (user?.id) {
            const { error } = await supabase
                .from('user_notification_preferences')
                .update({ [key]: value })
                .eq('user_id', user.id);
                
            if (error) {
                console.warn('[Settings] Failed to save push preference:', error);
                // Revert on failure
                setNotificationPrefs(prev => ({ ...prev, [key]: !value }));
            } else {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            }
        }
    };

    const redeemPromoCode = async () => {
        if (!promoCode.trim()) return;
        if (!user?.id) {
            setPromoResult({ success: false, message: 'Please Log In To Redeem A Promo Code.' });
            return;
        }
        setPromoLoading(true);
        setPromoResult(null);
        try {
            const res = await fetch('/api/promo/redeem', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAccessToken()}`
                },
                body: JSON.stringify({ code: promoCode.trim() })
            });
            const data = await res.json().catch(() => ({}));
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

    const sections = SETTINGS_SECTIONS;

    return (
        <PageTransition>
            <SEOHead
                title="Settings — Account & Preferences"
                description="Manage Your Smarter.Poker Account Settings, Preferences, Notifications, And Privacy Options."
                canonical="/hub/settings"
                noindex={true}
            >
                {/* Preconnect to Google Fonts for faster load, use font-display:swap to avoid FOIT */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </SEOHead>

            <div className="settings-page" style={styles.container}>
                {/* Background */}
                <div style={styles.bgGrid} />

                {/* Shared shimmer animation for loading skeletons */}
                <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

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
                    {saved && (
                        <span style={{
                            background: 'linear-gradient(135deg, #00ff88, #00cc66)',
                            padding: '8px 20px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#fff',
                        }}>
                            Saved
                        </span>
                    )}
                </div>

                {/* Layout */}
                <div style={{
                    ...styles.layout,
                    flexDirection: isMobile ? 'column' : 'row',
                }}>
                    {/* Sidebar */}
                    <nav style={{
                        ...styles.sidebar,
                        ...(isMobile ? {
                            width: '100%',
                            borderRight: 'none',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            padding: '12px 16px',
                            display: 'flex',
                            overflowX: 'auto',
                            gap: 8,
                            WebkitOverflowScrolling: 'touch',
                            msOverflowStyle: 'none',
                            scrollbarWidth: 'none',
                        } : {}),
                    }} role="tablist" aria-label="Settings sections">
                        {sections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                role="tab"
                                aria-selected={activeSection === section.id}
                                aria-controls={`settings-panel-${section.id}`}
                                style={{
                                    ...styles.sidebarItem,
                                    ...(activeSection === section.id ? styles.sidebarItemActive : {}),
                                    ...(isMobile ? {
                                        whiteSpace: 'nowrap',
                                        padding: '8px 16px',
                                        borderRadius: 20,
                                        marginBottom: 0,
                                        fontSize: 13,
                                        flexShrink: 0,
                                    } : {}),
                                }}
                            >
                                <span>{section.label}</span>
                            </button>
                        ))}

                        {!isMobile && <div style={styles.sidebarDivider} />}

                        <button onClick={handleLogout} style={{
                            ...styles.logoutButton,
                            ...(isMobile ? {
                                padding: '10px 16px',
                                fontSize: 13,
                                fontWeight: 600,
                                borderRadius: 8,
                                border: '1px solid rgba(255, 71, 87, 0.3)',
                                background: 'rgba(255, 71, 87, 0.1)',
                                whiteSpace: 'nowrap',
                                minWidth: 'auto',
                            } : {}),
                        }}>
                            <span>Log Out</span>
                        </button>
                    </nav>

                    {/* Content */}
                    <div style={styles.content} role="tabpanel" id={`settings-panel-${activeSection}`}>
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
                                                            onError={(e) => { e.target.style.display = 'none'; }}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        <div style={styles.profileInfo}>
                                            <span style={styles.profileName}>
                                                {initializing ? 'Loading...' : (
                                                    (userProfile?.first_name && userProfile?.last_name)
                                                        ? `${userProfile.first_name} ${userProfile.last_name}`
                                                        : userProfile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest User'
                                                )}
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
                                            const isActive = avatar && avatarData && avatar?.imageUrl === avatarData.image_url;
                                            const canCreate = isVip ? customAvatars.length < 5 : customAvatars.length < 1;

                                            return (
                                                <div
                                                    key={index}
                                                    onClick={async () => {
                                                        if (avatarData && !isActive) {
                                                            const result = await setActiveAvatar(avatarData.image_url, 'custom');
                                                            if (result.success) {
                                                                setSaved(true);
                                                                setTimeout(() => setSaved(false), 2000);
                                                            }
                                                        } else if (!avatarData && canCreate) {
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
                                                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
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
                                    <div style={{ marginBottom: 16 }}>
                                        <ReferralCrewCard />
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
                                            if (!user?.email || passwordResetStatus === 'sending') {
                                                if (!user?.email) setPasswordResetStatus('error');
                                                return;
                                            }
                                            setPasswordResetStatus('sending');
                                            try {
                                                const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                                                    // 2026-05-02 fix: was /hub/reset-auth which is
                                                    // an auth-clearing utility (signs the user out
                                                    // and clears localStorage — wrong destination).
                                                    // Route through /auth/callback so the recovery
                                                    // flow lands on /auth/reset-password.
                                                    redirectTo: `${window.location.origin}/auth/callback`
                                                });
                                                if (error) {
                                                    setPasswordResetStatus('error');
                                                } else {
                                                    setPasswordResetStatus('sent');
                                                }
                                            } catch (err) {
                                                console.warn('[Settings] Password reset error:', err);
                                                setPasswordResetStatus('error');
                                            }
                                            setTimeout(() => setPasswordResetStatus(null), 5000);
                                        }}
                                        disabled={passwordResetStatus === 'sending'}
                                        style={{
                                            ...styles.secondaryButton,
                                            opacity: passwordResetStatus === 'sending' ? 0.6 : 1,
                                            cursor: passwordResetStatus === 'sending' ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {passwordResetStatus === 'sending' ? 'Sending...' : 'Change Password'}
                                    </button>
                                    {passwordResetStatus === 'sent' && (
                                        <div style={{ padding: '8px 12px', marginBottom: 8, background: 'rgba(49, 162, 76, 0.15)', border: '1px solid rgba(49, 162, 76, 0.3)', borderRadius: 8, color: '#31A24C', fontSize: 13 }}>
                                            Password Reset Email Sent! Check Your Inbox.
                                        </div>
                                    )}
                                    {passwordResetStatus === 'error' && (
                                        <div style={{ padding: '8px 12px', marginBottom: 8, background: 'rgba(255, 71, 87, 0.15)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 8, color: '#ff4757', fontSize: 13 }}>
                                            Error Sending Password Reset Email. Please Try Again.
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setShow2FAModal(true)}
                                        style={styles.secondaryButton}
                                    >
                                        {twoFactorEnabled ? ' 2FA Enabled' : 'Enable 2FA'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setShowDevicesModal(true);
                                            setDevicesLoading(true);
                                            // Load connected devices from API
                                            try {
                                                if (!user?.id) return;

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
                                                console.warn('Error loading devices:', err);
                                            } finally {
                                                setDevicesLoading(false);
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
                                    <div style={{ padding: '0 0 16px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#fff' }}>Global Base Settings</h3>
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
                                    </div>

                                    <div style={{ paddingTop: '8px' }}>
                                        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#fff' }}>Detailed Alert Preferences</h3>
                                        <Toggle
                                            label="Tournament Reminders"
                                            description="Get Notified When Your Registered Flights Are Starting"
                                            value={notificationPrefs.tournament_reminders}
                                            onChange={(v) => updateNotificationPref('tournament_reminders', v)}
                                        />
                                        <Toggle
                                            label="Venue Activity Alerts"
                                            description="Updates When Games Fire At Favorited Venues"
                                            value={notificationPrefs.venue_alerts}
                                            onChange={(v) => updateNotificationPref('venue_alerts', v)}
                                        />
                                        <Toggle
                                            label="Social Mentions"
                                            description="When Someone Likes Or Replies To Your Content"
                                            value={notificationPrefs.social_mentions}
                                            onChange={(v) => updateNotificationPref('social_mentions', v)}
                                        />
                                        <Toggle
                                            label="Friend Activity"
                                            description="When Friends Register For Tournaments Or Log In"
                                            value={notificationPrefs.friend_activity}
                                            onChange={(v) => updateNotificationPref('friend_activity', v)}
                                        />
                                        <Toggle
                                            label="Messenger Alerts"
                                            description="New Direct Messages"
                                            value={notificationPrefs.messenger_alerts}
                                            onChange={(v) => updateNotificationPref('messenger_alerts', v)}
                                        />
                                        <Toggle
                                            label="Daily Challenges"
                                            description="New Missions And Challenge Completions"
                                            value={notificationPrefs.daily_challenges}
                                            onChange={(v) => updateNotificationPref('daily_challenges', v)}
                                        />
                                        <Toggle
                                            label="Diamond Rewards"
                                            description="Bounties And Diamond Economy Updates"
                                            value={notificationPrefs.diamond_rewards}
                                            onChange={(v) => updateNotificationPref('diamond_rewards', v)}
                                        />
                                        <Toggle
                                            label="Club Updates"
                                            description="Announcements From Clubs You Are A Member Of"
                                            value={notificationPrefs.club_updates}
                                            onChange={(v) => updateNotificationPref('club_updates', v)}
                                        />
                                        <Toggle
                                            label="Live Stream Notifications"
                                            description="Get Notified When Friends Or People You Follow Go Live"
                                            value={notificationPrefs.live_notifications}
                                            onChange={(v) => updateNotificationPref('live_notifications', v)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'privacy' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Privacy Settings</h2>

                                <div style={styles.card}>
                                    <Select
                                        label="Social Media Posting Name"
                                        value={settings.display_name_preference || 'full_name'}
                                        onChange={(v) => updateSetting('display_name_preference', v)}
                                        options={[
                                            { value: 'full_name', label: 'Full Name (e.g., Dan Bekavac) — Default' },
                                            { value: 'username', label: 'Poker Alias (e.g., KingFish)' },
                                        ]}
                                    />
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: -8, marginBottom: 16, paddingLeft: 4 }}>
                                        Choose The Name That Appears As "Posting As" When You Create Posts And Comments
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
                                            value={localVolume !== null ? localVolume : (settings.masterVolume || 50)}
                                            onChange={(e) => setLocalVolume(parseInt(e.target.value))}
                                            onPointerUp={() => { if (localVolume !== null) { updateSetting('masterVolume', localVolume); setLocalVolume(null); } }}
                                            onTouchEnd={() => { if (localVolume !== null) { updateSetting('masterVolume', localVolume); setLocalVolume(null); } }}
                                            style={styles.slider}
                                            aria-label="Master Volume"
                                            aria-valuetext={`${localVolume !== null ? localVolume : (settings.masterVolume || 50)}%`}
                                        />
                                        <span style={styles.volumeLabel}>{localVolume !== null ? localVolume : (settings.masterVolume || 50)}%</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Billing & Payments Section */}
                        {activeSection === 'billing' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Billing & Payments</h2>

                                {billingLoading ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                        {[1, 2, 3].map(i => (
                                            <div key={i} style={{
                                                background: '#242526',
                                                border: '1px solid #3a3b3c',
                                                borderRadius: 12,
                                                padding: 28,
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                    <div style={{
                                                        height: 16, width: i === 1 ? '60%' : i === 2 ? '40%' : '70%',
                                                        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                                                        backgroundSize: '200% 100%',
                                                        animation: 'shimmer 1.5s infinite',
                                                        borderRadius: 8,
                                                    }} />
                                                    <div style={{
                                                        height: 12, width: i === 1 ? '40%' : i === 2 ? '55%' : '30%',
                                                        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                                                        backgroundSize: '200% 100%',
                                                        animation: 'shimmer 1.5s infinite',
                                                        borderRadius: 8,
                                                    }} />
                                                    {i === 3 && <div style={{
                                                        height: 40, width: '100%',
                                                        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                                                        backgroundSize: '200% 100%',
                                                        animation: 'shimmer 1.5s infinite',
                                                        borderRadius: 8,
                                                        marginTop: 4,
                                                    }} />}
                                                </div>
                                            </div>
                                        ))}

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
                                                                setCancelFeedback(null);
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
                                            onKeyDown={(e) => e.key === 'Enter' && !promoLoading && redeemPromoCode()}
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
                                                {promoResult.success ? '✅' : '❌'}
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

                        {/* Club Arena Section */}
                        {activeSection === 'club_arena' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Club Arena</h2>
                                <p style={{ fontSize: 13, color: '#B0B3B8', marginBottom: 20 }}>
                                    Your roles, commission levels, and club memberships across Club Arena.
                                    Commission rates are set by your club owner or union lead and are read-only here.
                                </p>

                                {caRolesLoading && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {[1, 2].map(i => (
                                            <div key={i} style={{
                                                background: '#242526',
                                                border: '1px solid #3a3b3c',
                                                borderRadius: 12,
                                                padding: 20,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{
                                                            height: 16, width: i === 1 ? '50%' : '65%',
                                                            background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                                                            backgroundSize: '200% 100%',
                                                            animation: 'shimmer 1.5s infinite',
                                                            borderRadius: 8, marginBottom: 8,
                                                        }} />
                                                        <div style={{
                                                            height: 12, width: '30%',
                                                            background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                                                            backgroundSize: '200% 100%',
                                                            animation: 'shimmer 1.5s infinite',
                                                            borderRadius: 8,
                                                        }} />
                                                    </div>
                                                    <div style={{
                                                        height: 28, width: 80,
                                                        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                                                        backgroundSize: '200% 100%',
                                                        animation: 'shimmer 1.5s infinite',
                                                        borderRadius: 14,
                                                    }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {caRoles && !caRolesLoading && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        {/* Agent roles */}
                                        {caRoles.agents.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Agent Roles</div>
                                                {caRoles.agents.map(agent => {
                                                    const roleLabel = { super_agent: 'Super Agent', agent: 'Agent', sub_agent: 'Sub Agent' }[agent.role] || agent.role;
                                                    const roleColor = { super_agent: '#F7C52A', agent: '#2374E1', sub_agent: '#A855F7' }[agent.role] || '#2374E1';
                                                    return (
                                                        <div key={agent.id} style={{ background: '#242526', borderRadius: 10, padding: '14px 16px', marginBottom: 8, border: '1px solid #3E4042' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                                                                <div>
                                                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB', marginBottom: 4 }}>
                                                                        {agent.clubs?.name || 'Unknown Club'}
                                                                        {agent.clubs?.club_id && <span style={{ fontSize: 12, color: '#B0B3B8', marginLeft: 8 }}>#{agent.clubs.club_id}</span>}
                                                                    </div>
                                                                    <span style={{ fontSize: 11, fontWeight: 700, color: roleColor, background: `${roleColor}22`, padding: '2px 8px', borderRadius: 4 }}>
                                                                        {roleLabel}
                                                                    </span>
                                                                </div>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <div style={{ fontSize: 12, color: '#B0B3B8', marginBottom: 2 }}>Commission Rate</div>
                                                                    <div style={{ fontSize: 20, fontWeight: 900, color: '#F7C52A' }}>
                                                                        {((agent.commission_rate || 0) * 100).toFixed(0)}%
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#B0B3B8', flexWrap: 'wrap' }}>
                                                                <span>Payment type: <strong style={{ color: agent.is_prepaid ? '#31A24C' : '#ea580c' }}>{agent.is_prepaid ? 'Prepaid' : 'Credit'}</strong></span>
                                                                <span>Status: <strong style={{ color: agent.status === 'active' ? '#31A24C' : '#FA383E' }}>{agent.status}</strong></span>
                                                                {(agent.rakeback_percentage || 0) > 0 && (
                                                                    <span>Player rakeback you can offer: <strong style={{ color: '#2374E1' }}>{((agent.rakeback_percentage || 0) * 100).toFixed(0)}%</strong></span>
                                                                )}
                                                            </div>
                                                            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(247,197,42,0.06)', borderRadius: 8, border: '1px solid rgba(247,197,42,0.15)', fontSize: 12, color: '#B0B3B8' }}>
                                                                Agents earn commission by selling chips to players. Your commission rate is set by the club owner.
                                                                Sub-agents have lower rates than their parent agent.
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Club memberships (non-agent) */}
                                        {caRoles.members.filter(m => m.role !== 'agent' && m.role !== 'sub_agent').length > 0 && (
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Club Memberships</div>
                                                {caRoles.members.filter(m => m.role !== 'agent' && m.role !== 'sub_agent').map((mem, i) => (
                                                    <div key={i} style={{ background: '#242526', borderRadius: 10, padding: '12px 16px', marginBottom: 8, border: '1px solid #3E4042', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div>
                                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>
                                                                {mem.clubs?.name || 'Unknown Club'}
                                                            </div>
                                                            <div style={{ fontSize: 12, color: '#B0B3B8', marginTop: 2 }}>Role: {mem.role || 'member'}</div>
                                                        </div>
                                                        {mem.clubs?.union_id && (
                                                            <div style={{ fontSize: 11, color: '#2374E1', background: 'rgba(35,116,225,0.1)', padding: '2px 8px', borderRadius: 4 }}>In Union</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Union admin roles */}
                                        {caRoles.unionAdmins.length > 0 && (
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Union Roles</div>
                                                {caRoles.unionAdmins.map((ua, i) => (
                                                    <div key={i} style={{ background: '#242526', borderRadius: 10, padding: '12px 16px', marginBottom: 8, border: '1px solid #3E4042', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div>
                                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#E4E6EB' }}>{ua.unions?.name || 'Unknown Union'}</div>
                                                            <div style={{ fontSize: 12, color: '#B0B3B8', marginTop: 2 }}>Code: {ua.unions?.code || '--'}</div>
                                                        </div>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: ua.role === 'union_lead' ? '#F7C52A' : '#2374E1', background: ua.role === 'union_lead' ? 'rgba(247,197,42,0.12)' : 'rgba(35,116,225,0.12)', padding: '3px 10px', borderRadius: 4 }}>
                                                            {ua.role === 'union_lead' ? 'Union Lead' : 'Union Admin'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {caRoles.agents.length === 0 && caRoles.members.filter(m => m.role !== 'agent').length === 0 && caRoles.unionAdmins.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: 40, color: '#B0B3B8', fontSize: 13, border: '1px dashed #3E4042', borderRadius: 10 }}>
                                                You are not currently a member of any Club Arena club, union, or agent network.
                                            </div>
                                        )}

                                        {/* Commission structure explanation */}
                                        <div style={{ background: 'rgba(35,116,225,0.07)', borderRadius: 10, padding: 16, border: '1px solid rgba(35,116,225,0.2)', fontSize: 12, color: '#B0B3B8', lineHeight: 1.6 }}>
                                            <div style={{ fontWeight: 700, color: '#E4E6EB', marginBottom: 8 }}>Commission Structure</div>
                                            <div style={{ marginBottom: 4 }}>Clubs receive a share of rake collected at their tables, determined by the union commission rate.</div>
                                            <div style={{ marginBottom: 4 }}>Super Agents have the highest commission tier and can have Agents under them.</div>
                                            <div style={{ marginBottom: 4 }}>Agents earn commission on rake from players they bring in. Sub-agents have lower rates than their parent agent.</div>
                                            <div>Cashouts are handled at the player level only. Clubs and unions settle with each other off-platform. Agents are paid by selling their chips to players directly.</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Blocked Users Section */}
                        {activeSection === 'blocked' && (
                            <div style={styles.section}>
                                <h2 style={styles.sectionTitle}>Blocked Users</h2>

                                <div style={styles.card}>
                                    {blockedLoading ? (
                                        <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading Blocked Users...</div>
                                    ) : blockedList.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>&#x2714;</div>
                                            <div style={{ fontSize: 16, fontWeight: 600, color: '#e4e6eb', marginBottom: 8 }}>No Blocked Users</div>
                                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 300, margin: '0 auto' }}>
                                                You haven't blocked anyone. Users you block will appear here.
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {blockedList.map(entry => (
                                                <div key={entry.blocked_id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 14,
                                                    padding: '14px 16px', background: 'rgba(255,255,255,0.03)',
                                                    borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
                                                }}>
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: '50%',
                                                        background: 'linear-gradient(135deg, #3a3b3c, #4e4f50)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        overflow: 'hidden', flexShrink: 0,
                                                    }}>
                                                        {entry.blocked?.avatar_url ? (
                                                            <img src={entry.blocked.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: 600 }}>
                                                                {(entry.blocked?.full_name || entry.blocked?.username || '?')[0].toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#e4e6eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {entry.blocked?.full_name || entry.blocked?.username || 'Unknown User'}
                                                        </div>
                                                        {entry.blocked?.username && (
                                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>@{entry.blocked.username}</div>
                                                        )}
                                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                                                            Blocked {entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            setUnblockingId(entry.blocked_id);
                                                            try {
                                                                await unblockUser(user.id, entry.blocked_id);
                                                                setBlockedList(prev => prev.filter(b => b.blocked_id !== entry.blocked_id));
                                                            } catch (err) {
                                                                console.warn('[Settings] Unblock failed:', err);
                                                            } finally {
                                                                setUnblockingId(null);
                                                            }
                                                        }}
                                                        disabled={unblockingId === entry.blocked_id}
                                                        style={{
                                                            padding: '8px 16px',
                                                            background: unblockingId === entry.blocked_id ? 'rgba(255,255,255,0.05)' : 'rgba(255, 71, 87, 0.12)',
                                                            border: '1px solid rgba(255, 71, 87, 0.3)',
                                                            borderRadius: 8,
                                                            color: '#ff4757',
                                                            fontSize: 12, fontWeight: 600,
                                                            cursor: unblockingId === entry.blocked_id ? 'wait' : 'pointer',
                                                            opacity: unblockingId === entry.blocked_id ? 0.5 : 1,
                                                            transition: 'all 0.2s ease',
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        {unblockingId === entry.blocked_id ? 'Unblocking...' : 'Unblock'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
                                        Download A Copy Of Your Smarter.Poker Data Including Your Profile, Settings, Promo History, Avatars, Club Memberships, Orders, VIP Status, And Blocked Users.
                                    </p>
                                    <button
                                        onClick={exportData}
                                        disabled={exportLoading}
                                        style={{
                                            ...styles.exportButton,
                                            opacity: exportLoading ? 0.6 : 1,
                                            cursor: exportLoading ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {exportLoading ? 'Compiling Data...' : 'Download My Data'}
                                    </button>
                                    {exportFeedback && (
                                        <div style={{ padding: '8px 12px', marginTop: 8, background: exportFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${exportFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: exportFeedback.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                            {exportFeedback.message}
                                        </div>
                                    )}
                                    <p style={styles.helperText}>
                                        Your data will be downloaded as a JSON file immediately.
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
                                            setShowDeleteModal(true);
                                            setDeleteConfirmText('');
                                            setDeleteFeedback(null);
                                        }}
                                        style={styles.deleteButton}
                                    >
                                        Delete My Account
                                    </button>
                                </div>
                            </div>
                        )}


                    </div>
                </div>
            </div>

            {/* VIP Cancellation Modal */}
            {showCancelModal && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowCancelModal(false); setCancelFeedback(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowCancelModal(false); setCancelFeedback(null); } }}
                    tabIndex={-1}
                    style={{
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
                                onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
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
                                            onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
                                            style={{
                                                flex: 1,
                                                padding: '14px 20px',
                                                background: 'rgba(255, 255, 255, 0.08)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                borderRadius: 20,
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
                                                borderRadius: 20,
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
                                                borderRadius: 20,
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
                                                    const cancelRes = await fetch('/api/store/cancel-vip', {
                                                        method: 'POST',
                                                        headers: {
                                                            'Content-Type': 'application/json',
                                                            'Authorization': `Bearer ${getAccessToken()}`
                                                        },
                                                        body: JSON.stringify({
                                                            userId: user?.id,
                                                            reason: cancelReason,
                                                            reasonText: cancelReason === 'other' ? cancelOtherText : '',
                                                        }),
                                                    });
                                                    if (cancelRes.ok) {
                                                        setCancelStep('confirmed');
                                                    } else {
                                                        const errData = await cancelRes.json().catch(() => ({}));
                                                        setCancelFeedback({ type: 'error', message: errData.error || 'Failed To Cancel Membership. Please Try Again.' });
                                                    }
                                                } catch (err) {
                                                    console.warn('Cancel VIP error:', err);
                                                    setCancelFeedback({ type: 'error', message: 'Something Went Wrong. Please Try Again.' });
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
                                                borderRadius: 20,
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

                                    {/* Phase 2: VIP cancel inline feedback */}
                                    {cancelFeedback && (
                                        <div style={{ padding: '8px 12px', marginTop: 12, background: cancelFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${cancelFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: cancelFeedback.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                            {cancelFeedback.message}
                                        </div>
                                    )}
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
                                        onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
                                        style={{
                                            padding: '14px 40px',
                                            background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                            border: 'none',
                                            borderRadius: 20,
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
                                        onClick={() => { setShowCancelModal(false); setCancelFeedback(null); }}
                                        style={{
                                            padding: '14px 40px',
                                            background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                            border: 'none',
                                            borderRadius: 20,
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
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setShowAvatarBuilder(false); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setShowAvatarBuilder(false); }}
                    tabIndex={-1}
                    style={{
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
                    <style>{`body { overflow: hidden; }`}</style>
                    <button
                        onClick={() => setShowAvatarBuilder(false)}
                        style={{
                            position: 'fixed',
                            top: '20px',
                            right: '20px',
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: 'none',
                            borderRadius: '20px',
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
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShow2FAModal(false); setVerificationCode(''); setMfaFeedback(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShow2FAModal(false); setVerificationCode(''); setMfaFeedback(null); } }}
                    tabIndex={-1}
                    style={{
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
                                    onKeyDown={(e) => { if (e.key === 'Enter' && verificationCode.length === 6) verify2FA(); }}
                                    autoFocus
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
                                            borderRadius: 20,
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
                                            setMfaFeedback(null);
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>

                                {/* Phase 2: MFA inline feedback banner */}
                                {mfaFeedback && (
                                    <div style={{ padding: '8px 12px', marginTop: 12, background: mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: mfaFeedback.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                        {mfaFeedback.message}
                                    </div>
                                )}

                                {/* Backup Codes Display — shown after successful 2FA verify */}
                                {backupCodes.length > 0 && (
                                    <div style={{
                                        background: 'rgba(0, 212, 255, 0.08)',
                                        border: '1px solid rgba(0, 212, 255, 0.25)',
                                        borderRadius: 12,
                                        padding: 20,
                                        marginTop: 16,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <h4 style={{ color: '#00D4FF', fontSize: 14, fontWeight: 700, margin: 0 }}>Backup Codes</h4>
                                            <button
                                                onClick={() => {
                                                    try { navigator.clipboard.writeText(backupCodes.join('\n')); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
                                                    setBackupCodesCopied(true);
                                                    setTimeout(() => setBackupCodesCopied(false), 2000);
                                                }}
                                                style={{ padding: '4px 12px', background: backupCodesCopied ? 'rgba(49, 162, 76, 0.2)' : 'rgba(0, 212, 255, 0.15)', border: `1px solid ${backupCodesCopied ? 'rgba(49, 162, 76, 0.4)' : 'rgba(0, 212, 255, 0.3)'}`, borderRadius: 20, color: backupCodesCopied ? '#31A24C' : '#00D4FF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                {backupCodesCopied ? 'Copied!' : 'Copy All'}
                                            </button>
                                        </div>
                                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 12 }}>Save these codes in a safe place. Each can be used once if you lose access to your authenticator app.</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                            {backupCodes.map((code, i) => (
                                                <div key={i} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, color: '#fff', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}>{code}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
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

                                {!showDisable2FAConfirm ? (
                                    <button
                                        onClick={() => setShowDisable2FAConfirm(true)}
                                        disabled={loadingMFA}
                                        style={{
                                            width: '100%',
                                            padding: '12px 24px',
                                            background: loadingMFA ? '#999' : '#ff4757',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: loadingMFA ? 'not-allowed' : 'pointer',
                                            marginBottom: 12
                                        }}
                                    >
                                        {loadingMFA ? 'Disabling...' : 'Disable 2FA'}
                                    </button>
                                ) : (
                                    <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 12 }}>Are you sure? This will make your account less secure.</p>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button onClick={disable2FA} disabled={loadingMFA} style={{ flex: 1, padding: '10px', background: '#ff4757', border: 'none', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                                {loadingMFA ? 'Disabling...' : 'Yes, Disable'}
                                            </button>
                                            <button onClick={() => setShowDisable2FAConfirm(false)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                                Keep Enabled
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => { setShow2FAModal(false); setMfaFeedback(null); }}
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

                                {/* Phase 2: MFA inline feedback (enabled state) */}
                                {mfaFeedback && (
                                    <div style={{ padding: '8px 12px', marginTop: 12, background: mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${mfaFeedback.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: mfaFeedback.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                        {mfaFeedback.message}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Connected Devices Modal */}
            {showDevicesModal && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowDevicesModal(false); setRevokeDeviceTarget(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowDevicesModal(false); setRevokeDeviceTarget(null); } }}
                    tabIndex={-1}
                    style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
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

                        {devicesLoading ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <div style={{ width: 40, height: 40, border: '3px solid rgba(0, 212, 255, 0.2)', borderTop: '3px solid #00D4FF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading Devices...</p>
                            </div>
                        ) : connectedDevices.length === 0 ? (
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
                                                onClick={() => setRevokeDeviceTarget(device)}
                                                style={{
                                                    padding: '8px 16px',
                                                    background: '#ff4757',
                                                    border: 'none',
                                                    borderRadius: 20,
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

                        {/* Device Revoke Confirmation */}
                        {revokeDeviceTarget && (
                            <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 12 }}>
                                    Revoke access for <strong style={{ color: '#fff' }}>{revokeDeviceTarget.device_name || 'this device'}</strong>?
                                </p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={async () => {
                                            try {
                                                if (!user?.id) return;
                                                const response = await fetch('/api/auth/sessions/revoke', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAccessToken()}` },
                                                    body: JSON.stringify({ sessionId: revokeDeviceTarget.id })
                                                });
                                                if (response.ok) {
                                                    setConnectedDevices(prev => prev.filter(d => d.id !== revokeDeviceTarget.id));
                                                } else {
                                                    console.warn('Failed to revoke session');
                                                }
                                            } catch (err) {
                                                console.warn('Error revoking session:', err);
                                            } finally {
                                                setRevokeDeviceTarget(null);
                                            }
                                        }}
                                        style={{ flex: 1, padding: '10px', background: '#ff4757', border: 'none', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Yes, Revoke
                                    </button>
                                    <button
                                        onClick={() => setRevokeDeviceTarget(null)}
                                        style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => { setShowDevicesModal(false); setRevokeDeviceTarget(null); }}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: 20,
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

            {/* Delete Account Confirmation Modal */}
            {showDeleteModal && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteModal(false); setDeleteConfirmText(''); setDeleteFeedback(null); } }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { setShowDeleteModal(false); setDeleteConfirmText(''); setDeleteFeedback(null); } }}
                    tabIndex={-1}
                    style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.9)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20,
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        borderRadius: 16,
                        padding: 32,
                        maxWidth: 480,
                        width: '100%',
                        border: '1px solid rgba(255, 71, 87, 0.3)',
                        boxShadow: '0 20px 60px rgba(255, 71, 87, 0.15)',
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'rgba(255, 71, 87, 0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px',
                                border: '2px solid rgba(255, 71, 87, 0.3)',
                            }}>
                                <span style={{ fontSize: 28, color: '#ff4757' }}>X</span>
                            </div>
                            <h2 style={{ color: '#ff4757', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                                Delete Your Account?
                            </h2>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6 }}>
                                This action is permanent and cannot be undone. All your data, posts, training progress, diamonds, and VIP status will be permanently erased.
                            </p>
                        </div>

                        <div style={{
                            background: 'rgba(255, 71, 87, 0.08)',
                            border: '1px solid rgba(255, 71, 87, 0.2)',
                            borderRadius: 10,
                            padding: 16,
                            marginBottom: 20,
                        }}>
                            <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
                                Type <strong style={{ color: '#ff4757' }}>DELETE</strong> to confirm:
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                                placeholder="Type DELETE here"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: deleteConfirmText === 'DELETE'
                                        ? '2px solid #ff4757'
                                        : '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: 8,
                                    color: '#fff',
                                    fontSize: 16,
                                    fontFamily: 'Orbitron, monospace',
                                    letterSpacing: 4,
                                    textAlign: 'center',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {deleteFeedback && (
                            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(255, 71, 87, 0.15)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 8, color: '#ff4757', fontSize: 13 }}>
                                {deleteFeedback.message}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                onClick={async () => {
                                    if (deleteConfirmText !== 'DELETE') return;
                                    setDeleteLoading(true);
                                    try {
                                        await handleDeleteAccount();
                                    } finally {
                                        // Only reached on error — success navigates away
                                        setDeleteLoading(false);
                                    }
                                }}
                                disabled={deleteConfirmText !== 'DELETE' || deleteLoading}
                                style={{
                                    flex: 1,
                                    padding: '14px 24px',
                                    background: deleteConfirmText === 'DELETE' && !deleteLoading
                                        ? '#ff4757'
                                        : 'rgba(255, 71, 87, 0.2)',
                                    border: 'none',
                                    borderRadius: 20,
                                    color: deleteConfirmText === 'DELETE' && !deleteLoading
                                        ? '#fff'
                                        : 'rgba(255,255,255,0.4)',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: deleteConfirmText === 'DELETE' && !deleteLoading
                                        ? 'pointer'
                                        : 'not-allowed',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setDeleteConfirmText('');
                                    setDeleteFeedback(null);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '14px 24px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                    borderRadius: 20,
                                    color: '#fff',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
              <BottomNavBar />
    </PageTransition>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
