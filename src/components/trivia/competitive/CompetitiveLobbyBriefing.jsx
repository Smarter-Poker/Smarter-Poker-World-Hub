import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import TriviaConsole from '../console/TriviaConsole';
import ResponsiveModeArt from '../console/ResponsiveModeArt';
import {
    TRIVIA_INTRO_ART_PVP,
    TRIVIA_INTRO_ART_TOURNAMENTS,
} from '../../../config/triviaIntroArt.mjs';
import {
    deriveCompetitiveLobbyState,
    getRegistrationLabel,
    getTournamentClock,
    getTournamentHeadline,
    planCompetitiveLobbyRequests,
    sanitizeNightlySchedule,
    sanitizePvpResume,
    selectFeaturedTournament,
} from '../../../lib/trivia/competitiveLobbyModel.mjs';
import { createCompetitiveJourneyTracker } from '../../../lib/trivia/competitiveJourneyAnalytics.mjs';
import { authedFetch } from '../../../lib/authUtils';
import { createTriviaLobbyAccountRequestGuard } from '../../../lib/trivia/lobbyAccountIsolation.mjs';
import styles from './CompetitiveLobbyBriefing.module.css';

const disabledResource = () => ({ status: 'disabled', data: null, error: null, receivedAt: null });
const waitingResource = () => ({ status: 'loading', data: null, error: null, receivedAt: null });

function responseError(status) {
    const error = new Error('competitive_briefing_request_failed');
    error.status = status;
    return error;
}

async function readJson(url, signal, requestImpl = fetch) {
    const response = await requestImpl(url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
    });
    if (!response.ok) throw responseError(response.status);
    return response.json();
}

function formatMetric(value, suffix = '') {
    return Number.isInteger(value) ? `${value.toLocaleString('en-US')}${suffix}` : 'Pending';
}

function formatLocalStart(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return '8 PM CT';
    const hour = Number(match[1]);
    const minute = match[2];
    if (!Number.isInteger(hour) || hour > 23) return '8 PM CT';
    const clockHour = hour % 12 || 12;
    return `${clockHour}${minute === '00' ? '' : `:${minute}`} ${hour >= 12 ? 'PM' : 'AM'} CT`;
}

function formatViewerStart(startsAt, timeZone) {
    if (!startsAt || !timeZone) return 'Local Time Pending';
    const value = Date.parse(startsAt);
    if (!Number.isFinite(value)) return 'Local Time Pending';
    try {
        return new Intl.DateTimeFormat('en-US', {
            timeZone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short',
        }).format(value);
    } catch (_error) {
        return 'Local Time Pending';
    }
}

function pvpHeadline(resource, authState, enabled) {
    if (!enabled) return '1 V 1 In Maintenance';
    if (authState === 'loading') return 'Checking Player Access';
    if (authState === 'signed-out' || resource.status === 'signed-out') return 'Sign In For Match Recovery';
    if (['loading', 'refreshing'].includes(resource.status)) return 'Checking Active Match';
    if (resource.status === 'stale') return 'Last Known Match Status';
    if (['error', 'offline'].includes(resource.status)) return 'Match Recovery Unavailable';
    const pvp = resource.data;
    if (!pvp?.resumeAvailable) return '1 V 1 Ready';
    if (pvp.state === 'searching') return 'Match Search In Progress';
    if (pvp.state === 'settling') return 'Match Settlement In Progress';
    if (pvp.state === 'result') return 'Match Result Ready';
    return pvp.match?.opponent?.kind === 'horse'
        ? 'Resume Against Smarter Horse'
        : 'Resume Active Match';
}

