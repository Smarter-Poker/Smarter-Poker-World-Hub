/**
 * TOURNAMENTS PAGE — Route: /hub/trivia/tournaments
 * Daily bracket tournament with registration, bracket view, and round play
 * Tournaments start daily at 7PM CST, each round lasts 24 hours
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import Image from 'next/image';
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
import MetalFrame from '../../../src/components/ui/MetalFrame';
import HexButton from '../../../src/components/ui/HexButton';
import { Trophy, Calendar, Clock, Gem, CheckCircle, XCircle, Medal, Award, Bell, Swords, AlertTriangle } from 'lucide-react';
import { toTitleCase } from '../../../src/lib/trivia/titleCase';
// FIX(audit): shared prize schedule — same percentages the payout engine
// (tournament-lifecycle.js) uses, so the advertised split matches what is paid.
import { prizeSchedule, splitPrizePool } from '../../../src/lib/trivia/prizeSchedule';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';
import useVIPGate from '../../../src/hooks/useVIPGate';
import VIPGateModal from '../../../src/components/ui/VIPGateModal';

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
                        icon: '/images/trivia/lobby-tournaments.jpg'
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
                console.warn('[Tournaments] No session token — cannot register');
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
                    setRegisterError(json.error || `Entry failed (HTTP ${resp.status})`);
                }
                return;
            }
            setUserEntry(json.entry);
            if (typeof json.new_balance === 'number') setUserDiamonds(json.new_balance);
            busEmit.diamondsSpent(tournament.entry_fee, 'Tournament Entry');
        } catch (e) {
            console.warn('[Tournaments] Entry RPC failed:', e?.message || e);
            setRegisterError('Network error — please try again');
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
            case 'round_not_active': return 'This round is no longer active.';
            case 'round_deadline_passed': return 'The deadline for this round has passed.';
            case 'not_entered': return 'You are not entered in this tournament.';
            case 'eliminated': return 'You have been eliminated from this tournament.';
            case 'not_in_round': return 'You are not scheduled in this round.';
            case 'bye_round': return 'You have a bye — you advance automatically.';
            case 'already_submitted': return 'You have already played this round.';
            case 'no_questions':
            case 'no_playable_questions': return 'No questions are available for this round yet. Please try again shortly.';
            default: return code || `Could not load this round (HTTP ${status}).`;
        }
    }

    async function startRoundPlay() {
        // Guard against re-entering a round that has already been submitted
        // (e.g. a stale realtime refresh re-rendering the PLAY button).
        if (hasPlayedThisRound || roundLoading) return;
        if (!currentRoundData?.id) {
            setSubmitError('No active round to play yet. Please try again shortly.');
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
                setSubmitError('Your session expired — please sign in again.');
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
            setSubmitError('Network error — please try again');
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
                if (!token) throw new Error('No session token — cannot submit round');
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
                setSubmitError(lastErr?.message || 'Failed to save round score');
                // Don't proceed to "complete" UI — let user see error + retry button
                return;
            }
        }

        // Record question history. Only the SEEN fact is recorded here: with the
        // answer key server-side the page cannot know per-question correctness,
        // and inventing `was_correct: false` would understate every player's
        // accuracy AND poison trivia_questions.times_correct via the usage
        // trigger. The seen record is what the 60-day no-repeat rule needs.
        // (Cross-file: if per-question grades are wanted here, the submit route
        // would have to return them — see the report.)
        if (userId && questions && questions.length > 0) {
            try {
                const historyRecords = questions
                    .filter(q => q.id)
                    .map((q) => ({
                        user_id: userId,
                        question_id: q.id,
                        seen_at: new Date().toISOString(),
                        mode: 'tournament'
                    }));

                if (historyRecords.length > 0) {
                    // ignoreDuplicates:true => ON CONFLICT DO NOTHING.
                    // trivia_user_question_history has SELECT + INSERT RLS
                    // policies but NO UPDATE policy, so ignoreDuplicates:false
                    // (an UPDATE on conflict) failed the ENTIRE batch as soon as
                    // one question had been seen before.
                    const { error: err_trivia_user_question_history_xzckg } = await supabase.from('trivia_user_question_history').upsert(historyRecords, {
                            onConflict: 'user_id,question_id',
                            ignoreDuplicates: true
                        });
                    if (err_trivia_user_question_history_xzckg) console.warn('[Supabase] Silent mutation failed in trivia_user_question_history:', err_trivia_user_question_history_xzckg.message);
                }
            } catch (e) {
                console.warn('[Tournaments] Error recording history:', e);
            }
        }

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

        if (diff <= 0) return 'Starting...';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ${hours % 24}h`;
        }
        return `${hours}h ${minutes}m`;
    }

    function getDeadlineCountdown(deadline) {
        if (!deadline) return '';
        const diff = new Date(deadline) - new Date();
        if (diff <= 0) return 'Expired';
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m remaining`;
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

    return (
        <TriviaErrorBoundary pageName="Tournaments">
        <PageTransition>
            <SEOHead
                title="Trivia Tournaments — Compete For Prizes"
                description="Enter Poker Trivia Tournaments. Compete Against The Community For Diamonds, XP, And Leaderboard Glory."
                canonical="/hub/trivia/tournaments"
            >

            </SEOHead>

            <div className="tournaments-page">
                <div className="bg-overlay" />
                <UniversalHeader pageDepth={2} />

                {/* Save-failure banner — surfaces previously-silent errors */}
                {(submitError || registerError) && (
                    <div role="alert" style={{ position: 'fixed', top: 16, left: 16, right: 16, zIndex: 10000, background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 12, padding: 14, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {submitError ? `Round score didn't save: ${submitError}` : `Tournament entry failed: ${registerError}`}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            {submitError && (
                                <button onClick={() => { setSubmitError(null); finishRoundPlay(); }} style={{ padding: '6px 12px', background: '#ef4444', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Retry</button>
                            )}
                            <button onClick={() => { setSubmitError(null); setRegisterError(null); }} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
                        </div>
                    </div>
                )}

                {/* Out of Diamonds Modal */}
                {showOutOfDiamonds && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: '#1a1a2e', borderRadius: 16, padding: 32, maxWidth: 340, textAlign: 'center', border: '1px solid rgba(0,212,255,0.3)' }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>💎</div>
                            <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Not Enough Diamonds</h3>
                            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 20px', fontSize: 14 }}>You don't have enough diamonds for this entry fee. Visit the Diamond Store to get more!</p>
                            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <button onClick={() => setShowOutOfDiamonds(false)} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', cursor: 'pointer' }}>Close</button>
                                <button onClick={() => router.push('/hub/diamond-store')} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #00D4FF, #7B2FFF)', border: 'none', borderRadius: 20, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Get Diamonds</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="content">
                    {/* Notifications Banner */}
                    {notifications.length > 0 && (
                        <div className="notifications-banner">
                            {notifications.map(n => (
                                <div key={n.id} className={`notification ${n.notification_type}`}>
                                    <Bell size={16} />
                                    <span>{n.message}</span>
                                    <button onClick={() => dismissNotification(n.id)} className="dismiss">X</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {gameState === 'loading' && (
                        <div className="loading">
                            <div className="spinner" />
                            <p>Loading Tournaments...</p>
                        </div>
                    )}

                    {gameState === 'lobby' && (
                        <div className="lobby">
                            {/* Lobby Image */}
                            <div className="lobby-image-wrapper">
                                <Image src="/images/trivia/lobby-tournaments.jpg" alt="Tournaments - Daily Bracket Competitions" width={686} height={1024} className="lobby-image" />
                            </div>

                            {/* Active Tournament with Bracket */}
                            {activeTournament && (
                                <MetalFrame padding="24px" showBolts={true} className="active-tournament">
                                    <div className="tournament-badge live">
                                        <span className="pulse" />
                                        LIVE — Round {activeTournament.current_round || 1}
                                    </div>
                                    <h2>{activeTournament.name}</h2>

                                    <div className="tournament-info">
                                        <div className="info-item">
                                            <Gem size={16} />
                                            <span>Prize Pool: {activeTournament.prize_pool || 0}💎</span>
                                        </div>
                                        <div className="info-item">
                                            <Swords size={16} />
                                            <span>Round {activeTournament.current_round}/{activeTournament.total_rounds || '?'}</span>
                                        </div>
                                        {activeTournament.round_deadline && (
                                            <div className="info-item deadline">
                                                <Clock size={16} />
                                                <span>{deadlineDisplay || getDeadlineCountdown(activeTournament.round_deadline)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Your Match Status */}
                                    {userEntry && !isEliminated && myMatchup && (
                                        <div className="match-card">
                                            <h4>Your Match — {getRoundName(activeTournament.current_round, activeTournament.total_rounds)}</h4>
                                            <div className="match-vs">
                                                <div className="match-player you">
                                                    <span className="player-name">You</span>
                                                    {hasPlayedThisRound && (
                                                        <span className="player-score">
                                                            {myMatchup.player1_id === userId ? myMatchup.player1_score : myMatchup.player2_score}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="vs-text">VS</span>
                                                <div className="match-player opponent">
                                                    <span className="player-name">{opponentInfo?.username || 'BYE'}</span>
                                                    {opponentInfo && (
                                                        <span className="player-record">{opponentInfo.wins}W-{opponentInfo.losses}L</span>
                                                    )}
                                                </div>
                                            </div>

                                            {myMatchup.is_bye ? (
                                                <div className="bye-notice">
                                                    <CheckCircle size={20} color="#22c55e" />
                                                    <span>BYE — You Advance Automatically!</span>
                                                </div>
                                            ) : hasPlayedThisRound ? (
                                                <div className="already-played">
                                                    <CheckCircle size={20} color="#22c55e" />
                                                    <span>Score Submitted! Waiting For Opponent...</span>
                                                </div>
                                            ) : (
                                                <HexButton
                                                    onClick={startRoundPlay}
                                                    variant="primary"
                                                    size="lg"
                                                >
                                                    {roundLoading ? 'LOADING ROUND...' : 'PLAY YOUR MATCH'}
                                                </HexButton>
                                            )}

                                            {myMatchup.winner_id && (
                                                <div className={`match-result ${myMatchup.winner_id === userId ? 'won' : 'lost'}`}>
                                                    {myMatchup.winner_id === userId ? 'You Won!' : 'Eliminated'}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Eliminated notice */}
                                    {isEliminated && (
                                        <div className="eliminated-notice">
                                            <AlertTriangle size={20} />
                                            <span>Eliminated in Round {userEntry.eliminated_round}</span>
                                        </div>
                                    )}

                                    {/* Not registered */}
                                    {!userEntry && activeTournament.current_round === 0 && (
                                        <HexButton
                                            onClick={() => handleRegister(activeTournament)}
                                            variant="primary"
                                            size="lg"
                                        >
                                            ENTER ({activeTournament.entry_fee}💎)
                                        </HexButton>
                                    )}

                                    {/* Prize distribution — visible and auditable before entry */}
                                    {(activeTournament.prize_pool || 0) > 0 && prizeBreakdown.length > 0 && (
                                        <div className="prize-breakdown">
                                            <h4>Prize Distribution</h4>
                                            <div className="prize-rows">
                                                {prizeBreakdown.map(p => (
                                                    <div key={p.place} className="prize-row">
                                                        <span className="prize-place">{p.place}</span>
                                                        {/* FIX(audit): pct is now an integer percent from the shared schedule */}
                                                        <span className="prize-pct">{p.pct}%</span>
                                                        <span className="prize-amount">{p.amount} diamonds</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Bracket Visualization */}
                                    {rounds.length > 0 && (
                                        <div className="bracket-section">
                                            <h4>Tournament Bracket</h4>
                                            <div className="bracket-rounds">
                                                {rounds.map(round => (
                                                    <div key={round.id} className={`bracket-round ${round.status === 'active' ? 'active' : ''}`}>
                                                        <div className="round-header">
                                                            {getRoundName(round.round_number, activeTournament.total_rounds)}
                                                            {round.status === 'active' && <span className="round-active-dot" />}
                                                        </div>
                                                        <div className="round-matchups">
                                                            {(round.matchups || []).map((matchup, idx) => (
                                                                <div key={idx} className={`bracket-matchup ${matchup.winner_id ? 'completed' : ''} ${matchup.player1_id === userId || matchup.player2_id === userId ? 'my-match' : ''
                                                                    }`}>
                                                                    <div className={`bracket-player ${matchup.winner_id === matchup.player1_id ? 'winner' : ''}`}>
                                                                        <BracketPlayerName playerId={matchup.player1_id} userId={userId} names={playerNames} />
                                                                        {matchup.player1_score != null && (
                                                                            <span className="bracket-score">{matchup.player1_score}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className={`bracket-player ${matchup.winner_id === matchup.player2_id ? 'winner' : ''}`}>
                                                                        <BracketPlayerName playerId={matchup.player2_id} userId={userId} names={playerNames} />
                                                                        {matchup.player2_score != null && (
                                                                            <span className="bracket-score">{matchup.player2_score}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </MetalFrame>
                            )}

                            {/* Upcoming Tournaments */}
                            {tournaments.filter(t => t.status === 'upcoming').length > 0 && (
                                <div className="upcoming-section">
                                    <h3>Upcoming Tournaments</h3>
                                    {tournaments.filter(t => t.status === 'upcoming').map(tournament => (
                                        <MetalFrame key={tournament.id} padding="20px" showBolts={false} className="tournament-card">
                                            <div className="tournament-row">
                                                <div className="tournament-details">
                                                    <h4>{tournament.name}</h4>
                                                    <div className="tournament-meta">
                                                        <Calendar size={14} />
                                                        <span>{new Date(tournament.start_time).toLocaleDateString()}</span>
                                                        <Clock size={14} />
                                                        <span>7:00 PM CST</span>
                                                    </div>
                                                </div>
                                                <div className="tournament-action">
                                                    <div className="countdown">{getCountdown(tournament.start_time)}</div>
                                                    <div className="entry-fee">{tournament.entry_fee}💎 entry</div>
                                                    {/* Gate on THIS tournament's own entry.
                                                        `userEntry` is the entry for the ACTIVE
                                                        tournament only — using it here hid Register
                                                        from anyone playing today's live event, and
                                                        showed it on every upcoming row to everyone
                                                        else regardless of what they had entered. */}
                                                    {entriesByTournament[tournament.id] ? (
                                                        <div className="entered-badge">
                                                            <CheckCircle size={14} color="#22c55e" />
                                                            <span>Registered</span>
                                                        </div>
                                                    ) : (
                                                        <HexButton
                                                            onClick={() => handleRegister(tournament)}
                                                            variant="secondary"
                                                            size="sm"
                                                        >
                                                            Register
                                                        </HexButton>
                                                    )}
                                                </div>
                                            </div>
                                        </MetalFrame>
                                    ))}
                                </div>
                            )}

                            {/* Past Results */}
                            {pastResults.length > 0 && (
                                <div className="past-section">
                                    <h3>Past Tournaments</h3>
                                    {pastResults.map(tournament => (
                                        <MetalFrame key={tournament.id} padding="16px" showBolts={false} className="past-card">
                                            <div className="past-header">
                                                <span>{tournament.name}</span>
                                                <span className="prize-pool">
                                                    {tournament.status === 'cancelled' ? 'Cancelled' : `${tournament.prize_pool || 0}💎 pool`}
                                                </span>
                                            </div>
                                            {tournament.winners && (
                                                <div className="winners">
                                                    {tournament.winners.slice(0, 3).map((winner, idx) => (
                                                        <div key={idx} className="winner">
                                                            {idx === 0 ? <Trophy size={14} color="#FFD700" /> :
                                                                idx === 1 ? <Medal size={14} color="#C0C0C0" /> :
                                                                    <Award size={14} color="#CD7F32" />}
                                                            <span>{winner.username}</span>
                                                            <span className="prize">+{winner.prize}💎</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </MetalFrame>
                                    ))}
                                </div>
                            )}

                            {/* No tournaments */}
                            {tournaments.length === 0 && (
                                <MetalFrame padding="32px" showBolts={true}>
                                    <div className="no-tournaments">
                                        <Trophy size={48} color="rgba(255,255,255,0.2)" />
                                        <p>No Tournaments Scheduled Yet.</p>
                                        <span>Daily Tournaments Start At 7 PM CST!</span>
                                    </div>
                                </MetalFrame>
                            )}
                        </div>
                    )}

                    {/* Playing */}
                    {gameState === 'playing' && currentQuestion && (
                        <div className="playing">
                            <div className="play-header">
                                <div className="question-counter">
                                    Q{currentQuestionIndex + 1}/{questions.length}
                                </div>
                                <div className="current-score">
                                    Answered: {answeredCount}/{questions.length}
                                </div>
                                <div className={`timer ${timer.timeLeft <= 10 ? 'danger' : ''}`}>
                                    {timer.timeLeft}s
                                </div>
                            </div>

                            <MetalFrame padding="24px" showBolts={false}>
                                <h2 className="question-text">{toTitleCase(currentQuestion.question)}</h2>

                                <div className="options">
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
                            </MetalFrame>
                        </div>
                    )}

                    {/* Round Complete */}
                    {gameState === 'complete' && (
                        <div className="result-panel-overlay">


                            <div className="result-panel-container">
                                {/* The panel used to be hard-coded to panel-win.jpg, so a
                                    player who had just been eliminated got a victory
                                    screen. Derive the real state from the refreshed
                                    matchup: won / lost / still awaiting the opponent. */}
                                <img
                                    src={roundOutcome === 'lost' ? '/trivia/panels/panel-defeat.jpg' : '/trivia/panels/panel-win.jpg'}
                                    alt=""
                                    className="result-panel-bg"
                                    loading="lazy" />
                                <div className="result-panel-content">
                                    <div className="panel-stats">
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">RESULT</span>
                                            <span className={`panel-stat-value ${roundOutcome === 'won' ? 'green' : roundOutcome === 'lost' ? 'red' : 'white'}`}>
                                                {roundOutcome === 'won' ? 'YOU ADVANCE' : roundOutcome === 'lost' ? 'ELIMINATED' : 'AWAITING OPPONENT'}
                                            </span>
                                        </div>
                                        <div className="panel-stat-row">
                                            {/* Correct count as GRADED BY THE SERVER (submit
                                                response). The client no longer holds the answer
                                                key, so it cannot count this itself. */}
                                            <span className="panel-stat-label">YOUR SCORE</span>
                                            <span className="panel-stat-value cyan">{roundCorrectCount}/{questions.length}</span>
                                        </div>
                                        {opponentRoundScore != null && (
                                            <div className="panel-stat-row">
                                                <span className="panel-stat-label">{opponentInfo?.username || 'OPPONENT'}</span>
                                                <span className="panel-stat-value red">{opponentRoundScore}</span>
                                            </div>
                                        )}
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">POINTS</span>
                                            <span className="panel-stat-value green">{score}</span>
                                        </div>
                                        <div className="panel-stat-divider" />
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">TOURNAMENT</span>
                                            <span className="panel-stat-value white">{activeTournament?.name?.slice(0, 20) || 'Championship'}</span>
                                        </div>
                                        <div className="panel-stat-row">
                                            <span className="panel-stat-label">ROUND</span>
                                            <span className="panel-stat-value gold">{activeTournament?.current_round || 1} / {activeTournament?.total_rounds || '?'}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Navigation buttons — MUST be inside result-panel-container for absolute positioning */}
                                <button className="result-play-again-hitbox" onClick={() => { gameStateRef.current = 'lobby'; setGameState('lobby'); loadData(); }} aria-label="Back To Lobby" />
                                <button className="result-back-hitbox" onClick={() => router.push('/hub/trivia')} aria-label="Back To Trivia" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .tournaments-page {
                    min-height: 100vh; padding-bottom: 70px;
                    background: #0a0e1a;
                    background-color: #000000;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .bg-overlay { display: none; }

                .content {
                    position: relative;
                    padding: 80px 0 40px;
                    max-width: 100%;
                    margin: 0 auto;
                }

                /* Notifications */
                .notifications-banner {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 16px;
                    padding: 0 16px;
                }

                .notification {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    color: #fff;
                    animation: slideIn 0.3s ease;
                }

                .notification.round_start {
                    background: rgba(34, 197, 94, 0.15);
                    border: 1px solid rgba(34, 197, 94, 0.3);
                }

                .notification.forfeit_warning {
                    background: rgba(239, 168, 68, 0.15);
                    border: 1px solid rgba(239, 168, 68, 0.3);
                }

                .notification.eliminated {
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }

                .notification.winner {
                    background: rgba(255, 215, 0, 0.15);
                    border: 1px solid rgba(255, 215, 0, 0.3);
                }

                .dismiss {
                    background: none;
                    border: none;
                    color: rgba(255,255,255,0.5);
                    cursor: pointer;
                    margin-left: auto;
                    font-size: 16px;
                }

                @keyframes slideIn {
                    from { transform: translateY(-10px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                /* Lobby */
                .lobby-image-wrapper {
                    border-radius: 16px;
                    overflow: hidden;
                    margin-bottom: 24px;
                }

                .lobby-image {
                    width: 100%;
                    height: auto;
                    display: block;
                }

                .loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.6);
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #FFD700;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                /* Active Tournament */
                .active-tournament { margin-bottom: 24px; }

                .tournament-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                    margin-bottom: 12px;
                }

                .tournament-badge.live {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }

                .pulse {
                    width: 8px;
                    height: 8px;
                    background: #ef4444;
                    border-radius: 50%;
                    animation: pulse 1.5s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                }

                .active-tournament h2 {
                    font-size: 20px;
                    color: #fff;
                    margin: 0 0 16px;
                }

                .tournament-info {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 16px;
                    margin-bottom: 20px;
                }

                .info-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                }

                .info-item.deadline {
                    color: #ef4444;
                    font-weight: 600;
                }

                /* Match Card */
                .match-card {
                    background: rgba(30, 41, 59, 0.5);
                    border: 1px solid rgba(0, 212, 255, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    margin: 16px 0;
                }

                .match-card h4 {
                    font-size: 14px;
                    color: #00D4FF;
                    text-transform: uppercase;
                    margin: 0 0 16px;
                }

                .match-vs {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                }

                .match-player {
                    text-align: center;
                    flex: 1;
                }

                .player-name {
                    display: block;
                    font-size: 16px;
                    font-weight: 700;
                    color: #fff;
                }

                .player-score {
                    display: block;
                    font-size: 24px;
                    font-weight: 800;
                    color: #FFD700;
                    margin-top: 4px;
                }

                .player-record {
                    display: block;
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                    margin-top: 2px;
                }

                .vs-text {
                    font-size: 14px;
                    font-weight: 700;
                    color: rgba(255,255,255,0.3);
                    padding: 0 16px;
                }

                .bye-notice, .already-played {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 16px;
                    background: rgba(34, 197, 94, 0.15);
                    border-radius: 8px;
                    color: #22c55e;
                    font-weight: 600;
                }

                .match-result {
                    margin-top: 12px;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    font-weight: 700;
                    font-size: 18px;
                }

                .match-result.won {
                    background: rgba(34, 197, 94, 0.2);
                    color: #22c55e;
                }

                .match-result.lost {
                    background: rgba(239, 68, 68, 0.2);
                    color: #ef4444;
                }

                .eliminated-notice {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 16px;
                    background: rgba(239, 68, 68, 0.15);
                    border-radius: 8px;
                    color: #ef4444;
                    font-weight: 600;
                    margin: 16px 0;
                }

                /* Bracket */
                .bracket-section {
                    margin-top: 24px;
                    padding-top: 24px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                }

                .bracket-section h4 {
                    font-size: 14px;
                    color: rgba(255,255,255,0.5);
                    text-transform: uppercase;
                    margin: 0 0 16px;
                }

                .bracket-rounds {
                    display: flex;
                    gap: 16px;
                    overflow-x: auto;
                    /* Momentum scrolling + snap so 4-round brackets stay
                       browsable on a phone instead of crushing to nothing. */
                    -webkit-overflow-scrolling: touch;
                    scroll-snap-type: x proximity;
                    padding-bottom: 12px;
                }

                .bracket-round { scroll-snap-align: start; }

                .prize-breakdown {
                    margin-top: 20px;
                    padding: 14px 16px;
                    background: rgba(255, 215, 0, 0.06);
                    border: 1px solid rgba(255, 215, 0, 0.2);
                    border-radius: 10px;
                }

                .prize-breakdown h4 {
                    font-size: 12px;
                    text-transform: uppercase;
                    color: rgba(255, 215, 0, 0.8);
                    margin: 0 0 10px;
                }

                .prize-rows { display: flex; flex-direction: column; gap: 6px; }

                .prize-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .prize-place { font-weight: 700; min-width: 62px; }
                .prize-pct { color: rgba(255, 255, 255, 0.45); font-size: 12px; }
                .prize-amount { color: #FFD700; font-weight: 700; }

                .entered-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #22c55e;
                }

                .bracket-round {
                    min-width: 180px;
                    flex-shrink: 0;
                }

                .bracket-round.active {
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 8px;
                    padding: 8px;
                    background: rgba(0, 212, 255, 0.05);
                }

                .round-header {
                    font-size: 12px;
                    font-weight: 700;
                    color: rgba(255,255,255,0.6);
                    text-transform: uppercase;
                    margin-bottom: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .round-active-dot {
                    width: 6px;
                    height: 6px;
                    background: #00D4FF;
                    border-radius: 50%;
                    animation: pulse 1.5s infinite;
                }

                .round-matchups {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .bracket-matchup {
                    background: rgba(30, 41, 59, 0.4);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 6px;
                    overflow: hidden;
                }

                .bracket-matchup.my-match {
                    border-color: rgba(0, 212, 255, 0.4);
                }

                .bracket-matchup.completed {
                    opacity: 0.7;
                }

                .bracket-player {
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 10px;
                    font-size: 12px;
                    color: rgba(255,255,255,0.6);
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }

                .bracket-player:last-child {
                    border-bottom: none;
                }

                .bracket-player.winner {
                    color: #22c55e;
                    font-weight: 600;
                }

                .bracket-score {
                    font-weight: 700;
                    color: #FFD700;
                }

                /* Upcoming/Past sections */
                .upcoming-section, .past-section { margin-top: 24px; }

                .upcoming-section h3, .past-section h3 {
                    font-size: 16px;
                    color: rgba(255,255,255,0.6);
                    margin: 0 0 12px;
                }

                .tournament-card { margin-bottom: 12px; }

                .tournament-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .tournament-details h4 {
                    font-size: 16px;
                    color: #fff;
                    margin: 0 0 6px;
                }

                .tournament-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                }

                .tournament-action { text-align: right; }

                .countdown {
                    font-size: 18px;
                    font-weight: 700;
                    color: #FFD700;
                }

                .entry-fee {
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                    margin-bottom: 8px;
                }

                /* Past */
                .past-card { margin-bottom: 12px; }

                .past-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    color: rgba(255,255,255,0.7);
                    font-size: 14px;
                }

                .prize-pool { color: #00D4FF; }

                .winners {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .winner {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    color: #fff;
                }

                .winner .prize { margin-left: auto; color: #22c55e; }

                .no-tournaments {
                    text-align: center;
                    color: rgba(255,255,255,0.5);
                }

                .no-tournaments p {
                    font-size: 18px;
                    margin: 16px 0 8px;
                    color: #fff;
                }

                /* Playing */
                .play-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding: 12px 16px;
                    background: rgba(30, 41, 59, 0.6);
                    border-radius: 10px;
                }

                .question-counter, .current-score {
                    font-weight: 600;
                    color: #fff;
                }

                .timer {
                    font-size: 20px;
                    font-weight: 700;
                    color: #fff;
                    padding: 4px 12px;
                    background: rgba(0, 212, 255, 0.2);
                    border-radius: 6px;
                }

                .timer.danger {
                    color: #ef4444;
                    background: rgba(239, 68, 68, 0.2);
                    animation: pulse 0.5s infinite;
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
                .correct-icon { color: #22c55e; margin-left: auto; }
                .wrong-icon { color: #ef4444; margin-left: auto; }

                /* ===== PANEL OVERLAY SYSTEM ===== */
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

                .result-panel-bg {
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 4px;
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

                .result-panel-content {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 8% 10% 6%;
                }

                /* ===== PANEL TITLE — Exact Orbitron spec ===== */
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
              <VIPGateModal 
                visible={upgradeModalVisible}
                onClose={hideUpgradeModal}
                featureName="Trivia Tournaments"
                featureConfig={featureConfig}
            />

            <BottomNavBar />
    </PageTransition>
        </TriviaErrorBoundary>
    );
}

/**
 * Helper component to display player names in the bracket.
 *
 * Now purely presentational — it reads from the `names` map that
 * loadBracketData resolves in a single .in('id', ids) query. It previously
 * issued its own profiles query per instance (N+1: ~128 requests for a
 * 64-player bracket, re-fired on every realtime bracket update).
 */
function BracketPlayerName({ playerId, userId, names }) {
    if (!playerId) return <span>BYE</span>;
    if (playerId === userId) return <span className="bracket-you">You</span>;
    return <span>{(names && names[playerId]) || 'Player'}</span>;
}
