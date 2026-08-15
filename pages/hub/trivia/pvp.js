/**
 * PVP PAGE — Route: /hub/trivia/pvp
 * 1v1 trivia battles with diamond stakes
 * Uses Supabase Realtime for live matchmaking
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
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
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import useVIPGate from '../../../src/hooks/useVIPGate';
import VIPGateModal from '../../../src/components/ui/VIPGateModal';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import MetalFrame from '../../../src/components/ui/MetalFrame';
import { Trophy, Gem, Clock, XCircle, Loader } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

const STAKE_OPTIONS = [10, 25, 50, 100];
// How long a finished player waits for their opponent before being offered an
// escape from the 'waiting' screen.
const WAITING_DEADLINE_MS = 3 * 60 * 1000;

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

export default function PvPPage() {
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

    /**
     * Persist PvP stats after each match.
     *
     * Phase 80: this used to be a client-side read-modify-write of
     * trivia_pvp_stats. Two problems, both now closed by
     * fn_trivia_pvp_record_result (migration 120300):
     *   1. RLS no longer permits a direct client write to trivia_pvp_stats, so
     *      the old upsert simply fails.
     *   2. Even when it worked, the client chose the absolute values — a
     *      tampered client could post wins: 9999 — and two matches finishing
     *      concurrently lost each other's update.
     * The RPC applies a single bounded INCREMENT for one reported outcome,
     * always for auth.uid(), and returns the resulting row.
     */
    async function updatePvpStats(outcome, diamondsDelta) {
        if (!userId) return;
        if (!['win', 'loss', 'tie'].includes(outcome)) {
            console.warn('[PVP] Ignoring unknown outcome:', outcome);
            return;
        }

        try {
            const { data, error: rpcErr } = await supabase.rpc('fn_trivia_pvp_record_result', {
                p_outcome: outcome,
                p_diamonds: Math.max(0, Math.floor(Number(diamondsDelta) || 0))
            });
            if (rpcErr) {
                console.warn('[PVP] fn_trivia_pvp_record_result failed:', rpcErr.message);
                return;
            }
            if (!data || data.success === false) {
                console.warn('[PVP] PvP stat record rejected:', data?.error || 'unknown');
                return;
            }

            // The RPC returns the authoritative post-increment row — mirror it
            // instead of the locally-guessed values the old code displayed.
            setStats({
                wins: Number(data.wins) || 0,
                losses: Number(data.losses) || 0,
                ties: Number(data.ties) || 0,
                winStreak: Number(data.win_streak) || 0,
                bestStreak: Number(data.best_streak) || 0
            });
        } catch (e) {
            console.warn('[PVP] Failed to update stats:', e);
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

        // Always set 10-second horse fallback as safety net
        // This fires regardless of whether the queue join or real match succeeds
        searchTimeout.current = setTimeout(() => {
            handleHorseMatch(stake);
        }, 10000);

        // Try to join the matchmaking queue (best-effort for real matches)
        try {
            const { data: queueEntry } = await joinMatchmakingQueue(userId, stake);

            // VERIFY: If the 10-second timeout fired while we were joining the queue
            // (e.g. slow network), we MUST cancel this queue entry to prevent a ghost match.
            if (matchFoundRef.current) {
                if (queueEntry) {
                    try { await leaveMatchmakingQueue(userId); } catch (e) {}
                }
                return;
            }

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
        // Ref-based guards. The previous check read `gameState` from the closure
        // captured when handleFindMatch ran (frozen at 'lobby'/'searching'), so
        // it NEVER blocked: a horse match could clobber a real match that had
        // just been found — double question loads, wrong opponent, and the real
        // opponent left hanging on a match that never completes.
        if (matchFoundRef.current) return;
        if (gameStateRef.current === 'battle' || gameStateRef.current === 'result' || gameStateRef.current === 'waiting') return;

        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }

        try {
            // VERIFY WE ARE NOT ALREADY MATCHED BY A RACE CONDITION BEFORE STARTING HORSE MATCH
            // If an opponent matched us right before the timeout, our queue row is 'matched'.
            // If we abort the real match now, the opponent gets stuck waiting endlessly.
            const { data: myQueueRow } = await supabase
                .from('trivia_pvp_queue')
                .select('status, match_id')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (myQueueRow && myQueueRow.status === 'matched' && myQueueRow.match_id) {
                // A real match was created! Abort horse fallback and manually enter the real match.
                const { data: realMatch } = await supabase.from('trivia_pvp_matches').select('*').eq('id', myQueueRow.match_id).maybeSingle();
                if (realMatch) {
                    const opponentId = realMatch.player1_id === userId ? realMatch.player2_id : realMatch.player1_id;
                    let prof = null;
                    let st = null;
                    if (opponentId) {
                        const { data: pData } = await supabase.from('profiles').select('id, username').eq('id', opponentId).maybeSingle();
                        prof = pData;
                        const { data: sData } = await supabase.from('trivia_pvp_stats').select('wins, losses').eq('user_id', opponentId).maybeSingle();
                        st = sData;
                    }
                    const matchData = {
                        match: realMatch,
                        opponent: {
                            id: opponentId,
                            username: prof?.username || 'Opponent',
                            wins: st?.wins || 0,
                            losses: st?.losses || 0
                        }
                    };
                    matchFoundRef.current = true;
                    handleMatchFound(matchData);
                    return; // Successfully entered real match, do NOT start a horse match!
                }
            }
        } catch (e) {
            console.warn('[PVP] Race condition check before horse match failed:', e);
            // If the check fails, proceed to horse match to keep the player moving.
        }

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
     * idempotent reference - so a failure here means nothing was charged (or
     * the server already knows how to refund it) and bailing to the lobby is
     * always money-safe.
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
                setPvpError('Could not start the match. Nothing was charged - please try again.');
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

        // Persistent W/L record via the bounded-increment RPC (display stats,
        // not money). A swept refund counts as a tie.
        if (won) {
            await updatePvpStats('win', Math.max(0, (s.winnings || 0) - stake));
        } else if (tied) {
            await updatePvpStats('tie', 0);
        } else {
            await updatePvpStats('loss', stake);
        }

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

    return (
        <TriviaErrorBoundary pageName="PvP Battle">
            <SEOHead
                title="PvP Trivia — Player vs Player"
                description="Challenge Other Players To Head-to-head Poker Trivia Battles. Prove Who Knows Poker Best."
                canonical="/hub/trivia/pvp"
            >

            </SEOHead>

            <div className="pvp-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                {/* Error / refund-failure banner.
                    pvpError and refundFailed were set on every refund and payout
                    failure path but no JSX referenced them — so all the "surface
                    it to the user" work was dead and players got zero feedback
                    when their money did not move. */}
                {pvpError && (
                    <div role="alert" style={{
                        position: 'fixed', top: 16, left: 16, right: 16, zIndex: 10000,
                        background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 12,
                        padding: 14, color: '#fff', display: 'flex', alignItems: 'flex-start',
                        justifyContent: 'space-between', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                            <XCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14 }}>{pvpError}</div>
                                {refundFailed && (
                                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                                        Please double-check your diamond balance. If it looks wrong, contact support with the time of this match.
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => { setPvpError(null); setRefundFailed(false); }}
                            style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Out of Diamonds Modal */}
                {showOutOfDiamonds && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#1a1a2e', borderRadius: 16, padding: 32, maxWidth: 340, textAlign: 'center', border: '1px solid rgba(0,212,255,0.3)' }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>💎</div>
                            <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Not Enough Diamonds</h3>
                            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 20px', fontSize: 14 }}>You don't have enough diamonds for this stake. Visit the Diamond Store to get more!</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', cursor: 'pointer' }}>Close</button>
                                <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #7B2FFF)', border: 'none', borderRadius: 20, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Get Diamonds</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="content">
                    {/* Stats Bar - only visible during gameplay */}
                    {gameState !== 'lobby' && (
                        <div className="stats-bar">
                            <div className="stat">
                                <Trophy size={16} />
                                <span>{stats.wins}W - {stats.losses}L</span>
                            </div>
                            <div className="stat diamonds">
                                <Gem size={16} />
                                <span>{userDiamonds}</span>
                            </div>
                        </div>
                    )}

                    {/* Lobby */}
                    {gameState === 'lobby' && (
                        <div className="lobby">
                            <div
                                className="lobby-image-wrapper"
                                style={{
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                }}
                            >
                                <Image src="/images/trivia/lobby-pvp.jpg" alt="1v1 Battle - Start Challenge" width={686} height={1024} className="lobby-image" style={{ width: '100%', height: 'auto', display: 'block' }} />
                            </div>

                            {/* Diamond Balance */}
                            <div className="lobby-balance">
                                <Gem size={18} />
                                <span>{userDiamonds} Diamonds Available</span>
                            </div>

                            {/* Stake Selection */}
                            <div className="stake-selection">
                                <h3>Select Your Stake</h3>
                                <div className="stake-grid">
                                    {STAKE_OPTIONS.map(stake => (
                                        <button
                                            key={stake}
                                            className={`stake-btn ${userDiamonds < stake ? 'disabled' : ''}`}
                                            onClick={() => userDiamonds >= stake && handleFindMatch(stake)}
                                            disabled={userDiamonds < stake}
                                        >
                                            <span className="stake-amount">{stake} 💎</span>
                                            <span className="stake-win">Win {Math.floor(stake * 2 * 0.9)} 💎</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="rake-notice">10% house rake on prize pool</p>
                            </div>

                            {/* Record */}
                            <div className="lobby-record">
                                <Trophy size={16} />
                                <span>{stats.wins}W - {stats.losses}L</span>
                                {stats.bestStreak > 0 && (
                                    <span className="best-streak">Best Streak: {stats.bestStreak} 🔥</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Searching for opponent */}
                    {gameState === 'searching' && (
                        <div className="result-panel-overlay">
                            <button className="panel-back-top" onClick={handleCancelSearch}>← Cancel</button>
                            <div className="result-panel-container finding-container">
                                <img
                                    src="/trivia/panels/panel-finding.jpg"
                                    alt=""
                                    className="result-panel-bg"
                                    loading="lazy" />
                                {/* Record positioned in upper area */}
                                <div className="finding-record-zone">
                                    <span className="finding-record">{stats.wins}W - {stats.losses}L</span>
                                </div>
                                {/* Spinner in center */}
                                <div className="finding-spinner-zone">
                                    <Loader size={52} className="finding-spinner-icon" />
                                </div>
                                {/* Opponent info when found */}
                                {opponent && (
                                    <div className="finding-opponent-zone">
                                        <div className="panel-stats">
                                            <div className="panel-stat-row">
                                                <span className="panel-stat-label">PLAYER</span>
                                                <span className="panel-stat-value cyan">{opponent.username}</span>
                                            </div>
                                            <div className="panel-stat-row">
                                                <span className="panel-stat-label">RECORD</span>
                                                <span className="panel-stat-value white">{opponent.wins}W - {opponent.losses}L</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {/* Stake at the bottom, close to CANCEL */}
                                <div className="finding-stake-zone">
                                    <span className="finding-stake-label">STAKE</span>
                                    <span className="finding-stake-value">{stakeAmount} 💎</span>
                                </div>
                                {/* Invisible cancel hitbox over baked-in CANCEL button */}
                                <button className="finding-cancel-hitbox" onClick={handleCancelSearch} aria-label="Cancel Search" />
                            </div>
                        </div>
                    )}

                    {/* Battle */}
                    {gameState === 'battle' && currentQuestion && (
                        <div className="battle">
                            {/* Battle header */}
                            <div className="battle-header">
                                <div className="player you">
                                    <span className="name">{username}</span>
                                    <span className="score">{playerScore}</span>
                                </div>
                                <div className="vs">VS</div>
                                <div className="player opponent">
                                    <span className="name">{opponent?.username}</span>
                                    <span className="score">{opponentScore != null ? opponentScore : '?'}</span>
                                    {opponentScore == null && (
                                        <span className="ellipsis-pulse" aria-hidden="true">thinking</span>
                                    )}
                                </div>
                            </div>

                            {/* Timer */}
                            <div className={`battle-timer ${timer.timeLeft <= 5 ? 'danger' : ''}`}>
                                <Clock size={20} />
                                <span>{timer.timeLeft}s</span>
                            </div>

                            {/* Progress */}
                            <div className="battle-progress">
                                Question {currentQuestionIndex + 1} of {questions.length}
                            </div>

                            {/* Per-question result dots — data already lived in
                                playerAnswersRef but was never shown. */}
                            <div className="battle-dots" aria-hidden="true">
                                {questions.map((_, i) => {
                                    const outcome = playerAnswersRef.current[i];
                                    const cls = outcome === true ? 'dot correct'
                                        : outcome === false ? 'dot wrong'
                                            : 'dot';
                                    return <span key={i} className={cls} />;
                                })}
                            </div>

                            {/* Question */}
                            <MetalFrame padding="24px" showBolts={false}>
                                <h2 className="question-text">{toTitleCase(currentQuestion.question)}</h2>

                                <div className="options">
                                    {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-2 — shared option primitive */}
                                {/* correctIndex comes from the SERVER verdict -
                                    session-start never ships an answer key, so
                                    the reveal cannot happen before the server
                                    has graded (and bound) the tap. */}
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

                                {/* Report-a-bad-question. The component was imported here
                                    but never rendered, leaving the 3-strike quality
                                    demotion pipeline unwired in PvP. Only shown after the
                                    answer is revealed so it cannot stall the shot clock. */}
                                {showResult && currentQuestion?.id != null && (
                                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                                        <ReportQuestionButton questionId={currentQuestion.id} userToken={accessToken} />
                                    </div>
                                )}
                            </MetalFrame>
                        </div>
                    )}

                    {/* Waiting for opponent */}
                    {gameState === 'waiting' && (
                        <div className="waiting">
                            <MetalFrame padding="32px" showBolts={true}>
                                <h2>Battle Complete!</h2>
                                <p>Your Score: <strong>{playerScore}</strong></p>
                                {!waitingExpired ? (
                                    <div className="waiting-spinner">
                                        <div className="spinner" />
                                        <span>
                                            Waiting For Opponent To Finish
                                            {waitingSecondsLeft > 0 && ` — ${Math.floor(waitingSecondsLeft / 60)}:${String(waitingSecondsLeft % 60).padStart(2, '0')}`}
                                        </span>
                                    </div>
                                ) : (
                                    /* Escape hatch. Before this, a player whose opponent
                                       disconnected sat here forever with their stake locked
                                       and no way out — the match row never reached 'complete'
                                       so handleMatchUpdate never fired. */
                                    <div style={{ textAlign: 'center', marginTop: 16 }}>
                                        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginBottom: 6 }}>
                                            Your Opponent Has Not Finished Yet.
                                        </p>
                                        {/* Honest stake status: the pvp-settle sweep now
                                            force-settles anything still open ~30 minutes
                                            after the match started (forfeit win, tie
                                            refund, or full refund), so leaving this
                                            screen never strands the stake. Still no
                                            client-side refund here - that could only
                                            double-pay against the server settlement. */}
                                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 16 }}>
                                            Your run is graded and locked in on the server. If your opponent finishes, the match settles instantly and pays the winner. If they never finish, the automatic settlement sweep closes the match within about 30 minutes - you can leave this screen safely and check your balance later.
                                        </p>
                                        <button
                                            onClick={handlePlayAgain}
                                            style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            Back To Lobby
                                        </button>
                                    </div>
                                )}
                            </MetalFrame>
                        </div>
                    )}

                    {/* Results — title + buttons are baked into panel image, only overlay stats */}
                    {gameState === 'result' && result && (
                        <div className="result-panel-overlay">
                            <div className="result-panel-container">
                                <img
                                    src={result.won || result.tied ? '/trivia/panels/panel-win.jpg' : '/trivia/panels/panel-defeat.jpg'}
                                    alt=""
                                    className="result-panel-bg"
                                    loading="lazy" />
                                {/* Win/Loss record in the top header bar */}
                                <div className="result-score-zone">
                                    <div className="panel-stats">
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">RECORD</span>
                                            <span className="panel-stat-value white">{stats.wins}W - {stats.losses}L</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Game stats inside the main box, below the baked-in title */}
                                <div className="result-stats-zone">
                                    <div className="panel-stats">
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">YOUR SCORE</span>
                                            <span className="panel-stat-value cyan">{result.playerScore}/{questions.length}</span>
                                        </div>
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">{result.opponent?.username || 'OPPONENT'}</span>
                                            <span className="panel-stat-value red">{result.opponentScore}/{questions.length}</span>
                                        </div>
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">WIN STREAK</span>
                                            <span className="panel-stat-value gold">{stats.winStreak || 0} 🔥</span>
                                        </div>
                                        <div className="panel-stat-row">
                                            {/* A tie is a refund, not winnings — labelling it
                                                "+N DIAMONDS" read as a payout. */}
                                            <span className="panel-stat-label">{result.tied ? 'STAKE RETURNED' : 'DIAMONDS'}</span>
                                            <span className={`panel-stat-value ${result.won ? 'green' : result.tied ? 'white' : 'red'}`}>
                                                {result.won
                                                    ? `+${result.winnings} DIAMONDS`
                                                    : result.tied
                                                        ? `${result.stake ?? stakeAmount} DIAMONDS`
                                                        : `-${result.stake ?? stakeAmount} DIAMONDS`}
                                            </span>
                                        </div>
                                        {result.payoutFailed && (
                                            <div className="panel-stat-row">
                                                <span className="panel-stat-label">STATUS</span>
                                                <span className="panel-stat-value red">PAYOUT PENDING</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Invisible hitboxes over baked-in PLAY AGAIN and BACK TO TRIVIA buttons */}
                                <button className="result-play-again-hitbox" onClick={handlePlayAgain} aria-label="Play Again" />
                                <button className="result-back-hitbox" onClick={() => router.push('/hub/trivia')} aria-label="Back To Trivia" />
                            </div>
                        </div>
                    )}
                </div>
            {/* Modals */}
            <VIPGateModal 
                visible={upgradeModalVisible}
                onClose={hideUpgradeModal}
                featureName="PvP Battle Mode"
                featureConfig={featureConfig}
            />

            <BottomNavBar />
            </div>

            <style>{`
                .pvp-page {
                    min-height: 100vh; padding-bottom: 70px;
                    background: #0a0e1a;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay {
                    display: none;
                }

                .content {
                    position: relative;
                    padding: 80px 0 40px;
                    max-width: 100%;
                    margin: 0 auto;
                }

                .stats-bar {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    margin-bottom: 20px;
                }

                .stat {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #fff;
                }

                .stat.diamonds { color: #00d4ff; }

                /* Lobby */
                .lobby-header {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .lobby-header h1 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 28px;
                    color: #ef4444;
                    margin: 12px 0 8px;
                    text-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
                }

                .lobby-header p {
                    color: rgba(255, 255, 255, 0.6);
                    margin: 0;
                }

                .lobby-balance {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px 16px;
                    color: #00d4ff;
                    font-weight: 700;
                    font-size: 16px;
                    margin: 12px 0;
                }

                .lobby-record {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 12px 16px;
                    color: rgba(255, 255, 255, 0.7);
                    font-weight: 600;
                    font-size: 14px;
                    margin-top: 8px;
                }

                .best-streak {
                    color: #ffd700;
                    margin-left: 8px;
                }

                .stake-selection h3 {
                    text-align: center;
                    color: #fff;
                    margin: 0 0 16px;
                }

                .stake-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                    margin-bottom: 12px;
                }

                .stake-btn {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 2px solid rgba(0, 212, 255, 0.3);
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #fff;
                }

                .stake-btn:hover:not(.disabled) {
                    background: rgba(0, 212, 255, 0.1);
                    border-color: #00d4ff;
                    transform: translateY(-2px);
                }

                .stake-btn.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .stake-amount {
                    font-size: 24px;
                    font-weight: 700;
                }

                .stake-win {
                    font-size: 12px;
                    color: #22c55e;
                }

                .rake-notice {
                    text-align: center;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                    margin: 0;
                }

                .how-it-works {
                    margin-top: 24px;
                    padding-top: 24px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .how-it-works h4 {
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 12px;
                    text-transform: uppercase;
                    margin: 0 0 12px;
                }

                .how-it-works ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .how-it-works li {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 14px;
                    margin-bottom: 8px;
                }

                /* Battle */
                .battle-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border-radius: 12px;
                    margin-bottom: 16px;
                }

                .player {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .player .name {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .player .score {
                    font-size: 28px;
                    font-weight: 700;
                    color: #fff;
                }

                .player.you .score { color: #00d4ff; }
                .player.opponent .score { color: #ef4444; }

                .vs {
                    font-size: 20px;
                    font-weight: 700;
                    color: rgba(255, 255, 255, 0.3);
                }

                .battle-timer {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px;
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 12px;
                }

                .battle-timer.danger {
                    color: #ef4444;
                    animation: pulse 0.5s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.1); }
                }

                .battle-progress {
                    text-align: center;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin-bottom: 16px;
                }

                .question-text {
                    font-size: 18px;
                    color: #fff;
                    margin: 0 0 20px;
                    line-height: 1.5;
                }

                .options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .option {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                    color: #fff;
                }

                /* hover removed per user request */

                .option.correct {
                    background: rgba(34, 197, 94, 0.2);
                    border-color: #22c55e;
                }

                .option.wrong {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: #ef4444;
                }

                .option-letter {
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .option-text { flex: 1; }
                .result-icon { margin-left: auto; }
                .option.correct .result-icon { color: #22c55e; }
                .option.wrong .result-icon { color: #ef4444; }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #00d4ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .waiting-spinner {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                    margin: 24px 0;
                }

                /* Waiting */
                .waiting { text-align: center; }
                .waiting h2 { color: #fff; margin: 0 0 12px; }
                .waiting p { color: rgba(255, 255, 255, 0.7); }

                /* ===== PANEL OVERLAY SYSTEM (All 3 Panels) ===== */
                .result-panel-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.85);
                    animation: panelFadeIn 0.4s ease;
                }

                @keyframes panelFadeIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }

                .panel-back-top {
                    position: absolute;
                    top: 16px;
                    left: 16px;
                    z-index: 1010;
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 0.85rem;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.7);
                    background: rgba(0, 0, 0, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 6px;
                    padding: 8px 16px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .panel-back-top:hover {
                    color: #00f0ff;
                    border-color: rgba(0, 240, 255, 0.35);
                    background: rgba(0, 0, 0, 0.7);
                    text-shadow: 0 0 8px rgba(0, 240, 255, 0.5);
                }

                .result-panel-container {
                    position: relative;
                    width: 92vw;
                    max-width: 700px;
                }

                /* ===== Finding Opponent Panel Zones ===== */
                .finding-record-zone {
                    position: absolute;
                    top: 38%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                    text-align: center;
                }

                .finding-record {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 2rem;
                    color: rgba(255, 255, 255, 0.9);
                    letter-spacing: 0.08em;
                    text-shadow: 0 0 10px rgba(0, 240, 255, 0.4);
                }

                .finding-spinner-zone {
                    position: absolute;
                    top: 52%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                    text-align: center;
                }

                .finding-spinner-icon {
                    color: #00f0ff;
                    animation: spinLoader 1.2s linear infinite;
                    filter: drop-shadow(0 0 10px rgba(0, 240, 255, 0.6));
                }

                @keyframes spinLoader {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .finding-opponent-zone {
                    position: absolute;
                    top: 55%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 2;
                    width: 75%;
                }

                .finding-opponent-zone .panel-stats {
                    width: 100%;
                    max-width: none;
                }

                .finding-opponent-zone .panel-stat-label {
                    font-size: 1.1rem;
                }

                .finding-opponent-zone .panel-stat-value {
                    font-size: 1.3rem;
                }

                .finding-stake-zone {
                    position: absolute;
                    bottom: 18%;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .finding-stake-label {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 1.3rem;
                    color: rgba(255, 255, 255, 0.6);
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                }

                .finding-stake-value {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 800;
                    font-size: 1.6rem;
                    color: #ffd700;
                    text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
                }

                .finding-cancel-hitbox {
                    position: absolute;
                    bottom: 3%;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 35%;
                    height: 9%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 10;
                }

                .result-panel-bg {
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 4px;
                }

                /* Score zone - positioned in the top header box */
                .result-score-zone {
                    position: absolute;
                    top: 5%;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2;
                    width: 70%;
                }

                .result-score-zone .panel-stats {
                    width: 100%;
                    max-width: none;
                    gap: 2px;
                }

                .result-score-zone .panel-stat-label {
                    font-size: 0.95rem;
                }

                .result-score-zone .panel-stat-value {
                    font-size: 1.1rem;
                }

                /* Stats zone - positioned below the baked-in title area */
                .result-stats-zone {
                    position: absolute;
                    top: 58%;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 2;
                    width: 75%;
                }

                .result-stats-zone .panel-stats {
                    width: 100%;
                    max-width: none;
                    gap: 4px;
                }

                .result-stats-zone .panel-stat-label {
                    font-size: 1.1rem;
                }

                .result-stats-zone .panel-stat-value {
                    font-size: 1.3rem;
                }

                /* Per-question progress dots (battle screen) */
                .battle-dots {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 6px;
                    margin: 0 0 14px;
                }

                .battle-dots .dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.18);
                    transition: background 0.2s;
                }

                .battle-dots .dot.correct { background: #22c55e; }
                .battle-dots .dot.wrong { background: #ef4444; }

                /* Press feedback for the otherwise-invisible image hitboxes —
                   tapping a baked-in button previously gave zero response. */
                .result-play-again-hitbox:active,
                .result-back-hitbox:active,
                .finding-cancel-hitbox:active {
                    background: rgba(0, 240, 255, 0.08);
                    border-radius: 8px;
                }

                /* Invisible hitboxes over baked-in buttons */
                .result-play-again-hitbox {
                    position: absolute;
                    bottom: 8%;
                    left: 5%;
                    width: 45%;
                    height: 9%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 10;
                }

                .result-back-hitbox {
                    position: absolute;
                    bottom: 8%;
                    right: 5%;
                    width: 45%;
                    height: 9%;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    z-index: 10;
                }

                /* ===== PANEL TITLE — User's exact Orbitron spec ===== */
                .panel-title {
                    font-family: 'Orbitron', 'Exo 2', 'Rajdhani', sans-serif;
                    font-weight: 900;
                    font-size: 5rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    color: #ffffff;
                    text-align: center;
                    text-shadow:
                        0 0 12px #00ffff99,
                        0 0 24px #00ffff44,
                        3px 3px 6px #000000aa;
                    background: linear-gradient(to bottom, #ffffff, #d0d0d0);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                    line-height: 1.05;
                    white-space: pre-line;
                    margin: 0 0 4% 0;
                    padding: 0.5rem 0;
                }

                .panel-title.lose {
                    text-shadow:
                        0 0 12px #ff444499,
                        0 0 24px #ff444444,
                        3px 3px 6px #000000aa;
                }

                .panel-title.tie {
                    text-shadow:
                        0 0 12px #ffd70099,
                        0 0 24px #ffd70044,
                        3px 3px 6px #000000aa;
                }

                .ellipsis-pulse {
                    animation: ellipsisPulse 1.5s infinite;
                    font-size: 10px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.45);
                }

                @keyframes ellipsisPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.2; }
                }

                /* ===== STAT ROWS ===== */
                .panel-stats {
                    width: 75%;
                    max-width: 400px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 5%;
                }

                .panel-stat-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-size: 1rem;
                    letter-spacing: 0.04em;
                }

                .panel-stat-label {
                    color: rgba(255, 255, 255, 0.6);
                    font-weight: 700;
                    text-transform: uppercase;
                }

                .panel-stat-value {
                    font-weight: 900;
                }

                .panel-stat-value.cyan { color: #00f0ff; }
                .panel-stat-value.red { color: #ef4444; }
                .panel-stat-value.green { color: #22c55e; }
                .panel-stat-value.gold { color: #ffd700; }
                .panel-stat-value.white { color: #e8e8e8; }

                .panel-stat-divider {
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.3), transparent);
                    margin: 4px 0;
                }

                /* ===== PANEL BUTTONS ===== */
                .panel-buttons {
                    display: flex;
                    gap: 16px;
                    align-items: center;
                }

                .panel-btn-primary {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 800;
                    font-size: 1.1rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    color: #00f0ff;
                    background: linear-gradient(to bottom, #3a3e4a, #2a2e3a);
                    border: 1px solid rgba(0, 240, 255, 0.35);
                    border-radius: 6px;
                    padding: 12px 32px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-shadow: 0 0 10px rgba(0, 240, 255, 0.6);
                }

                .panel-btn-primary:hover {
                    background: linear-gradient(to bottom, #4a4e5a, #3a3e4a);
                    box-shadow: 0 0 20px rgba(0, 240, 255, 0.3);
                    transform: translateY(-1px);
                }

                .panel-btn-secondary {
                    font-family: 'Orbitron', 'Exo 2', sans-serif;
                    font-weight: 700;
                    font-size: 0.85rem;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    color: rgba(255, 255, 255, 0.5);
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 6px;
                    padding: 12px 24px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .panel-btn-secondary:hover {
                    color: rgba(255, 255, 255, 0.8);
                    border-color: rgba(255, 255, 255, 0.3);
                }

                /* ===== RESPONSIVE SCALING ===== */
                @media (max-width: 600px) {
                    .panel-title {
                        font-size: 2.5rem;
                    }
                    .panel-stat-row {
                        font-size: 0.8rem;
                    }
                    .panel-btn-primary {
                        font-size: 0.9rem;
                        padding: 10px 24px;
                    }
                    .panel-btn-secondary {
                        font-size: 0.75rem;
                        padding: 10px 18px;
                    }
                }

                @media (max-width: 400px) {
                    .panel-title {
                        font-size: 1.8rem;
                    }
                    .panel-stat-row {
                        font-size: 0.7rem;
                    }
                }

                /* ===== MOBILE OPTIMIZATION ===== */
                @media (max-width: 768px) {
                    .content {
                        padding: 60px 0 20px;
                    }

                    .lobby-image-wrapper {
                        max-height: calc(100dvh - 60px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .lobby-image {
                        max-height: calc(100dvh - 60px);
                        width: 100%;
                        object-fit: contain;
                    }
                }
            `}</style>
        </TriviaErrorBoundary>
    );
}
