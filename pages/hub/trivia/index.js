/**
 * TRIVIA HUB - Main lobby page
 * Route: /hub/trivia
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { useAvatar } from '../../../src/contexts/AvatarContext';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaLobby from '../../../src/components/trivia/TriviaLobby';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getTriviaPreferences, updateTriviaPreferences } from '../../../src/services/triviaPreferences';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { getTodayCST } from '../../../src/lib/trivia/getTodayCST';
import styles from '../../../src/styles/trivia/TriviaHub.module.css';
import * as triviaAudio from '../../../src/lib/trivia/triviaAudio';
import { isTriviaPvpReleased } from '../../../src/lib/trivia/pvpReleaseControl.mjs';
import { areTriviaTournamentsReleased } from '../../../src/lib/trivia/tournamentReleaseControl.mjs';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { readOwnProfile } from '../../../src/lib/ownProfile';
import {
    createTriviaLobbyAccountRequestGuard,
    projectTriviaLobbyProfileRead,
} from '../../../src/lib/trivia/lobbyAccountIsolation.mjs';

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
    const [playerDataStatus, setPlayerDataStatus] = useState({
        profile: 'loading',
        daily: 'loading',
        streak: 'loading',
    });
    const [menuOpen, setMenuOpen] = useState(false);
    const playerDataRequestGuardRef = useRef(null);
    if (!playerDataRequestGuardRef.current) {
        playerDataRequestGuardRef.current = createTriviaLobbyAccountRequestGuard();
    }
    const latestUserIdRef = useRef(userId || null);
    latestUserIdRef.current = userId || null;

    // Account-owned values must never survive an identity transition. This
    // runs before the data-loading effect below and invalidates every pending
    // completion from the prior account.
    useEffect(() => {
        playerDataRequestGuardRef.current.invalidate();
        setUserDiamonds(0);
        setIsVip(false);
        setDailyCompleted(false);
        setCurrentStreak(0);
        setPlayerDataStatus({
            profile: 'loading',
            daily: 'loading',
            streak: 'loading',
        });
        setIsLoading(true);
    }, [userId]);

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
        const requestUserId = userId || null;
        if (requestUserId !== latestUserIdRef.current) return;
        const request = playerDataRequestGuardRef.current.begin(requestUserId);
        const requestIsCurrent = () => playerDataRequestGuardRef.current
            .isCurrent(request, latestUserIdRef.current);

        if (!userId) {
            // Wait for auth to populate or fail
            if (!authLoading && requestIsCurrent()) {
                setUserDiamonds(0);
                setIsVip(false);
                setDailyCompleted(false);
                setCurrentStreak(0);
                setPlayerDataStatus({
                    profile: 'signed-out',
                    daily: 'signed-out',
                    streak: 'signed-out',
                });
                setIsLoading(false);
            }
            return;
        }
        if (!requestIsCurrent()) return;
        setIsLoading(true);
        setPlayerDataStatus((previous) => ({
            profile: previous.profile === 'ready' ? 'refreshing' : 'loading',
            daily: previous.daily === 'ready' ? 'refreshing' : 'loading',
            streak: previous.streak === 'ready' ? 'refreshing' : 'loading',
        }));
        try {
            const today = getTodayCST();

            // Run the three independent reads in parallel — was three
            // sequential awaits, ~2 extra round trips before the lobby showed.
            // Each result is applied independently. A streak outage must not
            // erase a valid balance or make a completed Daily attempt playable.
            const [profileRead, dailyPlayRead, streakRead] = await Promise.allSettled([
                readOwnProfile(supabase, 'diamonds, is_vip', { expectId: userId }),
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

            if (!requestIsCurrent()) return;

            const profileProjection = projectTriviaLobbyProfileRead(profileRead);
            const dailyPlayRes = dailyPlayRead.status === 'fulfilled' ? dailyPlayRead.value : null;
            const streakRes = streakRead.status === 'fulfilled' ? streakRead.value : null;
            const nextStatus = {
                profile: profileProjection.status,
                daily: dailyPlayRead.status === 'fulfilled' && dailyPlayRes && !dailyPlayRes.error ? 'ready' : 'error',
                streak: streakRead.status === 'fulfilled' && streakRes && !streakRes.error ? 'ready' : 'error',
            };

            if (profileProjection.applyValue) {
                setUserDiamonds(profileProjection.userDiamonds);
                setIsVip(profileProjection.isVip);
            }

            // A successful null owner profile is authoritative. Clear every
            // account-scoped value instead of retaining data from a previous
            // account or a profile that was removed mid-session.
            if (profileProjection.applyValue && !profileProjection.profileExists) {
                setDailyCompleted(false);
                setCurrentStreak(0);
            } else if (nextStatus.daily === 'ready') {
                const dailyPlay = dailyPlayRes?.data;
                setDailyCompleted(!!(dailyPlay && dailyPlay.length > 0));
            }

            if (!(profileProjection.applyValue && !profileProjection.profileExists)
                && nextStatus.streak === 'ready') {
                const streakData = streakRes?.data;
                setCurrentStreak(streakData?.current_streak || 0);
            }
            setPlayerDataStatus(nextStatus);
        } catch (error) {
            if (!requestIsCurrent()) return;
            console.warn('Error loading user data:', error);
            setPlayerDataStatus({ profile: 'error', daily: 'error', streak: 'error' });
        }
        if (requestIsCurrent()) setIsLoading(false);
    }, [userId, authLoading]);

    useEffect(() => {
        loadUserData();
    }, [loadUserData]);

    // BUS LISTENER: Keep diamond balance in sync with other pages via EventBus
    useEffect(() => {
        const handleBalanceRefresh = () => { loadUserData(); };
        const unsubEarned = eventBus.on(EventType.DIAMONDS_EARNED, handleBalanceRefresh);
        const unsubSpent = eventBus.on(EventType.DIAMONDS_SPENT, handleBalanceRefresh);
        return () => { unsubEarned(); unsubSpent(); };
    }, [loadUserData]);

    // Realtime subscription - live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`trivia-hub:${user?.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_trivia_plays', filter: `user_id=eq.${user?.id}` }, () => { loadUserData(); })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trivia_streaks', filter: `user_id=eq.${user?.id}` }, () => { loadUserData(); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id, loadUserData]);

    return (
        <PageTransition>
            <SEOHead
                title="Poker Trivia - Test Your Knowledge"
                description="Put Your Poker Knowledge To The Test With Multiple Game Modes: Endless, Survival, Time Attack, Mixed, PvP, And Tournaments."
                canonical="/hub/trivia"
            >

            </SEOHead>

            {/* Black-first page (Trivia console standard); the shared hub
                module still owns layout and the overflow clip. */}
            <div className={styles.page} style={{ background: 'var(--tc-black)' }}>
                <UniversalHeader
                    pageDepth={1}
                    commandMenuOpen={menuOpen}
                    onCommandMenuOpenChange={setMenuOpen}
                    onMenuClick={() => setMenuOpen(true)}
                />

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

                <main className={styles.content}>
                    <h1 className="sr-only">Smarter Poker Trivia</h1>
                    <TriviaLobby
                        userDiamonds={userDiamonds}
                        isVip={isVip}
                        dailyCompleted={dailyCompleted}
                        currentStreak={currentStreak}
                        modeAvailability={modeAvailability}
                        authState={authLoading ? 'loading' : userId ? 'authenticated' : 'signed-out'}
                        accountKey={userId || null}
                        playerDataLoading={isLoading}
                        playerDataStatus={playerDataStatus}
                        onRetryPlayerData={loadUserData}
                        onDiamondsChange={(delta) => setUserDiamonds(prev => prev + delta)}
                    />
                </main>
            </div>

      {/* Server rendered: measured on production this page returned
          only chrome to a crawler (AEO phase 3, 2026-09-17). */}
      <HubPageSummary page="trivia" />
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