function pvpDetail(resource, authState, enabled) {
    if (!enabled) return 'Competitive upgrades are in progress.';
    if (authState === 'loading') return 'Your session is still being verified.';
    if (authState === 'signed-out' || resource.status === 'signed-out') {
        return 'Sign in to recover an unfinished match or start a new challenge.';
    }
    if (['loading', 'refreshing'].includes(resource.status)) {
        return 'Reading your sanitized match status.';
    }
    if (resource.status === 'stale') {
        return 'This Stored Status May Have Changed. Open Head To Head To Verify The Server Record Before Acting.';
    }
    if (['error', 'offline'].includes(resource.status)) {
        return 'Your match was not changed. Retry when the connection is ready.';
    }
    const pvp = resource.data;
    if (!pvp?.resumeAvailable) return 'No active match. Human opponents are searched before any Smarter Horse joins.';
    const stake = pvp.match?.stake ?? pvp.ticket?.stake ?? pvp.result?.stake;
    const opponent = pvp.match?.opponent?.displayName;
    const details = [opponent, Number.isInteger(stake) ? `${stake} Diamond Stake` : null].filter(Boolean);
    return details.length > 0 ? details.join(' / ') : 'Your active match is ready to continue.';
}

function pvpPill(resource, authState, enabled) {
    if (!enabled) return 'Maintenance';
    if (authState === 'loading') return 'Access Check';
    if (authState === 'signed-out' || resource.status === 'signed-out') return 'Sign In';
    if (['loading', 'refreshing'].includes(resource.status)) return 'Refreshing';
    if (resource.status === 'stale') return 'Last Known';
    if (['error', 'offline'].includes(resource.status)) return 'Unavailable';
    if (resource.data?.resumeAvailable) return 'Resume Ready';
    return 'Available';
}

function pvpStatus(resource, authState, enabled) {
    if (!enabled) return 'Maintenance';
    if (authState === 'loading') return 'Checking Access';
    if (authState === 'signed-out' || resource.status === 'signed-out') return 'Sign In Required';
    if (['loading', 'refreshing'].includes(resource.status)) return 'Refreshing';
    if (resource.status === 'stale') return 'Verification Required';
    if (['error', 'offline'].includes(resource.status)) return 'Unavailable';
    const labels = {
        idle: 'Available',
        searching: 'Searching',
        dealing: 'Dealing',
        playing: 'Playing',
        waiting: 'Waiting On Opponent',
        settling: 'Settling',
        result: 'Result Ready',
        search_ended: 'Search Ended',
    };
    return labels[resource.data?.state] || 'Available';
}

