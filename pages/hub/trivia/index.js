/**
 * TRIVIA HUB - Main lobby page
 * Route: /hub/trivia
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import * as wireCatalog from '../../../src/lib/newsletter/weeklyWireCatalog.mjs';

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

function WeeklyWireTriviaBanner({ router }) {
    const rawQ = Array.isArray(router?.query?.wire_q) ? router.query.wire_q[0] : router?.query?.wire_q;
    const rawPick = Array.isArray(router?.query?.pick) ? router.query.pick[0] : router?.query?.pick;
    const cleanSlug = typeof rawQ === 'string' ? rawQ.trim().toLowerCase() : '';

    const catalog = wireCatalog.TRIVIA_OF_THE_WEEK_CATALOG || [];
    const matchedTrivia = cleanSlug
        ? catalog.find((item) => String(item.slug || '').toLowerCase() === cleanSlug)
        : null;

    const [userPick, setUserPick] = useState('');

    useEffect(() => {
        if (typeof rawPick === 'string') {
            const upper = rawPick.trim().toUpperCase();
            if (['A', 'B', 'C', 'D'].includes(upper)) {
                setUserPick(upper);
            }
        }
    }, [rawPick]);

    if (!matchedTrivia) return null;

    const isCorrect = userPick && userPick === matchedTrivia.answerKey;

    return (
        <section
            data-weekly-wire-trivia-card="true"
            aria-label="Weekly Wire Trivia Of The Week"
            style={{
                marginBottom: 24,
                padding: '20px 24px',
                borderRadius: 16,
                background: 'linear-gradient(135deg, #0b1118 0%, #101a24 100%)',
                border: '1px solid #1b2c3d',
                borderLeft: '3px solid #4fc1b3',
                color: '#ffffff',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <span style={{ color: '#4fc1b3', fontSize: 12, fontWeight: 800, letterSpacing: 1.8, textTransform: 'uppercase' }}>
                    Weekly Wire Trivia Of The Week
                </span>
                {matchedTrivia.categoryLabel && (
                    <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700, background: 'rgba(96, 165, 250, 0.12)', border: '1px solid rgba(96, 165, 250, 0.3)', padding: '2px 8px', borderRadius: 999 }}>
                        {matchedTrivia.categoryLabel}
                    </span>
                )}
            </div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 800, color: '#ffffff', lineHeight: 1.35 }}>
                {matchedTrivia.question}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
                {(matchedTrivia.options || []).map((opt) => {
                    const isSelected = userPick === opt.key;
                    const isTheAnswer = userPick && opt.key === matchedTrivia.answerKey;
                    return (
                        <button
                            key={opt.key}
                            type="button"
                            onClick={() => setUserPick(opt.key)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                padding: '12px 14px',
                                borderRadius: 10,
                                textAlign: 'left',
                                cursor: 'pointer',
                                background: isTheAnswer
                                    ? 'rgba(79, 193, 179, 0.16)'
                                    : isSelected
                                        ? 'rgba(96, 165, 250, 0.16)'
                                        : '#05070a',
                                border: isTheAnswer
                                    ? '1px solid #4fc1b3'
                                    : isSelected
                                        ? '1px solid #60a5fa'
                                        : '1px solid #1b2c3d',
                                color: '#ffffff',
                                fontSize: 13.5,
                                fontWeight: 700,
                            }}
                        >
                            <span>{`${opt.key}. ${opt.label}`}</span>
                            {isTheAnswer && (
                                <span style={{ color: '#4fc1b3', fontSize: 11.5, fontWeight: 800 }}>
                                    Correct
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            {userPick && (
                <div
                    role="status"
                    style={{
                        marginTop: 14,
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: '#05070a',
                        border: isCorrect ? '1px solid #4fc1b3' : '1px solid #60a5fa',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {isCorrect ? (
                            <span style={{ color: '#4fc1b3', fontSize: 13, fontWeight: 800 }}>
                                Correct Solver Pick
                            </span>
                        ) : (
                            <span style={{ color: '#60a5fa', fontSize: 13, fontWeight: 800 }}>
                                {`Missed - Option ${matchedTrivia.answerKey} Is Correct`}
                            </span>
                        )}
                    </div>
                    {matchedTrivia.explanation && (
                        <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>
                            {matchedTrivia.explanation}
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}

export default function TriviaHubPage({ modeAvailability }) {
    const router = useRouter();
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
                    <WeeklyWireTriviaBanner router={router} />
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
