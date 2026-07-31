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
    subscribeToMatch,
    submitMatchScore,
    processMatchReward
} from '../../../src/services/pvpMatchmaking';
import { getRecentlySeenIds, filterAndShuffle, fetchRandomQuestionPool } from '../../../src/lib/triviaQuestionLoader';
import { shuffleOptions } from '../../../src/lib/trivia/shuffleOptions';
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
import { Trophy, Gem, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

const STAKE_OPTIONS = [10, 25, 50, 100];
// How long a finished player waits for their opponent before being offered an
// escape from the 'waiting' screen.
const WAITING_DEADLINE_MS = 3 * 60 * 1000;

/**
 * Unique-per-event idempotency reference.
 *
 * The old scheme was `pvp_stake_${userId}_${minute}` / `pvp_refund_${userId}_${minute}`
 * — a per-minute bucket. Two matches started inside the same minute meant the
 * second stake deduction was de-duplicated by the DB (a free entry), and two
 * refunds inside the same minute (cancel + a horse-setup failure) meant the
 * second refund was silently dropped and the player simply lost the diamonds.
 * Refunds are now keyed to the thing being refunded (the stake reference or the
 * matchId); stakes get a fresh id held in a ref for retry stability.
 */
function newPvpReference(prefix, userId) {
    let unique;
    try {
        unique = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    } catch (e) {
        unique = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    return `${prefix}_${userId}_${unique}`;
}

/**
 * Wrapper around the diamond RPC that treats `{ success: false }` as a failure.
 *
 * Every call site used to check only `error`. add_diamonds_to_balance returns
 * `{ success:false }` WITHOUT an error on insufficient balance or reference_id
 * dedup, so failed stakes/refunds/payouts looked like successes: the UI moved
 * on and the money silently never moved.
 */
async function diamondRpc(supabase, params) {
    const { data, error } = await supabase.rpc('add_diamonds_to_balance', params);
    if (error) throw error;
    if (data && typeof data === 'object' && data.success === false) {
        throw new Error(data.error || data.message || 'Diamond transaction was rejected');
    }
    return data;
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

    // Battle state
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // TRAIN-WIRE-TRIVIA-HOOK-2 - shared trivia answer-state plumbing
    const timerCtrlRef = useRef({});
    const trivia = useTriviaQuestion(questions[currentQuestionIndex], {
        onAnswer: ({ index, isCorrect }) => {
            timerCtrlRef.current.stop?.();

            // Track answer accuracy per question for history recording
            playerAnswersRef.current[currentQuestionIndex] = isCorrect;

            if (isCorrect) {
                const newScore = playerScoreRef.current + 1;
                playerScoreRef.current = newScore;
                setPlayerScore(newScore);
                busEmit.decisionCorrect(newScore);
            } else {
                busEmit.decisionIncorrect(playerScoreRef.current);
                busEmit.screenShake('light');
            }

            // Advance quickly - no GTO explanations in PvP
            setTimeout(() => {
                if (currentQuestionIndex + 1 >= questions.length) {
                    finishBattle();
                } else {
                    setCurrentQuestionIndex(prev => prev + 1);
                    trivia.reset();
                    timerCtrlRef.current.reset?.();
                }
            }, 500);
        }
    });
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
    // Consequences before this change, on every REAL (non-horse) match:
    //   * handleBattleComplete: totalPot = stakeAmount(0) * 2 = 0, so the
    //     WINNER of a real PvP match was paid 0 diamonds;
    //   * loserId = isPlayer1(stale false) ? player2 : player1 — for the actual
    //     player1 that resolves to THEMSELVES, so processMatchReward debited
    //     the winner;
    //   * myScore/theirScore were swapped for player1;
    //   * handleMatchUpdate read the player's OWN score column as the
    //     opponent's score;
    //   * the `gameState !== 'result'` guard never became true, so every
    //     realtime UPDATE re-ran handleBattleComplete and updatePvpStats (a
    //     non-idempotent read-modify-write) double-counted wins/losses.
    //
    // These refs are written synchronously at the moment the value is known, so
    // the subscription callbacks always read live values.
    // ---------------------------------------------------------------------
    const stakeRef = useRef(0);
    const isPlayer1Ref = useRef(false);
    const matchIdRef = useRef(null);
    const opponentRef = useRef(null);
    const gameStateRef = useRef('lobby');
    const isHorseMatchRef = useRef(false);
    const completedRef = useRef(false);   // handleBattleComplete runs once per match
    const matchFoundRef = useRef(false);  // a real match won the race vs. the horse fallback
    const searchingRef = useRef(false);   // a stake is in flight and unrefunded
    const stakeRefIdRef = useRef(null);   // unique reference_id for the current stake
    const userIdRef = useRef(null);       // readable from unmount cleanup
    const waitingTimerRef = useRef(null); // opponent-finish deadline countdown

    // Keep gameStateRef in lockstep with gameState for the ref-based guards.
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

    // Horse (AI opponent) battle state
    const [isHorseMatch, setIsHorseMatch] = useState(false);
    const horseAnswersRef = useRef([]);

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
            // If the player navigates away mid-search, their stake has already
            // been deducted. Previously nothing refunded it and their queue row
            // stayed 'waiting' forever — a ghost opponent that another player
            // could match against and then wait on indefinitely. Leave the queue
            // and refund, keyed to the stake reference so it can't double-refund.
            if (searchingRef.current) {
                const uid = userIdRef.current;
                const amount = stakeRef.current;
                const stakeRefId = stakeRefIdRef.current;
                searchingRef.current = false;
                if (uid) {
                    // Fire-and-forget: the component is going away, but these
                    // promises still resolve against the module-level client.
                    Promise.resolve()
                        .then(() => leaveMatchmakingQueue(uid))
                        .catch(e => console.warn('[PVP] unmount leaveQueue failed:', e));
                    if (amount > 0) {
                        diamondRpc(supabase, {
                            p_user_id: uid,
                            p_amount: amount,
                            p_type: 'pvp_refund',
                            p_description: `PvP search abandoned — ${amount} diamonds refunded`,
                            p_reference_id: `pvp_refund_${stakeRefId || newPvpReference('abandon', uid)}`
                        }).catch(e => console.warn('[PVP] unmount refund failed — user owed manual refund:', e));
                    }
                }
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
        setPvpError(null);
        setRefundFailed(false);
        setGameState('searching');
        gameStateRef.current = 'searching';

        // Deduct stake immediately via RPC for audit trail
        stakeRefIdRef.current = newPvpReference('pvp_stake', userId);
        try {
            await diamondRpc(supabase, {
                p_user_id: userId,
                p_amount: -stake,
                p_type: 'pvp_stake',
                p_description: `PvP stake — ${stake} diamonds entry`,
                p_reference_id: stakeRefIdRef.current
            });
            searchingRef.current = true; // stake is now at risk until refunded/resolved
            // Refresh balance from DB after deduction
            const { data: postDeductProfile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (postDeductProfile) setUserDiamonds(postDeductProfile.diamonds || 0);
            busEmit.diamondsSpent(stake, 'PvP Stake Entry');
        } catch (e) {
            console.warn('[PVP] Stake deduction failed — aborting match:', e);
            setPvpError('We could not take your stake, so the match was not started. Please check your balance and try again.');
            setGameState('lobby');
            gameStateRef.current = 'lobby';
            return;
        }

        // Always set 5-second horse fallback as safety net
        // This fires regardless of whether the queue join or real match succeeds
        searchTimeout.current = setTimeout(() => {
            handleHorseMatch(stake);
        }, 5000);

        // Try to join the matchmaking queue (best-effort for real matches)
        try {
            const { data: queueEntry } = await joinMatchmakingQueue(userId, stake);

            if (queueEntry) {
                // Subscribe to queue changes to detect new opponents
                queueSubscription.current = subscribeToQueue(stake, async (newPlayer) => {
                    if (matchFoundRef.current) return;
                    if (newPlayer.user_id !== userId) {
                        const matchData = await findMatch(userId, stake);
                        if (matchData && !matchFoundRef.current) {
                            // Cancel horse fallback — real match found
                            matchFoundRef.current = true;
                            if (searchTimeout.current) clearTimeout(searchTimeout.current);
                            handleMatchFound(matchData);
                        }
                    }
                });

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

        // Leave the matchmaking queue BEFORE playing the horse. Previously only
        // the local subscription was torn down and the trivia_pvp_queue row was
        // left 'waiting' — another real player would match against this ghost,
        // stake their diamonds and wait forever for a score that never comes.
        try { await leaveMatchmakingQueue(userId); } catch (e) { console.warn('[PVP] leaveQueue before horse match failed:', e); }

        // Wrap entire flow — if any supabase call throws (network blip,
        // RLS issue, etc.), refund the stake and surface a banner instead
        // of leaving the user stuck on 'searching' with stake gone.
        try {

        // Get random AI horse from profiles
        const { data: horses } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('is_horse', true)
            .limit(50);

        let horseOpponent;
        if (horses && horses.length > 0) {
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
            horseOpponent = {
                id: randomHorse.id,
                username: randomHorse.username,
                avatar_url: randomHorse.avatar_url,
                wins: horseWins,
                losses: horseLosses,
                isHorse: true
            };
        } else {
            // Fallback horse if no horse profiles found
            horseOpponent = {
                id: 'horse-fallback',
                username: 'SharkyAce',
                avatar_url: null,
                wins: 42,
                losses: 18,
                isHorse: true
            };
        }

        // Load questions for horse match with 60-day exclusion using shared utility
        const excludeIds = await getRecentlySeenIds(supabase, userId, 200, 'pvp'); // specify 'pvp' mode to only exclude pvp-seen questions, maintaining isolation

        // Phase 55: random-offset fetch instead of "first 100" — was always
        // pulling the same 100 rows by Postgres-internal order, so PvP horse
        // matches recycled the same questions across all of a user's matches.
        const questions = await fetchRandomQuestionPool(supabase, { pageSize: 100 });

        let matchQuestions = [];
        if (questions && questions.length > 0) {
            matchQuestions = filterAndShuffle(questions, excludeIds, 20, { minQualityScore: 6 }); // Phase 51: drop low-quality (<=5)
        }

        // Phase 54: empty-questions guard. Without this, an empty trivia_questions
        // table or query failure would set questions=[] and proceed to 'battle'
        // state, where currentQuestion is undefined and the user is stuck on a
        // broken battle UI with their stake gone (no refund triggered).
        if (matchQuestions.length === 0) {
            throw new Error('No questions available for this match');
        }

        // Shuffle options FIRST so correct_index is updated before horse answer calc
        const shuffledQuestions = shuffleOptions(matchQuestions);

        // Pre-calculate horse answers based on stake-dependent accuracy
        // Higher stakes = smarter horse (60-85% accuracy)
        const horseAccuracy = 0.60 + (Math.min(stake, 100) / 100) * 0.25;
        const horseAnswers = shuffledQuestions.map(q => {
            if (Math.random() < horseAccuracy) {
                return q.correct_index; // Correct answer
            } else {
                // Random wrong answer
                const wrongIndices = [0, 1, 2, 3].filter(i => i !== q.correct_index);
                return wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
            }
        });
        horseAnswersRef.current = horseAnswers;

        const horseMatchId = `horse-match-${Date.now()}`;
        // Committed to the horse match — the outcome settles the stake, so the
        // unmount refund path must not also fire.
        searchingRef.current = false;
        setIsHorseMatch(true);
        isHorseMatchRef.current = true;
        setOpponent(horseOpponent);
        opponentRef.current = horseOpponent;
        setQuestions(shuffledQuestions);
        setMatchId(horseMatchId);
        matchIdRef.current = horseMatchId;
        setIsPlayer1(true);
        isPlayer1Ref.current = true;
        matchFoundRef.current = true;

        // Start battle after short delay
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
            console.warn('[PVP] handleHorseMatch threw — refunding stake:', e);
            let refunded = false;
            try {
                // Keyed to the stake's own reference so this refund can never
                // collide with (and be swallowed by) another refund in the same
                // minute — the old per-minute bucket did exactly that.
                await diamondRpc(supabase, {
                    p_user_id: userId,
                    p_amount: stake,
                    p_type: 'pvp_refund',
                    p_description: `PvP horse-match setup failed — ${stake} diamonds refunded`,
                    p_reference_id: `pvp_refund_${stakeRefIdRef.current || newPvpReference('horsefail', userId)}`
                });
                refunded = true;
                searchingRef.current = false;
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (profile) setUserDiamonds(profile.diamonds || 0);
            } catch (refundErr) {
                console.warn('[PVP] Refund also failed — user owed manual refund:', refundErr);
                setRefundFailed(true);
            }
            setPvpError(refunded
                ? 'Could not start the match — your stake has been refunded.'
                : `Could not start the match and the ${stake} diamond refund did not go through. Please verify your balance or contact support.`);
            setGameState('lobby');
            gameStateRef.current = 'lobby';
        }
    }

    function handleMatchFound(matchData) {
        matchFoundRef.current = true;
        // The stake is now committed to a real match. Clear the search flag so
        // unmounting mid-battle does NOT refund a stake that the match itself
        // will settle (which would double-pay the player).
        searchingRef.current = false;
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

        setMatchId(matchData.match.id);
        setOpponent(matchData.opponent);
        setQuestions(shuffleOptions(matchData.questions));
        setIsPlayer1(amIPlayer1);

        // Subscribe to match updates
        matchSubscription.current = subscribeToMatch(matchData.match.id, handleMatchUpdate);

        // Start the battle after short delay
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
    }

    // NOTE: handleNoMatchFound() used to live here — a refund path that nothing
    // ever called. Its job (refund + leave queue on a failed match start) is now
    // handled inline by handleHorseMatch's catch block and the unmount cleanup,
    // both keyed to the stake's own reference_id.

    async function handleCancelSearch() {
        if (queueSubscription.current) { queueSubscription.current(); queueSubscription.current = null; }
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        try { await leaveMatchmakingQueue(userId); } catch (e) { console.warn('[PVP] leaveQueue failed:', e); }

        // Refund stake via audit-safe RPC. Was previously silent on RPC error
        // — user clicked Cancel, returned to lobby thinking they got refund,
        // but RPC may have failed. Now surface refund-failure to user.
        const refundAmount = stakeRef.current || stakeAmount;
        try {
            await diamondRpc(supabase, {
                p_user_id: userId,
                p_amount: refundAmount,
                p_type: 'pvp_refund',
                p_description: `PvP cancelled — ${refundAmount} diamonds refunded`,
                p_reference_id: `pvp_refund_${stakeRefIdRef.current || newPvpReference('cancel', userId)}`
            });
            searchingRef.current = false;
            // Refresh balance from DB
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds || 0);
        } catch (e) {
            console.warn('[PVP] Cancel refund failed:', e);
            setRefundFailed(true);
            setPvpError(`Your refund of ${refundAmount} diamonds may not have gone through. Please verify your balance or contact support.`);
        }

        setGameState('lobby');
        gameStateRef.current = 'lobby';
        setOpponent(null);
        opponentRef.current = null;
    }

    function handleMatchUpdate(updatedMatch) {
        // Reads isPlayer1Ref, NOT the isPlayer1 state: this callback was
        // registered from a render where isPlayer1 was still false, so for the
        // actual player1 the "opponent" field resolved to their OWN score column.
        const opponentScoreField = isPlayer1Ref.current ? 'player2_score' : 'player1_score';
        const oppScore = updatedMatch[opponentScoreField];
        if (oppScore !== null && oppScore !== undefined) {
            setOpponentScore(oppScore);
        }

        // completedRef guards against the same 'complete' UPDATE (or several of
        // them) re-running the payout + the non-idempotent updatePvpStats
        // read-modify-write, which double-counted wins/losses. The old guard
        // (`gameState !== 'result'`) read a frozen closure value and never fired.
        if (updatedMatch.status === 'complete' && !completedRef.current) {
            completedRef.current = true;
            handleBattleComplete(updatedMatch);
        }
    }

    function handleTimeout() {
        timer.setIsTimerRunning(false);
        trivia.selectAnswer(-1); // Wrong answer - delegates to shared hook
    }

    async function finishBattle() {
        timer.setIsTimerRunning(false);
        setGameState('waiting');
        gameStateRef.current = 'waiting';

        // Use refs for accurate values — React state may be stale inside the
        // setTimeout closure that calls this.
        const finalScore = playerScoreRef.current;

        // Handle horse match differently
        if (isHorseMatchRef.current) {
            await finishHorseBattle(finalScore);
            return;
        }

        // Submit our score for real match
        try {
            await submitMatchScore(matchIdRef.current, userId, finalScore, isPlayer1Ref.current);
        } catch (e) {
            console.warn('[PVP] Score submission failed:', e);
            setPvpError('We could not submit your score. Check your connection — your stake is still in this match.');
        }

        // Opponent-disconnect deadline. Without this, a player whose opponent
        // never submits sits on "Waiting For Opponent To Finish..." forever with
        // their stake locked and no way out.
        startWaitingDeadline();
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

    // Complete horse battle - calculate result and award winnings
    async function finishHorseBattle(playerFinalScore) {
        // Calculate horse score from pre-generated answers
        const horseScore = horseAnswersRef.current.reduce((score, answer, idx) => {
            return score + (answer === questions[idx]?.correct_index ? 1 : 0);
        }, 0);

        const won = playerFinalScore > horseScore;
        const tied = playerFinalScore === horseScore;
        // Refs, not state — this runs from a setTimeout closure.
        const stake = stakeRef.current || stakeAmount;
        const liveMatchId = matchIdRef.current || matchId;
        searchingRef.current = false; // stake resolved by the match outcome

        // Calculate winnings — 10% rake on total pot
        const totalPot = stake * 2;
        const rakeAmount = Math.floor(totalPot * 0.1);
        let winnings = 0;

        // Phase 59: track payout failures so UI shows accurate winnings.
        // Was previously: RPC failed → console.warn only → busEmit/setResult
        // claimed full winnings → user saw "+60💎 payout" toast but balance
        // unchanged. Now we set winnings=0 on payout failure and surface an
        // error to the user via setRefundFailed/pvpError state.
        let _payoutFailed = false;
        if (won) {
            winnings = totalPot - rakeAmount;
            // Award winnings via audit-safe RPC
            try {
                await diamondRpc(supabase, {
                    p_user_id: userId,
                    p_amount: winnings,
                    p_type: 'pvp_win',
                    p_description: `PvP win — ${winnings} diamonds payout`,
                    p_reference_id: `pvp_win_${liveMatchId}`
                });
                // Refresh balance from DB
                const { data: winProfile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .maybeSingle();
                if (winProfile) setUserDiamonds(winProfile.diamonds || 0);
                busEmit.diamondsEarned(winnings, 'PvP Victory');
                busEmit.celebration('confetti');
            } catch (e) {
                console.warn('[PVP] Win payout failed:', e);
                _payoutFailed = true;
                setRefundFailed(true);
                setPvpError(`Your payout of ${winnings} diamonds may not have gone through. Please verify your balance or contact support.`);
            }
        } else if (tied) {
            // Refund stake on tie via audit-safe RPC
            try {
                await diamondRpc(supabase, {
                    p_user_id: userId,
                    p_amount: stake,
                    p_type: 'pvp_refund',
                    p_description: `PvP tie — ${stake} diamonds returned`,
                    p_reference_id: `pvp_tie_refund_${liveMatchId}_${userId}`
                });
                const { data: tieProfile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', userId)
                    .maybeSingle();
                if (tieProfile) setUserDiamonds(tieProfile.diamonds || 0);
            } catch (e) {
                console.warn('[PVP] Tie refund failed:', e);
                _payoutFailed = true;
                setRefundFailed(true);
                setPvpError(`Your ${stake} diamond stake refund for the drawn match may not have gone through. Please verify your balance or contact support.`);
            }
            winnings = stake;
        } else {
            busEmit.screenShake('medium');
        }

        // Update persistent stats
        if (won) {
            await updatePvpStats('win', winnings - stake);
        } else if (tied) {
            await updatePvpStats('tie', 0);
        } else {
            await updatePvpStats('loss', stake);
        }

        setOpponentScore(horseScore);
        setResult({
            won,
            tied,
            playerScore: playerFinalScore,
            opponentScore: horseScore,
            // Phase 59: if payout RPC failed, show 0 winnings so the result
            // panel doesn't lie about money the user didn't actually receive.
            // The error banner from setPvpError above tells them what happened.
            winnings: _payoutFailed ? 0 : (won ? winnings : (tied ? stake : 0)),
            stake,
            opponent: opponentRef.current || opponent,
            isHorseMatch: true,
            payoutFailed: _payoutFailed
        });

        // Record question history for 60-day non-repeat (with actual accuracy).
        // Phase 59: filter null question_id (FK violation guard) + capture
        // upsert errors that were silently swallowed.
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions
                    .filter(q => q && q.id != null)
                    .map((q, idx) => ({
                        user_id: userId,
                        question_id: q.id,
                        was_correct: playerAnswersRef.current[idx] === true,
                        seen_at: new Date().toISOString(),
                        mode: 'pvp'
                    }));

                if (historyRecords.length > 0) {
                    const { error: historyErr } = await supabase
                        .from('trivia_user_question_history')
                        .upsert(historyRecords, {
                            // ON CONFLICT DO NOTHING. trivia_user_question_history
                            // has SELECT + INSERT RLS policies but NO UPDATE policy,
                            // so the previous ignoreDuplicates:false failed the whole
                            // batch as soon as one question had been seen before.
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: true
                        });
                    if (historyErr) {
                        console.warn('[PVP] History upsert failed (non-fatal):', historyErr.message);
                    }
                }
            } catch (e) {
                console.warn('[PVP] Error recording history:', e);
            }
        }

        setGameState('result');
        gameStateRef.current = 'result';
    }

    async function handleBattleComplete(match) {
        if (matchSubscription.current) { matchSubscription.current(); matchSubscription.current = null; }
        if (waitingTimerRef.current) { clearInterval(waitingTimerRef.current); waitingTimerRef.current = null; }
        searchingRef.current = false; // stake is now resolved by the match itself

        // EVERY value below comes from a ref, not state. This function runs
        // inside the realtime subscription closure created back in
        // handleFindMatch, where stakeAmount was 0 and isPlayer1 was false —
        // which paid winners 0 diamonds and made player1 their own "loser".
        const stake = stakeRef.current;
        const amIPlayer1 = isPlayer1Ref.current;
        const liveMatchId = matchIdRef.current || match.id;

        const won = match.winner_id === userId;
        const myScore = amIPlayer1 ? match.player1_score : match.player2_score;
        const theirScore = amIPlayer1 ? match.player2_score : match.player1_score;
        const tied = !match.winner_id && myScore != null && theirScore != null && myScore === theirScore;

        // Calculate winnings — 10% rake on total pot. Floored for integer diamonds.
        const totalPot = stake * 2;
        const rakeAmount = Math.floor(totalPot * 0.1);
        const winnings = won ? totalPot - rakeAmount : 0;
        let payoutFailed = false;

        // Process rewards if we won
        if (won) {
            const loserId = amIPlayer1 ? match.player2_id : match.player1_id;
            try {
                // Phase 55: pass matchId for stable RPC idempotency reference_id
                const rewardResult = await processMatchReward(userId, loserId, stake, liveMatchId);
                if (rewardResult && rewardResult.success === false) {
                    throw new Error(rewardResult.error || 'Payout was rejected');
                }
            } catch (e) {
                console.warn('[PVP] Win payout failed:', e);
                payoutFailed = true;
                setRefundFailed(true);
                setPvpError(`Your payout of ${winnings} diamonds may not have gone through. Please verify your balance or contact support.`);
            }

            // Reload diamonds
            const { data: profile } = await supabase
                .from('profiles')
                .select('diamonds')
                .eq('id', userId)
                .maybeSingle();
            if (profile) setUserDiamonds(profile.diamonds || 0);

            if (!payoutFailed) {
                busEmit.diamondsEarned(winnings, 'PvP Real Match Victory');
                busEmit.celebration('confetti');
            }
        } else if (tied) {
            // Tie refund for REAL matches. Horse ties already refunded, but real
            // ties only called updatePvpStats('tie', 0) — so BOTH players simply
            // lost their full stake on a draw. Keyed to the matchId so the two
            // players' refunds are independent and each is idempotent.
            try {
                await diamondRpc(supabase, {
                    p_user_id: userId,
                    p_amount: stake,
                    p_type: 'pvp_refund',
                    p_description: `PvP tie — ${stake} diamonds returned`,
                    p_reference_id: `pvp_tie_refund_${liveMatchId}_${userId}`
                });
                const { data: tieProfile } = await supabase.from('profiles').select('diamonds').eq('id', userId).maybeSingle();
                if (tieProfile) setUserDiamonds(tieProfile.diamonds || 0);
            } catch (e) {
                console.warn('[PVP] Real-match tie refund failed:', e);
                payoutFailed = true;
                setRefundFailed(true);
                setPvpError(`Your ${stake} diamond stake refund for the drawn match may not have gone through. Please verify your balance or contact support.`);
            }
        } else {
            busEmit.screenShake('medium');
        }

        setResult({
            won,
            tied,
            playerScore: myScore,
            opponentScore: theirScore,
            winnings: payoutFailed ? 0 : (won ? winnings : (tied ? stake : 0)),
            stake,
            payoutFailed,
            opponent: opponentRef.current || opponent
        });

        // Update persistent stats via upsert (not just local setState)
        if (won) {
            await updatePvpStats('win', winnings - stake);
        } else if (match.winner_id && match.winner_id !== userId) {
            await updatePvpStats('loss', stake);
        } else {
            await updatePvpStats('tie', 0);
        }

        // Record question history for 60-day non-repeat (with actual accuracy).
        // Phase 59: filter null question_id + capture upsert errors.
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions
                    .filter(q => q && q.id != null)
                    .map((q, idx) => ({
                        user_id: userId,
                        question_id: q.id,
                        was_correct: playerAnswersRef.current[idx] === true,
                        seen_at: new Date().toISOString(),
                        mode: 'pvp'
                    }));

                if (historyRecords.length > 0) {
                    const { error: historyErr } = await supabase
                        .from('trivia_user_question_history')
                        .upsert(historyRecords, {
                            // ON CONFLICT DO NOTHING. trivia_user_question_history
                            // has SELECT + INSERT RLS policies but NO UPDATE policy,
                            // so the previous ignoreDuplicates:false failed the whole
                            // batch as soon as one question had been seen before.
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: true
                        });
                    if (historyErr) {
                        console.warn('[PVP] History upsert failed (non-fatal):', historyErr.message);
                    }
                }
            } catch (e) {
                console.warn('[PVP] Error recording history:', e);
            }
        }

        setGameState('result');
        gameStateRef.current = 'result';
    }

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
        searchingRef.current = false;
        stakeRefIdRef.current = null;
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
        horseAnswersRef.current = [];
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
                                {currentQuestion.options.map((option, idx) => (
                                  <TriviaAnswerOption
                                    key={idx}
                                    index={idx}
                                    option={toTitleCase(option)}
                                    selectedAnswer={selectedAnswer}
                                    correctIndex={currentQuestion.correct_index}
                                    showResult={showResult}
                                    onSelect={trivia.selectAnswer}
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
                                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 16 }}>
                                            Your score is submitted and safe. This match will settle automatically as soon as they finish — you can wait here or head back to the lobby.
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
