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
import {
    getTriviaMode,
    getTriviaModeRoute,
    resolveTriviaModeAvailability,
} from '../../../src/config/triviaModeRegistry.mjs';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { readOwnProfile } from '../../../src/lib/ownProfile';
import {
    createTriviaLobbyAccountRequestGuard,
    projectTriviaLobbyProfileRead,
} from '../../../src/lib/trivia/lobbyAccountIsolation.mjs';

const GAME_SETTINGS_KEY = 'trivia_settings';
const FREE_PREFETCH_ROUTES = Object.freeze([
    '/hub/trivia/daily',
    '/hub/trivia/history',
    '/hub/trivia/rules',
    '/hub/trivia/pro',
]);

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

    // The pick is stored with the slug it answers, so moving to another ?wire_q= question can never
    // show the previous question's pick against the new options.
    const [pickState, setPickState] = useState({ slug: '', key: '' });
    const userPick = pickState.slug === cleanSlug ? pickState.key : '';
    const optionKeys = (matchedTrivia?.options || []).map((opt) => String(opt.key));

    useEffect(() => {
        if (!cleanSlug || typeof rawPick !== 'string') return;
        const upper = rawPick.trim().toUpperCase();
        if (['A', 'B', 'C', 'D'].includes(upper) && optionKeys.includes(upper)) {
            setPickState({ slug: cleanSlug, key: upper });
        }
        // optionKeys derives from cleanSlug, so the slug and pick are the complete dependency set.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanSlug, rawPick]);

    if (!matchedTrivia) return null;

    const isCorrect = userPick && userPick === matchedTrivia.answerKey;

    return (
        <section
            data-weekly-wire-trivia-card="true"
            aria-label="Weekly Wire Trivia Of The Week"
            className="smarterdesign sd-panel"
            style={{
                marginBottom: 20,
                padding: '18px 20px',
                color: 'var(--sd-text, #f2f7ff)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'var(--sd-ice, #86daff)', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em' }}>
                    Weekly Wire Trivia Of The Week
                </span>
                {matchedTrivia.categoryLabel && (
                    <span style={{ color: 'var(--sd-ice, #86daff)', fontSize: 12, fontWeight: 700, background: 'rgba(134, 218, 255, 0.12)', border: '1px solid rgba(134, 218, 255, 0.35)', padding: '2px 10px', borderRadius: 4 }}>
                        {matchedTrivia.categoryLabel}
                    </span>
                )}
            </div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 18, fontWeight: 700, color: 'var(--sd-text, #f2f7ff)', lineHeight: 1.35 }}>
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
                            className={`sd-button${isSelected ? ' sd-primary' : ''}`}
                            aria-pressed={isSelected}
                            onClick={() => setPickState({ slug: cleanSlug, key: opt.key })}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                minHeight: 44,
                                padding: '10px 14px',
                                textAlign: 'left',
                                fontSize: 14,
                                fontWeight: 700,
                                borderColor: isTheAnswer ? '#4ade80' : undefined,
                            }}
                        >
                            <span>{`${opt.key}. ${opt.label}`}</span>
                            {isTheAnswer && (
                                <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 700 }}>
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
                        background: 'var(--sd-ink, #040d18)',
                        border: isCorrect ? '1px solid #4ade80' : '1px solid #86daff',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {isCorrect ? (
                            <span style={{ color: '#4ade80', fontSize: 13, fontWeight: 700 }}>
                                Correct Solver Pick
                            </span>
                        ) : (
                            <span style={{ color: '#86daff', fontSize: 13, fontWeight: 700 }}>
                                {`Missed - Option ${matchedTrivia.answerKey} Is Correct`}
                            </span>
                        )}
                    </div>
                    {matchedTrivia.explanation && (
                        <p style={{ margin: 0, color: 'var(--sd-silver, #bdd0e2)', fontSize: 13, lineHeight: 1.5 }}>
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
    const [arcadeTicketCount, setArcadeTicketCount] = useState(0);
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
    const inFlightFetchKeyRef = useRef(null);
    const lastCompletedFetchKeyRef = useRef(null);
    const deepLinkHandledRef = useRef('');

    // Prefetch free Trivia routes on mount/idle for fast 1-tap launch.
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        let cancelled = false;
        const runPrefetch = () => {
            if (cancelled) return;
            FREE_PREFETCH_ROUTES.forEach((route) => {
                router.prefetch(route).catch(() => {});
            });
        };
        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(runPrefetch, { timeout: 1200 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback?.(idleId);
            };
        }
        const timerId = window.setTimeout(runPrefetch, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timerId);
        };
    }, [router]);

    // Deep-link support: honor ?mode=<slug> cleanly once router is ready.
    useEffect(() => {
        if (!router.isReady) return;
        const rawMode = Array.isArray(router.query.mode) ? router.query.mode[0] : router.query.mode;
        const cleanMode = typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : '';
        if (!cleanMode || deepLinkHandledRef.current === cleanMode) return;
        const matched = getTriviaMode(cleanMode);
        if (!matched) return;
        const availability = resolveTriviaModeAvailability(matched.id, modeAvailability);
        deepLinkHandledRef.current = cleanMode;
        if (availability.enabled) {
            void router.replace(getTriviaModeRoute(matched.id));
        }
    }, [modeAvailability, router, router.isReady, router.query.mode]);

    // Account-owned values must never survive an identity transition.
    useEffect(() => {
        playerDataRequestGuardRef.current.invalidate();
        inFlightFetchKeyRef.current = null;
        lastCompletedFetchKeyRef.current = null;
        setUserDiamonds(0);
        setIsVip(false);
        setArcadeTicketCount(0);
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

    const loadUserData = useCallback(async ({ force = false } = {}) => {
        if (authLoading) return;
        const requestUserId = userId || null;
        if (requestUserId !== latestUserIdRef.current) return;

        if (!userId) {
            const request = playerDataRequestGuardRef.current.begin(null);
            if (playerDataRequestGuardRef.current.isCurrent(request, latestUserIdRef.current)) {
                setUserDiamonds(0);
                setIsVip(false);
                setArcadeTicketCount(0);
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

        // Deduplicate concurrent and recently completed identical reads for the same signed-in user.
        const fetchKey = `${requestUserId}:${getTodayCST()}`;
        if (!force && (inFlightFetchKeyRef.current === fetchKey || lastCompletedFetchKeyRef.current === fetchKey)) return;
        inFlightFetchKeyRef.current = fetchKey;

        const request = playerDataRequestGuardRef.current.begin(requestUserId);
        const requestIsCurrent = () => playerDataRequestGuardRef.current
            .isCurrent(request, latestUserIdRef.current);

        if (!requestIsCurrent()) return;
        setIsLoading(true);
        setPlayerDataStatus((previous) => ({
            profile: previous.profile === 'ready' ? 'refreshing' : 'loading',
            daily: previous.daily === 'ready' ? 'refreshing' : 'loading',
            streak: previous.streak === 'ready' ? 'refreshing' : 'loading',
        }));
        try {
            const today = getTodayCST();

            // Run independent reads in a single parallel batch.
            const [profileRead, dailyPlayRead, streakRead, ticketRead] = await Promise.allSettled([
                readOwnProfile(supabase, 'diamonds, is_vip', { expectId: userId }),
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
                supabase
                    .from('trivia_user_items')
                    .select('item_type, quantity')
                    .eq('user_id', userId)
                    .eq('item_type', 'arcade_ticket')
                    .maybeSingle(),
            ]);

            if (!requestIsCurrent()) return;

            const profileProjection = projectTriviaLobbyProfileRead(profileRead);
            const dailyPlayRes = dailyPlayRead.status === 'fulfilled' ? dailyPlayRead.value : null;
            const streakRes = streakRead.status === 'fulfilled' ? streakRead.value : null;
            const ticketRes = ticketRead.status === 'fulfilled' ? ticketRead.value : null;
            const nextStatus = {
                profile: profileProjection.status,
                daily: dailyPlayRead.status === 'fulfilled' && dailyPlayRes && !dailyPlayRes.error ? 'ready' : 'error',
                streak: streakRead.status === 'fulfilled' && streakRes && !streakRes.error ? 'ready' : 'error',
            };

            if (profileProjection.applyValue) {
                setUserDiamonds(profileProjection.userDiamonds);
                setIsVip(profileProjection.isVip);
            }

            if (profileProjection.applyValue && !profileProjection.profileExists) {
                setDailyCompleted(false);
                setCurrentStreak(0);
                setArcadeTicketCount(0);
            } else {
                if (nextStatus.daily === 'ready') {
                    const dailyPlay = dailyPlayRes?.data;
                    setDailyCompleted(!!(dailyPlay && dailyPlay.length > 0));
                }
                if (nextStatus.streak === 'ready') {
                    const streakData = streakRes?.data;
                    setCurrentStreak(streakData?.current_streak || 0);
                }
                if (ticketRes && !ticketRes.error) {
                    setArcadeTicketCount(Math.max(0, Number(ticketRes.data?.quantity) || 0));
                }
            }
            setPlayerDataStatus(nextStatus);
            lastCompletedFetchKeyRef.current = fetchKey;
        } catch (error) {
            if (!requestIsCurrent()) return;
            console.warn('Error loading user data:', error);
            setPlayerDataStatus({ profile: 'error', daily: 'error', streak: 'error' });
        } finally {
            if (inFlightFetchKeyRef.current === fetchKey) {
                inFlightFetchKeyRef.current = null;
            }
        }
        if (requestIsCurrent()) setIsLoading(false);
    }, [userId, authLoading]);

    useEffect(() => {
        loadUserData();
    }, [loadUserData]);

    // BUS LISTENER: Keep diamond balance in sync with other pages via EventBus
    useEffect(() => {
        const handleBalanceRefresh = () => { loadUserData({ force: true }); };
        const unsubEarned = eventBus.on(EventType.DIAMONDS_EARNED, handleBalanceRefresh);
        const unsubSpent = eventBus.on(EventType.DIAMONDS_SPENT, handleBalanceRefresh);
        return () => { unsubEarned(); unsubSpent(); };
    }, [loadUserData]);

    // Realtime subscription - live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`trivia-hub:${user?.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_trivia_plays', filter: `user_id=eq.${user?.id}` }, () => { loadUserData({ force: true }); })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trivia_streaks', filter: `user_id=eq.${user?.id}` }, () => { loadUserData({ force: true }); })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id, loadUserData]);

    return (
        <PageTransition>
            <SEOHead
                title="Poker Trivia - Test Your Knowledge"
                description="Put Your Poker Knowledge To The Test With Multiple Game Modes: Endless, Survival, Time Attack, Mixed, PvP, And Tournaments."
                canonical="/hub/trivia"
            />

            <div className={`${styles.page} smarterdesign`} style={{ background: 'var(--tc-black, #040d18)' }}>
                <UniversalHeader
                    pageDepth={1}
                    commandMenuOpen={menuOpen}
                    onCommandMenuOpenChange={setMenuOpen}
                    onMenuClick={() => setMenuOpen(true)}
                />

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
                    <WeeklyWireTriviaBanner router={router} />
                    <TriviaLobby
                        userDiamonds={userDiamonds}
                        isVip={isVip}
                        arcadeTicketCount={arcadeTicketCount}
                        dailyCompleted={dailyCompleted}
                        currentStreak={currentStreak}
                        modeAvailability={modeAvailability}
                        authState={authLoading ? 'loading' : userId ? 'authenticated' : 'signed-out'}
                        accountKey={userId || null}
                        playerDataLoading={isLoading}
                        playerDataStatus={playerDataStatus}
                        onRetryPlayerData={() => loadUserData({ force: true })}
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