export default function CompetitiveLobbyBriefing({
    authState = 'loading',
    accountKey = null,
    modeAvailability,
}) {
    const router = useRouter();
    const tournamentsEnabled = modeAvailability?.tournaments === true;
    const pvpEnabled = modeAvailability?.pvp === true;
    const [scheduleResource, setScheduleResource] = useState(
        tournamentsEnabled ? waitingResource : disabledResource,
    );
    const [pvpResource, setPvpResource] = useState(
        pvpEnabled ? waitingResource : disabledResource,
    );
    const [connectionState, setConnectionState] = useState('online');
    const [refreshVersion, setRefreshVersion] = useState(0);
    const [clockNow, setClockNow] = useState(() => Date.now());
    const [viewerTimeZone, setViewerTimeZone] = useState(null);
    const latestAccountKeyRef = useRef(accountKey || null);
    latestAccountKeyRef.current = accountKey || null;
    const scheduleRequestGuardRef = useRef(null);
    if (!scheduleRequestGuardRef.current) {
        scheduleRequestGuardRef.current = createTriviaLobbyAccountRequestGuard();
    }
    const pvpRequestGuardRef = useRef(null);
    if (!pvpRequestGuardRef.current) {
        pvpRequestGuardRef.current = createTriviaLobbyAccountRequestGuard();
    }
    const journeyTrackerRef = useRef(null);
    if (!journeyTrackerRef.current) journeyTrackerRef.current = createCompetitiveJourneyTracker();
    const journeyTracker = journeyTrackerRef.current;

    useEffect(() => {
        const availability = pvpEnabled && tournamentsEnabled
            ? 'both'
            : pvpEnabled ? 'pvp_only' : tournamentsEnabled ? 'tournament_only' : 'off';
        journeyTracker.track('lobby', 'impression', { source: 'lobby', availability });
    }, [journeyTracker, pvpEnabled, tournamentsEnabled]);

    useEffect(() => {
        try {
            setViewerTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        } catch (_error) {
            setViewerTimeZone('UTC');
        }
    }, []);

    const requestPlan = useMemo(() => planCompetitiveLobbyRequests({
        tournamentsEnabled,
        pvpEnabled,
        authState,
    }), [authState, pvpEnabled, tournamentsEnabled]);

    // Identity owns every authenticated competitive resource. Clear the old
    // account's schedule registration and resume state before starting the new
    // reads; the keyed parent remount also prevents one stale render frame.
    useEffect(() => {
        scheduleRequestGuardRef.current.invalidate();
        pvpRequestGuardRef.current.invalidate();
        setScheduleResource(tournamentsEnabled ? waitingResource() : disabledResource());
        if (!pvpEnabled) {
            setPvpResource(disabledResource());
        } else if (authState === 'loading') {
            setPvpResource({ ...disabledResource(), status: 'auth-loading' });
        } else if (authState === 'signed-out') {
            setPvpResource({ ...disabledResource(), status: 'signed-out' });
        } else {
            setPvpResource(waitingResource());
        }
    }, [accountKey, authState, pvpEnabled, tournamentsEnabled]);

    useEffect(() => {
        const controller = new AbortController();
        const request = scheduleRequestGuardRef.current.begin(accountKey);
        const scheduleRequestIsCurrent = () => scheduleRequestGuardRef.current
            .isCurrent(request, latestAccountKeyRef.current);
        if (!requestPlan.schedule) {
            setScheduleResource(disabledResource());
            return () => {
                scheduleRequestGuardRef.current.invalidate();
                controller.abort();
            };
        }

        setScheduleResource((previous) => ({
            ...previous,
            status: previous.data ? 'refreshing' : 'loading',
            error: null,
        }));
        const requestImpl = authState === 'authenticated' ? authedFetch : fetch;
        readJson(requestPlan.schedule, controller.signal, requestImpl)
            .then((raw) => {
                if (!scheduleRequestIsCurrent()) return;
                const data = sanitizeNightlySchedule(raw);
                if (!data) throw responseError(502);
                setScheduleResource({
                    status: data.instances.length > 0 ? 'ready' : 'empty',
                    data,
                    error: null,
                    receivedAt: Date.now(),
                });
                setClockNow(Date.now());
            })
            .catch((error) => {
                if (error?.name === 'AbortError' || !scheduleRequestIsCurrent()) return;
                setScheduleResource((previous) => ({
                    ...previous,
                    status: previous.data ? 'stale' : 'error',
                    error: 'schedule_unavailable',
                }));
            });
        return () => {
            scheduleRequestGuardRef.current.invalidate();
            controller.abort();
        };
    }, [accountKey, authState, refreshVersion, requestPlan.schedule]);

    useEffect(() => {
        const controller = new AbortController();
        const request = pvpRequestGuardRef.current.begin(accountKey);
        const pvpRequestIsCurrent = () => pvpRequestGuardRef.current
            .isCurrent(request, latestAccountKeyRef.current);
        if (!pvpEnabled) {
            setPvpResource(disabledResource());
            return () => {
                pvpRequestGuardRef.current.invalidate();
                controller.abort();
            };
        }
        if (authState === 'loading') {
            setPvpResource({ ...disabledResource(), status: 'auth-loading' });
            return () => {
                pvpRequestGuardRef.current.invalidate();
                controller.abort();
            };
        }
        if (!requestPlan.pvpResume) {
            setPvpResource({ ...disabledResource(), status: 'signed-out' });
            return () => {
                pvpRequestGuardRef.current.invalidate();
                controller.abort();
            };
        }

        setPvpResource((previous) => ({
            ...previous,
            status: previous.data ? 'refreshing' : 'loading',
            error: null,
        }));
        readJson(requestPlan.pvpResume, controller.signal, authedFetch)
            .then((raw) => {
                if (!pvpRequestIsCurrent()) return;
                const data = sanitizePvpResume(raw);
                if (!data) throw responseError(502);
                setPvpResource({ status: 'ready', data, error: null, receivedAt: Date.now() });
            })
            .catch((error) => {
                if (error?.name === 'AbortError' || !pvpRequestIsCurrent()) return;
                setPvpResource((previous) => ({
                    ...previous,
                    status: error?.status === 401
                        ? 'signed-out'
                        : previous.data ? 'stale' : 'error',
                    error: error?.status === 401 ? 'authentication_required' : 'pvp_unavailable',
                }));
            });
        return () => {
            pvpRequestGuardRef.current.invalidate();
            controller.abort();
        };
    }, [accountKey, authState, pvpEnabled, refreshVersion, requestPlan.pvpResume]);

    useEffect(() => {
        const markOffline = () => {
            setConnectionState('offline');
            setScheduleResource((previous) => tournamentsEnabled ? {
                ...previous,
                status: previous.data ? 'stale' : 'offline',
            } : previous);
            setPvpResource((previous) => pvpEnabled && authState === 'authenticated' ? {
                ...previous,
                status: previous.data ? 'stale' : 'offline',
            } : previous);
        };
        const refreshLatest = () => {
            setConnectionState('refreshing');
            setRefreshVersion((version) => version + 1);
        };
        window.addEventListener('offline', markOffline);
        window.addEventListener('online', refreshLatest);
        if (window.navigator.onLine === false) markOffline();
        return () => {
            window.removeEventListener('offline', markOffline);
            window.removeEventListener('online', refreshLatest);
        };
    }, [authState, pvpEnabled, tournamentsEnabled]);

    useEffect(() => {
        if (connectionState !== 'refreshing') return;
        const busy = ['loading', 'refreshing'].includes(scheduleResource.status)
            || ['loading', 'refreshing'].includes(pvpResource.status);
        if (!busy) setConnectionState(window.navigator.onLine === false ? 'offline' : 'online');
    }, [connectionState, pvpResource.status, scheduleResource.status]);

    const retry = useCallback(() => {
        if (window.navigator.onLine === false) {
            setConnectionState('offline');
            return;
        }
        setConnectionState('refreshing');
        setRefreshVersion((version) => version + 1);
    }, []);

    const followCompetitiveIntent = useCallback((mode, action, path) => {
        journeyTracker.track(mode, 'intent', { source: 'lobby', action });
        router.push(path);
    }, [journeyTracker, router]);

    const featuredTournament = selectFeaturedTournament(scheduleResource.data);
    const scheduleNow = scheduleResource.data?.serverTime && scheduleResource.receivedAt
        ? Date.parse(scheduleResource.data.serverTime) + (clockNow - scheduleResource.receivedAt)
        : clockNow;
    const countdown = featuredTournament
        ? getTournamentClock(featuredTournament, scheduleNow)
        : {
            display: tournamentsEnabled ? 'Pending' : '8 PM CT',
            ariaLabel: tournamentsEnabled ? 'Schedule pending' : 'Nightly tournament time, 8 PM Central',
        };
    const registrationLabel = !tournamentsEnabled
        ? 'Tournament In Maintenance'
        : scheduleResource.status === 'stale'
            ? 'Last Known / Refresh Required'
            : ['error', 'offline'].includes(scheduleResource.status)
                ? 'Schedule Unavailable'
                : ['loading', 'refreshing'].includes(scheduleResource.status)
                    ? 'Checking Registration'
                    : getRegistrationLabel(featuredTournament, scheduleNow);

    useEffect(() => {
        if (!featuredTournament?.startsAt) return undefined;
        if (!['scheduled', 'registration', 'held'].includes(featuredTournament.state)) return undefined;
        const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [featuredTournament?.startsAt, featuredTournament?.state]);
    const overall = deriveCompetitiveLobbyState({
        authState,
        tournamentsEnabled,
        pvpEnabled,
        connectionState,
        scheduleResource,
        pvpResource,
    });
    const showRetry = ['offline', 'stale', 'partial', 'error'].includes(overall.key);
    const showResume = pvpResource.data?.resumeAvailable === true;
    const showSignIn = pvpEnabled
        && (authState === 'signed-out' || pvpResource.status === 'signed-out');
    const canStartPvp = pvpEnabled
        && authState === 'authenticated'
        && pvpResource.status === 'ready'
        && !showResume;
    const tournamentActionLabel = scheduleResource.status === 'stale'
        ? 'Verify Tournament'
        : featuredTournament?.viewer?.entered
            ? 'Open My Run'
            : featuredTournament?.state === 'live'
                ? 'View Live Bracket'
                : featuredTournament?.state === 'settled'
                    ? 'View Results'
                    : 'View Tournament';

    return (
        <section
            className={styles.region}
            aria-label="Competitive Trivia Briefing"
            data-competitive-lobby-state={overall.key}
            data-mobile-layout="stacked"
            data-desktop-layout="seven-five-competitive"
        >
            <div className={styles.layout}>
                <TriviaConsole
                    className={`${styles.console} ${styles.tournamentConsole}`}
                    eyebrow="Nightly Tournament"
                    title={getTournamentHeadline(featuredTournament, scheduleNow)}
                    titleId="competitive-tournament-title"
                    subtitle="America/Chicago / Official Nightly"
                    pill={registrationLabel}
                    pillInk={registrationLabel === 'Registration Open' || registrationLabel.startsWith('Registered') ? 'green' : 'gold'}
                >
                    <ResponsiveModeArt
                        art={TRIVIA_INTRO_ART_TOURNAMENTS}
                        className={styles.featureArt}
                        sizes="(min-width: 701px) 560px, 100vw"
                    />
                    <div className={styles.featureCopy} aria-labelledby="competitive-tournament-title">
                        <div className={styles.countdownRail}>
                            <div>
                                <span className={styles.zoneTitle}>Next Deal</span>
                                <output className={styles.countdown} aria-label={countdown.ariaLabel}>
                                    {countdown.display}
                                </output>
                            </div>
                            <div className={styles.timeReadout}>
                                <p className={styles.localTime}>
                                    <span>Official Central</span>
                                    {featuredTournament?.localDate || 'Date Pending'} / {formatLocalStart(featuredTournament?.localStartTime)}
                                </p>
                                <p className={styles.localTime}>
                                    <span>Your Time</span>
                                    {formatViewerStart(featuredTournament?.startsAt, viewerTimeZone)}
                                </p>
                            </div>
                        </div>
                        <dl className={`${styles.readout} ${styles.tournamentReadout}`}>
                            <div className={styles.readoutRow}>
                                <dt>Entry</dt>
                                <dd>{formatMetric(featuredTournament?.entryFee, ' Diamonds')}</dd>
                            </div>
                            <div className={styles.readoutRow}>
                                <dt>Rake</dt>
                                <dd>{formatMetric(featuredTournament?.rakePerEntry, ' Diamonds')}</dd>
                            </div>
                            <div className={styles.readoutRow}>
                                <dt>Humans</dt>
                                <dd>{formatMetric(featuredTournament?.humansEntered)}</dd>
                            </div>
                            <div className={styles.readoutRow}>
                                <dt>Smarter Horses</dt>
                                <dd>{formatMetric(featuredTournament?.horsesEntered)}</dd>
                            </div>
                            <div className={styles.readoutRow}>
                                <dt>Human Seats Open</dt>
                                <dd>{formatMetric(featuredTournament?.humanSeatsRemaining)}</dd>
                            </div>
                            <div className={styles.readoutRow}>
                                <dt>Prize Pool</dt>
                                <dd>{formatMetric(featuredTournament?.estimatedPrizePool, ' Diamonds')}</dd>
                            </div>
                        </dl>
                        <p className={styles.zoneDetail}>
                            {featuredTournament
                                ? 'Single elimination. Human and Smarter Horse entries are disclosed before play.'
                                : tournamentsEnabled
                                    ? 'Waiting for the official nightly event to be posted.'
                                    : 'Nightly tournament upgrades are in progress.'}
                        </p>
                        {tournamentsEnabled && featuredTournament ? (
                            <div className={styles.actions}>
                                <button
                                    type="button"
                                    className={`tc-word ${styles.action}`}
                                    onClick={() => followCompetitiveIntent(
                                        'nightly_tournament',
                                        featuredTournament.viewer?.entered ? 'open_run' : featuredTournament.state === 'live' ? 'view_bracket' : featuredTournament.state === 'settled' ? 'view_results' : 'view_tournament',
                                        '/hub/trivia/tournaments',
                                    )}
                                >
                                    {tournamentActionLabel}
                                </button>
                            </div>
                        ) : null}
                    </div>
                </TriviaConsole>

                <TriviaConsole
                    className={`${styles.console} ${styles.pvpConsole}`}
                    eyebrow="1 V 1 Matchmaking"
                    title="Head To Head"
                    titleId="competitive-pvp-title"
                    subtitle="Human First / Smarter Horse Fallback"
                    pill={pvpPill(pvpResource, authState, pvpEnabled)}
                    pillInk={showResume ? 'green' : ['error', 'offline'].includes(overall.key) ? 'red' : 'blue'}
                >
                    <ResponsiveModeArt
                        art={TRIVIA_INTRO_ART_PVP}
                        className={styles.featureArt}
                        sizes="(min-width: 701px) 400px, 100vw"
                    />
                    <div className={styles.featureCopy} aria-labelledby="competitive-pvp-title">
                        <h3 className={styles.pvpHeadline}>{pvpHeadline(pvpResource, authState, pvpEnabled)}</h3>
                        <p className={styles.zoneDetail}>{pvpDetail(pvpResource, authState, pvpEnabled)}</p>
                        <dl className={styles.readout}>
                            <div className={styles.readoutRow}>
                                <dt>Status</dt>
                                <dd>{pvpStatus(pvpResource, authState, pvpEnabled)}</dd>
                            </div>
                            <div className={styles.readoutRow}>
                                <dt>Stake</dt>
                                <dd>
                                    {pvpResource.data?.match || pvpResource.data?.ticket
                                        ? formatMetric(pvpResource.data?.match?.stake ?? pvpResource.data?.ticket?.stake, ' Diamonds')
                                        : pvpEnabled ? 'Choose At Entry' : 'Unavailable'}
                                </dd>
                            </div>
                            <div className={styles.readoutRow}>
                                <dt>Opponent</dt>
                                <dd>
                                    {pvpResource.data?.match?.opponent?.displayName
                                        || (pvpEnabled ? 'Human Search First' : 'Unavailable')}
                                </dd>
                            </div>
                        </dl>
                        <div className={styles.actions}>
                            {showResume ? (
                                <button type="button" className={`tc-word ${styles.action}`} onClick={() => followCompetitiveIntent('pvp', pvpResource.status === 'stale' ? 'verify_resume' : 'resume_pvp', '/hub/trivia/pvp')}>
                                    {pvpResource.status === 'stale' ? 'Verify And Resume' : 'Resume Match'}
                                </button>
                            ) : null}
                            {canStartPvp ? (
                                <button type="button" className={`tc-word ${styles.action}`} onClick={() => followCompetitiveIntent('pvp', 'start_pvp', '/hub/trivia/pvp')}>
                                    Start 1 V 1
                                </button>
                            ) : null}
                            {showSignIn ? (
                                <button type="button" className={`tc-word ${styles.action}`} onClick={() => followCompetitiveIntent('pvp', 'sign_in', '/auth/login?redirect=/hub/trivia')}>
                                    Sign In
                                </button>
                            ) : null}
                        </div>
                    </div>
                </TriviaConsole>
            </div>

            <div className={styles.statusRail}>
                <p className={styles.overallStatus} role="status" aria-live="polite" aria-atomic="true">
                    {overall.label}
                </p>
                {showRetry ? (
                    <button type="button" className={`tc-word ${styles.action}`} onClick={retry}>
                        Refresh Latest Status
                    </button>
                ) : null}
            </div>
        </section>
    );
}
