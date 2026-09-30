/**
 * TOURNAMENTS PAGE — Route: /hub/trivia/tournaments
 * Daily bracket tournament with registration, bracket view, and round play
 * Tournaments are planned for 8 PM Central Time; each round lasts 24 hours.
 *
 * Presentation (#ClubArenaConsole, 2026-09-21): every state prints on the
 * Trivia console chassis (TriviaConsole / TriviaConsoleDialog). The data,
 * registration, round play, grading and realtime logic below is unchanged.
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaAnswerOption from '../../../src/components/trivia/TriviaAnswerOption';
import useTriviaQuestion from '../../../src/hooks/useTriviaQuestion';
import useTriviaTimer from '../../../src/hooks/useTriviaTimer';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaConsole, { TriviaGlassAction } from '../../../src/components/trivia/console/TriviaConsole';
import TriviaConsoleDialog from '../../../src/components/trivia/console/TriviaConsoleDialog';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_TOURNAMENTS } from '../../../src/config/triviaIntroArt.mjs';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
import { printPlayerName } from '../../../src/lib/trivia/printPlayerName';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import {
    TOURNAMENTS_ART,
    TournamentAlerts,
    TournamentBracket,
    TournamentField,
    TournamentPastList,
    TournamentPrizeRows,
    TournamentRows,
    TournamentScheduledList,
    TournamentTabs,
    exactAmount,
    printableError,
} from '../../../src/components/trivia/tournaments/TournamentSections';
// FIX(audit): shared prize schedule — same percentages the payout engine
// (tournament-lifecycle.js) uses, so the advertised split matches what is paid.
import { prizeSchedule, splitPrizePool } from '../../../src/lib/trivia/prizeSchedule';
import useVIPGate from '../../../src/hooks/useVIPGate';
import { triviaTournamentPageReleaseResult } from '../../../src/lib/trivia/tournamentReleaseControl.mjs';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';

// Direct navigation cannot boot the legacy tournament client while the
// nightly server-owned tournament engine is being rebuilt.
export function getServerSideProps() {
    return triviaTournamentPageReleaseResult(process.env);
}

export default function TournamentsPage() {
    useTrainingBus('trivia-tournaments');
    const router = useRouter();
    const { allowed, showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('trivia');
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [userId, setUserId] = useState(null);
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [tournaments, setTournaments] = useState([]);
    const [activeTournament, setActiveTournament] = useState(null);
    const [userEntry, setUserEntry] = useState(null);
    // { [tournament_id]: entry } for every listed tournament, so each Register
    // button can be gated on its own tournament rather than the active one.
    const [entriesByTournament, setEntriesByTournament] = useState({});
    // { [profile_id]: username } for the whole bracket, fetched in one query.
    const [playerNames, setPlayerNames] = useState({});
    const [pastResults, setPastResults] = useState([]);
    const [gameState, setGameState] = useState('loading');
    const [notifications, setNotifications] = useState([]);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    // Which lobby list is showing (Scheduled / Active / Past). Presentation
    // only: null means "follow the data" (Active while a tournament is live).
    const [lobbyView, setLobbyView] = useState(null);

    // Bracket state
    const [rounds, setRounds] = useState([]);
    const [currentRoundData, setCurrentRoundData] = useState(null);
    const [myMatchup, setMyMatchup] = useState(null);
    const [opponentInfo, setOpponentInfo] = useState(null);

    // Save-error UI state (was silently swallowed, now surfaced)
    const [submitError, setSubmitError] = useState(null);
    const [registerError, setRegisterError] = useState(null);

    // Playing state
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // TRAIN-WIRE-TRIVIA-HOOK-3 - shared trivia answer-state plumbing
    const timerCtrlRef = useRef({});
    const trivia = useTriviaQuestion(questions[currentQuestionIndex], {
        onAnswer: ({ index }) => {
            timerCtrlRef.current.stop?.();

            // ANSWER-KEY LOCKDOWN (Phase 80): tournament questions are served by
            // /api/trivia/tournament-round-questions WITHOUT correct_index, so the
            // client genuinely cannot know whether a pick was right. We record the
            // DISPLAY index the player clicked; the submit route maps it back
            // through the same deterministic permutation and grades server-side.
            // -1 (timeout) is stored as null == "unanswered".
            answersRef.current[currentQuestionIndex] =
                Number.isInteger(index) && index >= 0 ? index : null;
            setAnsweredCount(answersRef.current.filter(a => a != null).length);

            // Advance quickly - no GTO explanations in tournaments
            setTimeout(() => {
                if (currentQuestionIndex + 1 >= questions.length) {
                    finishRoundPlay();
                } else {
                    setCurrentQuestionIndex(prev => prev + 1);
                    trivia.reset();
                    timerCtrlRef.current.reset?.();
                }
            }, 500);
        }
    });
    const { selectedAnswer, showResult } = trivia;
    const [score, setScore] = useState(0);
    // How many questions the player has actually answered this round (the client
    // can no longer compute a live score — see the answer-key lockdown note).
    const [answeredCount, setAnsweredCount] = useState(0);
    // Server-graded result for the round, filled from the submit response.
    const [roundResult, setRoundResult] = useState(null);
    const [roundLoading, setRoundLoading] = useState(false);
    const [startTime, setStartTime] = useState(null);
    // TRAIN-WIRE-TRIVIA-TIMER-3 - shared shot-clock hook.
    // pauseOnHide:false — tournaments are competitive; pausing the shot clock on
    // tab-hide was a free answer-lookup window.
    const timer = useTriviaTimer({ initialTime: 40, showResult: trivia.showResult, gameState, onTimeout: handleTimeout, pauseOnHide: false });
    timerCtrlRef.current = { stop: () => timer.setIsTimerRunning(false), reset: timer.resetTimer };
    const answersRef = useRef([]); // Display index picked per question (null = unanswered)
    const realtimeChannelRef = useRef(null);
    const isStartingRef = useRef(false); // Prevent double-click race
    const deadlineTimerRef = useRef(null);
    const [deadlineDisplay, setDeadlineDisplay] = useState('');
    // Mirrors gameState so realtime callbacks (registered once per tournament id)
    // can test the LIVE phase instead of a frozen closure value.
    const gameStateRef = useRef('loading');
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    // Presentation: round play and the round result each replace the lobby
    // console, so bring the new console's head into view (the old result was
    // a fixed overlay and never needed this).
    useEffect(() => {
        if ((gameState === 'playing' || gameState === 'complete') && typeof window !== 'undefined') {
            window.scrollTo(0, 0);
        }
    }, [gameState]);
    // Notification ids we have already raised an OS notification for. Without
    // this, loadNotifications' 30s poll re-fired a browser Notification for the
    // same unread item every 30 seconds until it was dismissed.
    const notifiedIdsRef = useRef(new Set());

    useEffect(() => {
        if (authLoading) return;
        loadData();
        return () => {
            if (deadlineTimerRef.current) clearInterval(deadlineTimerRef.current);
            // Cleanup realtime channel
            if (realtimeChannelRef.current) {
                try { supabase.removeChannel(realtimeChannelRef.current); } catch { /* ignore */ }
                realtimeChannelRef.current = null;
            }
        };
    }, [avatarUser?.id, authLoading]);

    // Visibility-change pause + shot-clock countdown now handled by
    // useTriviaTimer (TRAIN-WIRE-TRIVIA-TIMER-3) — removed inline effects.

    // Request browser notification permission
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Poll for notifications every 30 seconds
    useEffect(() => {
        if (!userId) return;
        const interval = setInterval(loadNotifications, 30000);
        return () => clearInterval(interval);
    }, [userId]);

    // Supabase Realtime subscription for bracket updates
    useEffect(() => {
        if (!activeTournament?.id) return;

        // Cleanup previous channel
        if (realtimeChannelRef.current) {
            try { supabase.removeChannel(realtimeChannelRef.current); } catch { /* ignore */ }
            realtimeChannelRef.current = null;
        }

        const channelName = `trivia-tournament-${activeTournament.id}-${Date.now()}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'trivia_tournament_rounds',
                    filter: `tournament_id=eq.${activeTournament.id}`
                },
                () => {
                    if (userId) loadBracketData(activeTournament, userId);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'trivia_tournaments',
                    filter: `id=eq.${activeTournament.id}`
                },
                () => {
                    // Scope this to the transitions that actually matter.
                    // Previously ANY update to the tournament row (e.g. the
                    // prize_pool increment when another player registers) called
                    // loadData(), which unconditionally ends with
                    // setGameState('lobby') — yanking a mid-round player out of
                    // their questions and losing their in-progress answers.
                    if (gameStateRef.current === 'playing' || gameStateRef.current === 'complete') {
                        refreshTournamentRowOnly(activeTournament.id);
                        return;
                    }
                    loadData();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                }
            });

        realtimeChannelRef.current = channel;

        return () => {
            if (realtimeChannelRef.current) {
                try { supabase.removeChannel(realtimeChannelRef.current); } catch { /* ignore */ }
                realtimeChannelRef.current = null;
            }
        };
    }, [activeTournament?.id]);

    // Live deadline countdown refresh every 30 seconds
    useEffect(() => {
        if (!activeTournament?.round_deadline) {
            setDeadlineDisplay('');
            return;
        }

        const updateDeadline = () => {
            setDeadlineDisplay(getDeadlineCountdown(activeTournament.round_deadline));
        };
        updateDeadline();
        deadlineTimerRef.current = setInterval(updateDeadline, 30000);

        return () => {
            if (deadlineTimerRef.current) clearInterval(deadlineTimerRef.current);
        };
    }, [activeTournament?.round_deadline]);

    async function loadNotifications(uid) {
        const effectiveId = uid || userId;
        if (!effectiveId) return;
        const { data } = await supabase
            .from('trivia_tournament_notifications')
            .select('*')
            .eq('user_id', effectiveId)
            .eq('read', false)
            .order('created_at', { ascending: false })
            .limit(10);

        if (data && data.length > 0) {
            setNotifications(data);
            // Show a browser notification only for items we have not already
            // notified about in this session.
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                const latest = data[0];
                if (latest?.id != null && !notifiedIdsRef.current.has(latest.id)) {
                    notifiedIdsRef.current.add(latest.id);
                    new Notification('Smarter Poker Tournament', {
                        body: latest.message,
                        icon: TOURNAMENTS_ART
                    });
                }
            }
        } else {
            setNotifications([]);
        }
    }

    async function dismissNotification(id) {
        const { error: err_trivia_tournament_notifications_n56za } = await supabase
          .from('trivia_tournament_notifications')
          .update({ read: true })
            .eq('id', id);
        if (err_trivia_tournament_notifications_n56za) console.warn('[Supabase] Silent mutation failed in trivia_tournament_notifications:', err_trivia_tournament_notifications_n56za.message);
        setNotifications(prev => prev.filter(n => n.id !== id));
    }

    async function loadData() {
        const user = avatarUser || getAuthUser();
        if (!user) {
            router.push('/hub/trivia');
            return;
        }

        setUserId(user.id);

        // Load diamonds
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', user.id)
            .maybeSingle();

        if (profile) setUserDiamonds(profile.diamonds || 0);

        // Load upcoming/active tournaments.
        // trivia_tournaments_public is the key-stripped projection (migration
        // 120800): `questions` has correct_index/explanation removed from every
        // element, and clients no longer hold SELECT on the base table.
        const { data: tournamentData } = await supabase
            .from('trivia_tournaments_public')
            .select('*')
            .in('status', ['upcoming', 'active'])
            .order('start_time', { ascending: true })
            .limit(50); // tournaments

        setTournaments(tournamentData || []);

        // One query for the user's entries across every listed tournament.
        const listedIds = (tournamentData || []).map(t => t.id).filter(Boolean);
        if (listedIds.length > 0) {
            const { data: myEntries } = await supabase
                .from('trivia_tournament_entries')
                .select('*')
                .eq('user_id', user.id)
                .in('tournament_id', listedIds);
            const byId = {};
            (myEntries || []).forEach(e => { byId[e.tournament_id] = e; });
            setEntriesByTournament(byId);
        } else {
            setEntriesByTournament({});
        }

        // Find active tournament and load bracket data
        const active = tournamentData?.find(t => t.status === 'active');
        if (active) {
            setActiveTournament(active);
            await loadBracketData(active, user.id);

            // Check if user is registered
            const { data: entry } = await supabase
                .from('trivia_tournament_entries')
                .select('*')
                .eq('tournament_id', active.id)
                .eq('user_id', user.id)
                .maybeSingle();

            setUserEntry(entry);
        }

        // Load past results
        const { data: past } = await supabase
            .from('trivia_tournaments_public')
            .select('*')
            .in('status', ['completed', 'cancelled'])
            .order('completed_at', { ascending: false })
            .limit(5);

        setPastResults(past || []);

        // Load notifications (pass user.id directly since useState hasn't propagated yet)
        await loadNotifications(user.id);

        // Only take over the screen when we are not mid-round. loadData used to
        // force 'lobby' unconditionally, so any refresh during play kicked the
        // player out of their questions.
        if (gameStateRef.current !== 'playing' && gameStateRef.current !== 'complete') {
            setGameState('lobby');
            gameStateRef.current = 'lobby';
        }
    }

    /**
     * Refresh ONLY the tournament row (prize pool, round counters, deadline)
     * without touching gameState — used by the realtime handler while the player
     * is mid-round.
     */
    async function refreshTournamentRowOnly(tournamentId) {
        try {
            const { data: fresh } = await supabase
                .from('trivia_tournaments_public')
                .select('*')
                .eq('id', tournamentId)
                .maybeSingle();
            if (fresh) setActiveTournament(fresh);
        } catch (e) {
            console.warn('[Tournaments] Row refresh failed:', e);
        }
    }

    async function loadBracketData(tournament, uid) {
        // Load all rounds for this tournament
        const { data: roundsData } = await supabase
            .from('trivia_tournament_rounds')
            .select('*')
            .eq('tournament_id', tournament.id)
            .order('round_number', { ascending: true });

        setRounds(roundsData || []);

        // Batch-resolve every player name in the bracket in ONE query.
        // BracketPlayerName used to issue a profiles query per player per render
        // — a 64-player bracket fired ~128 requests, re-fired on every realtime
        // bracket update.
        try {
            const ids = new Set();
            (roundsData || []).forEach(r => {
                (r.matchups || []).forEach(m => {
                    if (m?.player1_id) ids.add(m.player1_id);
                    if (m?.player2_id) ids.add(m.player2_id);
                });
            });
            if (ids.size > 0) {
                const { data: profs } = await supabase
                    .from('profiles')
                    .select('id, username')
                    .in('id', Array.from(ids));
                const map = {};
                (profs || []).forEach(pr => { map[pr.id] = pr.username || 'Player'; });
                setPlayerNames(map);
            } else {
                setPlayerNames({});
            }
        } catch (e) {
            console.warn('[Tournaments] Bracket name batch fetch failed:', e);
        }

        // Find the current active round
        const activeRound = roundsData?.find(r => r.status === 'active');
        setCurrentRoundData(activeRound);

        // Find user's matchup in the current round
        if (activeRound && uid) {
            const matchups = activeRound.matchups || [];
            const myMatch = matchups.find(m =>
                m.player1_id === uid || m.player2_id === uid
            );
            setMyMatchup(myMatch);

            // Load opponent info
            if (myMatch) {
                const opponentId = myMatch.player1_id === uid ? myMatch.player2_id : myMatch.player1_id;
                if (opponentId) {
                    const { data: oppProfile } = await supabase
                        .from('profiles')
                        .select('username, avatar_url')
                        .eq('id', opponentId)
                        .maybeSingle();

                    const { data: oppStats } = await supabase
                        .from('trivia_pvp_stats')
                        .select('wins, losses')
                        .eq('user_id', opponentId)
                        .maybeSingle();

                    setOpponentInfo({
                        id: opponentId,
                        username: oppProfile?.username || 'Player',
                        avatar_url: oppProfile?.avatar_url,
                        wins: oppStats?.wins || 0,
                        losses: oppStats?.losses || 0
                    });
                }
            }
        }
    }

    async function handleRegister(tournament) {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
        // (The old `sessionStorage.trivia_paid` cleanup is gone — nothing writes
        //  that flag any more; tournaments always bill their own entry fee via
        //  /api/trivia/tournament-enter.)

        if (!allowed) {
            showUpgradeModal();
            return;
        }

        // Cheap client-side balance check (server re-verifies authoritatively)
        if (userDiamonds < tournament.entry_fee) {
            setShowOutOfDiamonds(true);
            return;
        }

        // Atomic server-side entry: deduct fee + insert entry + update prize pool
        // (replaces the previous client-side flow that direct-wrote to
        //  trivia_tournament_entries and trivia_tournaments — both now
        //  RLS-locked to service_role per Phase 37.)
        try {
            const token = getAccessToken();
            if (!token) {
                console.warn('[Tournaments] No session token - cannot register');
                return;
            }
            const resp = await fetch('/api/trivia/tournament-enter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ tournament_id: tournament.id })
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok || !json.success) {
                if (resp.status === 402 || json.error === 'insufficient_diamonds') {
                    setShowOutOfDiamonds(true);
                } else if (json.error === 'already_entered') {
                    // Idempotent — re-load to surface the existing entry
                    await loadData();
                } else {
                    // Surface to user (was previously silent)
                    console.warn('[Tournaments] Entry failed:', json.error || resp.status);
                    setRegisterError(json.error || `Entry Failed (HTTP ${resp.status})`);
                }
                return;
            }
            setUserEntry(json.entry);
            if (typeof json.new_balance === 'number') setUserDiamonds(json.new_balance);
            busEmit.diamondsSpent(tournament.entry_fee, 'Tournament Entry');
        } catch (e) {
            console.warn('[Tournaments] Entry RPC failed:', e?.message || e);
            setRegisterError('Network Error. Please Try Again.');
            return;
        }

        // Refresh tournament data
        await loadData();
        } finally {
            isStartingRef.current = false;
        }
    }

    /** Human-readable text for the API's machine error codes. */
    function roundQuestionsErrorText(code, status) {
        switch (code) {
            case 'round_not_active': return 'This Round Is No Longer Active.';
            case 'round_deadline_passed': return 'The Deadline For This Round Has Passed.';
            case 'not_entered': return 'You Are Not Entered In This Tournament.';
            case 'eliminated': return 'You Have Been Eliminated From This Tournament.';
            case 'not_in_round': return 'You Are Not Scheduled In This Round.';
            case 'bye_round': return 'You Have A Bye, So You Advance Automatically.';
            case 'already_submitted': return 'You Have Already Played This Round.';
            case 'no_questions':
            case 'no_playable_questions': return 'No Questions Are Available For This Round Yet. Please Try Again Shortly.';
            default: return code || `Could Not Load This Round (HTTP ${status}).`;
        }
    }

    async function startRoundPlay() {
        // Guard against re-entering a round that has already been submitted
        // (e.g. a stale realtime refresh re-rendering the PLAY button).
        if (hasPlayedThisRound || roundLoading) return;
        if (!currentRoundData?.id) {
            setSubmitError('No Active Round To Play Yet. Please Try Again Shortly.');
            return;
        }

        setRoundLoading(true);
        setSubmitError(null);
        try {
            // ANSWER-KEY LOCKDOWN (Phase 80): the round roster now comes from the
            // server WITHOUT correct_index/explanation, with options permuted
            // deterministically per user. The page no longer slices (and no
            // longer shuffles) the world-readable tournament snapshot, which used
            // to hand the answer key to every client.
            const token = getAccessToken();
            if (!token) {
                setSubmitError('Your Session Expired. Please Sign In Again.');
                return;
            }
            const resp = await fetch(
                `/api/trivia/tournament-round-questions?round_id=${encodeURIComponent(currentRoundData.id)}`,
                { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
            );
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok || !json.success || !Array.isArray(json.questions) || json.questions.length === 0) {
                if (json?.error === 'already_submitted') {
                    // Server already has this round — resync the bracket instead
                    // of dropping the player into a round they cannot submit.
                    await loadBracketData(activeTournament, userId);
                }
                setSubmitError(roundQuestionsErrorText(json?.error, resp.status));
                return;
            }

            setQuestions(json.questions);
            setCurrentQuestionIndex(0);
            setScore(0);
            setAnsweredCount(0);
            setRoundResult(null);
            answersRef.current = [];
            trivia.reset();
            setStartTime(Date.now());
            gameStateRef.current = 'playing'; // set synchronously — realtime callbacks read this
            setGameState('playing');
            timer.resetTimer();
        } catch (e) {
            console.warn('[Tournaments] Round question fetch failed:', e?.message || e);
            setSubmitError('Network Error. Please Try Again.');
        } finally {
            setRoundLoading(false);
        }
    }

    function handleTimeout() {
        timer.setIsTimerRunning(false);
        trivia.selectAnswer(-1); // Wrong answer - delegates to shared hook
    }

    async function finishRoundPlay() {
        timer.setIsTimerRunning(false);
        setSubmitError(null);

        // Server-side score submission via /api/trivia/tournament-submit-round.
        // ANSWER-KEY LOCKDOWN (Phase 80): we submit { question_id, display_index }
        // — the position the player actually clicked in the per-user permuted
        // option order. The server reverses the permutation and compares against
        // the key it holds privately, so the client never sees, and never gets to
        // assert, correctness. (The old payload posted a `selected` index derived
        // from the downloaded correct_index — self-grading in all but name.)
        if (currentRoundData && myMatchup) {
            const submitOnce = async () => {
                const token = getAccessToken();
                if (!token) throw new Error('No session token - cannot submit round');
                // display_index === null means "did not answer" (timeout / skipped);
                // the server counts it as unanswered rather than wrong-by-sentinel.
                const answersPayload = questions
                    .filter(q => q.id != null)
                    .map((q, idx) => {
                        const picked = answersRef.current[idx];
                        return {
                            question_id: q.id,
                            display_index: Number.isInteger(picked) && picked >= 0 ? picked : null
                        };
                    });
                const resp = await fetch('/api/trivia/tournament-submit-round', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ round_id: currentRoundData.id, answers: answersPayload })
                });
                const json = await resp.json().catch(() => ({}));
                if (!resp.ok || !json.success) {
                    throw new Error(json.error || `submit_failed_${resp.status}`);
                }
                return json;
            };

            // Retry once on transient failure (network blip / 500), then surface to user.
            // Was previously silent — user saw "Round Complete" but server had no record.
            let lastErr = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const json = await submitOnce();
                    // The server is the only party that knows the score. On an
                    // idempotent resubmit score_added is 0, so fall back to the
                    // score already sitting in our matchup slot.
                    const slot = json?.matchup
                        ? (json.matchup.player1_id === userId ? json.matchup.player1_score : json.matchup.player2_score)
                        : null;
                    const graded = json?.deduped && slot != null ? Number(slot) : Number(json?.score_added ?? 0);
                    const safeGraded = Number.isFinite(graded) ? graded : 0;
                    setRoundResult({
                        correct: safeGraded,
                        answered: Number.isFinite(Number(json?.answered)) ? Number(json.answered) : answeredCount,
                        total: questions.length
                    });
                    setScore(safeGraded * 100);
                    lastErr = null;
                    break;
                } catch (e) {
                    lastErr = e;
                    if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
                }
            }
            if (lastErr) {
                console.warn('[Tournaments] Round submit failed after retry:', lastErr?.message || lastErr);
                setSubmitError(lastErr?.message || 'Failed To Save Round Score');
                // Don't proceed to "complete" UI — let user see error + retry button
                return;
            }
        }

        // The submit route has already persisted server-verified history,
        // mastery, correctness and skip telemetry under an exact-once round key.

        // Refresh bracket data
        await loadBracketData(activeTournament, userId);
        busEmit.celebration('confetti');
        gameStateRef.current = 'complete';
        setGameState('complete');
    }

    function getCountdown(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        const diff = start - now;

        if (diff <= 0) return 'Starting Now';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days}D ${hours % 24}H`;
        }
        return `${hours}H ${minutes}M`;
    }

    function getDeadlineCountdown(deadline) {
        if (!deadline) return '';
        const diff = new Date(deadline) - new Date();
        if (diff <= 0) return 'Expired';
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}H ${minutes}M Remaining`;
    }

    function getRoundName(roundNum, totalRounds) {
        if (!totalRounds) return `Round ${roundNum}`;
        const remaining = totalRounds - roundNum;
        if (remaining === 0) return 'Finals';
        if (remaining === 1) return 'Semi-Finals';
        if (remaining === 2) return 'Quarter-Finals';
        return `Round ${roundNum}`;
    }

    const currentQuestion = questions[currentQuestionIndex];

    // Round-complete derivations (post loadBracketData refresh).
    // The correct count is whatever the SERVER graded — the client has no key.
    const roundCorrectCount = roundResult?.correct ?? 0;
    const opponentRoundScore = myMatchup
        ? (myMatchup.player1_id === userId ? myMatchup.player2_score : myMatchup.player1_score)
        : null;
    const roundOutcome = !myMatchup || !myMatchup.winner_id
        ? 'pending'
        : (myMatchup.winner_id === userId ? 'won' : 'lost');

    // Prize distribution preview, computed from the live prize pool so players
    // can see exactly what each finishing place pays BEFORE they enter.
    // FIX(audit): the old hard-coded 40/20/12/8/5 PRIZE_SPLIT never matched the
    // payout engine's schedule (tournament-lifecycle.js prizeSchedule), so every
    // advertised amount was wrong. The preview now uses the SAME
    // prizeSchedule()/splitPrizePool() the engine pays with, keyed to the live
    // entrant count derived from the round-1 bracket roster.
    const ordinal = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
    };
    const entrantCount = (() => {
        const firstRound = rounds && rounds.length > 0 ? rounds[0] : null;
        if (!firstRound) return 0;
        const ids = new Set();
        (firstRound.matchups || []).forEach(m => {
            if (m?.player1_id) ids.add(m.player1_id);
            if (m?.player2_id) ids.add(m.player2_id);
        });
        return ids.size;
    })();
    const prizeBreakdown = (() => {
        // Without a seeded bracket the field size is unknown — show nothing
        // rather than a split that may not apply to the final entrant count.
        if (!activeTournament || entrantCount < 2) return [];
        const pool = Math.max(0, Math.floor(Number(activeTournament.prize_pool) || 0));
        if (pool <= 0) return [];
        const pcts = prizeSchedule(entrantCount);
        return splitPrizePool(pool, entrantCount).map((amount, i) => ({
            place: ordinal(i + 1),
            pct: pcts[i] || 0,
            amount
        }));
    })();

    // Loose (!= null) checks: matchups live in a JSONB array, so a bracket
    // generator that OMITS the score keys yields `undefined`, and
    // `undefined !== null` is true — the player would be shown "Score
    // Submitted! Waiting For Opponent..." with the PLAY button permanently
    // hidden, silently blocking them out of the whole bracket.
    const hasPlayedThisRound = myMatchup && (
        (myMatchup.player1_id === userId && myMatchup.player1_score != null) ||
        (myMatchup.player2_id === userId && myMatchup.player2_score != null)
    );
    const isEliminated = userEntry?.eliminated_round != null;

    // ── Presentation-only derivations ─────────────────────────────────────
    const upcomingTournaments = tournaments.filter(t => t.status === 'upcoming');
    // null follows the data: the live bracket when there is one, else the schedule.
    const lobbyList = lobbyView || (activeTournament ? 'active' : 'scheduled');
    const roundNameFor = (roundNum) => getRoundName(roundNum, activeTournament?.total_rounds);
    const myRoundScore = myMatchup
        ? (myMatchup.player1_id === userId ? myMatchup.player1_score : myMatchup.player2_score)
        : null;
    const fieldPlayerIds = (() => {
        const firstRound = rounds && rounds.length > 0 ? rounds[0] : null;
        if (!firstRound) return [];
        const ids = [];
        (firstRound.matchups || []).forEach(m => {
            if (m?.player1_id && !ids.includes(m.player1_id)) ids.push(m.player1_id);
            if (m?.player2_id && !ids.includes(m.player2_id)) ids.push(m.player2_id);
        });
        return ids;
    })();
    const tournamentName = toTitleCase(String(activeTournament?.name || 'Championship'));
    const timeLow = timer.timeLeft <= 10;
    // submitError carries two kinds of failure: a round submit that failed
    // after its retry (the player is still in 'playing' with answers held),
    // and a round that could not be LOADED from the lobby. Only the first can
    // be retried by re-submitting; offering finishRoundPlay() for a load error
    // would submit an empty answer sheet, so that case shows Dismiss only.
    const submitFailed = Boolean(submitError) && gameState === 'playing';
    const errorText = submitFailed
        ? `Round Score Did Not Save: ${printableError(submitError)}`
        : submitError
            ? `Round Could Not Load: ${printableError(submitError)}`
            : registerError ? `Tournament Entry Failed: ${printableError(registerError)}` : '';
    const dismissErrors = () => { setSubmitError(null); setRegisterError(null); };
    const backToLobby = () => { gameStateRef.current = 'lobby'; setGameState('lobby'); loadData(); };
    const outcomeLabel = roundOutcome === 'won' ? 'You Advance' : roundOutcome === 'lost' ? 'Eliminated' : 'Awaiting Opponent';
    const outcomeInk = roundOutcome === 'won' ? 'green' : roundOutcome === 'lost' ? 'red' : 'blue';
    const dayPassCost = featureConfig?.cost || 25;
    const dayPassGate = featureConfig?.gate === 'DIAMOND' || featureConfig?.gate === 'MIXED';

    return (
        <TriviaErrorBoundary pageName="Tournaments">
        <PageTransition>
            <SEOHead
                title="Trivia Tournaments - Compete For Prizes"
                description="Poker Trivia Tournaments On Smarter.Poker: A Scheduled Field Answering The Same Questions In The Same Order, Ranked On Accuracy And Speed. Free To Enter, And Nothing In It Is A Wager."
                canonical="/hub/trivia/tournaments"
            >

            </SEOHead>

            <div
                className="trivia-console-standalone trivia-tournaments-page"
                data-trivia-surface="tournaments"
                data-game-state={gameState}
            >
                <UniversalHeader pageDepth={2} />

                <main className="tt-shell" aria-labelledby="trivia-tournaments-title">
                    {gameState === 'loading' && (
                        <TriviaConsole
                            eyebrow="Nightly Brackets"
                            title="Trivia Tournaments"
                            titleAs="h1"
                            titleId="trivia-tournaments-title"
                            subtitle="8 PM Central. Each Round Lasts 24 Hours"
                            pill="Loading"
                            pillInk="muted"
                        >
                            <div className="trivia-console-state" role="status">
                                <p className="tt-pulse">Loading Tournaments...</p>
                            </div>
                        </TriviaConsole>
                    )}

                    {gameState === 'lobby' && (
                        <TriviaConsole
                            eyebrow="Nightly Brackets"
                            title="Trivia Tournaments"
                            titleAs="h1"
                            titleId="trivia-tournaments-title"
                            subtitle="8 PM Central. Each Round Lasts 24 Hours"
                            pill={activeTournament ? 'Live' : 'Nightly'}
                            pillInk={activeTournament ? 'green' : 'blue'}
                        >
                            <ResponsiveModeArt art={TRIVIA_INTRO_ART_TOURNAMENTS} priority />

                            <TournamentRows
                                label="Your Balance"
                                rows={[{ label: 'Your Diamonds', value: exactAmount(userDiamonds) }]}
                            />

                            <TournamentAlerts notifications={notifications} onDismiss={dismissNotification} />

                            <TournamentTabs value={lobbyList} onChange={setLobbyView} />

                            {lobbyList === 'active' && !activeTournament && (
                                <div className="trivia-console-state">
                                    <p className="tc-ink--silver">No Tournament Is Live Right Now.</p>
                                    <p className="tc-ink--muted">Nightly Tournaments Start At 8 PM Central Time!</p>
                                </div>
                            )}

                            {/* Active Tournament with Bracket */}
                            {lobbyList === 'active' && activeTournament && (
                                <section className="tt-section" aria-labelledby="tt-active-title">
                                    <p className="tc-label tc-ink--green">
                                        Live Round {activeTournament.current_round || 1}
                                    </p>
                                    <h2 id="tt-active-title" className="tt-event__name">{tournamentName}</h2>

                                    <TournamentRows
                                        label="Tournament Details"
                                        rows={[
                                            { label: 'Prize Pool', value: `${exactAmount(activeTournament.prize_pool || 0)} Diamonds`, ink: 'gold' },
                                            { label: 'Round', value: `${activeTournament.current_round} / ${activeTournament.total_rounds || '?'}` },
                                            activeTournament.round_deadline
                                                ? { label: 'Deadline', value: deadlineDisplay || getDeadlineCountdown(activeTournament.round_deadline), ink: 'red' }
                                                : null,
                                            entrantCount > 0
                                                ? { label: 'Players', value: formatTriviaDisplayNumber(entrantCount) }
                                                : null,
                                            { label: 'Entry Fee', value: `${exactAmount(activeTournament.entry_fee || 0)} Diamonds` },
                                        ]}
                                    />

                                    {/* Your Match Status */}
                                    {userEntry && !isEliminated && myMatchup && (
                                        <section className="tt-match" aria-labelledby="tt-match-title">
                                            <h3 id="tt-match-title" className="tc-label">
                                                Your Match: {getRoundName(activeTournament.current_round, activeTournament.total_rounds)}
                                            </h3>
                                            <div className="tt-vs">
                                                <div className="tt-seat">
                                                    <span className="tt-seat__name tc-ink--blue">You</span>
                                                    {hasPlayedThisRound && (
                                                        <span className="tt-seat__score tc-ink--gold">{myRoundScore}</span>
                                                    )}
                                                </div>
                                                <span className="tt-vs__word tc-ink--muted">Vs</span>
                                                <div className="tt-seat">
                                                    <span className="tt-seat__name tc-ink--silver">
                                                        {opponentInfo?.username ? printPlayerName(opponentInfo.username) : 'Bye'}
                                                    </span>
                                                    {opponentInfo && (
                                                        <span className="tt-seat__record tc-ink--muted">
                                                            {formatTriviaDisplayNumber(opponentInfo.wins)} W {formatTriviaDisplayNumber(opponentInfo.losses)} L
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {myMatchup.is_bye ? (
                                                <p className="tt-status tc-ink--green">Bye: You Advance Automatically!</p>
                                            ) : hasPlayedThisRound ? (
                                                <p className="tt-status tc-ink--green">Score Submitted! Waiting For Opponent...</p>
                                            ) : (
                                                <div className="tt-actions">
                                                    <TriviaGlassAction
                                                        label={roundLoading ? 'Loading Round...' : 'Play Your Match'}
                                                        disabled={roundLoading}
                                                        onClick={startRoundPlay}
                                                    />
                                                </div>
                                            )}

                                            {myMatchup.winner_id && (
                                                <p className={`tt-status ${myMatchup.winner_id === userId ? 'tc-ink--green' : 'tc-ink--red'}`}>
                                                    {myMatchup.winner_id === userId ? 'You Won!' : 'Eliminated'}
                                                </p>
                                            )}
                                        </section>
                                    )}

                                    {/* Eliminated notice */}
                                    {isEliminated && (
                                        <p className="tt-status tc-ink--red">Eliminated In Round {userEntry.eliminated_round}</p>
                                    )}

                                    {/* Not registered */}
                                    {!userEntry && activeTournament.current_round === 0 && (
                                        <div className="tt-actions">
                                            <TriviaGlassAction
                                                label={`Enter For ${exactAmount(activeTournament.entry_fee)} Diamonds`}
                                                onClick={() => handleRegister(activeTournament)}
                                            />
                                        </div>
                                    )}

                                    {/* Prize distribution — visible and auditable before entry */}
                                    {(activeTournament.prize_pool || 0) > 0 && prizeBreakdown.length > 0 && (
                                        <TournamentPrizeRows breakdown={prizeBreakdown} />
                                    )}

                                    <TournamentField playerIds={fieldPlayerIds} userId={userId} names={playerNames} />

                                    {/* Bracket Visualization */}
                                    <TournamentBracket
                                        rounds={rounds}
                                        userId={userId}
                                        names={playerNames}
                                        roundName={roundNameFor}
                                    />
                                </section>
                            )}

                            {/* Upcoming Tournaments */}
                            {lobbyList === 'scheduled' && (
                                <TournamentScheduledList
                                    tournaments={upcomingTournaments}
                                    entriesByTournament={entriesByTournament}
                                    onRegister={handleRegister}
                                    countdown={getCountdown}
                                />
                            )}

                            {/* Past Results */}
                            {lobbyList === 'past' && <TournamentPastList tournaments={pastResults} />}
                        </TriviaConsole>
                    )}

                    {/* Playing */}
                    {gameState === 'playing' && currentQuestion && (
                        <TriviaConsole
                            eyebrow="Trivia Tournament"
                            title={activeTournament ? getRoundName(activeTournament.current_round, activeTournament.total_rounds) : 'Tournament Round'}
                            titleAs="h1"
                            titleId="trivia-tournaments-title"
                            subtitle={`Question ${currentQuestionIndex + 1} Of ${questions.length}`}
                            pill={`${timer.timeLeft} Sec`}
                            pillInk={timeLow ? 'red' : 'gold'}
                        >
                            <TournamentRows
                                label="Round Progress"
                                rows={[
                                    { label: 'Tournament', value: tournamentName, wrap: true },
                                    { label: 'Question', value: `${currentQuestionIndex + 1} / ${questions.length}` },
                                    { label: 'Answered', value: `${answeredCount} / ${questions.length}` },
                                    { label: 'Time Left', value: `${timer.timeLeft} Sec`, ink: timeLow ? 'red' : 'gold' },
                                ]}
                            />
                            <p className="trivia-sr-only" aria-live="polite">
                                {timeLow ? `${timer.timeLeft} Seconds Left` : ''}
                            </p>
                            <hr className="tc-rule" />
                            <h2 className="tt-question">{toTitleCase(currentQuestion.question)}</h2>

                            <div className="tt-options">
                                {/* TRAIN-WIRE-TRIVIA-ANSWER-OPTION-3 — shared option primitive.
                                    showResult is deliberately false: with the answer key held
                                    server-side there is nothing to reveal, so the pick only
                                    renders as "selected" (locked in) and `disabled` comes from
                                    the hook's showResult instead. Revealing here would either
                                    lie (every answer painted wrong) or leak the key. */}
                                {(currentQuestion.options || []).map((option, idx) => (
                                    <TriviaAnswerOption
                                        key={idx}
                                        index={idx}
                                        option={toTitleCase(option)}
                                        selectedAnswer={selectedAnswer}
                                        showResult={false}
                                        disabled={showResult}
                                        onSelect={trivia.selectAnswer}
                                    />
                                ))}
                            </div>
                            {showResult && (
                                <p className="tt-status tc-ink--blue" role="status">Answer Locked In</p>
                            )}
                        </TriviaConsole>
                    )}

                    {/* Round Complete: the outcome comes from the refreshed matchup
                        (won / lost / still awaiting the opponent), never a fixed
                        victory screen. */}
                    {gameState === 'complete' && (
                        <TriviaConsole
                            eyebrow="Trivia Tournament"
                            title="Round Complete"
                            titleAs="h1"
                            titleId="trivia-tournaments-title"
                            subtitle="Your Round Result"
                            pill={roundOutcome === 'won' ? 'Advance' : roundOutcome === 'lost' ? 'Eliminated' : 'Waiting'}
                            pillInk={outcomeInk}
                            secondaryAction={{
                                label: 'Back To Trivia',
                                'aria-label': 'Back To Trivia',
                                onClick: () => router.push('/hub/trivia'),
                            }}
                            primaryAction={{
                                label: 'Back To Lobby',
                                'aria-label': 'Back To Lobby',
                                onClick: backToLobby,
                            }}
                        >
                            <TournamentRows
                                label="Round Result"
                                rows={[
                                    { label: 'Result', value: outcomeLabel, ink: outcomeInk },
                                    // Correct count as GRADED BY THE SERVER (submit
                                    // response). The client no longer holds the answer
                                    // key, so it cannot count this itself.
                                    { label: 'Your Score', value: `${roundCorrectCount} / ${questions.length}`, ink: 'blue' },
                                    opponentRoundScore != null
                                        ? { label: opponentInfo?.username ? printPlayerName(opponentInfo.username) : 'Opponent', value: String(opponentRoundScore), ink: 'red' }
                                        : null,
                                    { label: 'Points', value: String(score), ink: 'green' },
                                    { label: 'Tournament', value: tournamentName, wrap: true },
                                    { label: 'Round', value: `${activeTournament?.current_round || 1} / ${activeTournament?.total_rounds || '?'}`, ink: 'gold' },
                                ]}
                            />
                        </TriviaConsole>
                    )}
                </main>
            </div>

            {/* Save-failure notice: surfaces previously-silent errors */}
            <TriviaConsoleDialog
                open={Boolean(submitError || registerError)}
                onClose={dismissErrors}
                eyebrow="Trivia Tournaments"
                title={submitFailed ? 'Round Not Saved' : submitError ? 'Round Not Loaded' : 'Entry Failed'}
                pill="Error"
                pillInk="red"
                primaryAction={submitFailed ? {
                    label: 'Retry',
                    onClick: () => { setSubmitError(null); finishRoundPlay(); },
                } : { label: 'Dismiss', onClick: dismissErrors }}
                secondaryAction={submitFailed ? { label: 'Dismiss', onClick: dismissErrors } : undefined}
            >
                <p className="trivia-console-copy tc-ink--red" role="alert">{errorText}</p>
            </TriviaConsoleDialog>

            {/* Out of Diamonds */}
            <TriviaConsoleDialog
                open={showOutOfDiamonds}
                onClose={() => setShowOutOfDiamonds(false)}
                eyebrow="Tournament Entry"
                title="Not Enough Diamonds"
                pill="Diamonds"
                pillInk="gold"
                secondaryAction={{ label: 'Close', onClick: () => setShowOutOfDiamonds(false) }}
                primaryAction={{ label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }}
            >
                <p className="trivia-console-copy">You Don't Have Enough Diamonds For This Entry Fee. Visit The Diamond Store To Get More!</p>
                <TournamentRows
                    label="Your Balance"
                    rows={[{ label: 'Your Diamonds', value: exactAmount(userDiamonds), ink: 'red' }]}
                />
            </TriviaConsoleDialog>

            {/* VIP gate (useVIPGate owns visibility; same destinations as the legacy modal) */}
            <TriviaConsoleDialog
                open={upgradeModalVisible}
                onClose={hideUpgradeModal}
                eyebrow="Trivia Tournaments"
                title="Premium Feature"
                pill="VIP"
                pillInk="gold"
                secondaryAction={{ label: 'Maybe Later', onClick: hideUpgradeModal }}
                primaryAction={{
                    // The plate prints the short label so it fits the painted
                    // well; the full action is still announced.
                    label: 'Get VIP',
                    'aria-label': 'Get VIP Membership',
                    onClick: () => { hideUpgradeModal(); router.push('/hub/diamond-store?tab=vip'); },
                }}
            >
                <p className="trivia-console-copy">
                    <span className="tc-ink--gold">Trivia Tournaments</span> Is A Premium Feature.
                    Upgrade To VIP For Unlimited Access To All Premium Features!
                </p>
                {dayPassGate && (
                    <div className="tt-actions tt-actions--stacked">
                        <TriviaGlassAction
                            label={`Day Pass: ${exactAmount(dayPassCost)} Diamonds`}
                            ink="gold"
                            onClick={() => { hideUpgradeModal(); router.push('/hub/diamond-store'); }}
                        />
                        <p className="trivia-console-copy tc-ink--muted">A Day Pass Lasts 24 Hours.</p>
                    </div>
                )}
            </TriviaConsoleDialog>

    </PageTransition>
          {/* Server rendered: measured on production this page returned
              only chrome to a crawler (AEO phase 3, 2026-09-17). */}
          <HubPageSummary page="trivia-tournaments" />
        </TriviaErrorBoundary>
    );
}
