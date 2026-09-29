/**
 * PVP PAGE — Route: /hub/trivia/pvp
 * 1v1 trivia battles with diamond stakes
 * Uses Supabase Realtime for live matchmaking
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import ReportQuestionButton from '../../../src/components/trivia/ReportQuestionButton';
import {
    joinMatchmakingQueue,
    leaveMatchmakingQueue,
    findMatch,
    subscribeToQueue,
    subscribeToMatch
} from '../../../src/services/pvpMatchmaking';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import TriviaConsole, { TriviaGlassAction } from '../../../src/components/trivia/console/TriviaConsole';
import TriviaConsoleDialog from '../../../src/components/trivia/console/TriviaConsoleDialog';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import useVIPGate from '../../../src/hooks/useVIPGate';

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { printPlayerName } from '../../../src/lib/trivia/printPlayerName';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import { triviaPvpPageReleaseResult } from '../../../src/lib/trivia/pvpReleaseControl.mjs';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';

const STAKE_OPTIONS = [10, 25, 50, 100];
// How long a finished player waits for their opponent before being offered an
// escape from the 'waiting' screen.
const WAITING_DEADLINE_MS = 3 * 60 * 1000;

// PvP moves real diamonds and remains unavailable until the server-owned
// matchmaking path is deployed and TRIVIA_PVP_ENABLED is explicitly `true`.
// Keeping this in getServerSideProps means a direct URL cannot boot the legacy
// browser matchmaking service while the release is contained.
export function getServerSideProps() {
    return triviaPvpPageReleaseResult(process.env);
}

/**
 * Authenticated JSON POST to the trivia API routes.
 *
 * ALL money this page used to move now moves server-side: session-start
 * escrows the stake, session-answer/session-submit grade, and
 * /api/trivia/pvp-settle-match pays winners and refunds ties from the
 * server-graded counts. The direct diamond RPC calls that used to live here
 * (stake, refunds, payouts) went through a browser-callable credit function
 * that lost authenticated EXECUTE on 2026-08-03 - every one of them has been
 * failing since, which is why winners were unpaid and a match could not even
 * take a stake.
 */
async function postJsonAuthed(url, body) {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const token = getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch (e) { /* cookie-based auth still applies */ }
    const res = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body || {})
    });
    let json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    if (!res.ok || !json || json.success === false) {
        const err = new Error((json && json.error) || `request_failed_${res.status}`);
        err.status = res.status;
        err.payload = json;
        throw err;
    }
    return json;
}

