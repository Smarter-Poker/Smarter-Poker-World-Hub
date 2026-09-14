/**
 * TRIVIA HUB - Main lobby page
 * Route: /hub/trivia
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { useAvatar } from '../../../src/contexts/AvatarContext';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import PullToRefresh from '../../../src/components/ui/PullToRefresh';
import { useLoadFailsafe } from '../../../src/hooks/useLoadFailsafe';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useOnlineStatus, OFFLINE_TOAST } from '../../../src/hooks/useOnlineStatus';
import toast from '../../../src/stores/toastStore';
import TriviaLobby from '../../../src/components/trivia/TriviaLobby';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getTriviaPreferences, updateTriviaPreferences } from '../../../src/services/triviaPreferences';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import styles from '../../../src/styles/trivia/TriviaHub.module.css';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import { isTriviaPvpReleased } from '../../../src/lib/trivia/pvpReleaseControl.mjs';
import { areTriviaTournamentsReleased } from '../../../src/lib/trivia/tournamentReleaseControl.mjs';

const GAME_SETTINGS_KEY = 'trivia_settings';

function mirrorGamePreference(key, value) {
    if (typeof window === 'undefined') return;
    if (key === 'soundEffects') triviaAudio.setMuted(!value);
    try {
        const existing = JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY) || '{}') || {};
        const gameKey = key === 'soundEffects' ? 'audio' : key;
        localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify({ ...existing, [gameKey]: value }));
    } catch (error) {
        console.warn('[TriviaHub] Could not mirror game preference:', error);
    }
}

export default function TriviaHubPage({ modeAvailability }) {
    useTrainingBus('trivia-hub');
    const { user, loading: authLoading } = useAvatar();
    const userId = user?.id;
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [isVip, setIsVip] = useState(false);
    const [dailyCompleted, setDailyCompleted] = useState(false);
    const [currentStreak, setCurrentStreak] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);

    /* MOBILE PHASE 7 (docs/mobile-standard): the phase 0a set. The skeleton
       is capped at eight seconds, a pull at the top re-reads the balance,
       daily state and streak, and starting a game while offline says so
       instead of routing into a page that cannot load. */
    useLoadFailsafe(isLoading, setIsLoading);
    const haptic = useHaptics();
    const online = useOnlineStatus();
    const requireOnline = useCallback(() => {
        if (online) return true;
        toast.error(OFFLINE_TOAST);
        return false;
    }, [online]);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        soundEffects: true,
        timerEnabled: true,
        hintsEnabled: false,
    });

    // Load preferences from localStorage on mount.
    // Phase 71: track unmount via ref so the resolved-after-unmount setState
    // doesn't fire on a dead component (React 18 warning).
    useEffect(() => {
        let cancelled = false;
        if (userId) {
            getTriviaPreferences(userId)
                .then(p => {
                    if (cancelled) return;
                    setPreferences(p);
                    Object.entries(p || {}).forEach(([key, value]) => mirrorGamePreference(key, value));
                })
                .catch(e => console.warn('[TriviaHub] Failed to load prefs:', e));
        }
        return () => { cancelled = true; };
    }, [userId]);

    // Phase 71: rollback on save failure so local state doesn't drift from
    // server. User toggling a preference shouldn't see it 'stick' locally
    // while the server actually has the old value (next page load reverts).
    // Resolves true when the value is durable, false when the server rejected it
    // (callers that keep a second copy of the value need to roll theirs back too).
    const updatePreference = useCallback(async (key, value) => {
        const previousValue = preferences[key];
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);
        mirrorGamePreference(key, value);

        if (userId) {
            try {
                await updateTriviaPreferences(userId, { [key]: value });
            } catch (error) {
                console.warn('Failed to save preference, reverting:', error);
                setPreferences(prev => ({ ...prev, [key]: previousValue }));
                mirrorGamePreference(key, previousValue);
                return false;
            }
        }
        return true;
    }, [preferences, userId]);

    const menuConfig = getMenuConfig('trivia', user, {
        ...preferences,
        timerEnabled: preferences.timerEnabled,
        hintsEnabled: preferences.hintsEnabled,
    }, {
        setSoundEffects: (val) => updatePreference('soundEffects', val),
        setShowHints: (val) => updatePreference('hintsEnabled', val),
        setHintsEnabled: (val) => updatePreference('hintsEnabled', val),
        setTimerEnabled: (val) => updatePreference('timerEnabled', val),
    });

    // Using existing supabase instance from lib

    const loadUserData = useCallback(async () => {
        if (!userId) {
            // Wait for auth to populate or fail
            if (!authLoading) {
                setUserDiamonds(0);
                setIsVip(false);
                setDailyCompleted(false);
                setCurrentStreak(0);
                setIsLoading(false);
            }
            return;
        }
        try {
            const today = getTodayCST();

            // Run the three independent reads in parallel — was three
            // sequential awaits, ~2 extra round trips before the lobby showed.
            const [profileRes, dailyPlayRes, streakRes] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('diamonds, is_vip')
                    .eq('id', userId)
                    .maybeSingle(),
                // NOTE: multiple daily_trivia_plays rows per (user, date) are
                // possible (replays), so .maybeSingle() errored with 2+ rows
                // and the lobby re-offered an already-completed daily. Use
                // .limit(1) like [mode].js does.
                supabase
                    .from('daily_trivia_plays')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('played_date', today)
                    .limit(1),
                supabase
                    .from('trivia_streaks')
                    .select('current_streak')
                    .eq('user_id', userId)
                    .maybeSingle(),
            ]);

            const readErrors = [profileRes?.error, dailyPlayRes?.error, streakRes?.error].filter(Boolean);
            if (readErrors.length > 0) {
                throw new Error(readErrors.map(error => error.message || String(error)).join('; '));
            }

            const profile = profileRes?.data;
            if (profile) {
                setUserDiamonds(profile.diamonds || 0);
                setIsVip(profile.is_vip === true);
            }

            const dailyPlay = dailyPlayRes?.data;
            setDailyCompleted(!!(dailyPlay && dailyPlay.length > 0));

            const streakData = streakRes?.data;
            if (streakData) {
                setCurrentStreak(streakData.current_streak || 0);
            }
        } catch (error) {
            console.warn('Error loading user data:', error);
        }
        setIsLoading(false);
    }, [userId, authLoading]);

    useEffect(() => {
        loadUserData();
    }, [loadUserData]);

    // 🚌 BUS LISTENER: Keep diamond balance in sync with other pages via EventBus
    useEffect(() => {
        const handleBalanceRefresh = () => { loadUserData(); };
        const unsubEarned = eventBus.on(EventType.DIAMONDS_EARNED, handleBalanceRefresh);
        const unsubSpent = eventBus.on(EventType.DIAMONDS_SPENT, handleBalanceRefresh);
        return () => { unsubEarned(); unsubSpent(); };
    }, [loadUserData]);

    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`trivia-hub:${user?.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_trivia_plays', filter: `user_id=eq.${user?.id}` }, () => { loadUserData(); })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trivia_streaks', filter: `user_id=eq.${user?.id}` }, () => { loadUserData(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id, loadUserData]);

    const refreshLobby = useCallback(async () => {
        if (!requireOnline()) return;
        haptic('light');
        await loadUserData();
    }, [requireOnline, haptic, loadUserData]);

    return (
        <PageTransition>
            <SEOHead
                title="Poker Trivia - Test Your Knowledge"
                description="Put Your Poker Knowledge To The Test With Multiple Game Modes: Endless, Survival, Time Attack, Mixed, PvP, And Tournaments."
                canonical="/hub/trivia"
            >

            </SEOHead>

            <div className={styles.page}>
                <div className={styles.backgroundOverlay} />

                <HubPageShell
                    className="trivia"
                    maxWidth={1000}
                    header={(
                        <UniversalHeader
                            pageDepth={1}
                            commandMenuOpen={menuOpen}
                            onCommandMenuOpenChange={setMenuOpen}
                            onMenuClick={() => setMenuOpen(true)}
                        />
                    )}
                >
                    {/* Hamburger Menu */}
                    <HamburgerMenu
                        isOpen={menuOpen}
                        onClose={() => setMenuOpen(false)}
                        direction="left"
                        theme="dark"
                        user={user || null}
                        showProfile={!!user}
                        menuItems={menuConfig.menuItems}
                        bottomLinks={menuConfig.bottomLinks}
                    />

                    <PullToRefresh onRefresh={refreshLobby} disabled={menuOpen}>
                        <div className={styles.content}>
                            <h1 className="sr-only">Smarter Poker Trivia</h1>
                            {isLoading ? (
                                <div className={styles.loading}>
                                    <TriviaSkeleton label="Daily Trivia and Quick Stakes loading; competitive modes are in Maintenance" />
                                </div>
                            ) : (
                                <TriviaLobby
                                    userDiamonds={userDiamonds}
                                    isVip={isVip}
                                    dailyCompleted={dailyCompleted}
                                    currentStreak={currentStreak}
                                    modeAvailability={modeAvailability}
                                    requireOnline={requireOnline}
                                    haptic={haptic}
                                    onDiamondsChange={(delta) => setUserDiamonds(prev => prev + delta)}
                                />
                            )}
                        </div>
                    </PullToRefresh>
                </HubPageShell>
            </div>

    </PageTransition>
    );
}

/**
 * Keep the lobby capability display on the same server-only controls as the
 * destination routes. No private environment value is serialized—only the
 * two resolved booleans required to render an accurate launch state.
 */
export function getServerSideProps() {
    return {
        props: {
            modeAvailability: {
                pvp: isTriviaPvpReleased(process.env),
                tournaments: areTriviaTournamentsReleased(process.env),
            },
        },
    };
}