export default function PvPPage({ pvpHorsesEnabled = false }) {
    useTrainingBus('trivia-pvp');
    const router = useRouter();
    const { allowed, showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('trivia');
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [gameState, setGameState] = useState('lobby'); // lobby, searching, battle, waiting, result
    const [userId, setUserId] = useState(null);
    const [username, setUsername] = useState('');
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [stakeAmount, setStakeAmount] = useState(0);
    const [questions, setQuestions] = useState([]);
    const [opponent, setOpponent] = useState(null);
    const [result, setResult] = useState(null);
    const [stats, setStats] = useState({ wins: 0, losses: 0 });
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    const [matchId, setMatchId] = useState(null);
    const [isPlayer1, setIsPlayer1] = useState(false);
    // Error/refund-failure UI state — was previously silent
    const [pvpError, setPvpError] = useState(null);
    const [refundFailed, setRefundFailed] = useState(false);
    const [accessToken, setAccessToken] = useState(null); // for ReportQuestionButton
    const [heroMissing, setHeroMissing] = useState(false); // presentation: mode picture failed to load

    // Server-graded session adapter (mode 'pvp'): session-start escrows the
    // stake and serves the shared, answer-free roster; session-answer grades
    // each tap (binding first answer); session-submit grades and closes the
    // session but pays 0 for pvp BY DESIGN - sessions grade, settlement pays.
    // Payment happens in /api/trivia/pvp-settle-match from both players'
    // server-graded counts, never from anything this client reports.
    const serverRun = useServerGradedRun('pvp');

    // Battle state
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // TRAIN-WIRE-TRIVIA-HOOK-2 - shared trivia answer-state plumbing.
    // No onAnswer handler and no answer key anywhere: questions arrive from
    // session-start WITHOUT correct_index, so right/wrong comes exclusively
    // from the server verdict inside gradeAnswer below.
    const timerCtrlRef = useRef({});
    const trivia = useTriviaQuestion(questions[currentQuestionIndex]);
    const { selectedAnswer, showResult } = trivia;
    const [playerScore, setPlayerScore] = useState(0);
    const [opponentScore, setOpponentScore] = useState(null);
    // TRAIN-WIRE-TRIVIA-TIMER-2 - shared shot-clock hook
    // pauseOnHide:false — PvP is head-to-head; pausing the shot clock on
    // tab-hide handed the player a free, untimed answer-lookup window.
    const timer = useTriviaTimer({ initialTime: 40, showResult: trivia.showResult, gameState, playingState: 'battle', onTimeout: handleTimeout, pauseOnHide: false });
    timerCtrlRef.current = { stop: () => timer.setIsTimerRunning(false), reset: timer.resetTimer };

    const queueSubscription = useRef(null);
    const matchSubscription = useRef(null);
    const searchTimeout = useRef(null);
    const isStartingRef = useRef(false); // Prevent double-click race
    const playerScoreRef = useRef(0);
    const playerAnswersRef = useRef([]); // Track correct/incorrect per question

    // ---------------------------------------------------------------------
    // LIVE-VALUE REFS.
    //
    // handleFindMatch builds the queue subscription -> handleMatchFound ->
    // subscribeToMatch(handleMatchUpdate) chain. Every one of those callbacks
    // captures the bindings from the render in which handleFindMatch ran — a
    // render where stakeAmount is still 0 and isPlayer1 is still false. The
    // later setState re-renders never reach the already-registered callback.
    //
    // Anything those callbacks need is therefore written to a ref
    // synchronously at the moment the value is known. (Reading state instead
    // of these refs is the bug class that once paid real-match winners 0
    // diamonds and double-counted stats.)
    // ---------------------------------------------------------------------
    const stakeRef = useRef(0);
    const isPlayer1Ref = useRef(false);
    const matchIdRef = useRef(null);
    const opponentRef = useRef(null);
    const gameStateRef = useRef('lobby');
    const isHorseMatchRef = useRef(false);
    const completedRef = useRef(false);   // the settled result renders once per match
    const matchFoundRef = useRef(false);  // a real match won the race vs. the horse fallback
    const userIdRef = useRef(null);       // readable from unmount cleanup
    const waitingTimerRef = useRef(null); // opponent-finish deadline countdown
    // Server-graded run plumbing (mirrors the adopted solo modes):
    const [verdict, setVerdict] = useState(null); // current question's server verdict
    const answerLockRef = useRef(false);          // tap lock across the answer round-trip
    const sessionAnswersRef = useRef([]);         // [{questionId, displayIndex}] in tap order
    const settlePhaseRef = useRef(0);             // 0=playing, 1=session submitted, 2=result shown
    const waitingPollRef = useRef(null);          // settlement retry poll while 'waiting'

    // Keep gameStateRef in lockstep with gameState for the ref-based guards.
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    // Horse (AI opponent) battle state. The horse's answers are no longer
    // generated in the browser: its score is produced deterministically
    // inside /api/trivia/pvp-settle-match (same stake-scaled 60-85% accuracy
    // formula this file used to run locally), so no client input can shape a
    // house-funded payout.
    const [isHorseMatch, setIsHorseMatch] = useState(false);

    // Opponent-finish deadline (real matches only)
    const [waitingSecondsLeft, setWaitingSecondsLeft] = useState(0);
    const [waitingExpired, setWaitingExpired] = useState(false);
    useEffect(() => () => { if (waitingTimerRef.current) clearInterval(waitingTimerRef.current); }, []);

    useEffect(() => {
        if (authLoading) return;
        loadUserData();

        return () => {
            // Cleanup subscriptions
            if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }
            if (matchSubscription.current) { matchSubscription.current(); matchSubscription.current = null; }
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current);
            }
            if (waitingPollRef.current) {
                clearInterval(waitingPollRef.current);
                waitingPollRef.current = null;
            }
            // Navigating away mid-search only needs the queue row cleaned up
            // (otherwise it lingers as a ghost opponent). Nothing is charged
            // during search any more - the stake is escrowed server-side by
            // session-start once a match begins - and an in-flight match is
            // settled or refunded by the pvp-settle sweep, so a client-side
            // refund here could only ever double-pay.
            const uid = userIdRef.current;
            if (uid) {
                // Fire-and-forget: the component is going away, but the
                // promise still resolves against the module-level client.
                Promise.resolve()
                    .then(() => leaveMatchmakingQueue(uid))
                    .catch(e => console.warn('[PVP] unmount leaveQueue failed:', e));
            }
        };
    }, [avatarUser?.id, authLoading]);

    // Realtime: Sync diamond balance when it changes externally
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-pvp-bal:${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async () => {
                try {
                    const { data } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                    if (data) setUserDiamonds(data.diamonds || 0);
                } catch (e) {
                    console.warn('[PvP] Realtime diamond refresh failed:', e);
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    async function loadUserData() {
        const user = avatarUser || getAuthUser();
        if (!user) {
            router.push('/hub/trivia');
            return;
        }

        setUserId(user.id);
        userIdRef.current = user.id;
        try { setAccessToken(getAccessToken()); } catch (e) { /* anonymous report still allowed */ }

        try {
            // Get diamond balance and username
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds, username')
                .eq('id', user.id)
                .maybeSingle();

            if (profile) {
                setUserDiamonds(profile.diamonds || 0);
                setUsername(profile.username || 'Player');
            }

            // Get PvP stats from persistent stats table
            const { data: pvpStats } = await supabase
                .from('trivia_pvp_stats')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (pvpStats) {
                setStats({
                    wins: pvpStats.wins || 0,
                    losses: pvpStats.losses || 0,
                    ties: pvpStats.ties || 0,
                    winStreak: pvpStats.win_streak || 0,
                    bestStreak: pvpStats.best_streak || 0
                });
            }
        } catch (e) {
            console.warn('[PVP] Failed to load user data:', e);
        }
    }

    async function handleFindMatch(stake) {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
            // VIP gate (devhead migrated this page from useFeatureGate to
            // useVIPGate; the hook destructure above is the useVIPGate one).
            if (!allowed) {
                showUpgradeModal();
                return;
            }
        // (The old `sessionStorage.trivia_paid` cleanup is gone — nothing writes
        //  that flag any more and pvp always bills its own variable stake.)

        // Fresh balance check from DB to avoid stale-state false negatives
        let freshBalance = userDiamonds;
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (profile) {
                freshBalance = profile.diamonds || 0;
                setUserDiamonds(freshBalance);
            }
        } catch (e) {
            console.warn('[PVP] Balance check failed:', e);
        }

        if (freshBalance < stake) {
            setShowOutOfDiamonds(true);
            return;
        }

        // Write the live-value refs synchronously — the subscription callbacks
        // created below capture this render's bindings forever.
        setStakeAmount(stake);
        stakeRef.current = stake;
        completedRef.current = false;
        matchFoundRef.current = false;
        isPlayer1Ref.current = false;
        settlePhaseRef.current = 0;
        sessionAnswersRef.current = [];
        setVerdict(null);
        setPvpError(null);
        setRefundFailed(false);
        setGameState('searching');
        gameStateRef.current = 'searching';

        // NO client-side stake deduction. The browser-side diamond RPC lost
        // authenticated EXECUTE on 2026-08-03, so the deduction that used to
        // sit here could never succeed again - and even when it worked, this
        // page had to own a refund path for every abort. The stake is now
        // escrowed SERVER-SIDE by /api/trivia/session-start at the moment a
        // match actually begins, which also means cancelling a search refunds
        // nothing because nothing has been taken.

        // The legacy browser horse path is independently fail-closed. It is
        // disabled in production during containment and will be replaced by
        // the server-persisted 20-45 second eligibility timestamp in Phase 5.
        if (pvpHorsesEnabled) {
            searchTimeout.current = setTimeout(() => {
                handleHorseMatch(stake);
            }, 5000);
        }

        // Try to join the matchmaking queue (best-effort for real matches)
        try {
            const { data: queueEntry } = await joinMatchmakingQueue(userId, stake);

            if (queueEntry) {
                // Subscribe to queue changes to detect new opponents.
                // FIX(audit): pass userId as the third argument — the polling
                // service's signature is subscribeToQueue(stakeAmount, onNewPlayer,
                // userId) and it needs the id to find this player's own 'matched'
                // queue row. Without it the matched-row lookup queried
                // user_id=undefined and never fired, so the player an opponent had
                // matched against never entered the match: their stake stayed in
                // the opponent's match while the horse fallback hijacked them.
                queueSubscription.current = subscribeToQueue(stake, async (payload) => {
                    if (matchFoundRef.current) return;
                    // FIX(audit): a 'matched' notification now arrives carrying the
                    // ALREADY-CREATED match (the opponent's findMatch built it).
                    // Enter it directly - re-running findMatch here always
                    // returned null because the opponent's queue row is no
                    // longer 'waiting'. The shared roster is served by
                    // session-start, not carried in this payload.
                    if (payload && payload.match && payload.match.id) {
                        // Cancel horse fallback — real match found
                        matchFoundRef.current = true;
                        if (searchTimeout.current) clearTimeout(searchTimeout.current);
                        handleMatchFound(payload);
                        return;
                    }
                    // Legacy shape: another player appeared in the queue — try to
                    // pair with them ourselves.
                    if (payload && payload.user_id && payload.user_id !== userId) {
                        const matchData = await findMatch(userId, stake);
                        if (matchData && !matchFoundRef.current) {
                            // Cancel horse fallback — real match found
                            matchFoundRef.current = true;
                            if (searchTimeout.current) clearTimeout(searchTimeout.current);
                            handleMatchFound(matchData);
                        }
                    }
                }, userId);

                // Also immediately try to find an existing opponent
                const matchData = await findMatch(userId, stake);
                if (matchData && !matchFoundRef.current) {
                    // Cancel horse fallback — real match found
                    matchFoundRef.current = true;
                    if (searchTimeout.current) clearTimeout(searchTimeout.current);
                    handleMatchFound(matchData);
                }
            }
        } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
        } finally {
            isStartingRef.current = false;
        }
    }

    // Horse Match - Select random AI horse as opponent
    async function handleHorseMatch(stake) {
        if (!pvpHorsesEnabled) return;
        // Ref-based guards. The previous check read `gameState` from the closure
        // captured when handleFindMatch ran (frozen at 'lobby'/'searching'), so
        // it NEVER blocked: a horse match could clobber a real match that had
        // just been found — double question loads, wrong opponent, and the real
        // opponent left hanging on a match that never completes.
        if (matchFoundRef.current) return;
        if (gameStateRef.current === 'battle' || gameStateRef.current === 'result' || gameStateRef.current === 'waiting') return;

        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }

        // Leave the matchmaking queue BEFORE playing the horse. Previously only
        // the local subscription was torn down and the trivia_pvp_queue row was
        // left 'waiting' — another real player would match against this ghost,
        // stake their diamonds and wait forever for a score that never comes.
        try { await leaveMatchmakingQueue(userId); } catch (e) { console.warn('[PVP] leaveQueue before horse match failed:', e); }

        // Nothing is charged anywhere in this function - the stake is escrowed
        // by session-start inside beginMatchSession - so any failure here can
        // simply bail back to the lobby with no refund machinery.
        try {
            // Get random AI horse from profiles. The horse's identity is
            // cosmetic: its SCORE is generated server-side by the settlement
            // route from the match id and stake, so which horse appears (and
            // anything else this client does) cannot influence the payout.
            const { data: horses } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .eq('is_horse', true)
                .limit(50);

            if (!horses || horses.length === 0) {
                // No pseudo-horse fallback any more: the match row requires a
                // real profile uuid for player2. Nothing has been charged, so
                // failing out is safe.
                throw new Error('no_horse_profiles');
            }

            const randomHorse = horses[Math.floor(Math.random() * horses.length)];
            // Use the horse's REAL record where one exists. Fabricating a random
            // W/L every match meant the same horse showed a different record each
            // time you met it — obviously fake.
            let horseWins = 0;
            let horseLosses = 0;
            try {
                const { data: horseStats } = await supabase
                    .from('trivia_pvp_stats')
                    .select('wins, losses')
                    .eq('user_id', randomHorse.id)
                    .maybeSingle();
                if (horseStats) {
                    horseWins = horseStats.wins || 0;
                    horseLosses = horseStats.losses || 0;
                }
            } catch (e) {
                console.warn('[PVP] Horse stats lookup failed, defaulting to 0-0:', e);
            }
            const horseOpponent = {
                id: randomHorse.id,
                username: randomHorse.username,
                avatar_url: randomHorse.avatar_url,
                wins: horseWins,
                losses: horseLosses,
                isHorse: true
            };

            // A horse match is a REAL trivia_pvp_matches row now: the
            // settlement route needs a row to use as its mutex, and the
            // stale-match sweep needs one to clean up abandoned runs (which
            // settle as a forfeit loss, exactly like the old economics).
            // questions is left null ON PURPOSE - session-start seeds the
            // roster server-side, so this client cannot hand-pick questions
            // it has already learned the answers to.
            const { data: match, error: matchErr } = await supabase
                .from('trivia_pvp_matches')
                .insert({
                    player1_id: userId,
                    player2_id: randomHorse.id,
                    stake_amount: stake,
                    status: 'active'
                })
                .select()
                .maybeSingle();
            if (matchErr || !match) {
                throw matchErr || new Error('horse_match_create_failed');
            }

            setIsHorseMatch(true);
            isHorseMatchRef.current = true;
            setOpponent(horseOpponent);
            opponentRef.current = horseOpponent;
            setMatchId(match.id);
            matchIdRef.current = match.id;
            setIsPlayer1(true);
            isPlayer1Ref.current = true;
            matchFoundRef.current = true;
            completedRef.current = false;
            settlePhaseRef.current = 0;

            await beginMatchSession(match.id);
        } catch (e) {
            console.warn('[PVP] handleHorseMatch failed (nothing charged):', e);
            setPvpError('Could not start a match right now. Nothing was charged - please try again.');
            setGameState('lobby');
            gameStateRef.current = 'lobby';
        }
    }

    function handleMatchFound(matchData) {
        matchFoundRef.current = true;
        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        const amIPlayer1 = matchData.match.player1_id === userId;

        // Write refs BEFORE subscribing. subscribeToMatch registers
        // handleMatchUpdate immediately and realtime events can arrive before
        // React has flushed any of these setState calls.
        matchIdRef.current = matchData.match.id;
        opponentRef.current = matchData.opponent;
        isPlayer1Ref.current = amIPlayer1;
        isHorseMatchRef.current = false;
        completedRef.current = false;
        settlePhaseRef.current = 0;

        setMatchId(matchData.match.id);
        setOpponent(matchData.opponent);
        setIsPlayer1(amIPlayer1);
        setIsHorseMatch(false);

        // Subscribe to match updates
        matchSubscription.current = subscribeToMatch(matchData.match.id, handleMatchUpdate);

        // Questions come from session-start (answer-free, per-player display
        // order, stake escrowed server-side) - never from the match payload.
        beginMatchSession(matchData.match.id);
    }

    /**
     * Open the server-graded session for a match (real or horse) and enter
     * battle. session-start verifies participation, serves the SHARED roster
     * (drawn server-side, no answer key), and escrows the stake with an
     * idempotent reference. A failed HTTP response is ambiguous: the atomic
     * database transaction may already have committed, so retries resume the
     * same binding and the recovery sweep settles or refunds abandoned play.
     */
    async function beginMatchSession(liveMatchId) {
        try {
            const started = await serverRun.start({ matchId: liveMatchId });
            if (!started || !Array.isArray(started.questions) || started.questions.length === 0) {
                throw new Error('no_questions_available');
            }
            setQuestions(started.questions);
            sessionAnswersRef.current = [];
            setVerdict(null);
            answerLockRef.current = false;

            // Short "opponent found" beat before the first question.
            setTimeout(() => {
                gameStateRef.current = 'battle';
                setGameState('battle');
                setCurrentQuestionIndex(0);
                setPlayerScore(0);
                playerScoreRef.current = 0;
                playerAnswersRef.current = [];
                trivia.reset();
                timer.resetTimer();
            }, 2000);
        } catch (e) {
            console.warn('[PVP] session-start failed:', e?.message || e);
            if (matchSubscription.current) { matchSubscription.current(); matchSubscription.current = null; }
            try { await leaveMatchmakingQueue(userId); } catch (qe) { console.warn('[PVP] leaveQueue failed:', qe); }
            if (e?.status === 402 || e?.message === 'insufficient_diamonds') {
                setShowOutOfDiamonds(true);
            } else {
                setPvpError('Could not confirm the match start. Your stake may be pending; retry to resume the same match.');
            }
            setGameState('lobby');
            gameStateRef.current = 'lobby';
        }
    }

    /**
     * Per-answer server grading (same pattern as the adopted solo modes).
     * Lock the tap immediately, record it with /api/trivia/session-answer
     * (the first answer per question is BINDING server-side), then reveal
     * from the verdict. A failed call unlocks so the player can re-tap - the
     * endpoint is idempotent per question, so a retry cannot double-record.
     * displayIndex -1 is the shot-clock timeout.
     */
    async function gradeAnswer(displayIndex) {
        if (answerLockRef.current || trivia.showResult) return;
        const q = questions[currentQuestionIndex];
        if (!q || typeof q.id !== 'string') return;
        answerLockRef.current = true;
        timerCtrlRef.current.stop?.();
        if (displayIndex >= 0) trivia.setSelectedAnswer(displayIndex); // instant visual lock on the tap
        try {
            const v = await serverRun.answer({ questionId: q.id, displayIndex });
            applyVerdict(q, displayIndex, v);
        } catch (e) {
            console.warn('[PVP] answer grading failed:', e?.message || e);
            if (displayIndex < 0) {
                // Timeout that could not reach the server: no re-tap is
                // possible, so record it for session-submit (which grades
                // server-side) and count the miss without a reveal.
                sessionAnswersRef.current.push({ questionId: q.id, displayIndex: -1 });
                playerAnswersRef.current[currentQuestionIndex] = false;
                busEmit.decisionIncorrect(playerScoreRef.current);
                advanceOrFinish(400);
            } else {
                trivia.setSelectedAnswer(null);
                answerLockRef.current = false;
                setPvpError('Could not submit that answer - please tap it again.');
                setTimeout(() => setPvpError(null), 3000);
                timer.setIsTimerRunning(true);
            }
        }
    }

    /** Reveal + bookkeeping driven entirely by the server verdict. */
    function applyVerdict(q, displayIndex, v) {
        setVerdict(v);
        trivia.setShowResult(true);
        sessionAnswersRef.current.push({ questionId: q.id, displayIndex });

        const wasCorrect = v?.wasCorrect === true;
        playerAnswersRef.current[currentQuestionIndex] = wasCorrect;
        if (wasCorrect) {
            // Display-only running count. The number that settles the match
            // is the server-graded correct_count on the session row.
            const newScore = playerScoreRef.current + 1;
            playerScoreRef.current = newScore;
            setPlayerScore(newScore);
            busEmit.decisionCorrect(newScore);
        } else {
            busEmit.decisionIncorrect(playerScoreRef.current);
            busEmit.screenShake('light');
        }

        // Advance quickly - no GTO explanations in PvP.
        advanceOrFinish(700);
    }

    function advanceOrFinish(delayMs) {
        setTimeout(() => {
            if (currentQuestionIndex + 1 >= questions.length) {
                finishBattle();
            } else {
                setCurrentQuestionIndex(prev => prev + 1);
                setVerdict(null);
                trivia.reset();
                answerLockRef.current = false;
                timerCtrlRef.current.reset?.();
            }
        }, delayMs);
    }

    async function handleCancelSearch() {
        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        // Nothing to refund: the stake is only escrowed by session-start once
        // a match actually begins, and a search that is still cancellable
        // never got that far. All this has to do is vacate the queue row.
        try { await leaveMatchmakingQueue(userId); } catch (e) { console.warn('[PVP] leaveQueue failed:', e); }

        setGameState('lobby');
        gameStateRef.current = 'lobby';
        setOpponent(null);
        opponentRef.current = null;
    }

    function handleMatchUpdate(updatedMatch) {
        // Reads isPlayer1Ref, NOT the isPlayer1 state: this callback was
        // registered from a render where isPlayer1 was still false, so for the
        // actual player1 the "opponent" field resolved to their OWN score column.
        // These columns are written by the SETTLEMENT ENGINE (service role) -
        // they are display-only and never a settlement input.
        const opponentScoreField = isPlayer1Ref.current ? 'player2_score' : 'player1_score';
        const oppScore = updatedMatch[opponentScoreField];
        if (oppScore !== null && oppScore !== undefined) {
            setOpponentScore(oppScore);
        }

        // 'complete' (or another participant's 'settling' claim) means the
        // server settled - or is settling - this match. Fetch the
        // authoritative outcome; settlePhaseRef/completedRef make the result
        // render once. Only react after our own session is submitted: before
        // that the settle route would answer 'pending' anyway, and the
        // finishBattle path picks the result up itself.
        if ((updatedMatch.status === 'complete' || updatedMatch.status === 'settling')
            && !completedRef.current && settlePhaseRef.current >= 1) {
            requestSettlement('realtime');
        }
    }

    function handleTimeout() {
        timer.setIsTimerRunning(false);
        gradeAnswer(-1); // shot-clock timeout counts as wrong, graded server-side
    }

    async function finishBattle() {
        timer.setIsTimerRunning(false);
        setGameState('waiting');
        gameStateRef.current = 'waiting';

        // Grade our session server-side, then ask for settlement. A horse
        // match settles on the first call (the server generates the horse
        // score itself); a real match stays pending until the opponent's
        // session is graded, and the realtime event / waiting poll finishes
        // the job then.
        await finalizeRun();
        if (settlePhaseRef.current < 2) {
            // Opponent-finish deadline. The player is never truly stuck: the
            // stale-match sweep force-settles anything still open ~30 minutes
            // after creation, win, refund or forfeit.
            startWaitingDeadline();
            startWaitingPoll();
        }
    }

    /**
     * Start (or restart) the wait-for-opponent countdown. On expiry the player
     * is told the opponent has not finished and offered a lobby escape; the
     * match subscription stays live so a late completion still resolves.
     */
    function startWaitingDeadline() {
        if (waitingTimerRef.current) clearInterval(waitingTimerRef.current);
        const deadline = Date.now() + WAITING_DEADLINE_MS;
        setWaitingSecondsLeft(Math.ceil(WAITING_DEADLINE_MS / 1000));
        setWaitingExpired(false);
        waitingTimerRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setWaitingSecondsLeft(remaining);
            if (remaining <= 0) {
                clearInterval(waitingTimerRef.current);
                waitingTimerRef.current = null;
                setWaitingExpired(true);
            }
        }, 1000);
    }

    /**
     * Idempotent two-phase finish, safe to call repeatedly (the waiting poll
     * does). Phase 1 grades + closes our session; phase 2 asks the settlement
     * route to pay from the graded counts.
     */
    async function finalizeRun() {
        if (settlePhaseRef.current < 1) {
            try {
                await serverRun.submit(sessionAnswersRef.current.map(a => ({
                    questionId: a.questionId,
                    displayIndex: a.displayIndex
                })));
                settlePhaseRef.current = 1;
            } catch (e) {
                if (e?.status === 409 || e?.status === 410) {
                    // Already closed (double submit or expiry race) - the
                    // grading is done either way; move on to settlement.
                    settlePhaseRef.current = 1;
                } else {
                    console.warn('[PVP] session submit failed (will retry):', e?.message || e);
                    setPvpError('Could not submit your run - retrying automatically.');
                    return;
                }
            }
            setPvpError(null);
        }
        await requestSettlement('finish');
    }

    /**
     * Ask /api/trivia/pvp-settle-match to settle. Retry-safe by design: the
     * route is idempotent (conditional status claim + reference-dedup'd
     * credits shared with the pvp-settle sweep), so calling it from the
     * finish path, the realtime event AND the poll can never double-pay.
     */
    async function requestSettlement(reason) {
        if (settlePhaseRef.current >= 2) return;
        const liveMatchId = matchIdRef.current || matchId;
        if (!liveMatchId) return;
        try {
            const s = await postJsonAuthed('/api/trivia/pvp-settle-match', { matchId: liveMatchId });
            if (s && s.settled) {
                await showSettlement(s);
            }
            // Not settled yet: opponent still playing. The realtime status
            // change or the waiting poll calls this again.
        } catch (e) {
            console.warn(`[PVP] settlement request failed (${reason}):`, e?.message || e);
        }
    }

    /** Render the server-decided outcome. Runs exactly once per match. */
    async function showSettlement(s) {
        if (settlePhaseRef.current >= 2) return;
        settlePhaseRef.current = 2;
        completedRef.current = true;
        if (matchSubscription.current) { matchSubscription.current(); matchSubscription.current = null; }
        if (waitingTimerRef.current) { clearInterval(waitingTimerRef.current); waitingTimerRef.current = null; }
        if (waitingPollRef.current) { clearInterval(waitingPollRef.current); waitingPollRef.current = null; }

        const stake = stakeRef.current || stakeAmount;
        const won = s.outcome === 'win';
        // 'refund' (sweep closed an unfinished match) displays like a tie:
        // no winner, stake returned.
        const tied = s.outcome === 'tie' || s.outcome === 'refund';
        const myScore = Number.isFinite(s.myCorrect) ? s.myCorrect : playerScoreRef.current;
        const theirScore = Number.isFinite(s.opponentCorrect) ? s.opponentCorrect : 0;

        setOpponentScore(theirScore);
        setResult({
            won,
            tied,
            playerScore: myScore,
            opponentScore: theirScore,
            winnings: won ? (s.winnings || 0) : (tied ? stake : 0),
            stake,
            opponent: opponentRef.current || opponent,
            isHorseMatch: isHorseMatchRef.current,
            payoutFailed: false
        });

        if (won) {
            busEmit.diamondsEarned(s.winnings || 0, 'PvP Victory');
            busEmit.celebration('confetti');
        } else if (!tied) {
            busEmit.screenShake('medium');
        }

        // Balance changed server-side - mirror it from the DB.
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds || 0);
        } catch (e) {
            console.warn('[PVP] balance refresh failed:', e);
        }

        // Persistent W/L stats are recorded by the same server settlement that
        // decided and paid this result. Refresh the authoritative row instead
        // of reporting an outcome from the browser.
        await loadUserData();

        // No client-side question-history writes here: session-start already
        // records the roster into the 60-day no-repeat window server-side.

        setGameState('result');
        gameStateRef.current = 'result';
    }

    /**
     * While on the waiting screen, retry submit/settle every 15s. Covers a
     * missed realtime event and transient network failures; harmless because
     * finalizeRun and the settle route are both idempotent.
     */
    function startWaitingPoll() {
        if (waitingPollRef.current) clearInterval(waitingPollRef.current);
        waitingPollRef.current = setInterval(() => {
            if (settlePhaseRef.current >= 2 || gameStateRef.current !== 'waiting') {
                clearInterval(waitingPollRef.current);
                waitingPollRef.current = null;
                return;
            }
            finalizeRun().catch(e => console.warn('[PVP] waiting poll failed:', e?.message || e));
        }, 15000);
    }

    // NOTE: finishHorseBattle() and handleBattleComplete() used to live here.
    // Both settled money in the browser (horse score fabricated locally, the
    // winner crediting themselves through a dead RPC). Their entire job now
    // belongs to /api/trivia/pvp-settle-match; showSettlement above only
    // renders what the server decided.

    function handlePlayAgain() {
        if (waitingTimerRef.current) { clearInterval(waitingTimerRef.current); waitingTimerRef.current = null; }
        setGameState('lobby');
        gameStateRef.current = 'lobby';
        setWaitingExpired(false);
        setWaitingSecondsLeft(0);
        setPvpError(null);
        setRefundFailed(false);
        setResult(null);
        setOpponent(null);
        opponentRef.current = null;
        setMatchId(null);
        matchIdRef.current = null;
        stakeRef.current = 0;
        isPlayer1Ref.current = false;
        isHorseMatchRef.current = false;
        completedRef.current = false;
        matchFoundRef.current = false;
        settlePhaseRef.current = 0;
        sessionAnswersRef.current = [];
        answerLockRef.current = false;
        setVerdict(null);
        serverRun.reset();
        if (waitingPollRef.current) { clearInterval(waitingPollRef.current); waitingPollRef.current = null; }
        setQuestions([]);
        setPlayerScore(0);
        playerScoreRef.current = 0;
        playerAnswersRef.current = [];
        setOpponentScore(null);
        setCurrentQuestionIndex(0);
        trivia.reset();
        timer.setTimeLeft(40);
        timer.setIsTimerRunning(false);
        setIsHorseMatch(false);
        setStakeAmount(0);
        // Refresh diamond balance from DB
        loadUserData();
    }

    const currentQuestion = questions[currentQuestionIndex];

    // ---------------------------------------------------------------------
    // PRESENTATION ONLY (#ClubArenaConsole). Everything above this line is
    // the match engine and is untouched by the console redesign: this block
    // only chooses what the painted chassis prints for the current state.
    // Counts use formatTriviaDisplayNumber; settlement amounts (stake,
    // winnings, refunds) print exactly as the server decided them.
    // ---------------------------------------------------------------------
    const fmt = formatTriviaDisplayNumber;
    // Handles print in Title Case like every other string (underscores read
    // as word breaks), so a player's name never reaches the glass lower case.
    const displayName = name => printPlayerName(name, 'Player');
    const recordText = (wins, losses) => `${fmt(wins || 0)} W - ${fmt(losses || 0)} L`;
    const clockText = seconds => {
        const safe = Math.max(0, Math.trunc(Number(seconds) || 0));
        return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
    };
    const totalQuestions = questions.length;
    const vipGateType = featureConfig?.gate || 'VIP';
    const dayPassCost = featureConfig?.cost || 25;

    let consoleHead;
    let primaryAction = null;
    let secondaryAction = null;
    if (gameState === 'searching') {
        consoleHead = {
            eyebrow: 'PvP Battle',
            title: opponent ? 'Opponent Found' : 'Finding An Opponent',
            subtitle: opponent ? 'Loading The Questions' : 'Free To Cancel Until Matched',
            pill: `Stake ${stakeAmount}`,
            pillInk: 'gold',
        };
        primaryAction = { label: 'Cancel Search', onClick: handleCancelSearch, 'aria-label': 'Cancel Search' };
    } else if (gameState === 'battle') {
        consoleHead = {
            eyebrow: 'PvP Battle',
            title: currentQuestion ? `Question ${currentQuestionIndex + 1} Of ${totalQuestions}` : 'Loading Question',
            subtitle: `Stake ${stakeAmount} Diamonds`,
            pill: clockText(timer.timeLeft),
            pillInk: timer.timeLeft <= 10 ? 'red' : 'gold',
        };
    } else if (gameState === 'waiting') {
        consoleHead = {
            eyebrow: 'PvP Battle',
            title: 'Battle Complete',
            subtitle: waitingExpired ? 'Your Opponent Has Not Finished Yet' : 'Waiting For Opponent To Finish',
            pill: `Score ${playerScore}`,
            pillInk: 'blue',
        };
        if (waitingExpired) {
            primaryAction = { label: 'Back To Lobby', onClick: handlePlayAgain };
        }
    } else if (gameState === 'result' && result) {
        consoleHead = {
            eyebrow: 'Match Result',
            title: result.won ? 'Victory' : result.tied ? 'Tie Match' : 'Defeat',
            subtitle: result.won ? 'The Server Paid The Winner' : result.tied ? 'Your Stake Was Returned' : 'Better Luck Next Match',
            pill: result.won ? `+${result.winnings}` : result.tied ? 'Refund' : `-${result.stake ?? stakeAmount}`,
            pillInk: result.won ? 'green' : result.tied ? 'silver' : 'red',
        };
        secondaryAction = { label: 'Back To Trivia', onClick: () => router.push('/hub/trivia'), 'aria-label': 'Back To Trivia' };
        primaryAction = { label: 'Play Again', onClick: handlePlayAgain, 'aria-label': 'Play Again' };
    } else {
        consoleHead = {
            eyebrow: 'PvP Battle',
            title: 'Head To Head',
            subtitle: 'Same Questions, One Winner',
            pill: userId ? fmt(userDiamonds) : undefined,
            pillInk: 'blue',
        };
    }

    return (
        <TriviaErrorBoundary pageName="PvP Battle">
            <SEOHead
                title="PvP Trivia - Player vs Player"
                description="Head To Head Poker Trivia On Smarter.Poker: Two Players, The Same Questions At The Same Time, And The Faster Correct Answer Takes The Point. Free To Play, And Nothing In It Is A Wager."
                canonical="/hub/trivia/pvp"
            />

            <div
                className="trivia-console-standalone trivia-pvp-page"
                data-trivia-surface="pvp"
                data-game-state={gameState}
            >
                <UniversalHeader pageDepth={2} />

                <main className="trivia-pvp-shell" aria-labelledby="pvp-title">
                    <TriviaConsole
                        className="trivia-pvp-console"
                        eyebrow={consoleHead.eyebrow}
                        title={consoleHead.title}
                        titleAs="h1"
                        titleId="pvp-title"
                        subtitle={consoleHead.subtitle}
                        pill={consoleHead.pill}
                        pillInk={consoleHead.pillInk}
                        primaryAction={primaryAction}
                        secondaryAction={secondaryAction}
                    >
                        {/* Error / refund-failure notice. pvpError and
                            refundFailed were once set on every failure path
                            with no JSX reading them, so players got zero
                            feedback when their money did not move. The
                            message is printed on the glass (Title Case at the
                            print site), never in a drawn banner. */}
                        {pvpError && (
                            <div className="trivia-pvp-alert" role="alert">
                                <p className="trivia-pvp-alert__text">{toTitleCase(pvpError)}</p>
                                {refundFailed && (
                                    <p className="trivia-pvp-alert__note">
                                        Please Double-Check Your Diamond Balance. If It Looks Wrong, Contact Support With The Time Of This Match.
                                    </p>
                                )}
                                <button
                                    type="button"
                                    className="tc-word trivia-pvp-alert__dismiss"
                                    onClick={() => { setPvpError(null); setRefundFailed(false); }}
                                >
                                    Dismiss
                                </button>
                            </div>
                        )}

                        {/* Lobby */}
                        {gameState === 'lobby' && (
                            <div className="trivia-pvp-stage trivia-pvp-stage--lobby">
                                {!heroMissing && (
                                    <img
                                        className="trivia-pvp-hero"
                                        src="/images/trivia/modes-console-v1/pvp.webp"
                                        alt=""
                                        width={1000}
                                        height={560}
                                        decoding="async"
                                        onError={() => setHeroMissing(true)}
                                    />
                                )}

                                <p className="trivia-console-copy trivia-pvp-intro">
                                    Two Players, The Same Questions, The Same Shot Clock. Pick A Stake And The Better Score Takes The Pot.
                                </p>

                                {!userId ? (
                                    <p className="trivia-pvp-status" role="status">Loading Your Account</p>
                                ) : (
                                    <>
                                        <ul className="tc-rows trivia-pvp-rows" aria-label="Your PvP Account">
                                            <li className="tc-row">
                                                <span className="tc-row__label">Diamonds Available</span>
                                                <span className="tc-row__value">{fmt(userDiamonds)}</span>
                                            </li>
                                            <li className="tc-row">
                                                <span className="tc-row__label">Record</span>
                                                <span className="tc-row__value">{recordText(stats.wins, stats.losses)}</span>
                                            </li>
                                            {stats.bestStreak > 0 && (
                                                <li className="tc-row">
                                                    <span className="tc-row__label">Best Streak</span>
                                                    <span className="tc-row__value tc-ink--gold">{fmt(stats.bestStreak)}</span>
                                                </li>
                                            )}
                                        </ul>

                                        <section className="trivia-pvp-stakes" aria-labelledby="pvp-stakes-title">
                                            <h2 id="pvp-stakes-title" className="tc-label trivia-pvp-stakes__title">Select Your Stake</h2>
                                            <ul className="tc-rows">
                                                {STAKE_OPTIONS.map(stake => (
                                                    <li key={stake} className="tc-row trivia-pvp-stake" data-affordable={userDiamonds >= stake ? 'true' : 'false'}>
                                                        <button
                                                            type="button"
                                                            className="tc-word trivia-pvp-stake__pick"
                                                            onClick={() => userDiamonds >= stake && handleFindMatch(stake)}
                                                            disabled={userDiamonds < stake}
                                                            aria-label={`Stake ${stake} Diamonds`}
                                                        >
                                                            Stake {stake}
                                                        </button>
                                                        {userDiamonds < stake ? (
                                                            <span className="tc-row__value tc-ink--red">Not Enough Diamonds</span>
                                                        ) : (
                                                            <span className="tc-row__value tc-ink--green">Win {Math.floor(stake * 2 * 0.9)}</span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className="trivia-pvp-note">10% House Rake On Prize Pool</p>
                                        </section>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Searching for an opponent, then the short "opponent
                            found" beat while session-start serves the roster.
                            Every player in the pool prints the same way. */}
                        {gameState === 'searching' && (
                            <div className="trivia-pvp-stage trivia-pvp-stage--searching">
                                <p className="trivia-pvp-status" role="status">
                                    {opponent ? 'Match Found' : 'Searching For A Player At Your Stake'}
                                </p>
                                <ul className="tc-rows trivia-pvp-rows" aria-label="Match">
                                    <li className="tc-row">
                                        <span className="tc-row__label">Stake</span>
                                        <span className="tc-row__value tc-ink--gold">{stakeAmount} Diamonds</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label">Your Record</span>
                                        <span className="tc-row__value">{recordText(stats.wins, stats.losses)}</span>
                                    </li>
                                    {opponent && (
                                        <li className="tc-row trivia-pvp-row--name">
                                            <span className="tc-row__label">Opponent</span>
                                            <span className="tc-row__value tc-ink--blue">{displayName(opponent.username)}</span>
                                        </li>
                                    )}
                                    {opponent && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Their Record</span>
                                            <span className="tc-row__value">{recordText(opponent.wins, opponent.losses)}</span>
                                        </li>
                                    )}
                                    <li className="tc-row">
                                        <span className="tc-row__label">Balance</span>
                                        <span className="tc-row__value">{fmt(userDiamonds)}</span>
                                    </li>
                                </ul>
                            </div>
                        )}

                        {/* Battle */}
                        {gameState === 'battle' && !currentQuestion && (
                            <p className="trivia-pvp-status" role="status">Loading Question</p>
                        )}
                        {gameState === 'battle' && currentQuestion && (
                            <div className="trivia-pvp-stage trivia-pvp-stage--battle">
                                <ul className="tc-rows trivia-pvp-scoreboard" aria-label="Scoreboard">
                                    <li className="tc-row">
                                        <span className="tc-row__label trivia-pvp-name">{displayName(username)}</span>
                                        <span className="tc-row__value tc-ink--blue">{playerScore}</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label trivia-pvp-name">{displayName(opponent?.username || 'Opponent')}</span>
                                        <span className="tc-row__value tc-ink--silver">
                                            {opponentScore != null ? opponentScore : (
                                                <span className="trivia-pvp-thinking" aria-hidden="true">Thinking</span>
                                            )}
                                        </span>
                                    </li>
                                </ul>

                                {/* Per-question outcomes: the data lives in
                                    playerAnswersRef; printed as numerals in
                                    the verdict's ink, never drawn dots. */}
                                <p className="trivia-pvp-marks" aria-hidden="true">
                                    {questions.map((_, i) => {
                                        const outcome = playerAnswersRef.current[i];
                                        const mark = outcome === true ? 'correct'
                                            : outcome === false ? 'wrong'
                                                : i === currentQuestionIndex ? 'current' : 'open';
                                        return <span key={i} className="trivia-pvp-mark" data-outcome={mark}>{i + 1}</span>;
                                    })}
                                </p>

                                <h2 className="question-text trivia-pvp-question">{toTitleCase(currentQuestion.question)}</h2>

                                <div className="options trivia-pvp-options">
                                    {/* correctIndex comes from the SERVER verdict -
                                        session-start never ships an answer key, so
                                        the reveal cannot happen before the server
                                        has graded (and bound) the tap. */}
                                    {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-2: shared option primitive */}
                                    {currentQuestion.options.map((option, idx) => (
                                        <TriviaAnswerOption
                                            key={idx}
                                            index={idx}
                                            option={toTitleCase(option)}
                                            selectedAnswer={selectedAnswer}
                                            correctIndex={verdict ? verdict.correctDisplayIndex : null}
                                            showResult={showResult}
                                            onSelect={gradeAnswer}
                                        />
                                    ))}
                                </div>

                                {/* Report-a-bad-question, only after the reveal so
                                    it cannot stall the shot clock. */}
                                {showResult && currentQuestion?.id != null && (
                                    <div className="trivia-pvp-report">
                                        <ReportQuestionButton questionId={currentQuestion.id} userToken={accessToken} />
                                    </div>
                                )}

                                <p className="trivia-pvp-meta">
                                    Record {recordText(stats.wins, stats.losses)} <span aria-hidden="true">|</span> {fmt(userDiamonds)} Diamonds
                                </p>
                            </div>
                        )}

                        {/* Waiting for the opponent to finish */}
                        {gameState === 'waiting' && (
                            <div className="trivia-pvp-stage trivia-pvp-stage--waiting">
                                <ul className="tc-rows trivia-pvp-rows" aria-label="Your Run">
                                    <li className="tc-row">
                                        <span className="tc-row__label">Your Score</span>
                                        <span className="tc-row__value tc-ink--blue">{playerScore} Of {totalQuestions}</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label trivia-pvp-name">{displayName(opponent?.username || 'Opponent')}</span>
                                        <span className="tc-row__value">{opponentScore != null ? `${opponentScore} Of ${totalQuestions}` : 'Playing'}</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label">Stake</span>
                                        <span className="tc-row__value tc-ink--gold">{stakeAmount} Diamonds</span>
                                    </li>
                                    {!waitingExpired && waitingSecondsLeft > 0 && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Time Left</span>
                                            <span className={`tc-row__value ${waitingSecondsLeft <= 10 ? 'tc-ink--red' : 'tc-ink--gold'}`}>{clockText(waitingSecondsLeft)}</span>
                                        </li>
                                    )}
                                </ul>
                                {!waitingExpired ? (
                                    <p className="trivia-pvp-status" role="status">The Match Settles The Moment They Finish</p>
                                ) : (
                                    /* Escape hatch. Before this, a player whose opponent
                                       disconnected sat here forever with their stake locked
                                       and no way out. The pvp-settle sweep force-settles
                                       anything still open ~30 minutes after the match
                                       started, so leaving never strands the stake, and
                                       there is still no client-side refund here. */
                                    <div className="trivia-pvp-expired">
                                        <p className="trivia-pvp-status">Your Opponent Has Not Finished Yet.</p>
                                        <p className="trivia-pvp-note">
                                            Your Run Is Graded And Locked In On The Server. If Your Opponent Finishes, The Match Settles Instantly And Pays The Winner. If They Never Finish, The Automatic Settlement Sweep Closes The Match Within About 30 Minutes - You Can Leave This Screen Safely And Check Your Balance Later.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Result: the server-decided outcome */}
                        {gameState === 'result' && result && (
                            <div className="trivia-pvp-stage trivia-pvp-stage--result">
                                <ul className="tc-rows trivia-pvp-rows" aria-label="Match Result">
                                    <li className="tc-row">
                                        <span className="tc-row__label">Your Score</span>
                                        <span className="tc-row__value tc-ink--blue">{result.playerScore} Of {totalQuestions}</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label trivia-pvp-name">{displayName(result.opponent?.username || 'Opponent')}</span>
                                        <span className="tc-row__value">{result.opponentScore} Of {totalQuestions}</span>
                                    </li>
                                    <li className="tc-row">
                                        {/* A tie is a refund, not winnings - labelling it
                                            as a payout read as money won. */}
                                        <span className="tc-row__label">{result.tied ? 'Stake Returned' : 'Diamonds'}</span>
                                        <span className={`tc-row__value ${result.won ? 'tc-ink--green' : result.tied ? 'tc-ink--white' : 'tc-ink--red'}`}>
                                            {result.won
                                                ? `+${result.winnings} Diamonds`
                                                : result.tied
                                                    ? `${result.stake ?? stakeAmount} Diamonds`
                                                    : `-${result.stake ?? stakeAmount} Diamonds`}
                                        </span>
                                    </li>
                                    {result.payoutFailed && (
                                        <li className="tc-row">
                                            <span className="tc-row__label">Status</span>
                                            <span className="tc-row__value tc-ink--red">Payout Pending</span>
                                        </li>
                                    )}
                                    <li className="tc-row">
                                        <span className="tc-row__label">Record</span>
                                        <span className="tc-row__value">{recordText(stats.wins, stats.losses)}</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label">Win Streak</span>
                                        <span className="tc-row__value tc-ink--gold">{fmt(stats.winStreak || 0)}</span>
                                    </li>
                                    <li className="tc-row">
                                        <span className="tc-row__label">Balance</span>
                                        <span className="tc-row__value">{fmt(userDiamonds)}</span>
                                    </li>
                                </ul>
                            </div>
                        )}
                    </TriviaConsole>
                </main>

                {/* Not enough Diamonds for the chosen stake (fresh balance
                    check, or session-start answered 402). */}
                <TriviaConsoleDialog
                    open={showOutOfDiamonds}
                    onClose={() => setShowOutOfDiamonds(false)}
                    eyebrow="PvP Battle"
                    title="Not Enough Diamonds"
                    pill={fmt(userDiamonds)}
                    pillInk="gold"
                    secondaryAction={{ label: 'Close', onClick: () => setShowOutOfDiamonds(false) }}
                    primaryAction={{ label: 'Get Diamonds', tone: 'gold', onClick: () => router.push('/hub/diamond-store') }}
                >
                    <p className="trivia-console-copy">
                        You Don't Have Enough Diamonds For This Stake. Visit The Diamond Store To Get More!
                    </p>
                </TriviaConsoleDialog>

                {/* VIP gate, driven by the same useVIPGate state the legacy
                    VIPGateModal used. */}
                <TriviaConsoleDialog
                    open={upgradeModalVisible}
                    onClose={hideUpgradeModal}
                    eyebrow="Premium Feature"
                    title="PvP Battle Mode"
                    pill="VIP"
                    pillInk="gold"
                    secondaryAction={{ label: 'Maybe Later', onClick: hideUpgradeModal }}
                    primaryAction={{ label: 'Get VIP', 'aria-label': 'Get VIP Membership', onClick: () => { hideUpgradeModal(); router.push('/hub/diamond-store?tab=vip'); } }}
                >
                    <p className="trivia-console-copy">
                        Upgrade To VIP For Unlimited Access To All Premium Features!
                    </p>
                    {(vipGateType === 'DIAMOND' || vipGateType === 'MIXED') && (
                        <p className="trivia-pvp-dialog-actions">
                            <TriviaGlassAction
                                label={`Day Pass For ${dayPassCost} Diamonds`}
                                ink="blue"
                                onClick={() => { hideUpgradeModal(); router.push('/hub/diamond-store'); }}
                            />
                        </p>
                    )}
                </TriviaConsoleDialog>
            </div>

            {/* Server rendered: measured on production this page returned
                only chrome to a crawler (AEO phase 3, 2026-09-17). */}
            <HubPageSummary page="trivia-pvp" />
        </TriviaErrorBoundary>
    );
}
