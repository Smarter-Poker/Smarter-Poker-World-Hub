/**
 * TIME ATTACK PAGE — Route: /hub/trivia/time-attack
 * 30 seconds to answer as many as possible
 *
 * Server-authoritative run: /api/trivia/session-start deals (and permutes)
 * the questions, session-answer grades each tap, session-submit caps and
 * pays - the client never receives an answer key.
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';
// NOTE: ReportQuestionButton was imported here but never rendered — the
// per-question UI for this mode lives in <TimeAttackGame>, which this page does
// not own. The dead import is removed rather than left in the bundle; wiring the
// report button belongs inside src/components/trivia/TimeAttackGame.jsx.

import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TimeAttackGame from '../../../src/components/trivia/TimeAttackGame';
import DiamondEngine from '../../../src/services/DiamondEngine';
import GameCostPopup from '../../../src/components/gates/GameCostPopup';
import TriviaErrorBoundary from '../../../src/components/trivia/TriviaErrorBoundary';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';
import ResponsiveModeArt from '../../../src/components/trivia/console/ResponsiveModeArt';
import { TRIVIA_INTRO_ART_TIME_ATTACK } from '../../../src/config/triviaIntroArt.mjs';
import { busEmit } from '../../../src/engine/EventBus';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import useServerGradedRun from '../../../src/hooks/useServerGradedRun';
import { getTodayStartCST } from '../../../src/lib/trivia/getTodayCST';
import { DAILY_DIAMOND_CAPS } from '../../../src/lib/trivia/triviaEngine';
import { formatTriviaDisplayNumber } from '../../../src/lib/trivia/formatTriviaDisplayNumber';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import { printPlayerName } from '../../../src/lib/trivia/printPlayerName';
import { createAccountOperationScope, isStaleAccountOperation } from '../../../src/lib/trivia/accountOperationScope.mjs';

// Roster size requested from /api/trivia/session-start. The 30-second clock
// realistically allows well under 30 answers, so 60 is generous headroom;
// unanswered served questions cost nothing (payout is per-correct and the
// submit omits them).
const QUESTIONS_PER_SESSION = 60;

// Phase 80: the cap lives in triviaEngine so the page, <TimeAttackGame>'s results
// display and the shared clampToCap helper all agree. The old local value of 5 was
// below a single 10-diamond entry (mathematically unwinnable) AND disagreed with the
// engine value the component reads, which made the results screen over-report earnings.
const DAILY_DIAMOND_CAP = Number.isFinite(DAILY_DIAMOND_CAPS['time-attack'])
    ? DAILY_DIAMOND_CAPS['time-attack']
    : 40;

export default function TimeAttackPage() {
    useTrainingBus('trivia-time-attack');
    const router = useRouter();
    const { user: avatarUser, loading: authLoading } = useAvatar();
    const [gameState, setGameState] = useState('lobby');
    const isStartingRef = useRef(false); // Prevent double-click race
    const [questions, setQuestions] = useState([]);
    const [userId, setUserId] = useState(null);
    const accountOperationScopeRef = useRef(null);
    if (!accountOperationScopeRef.current) {
        accountOperationScopeRef.current = createAccountOperationScope();
    }
    const resolvedAccountId = authLoading
        ? userId
        : (avatarUser?.id || getAuthUser()?.id || null);
    if (!authLoading) accountOperationScopeRef.current.transition(resolvedAccountId);
    const [dailyDiamondsEarned, setDailyDiamondsEarned] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [personalBest, setPersonalBest] = useState(0);
    const [result, setResult] = useState(null);
    const [isVip, setIsVip] = useState(false);
    const [showOutOfDiamonds, setShowOutOfDiamonds] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    const [startError, setStartError] = useState(null);
    // Server-authoritative run: session-start deals, session-answer grades
    // each tap, session-submit caps and pays. No client-side crediting.
    const serverRun = useServerGradedRun('time-attack', { accountId: resolvedAccountId });
    // Answers actually recorded via session-answer this game, in tap order:
    // { questionId, displayIndex }. This is what session-submit grades from;
    // unanswered served questions are deliberately omitted (the server counts
    // them wrong, which is free here because payout is per-correct).
    const sessionAnswersRef = useRef([]);
    const accountLoadRef = useRef(0);
    const accountIdentityRef = useRef(null);
    const startOperationRef = useRef(null);

    useEffect(() => {
        if (authLoading) return;
        const user = avatarUser || getAuthUser();
        const nextAccountId = user?.id || null;
        const identityChanged = accountIdentityRef.current !== nextAccountId;
        accountIdentityRef.current = nextAccountId;
        const operationScope = accountOperationScopeRef.current.transition(nextAccountId);
        const request = ++accountLoadRef.current;
        if (identityChanged) {
            startOperationRef.current = null;
            isStartingRef.current = false;
            savePhaseRef.current = 0;
            serverResultRef.current = null;
            sessionAnswersRef.current = [];
            setQuestions([]);
            setResult(null);
            setSaveErrorPayload(null);
            setStartError(null);
            setShowOutOfDiamonds(false);
            setDailyDiamondsEarned(0);
            setPersonalBest(0);
            setIsVip(false);
            setGameState('lobby');
        }
        setUserId(nextAccountId);
        setPageLoading(true);
        // Phase 56: was missing .catch — if either promise rejected, unhandled
        // rejection propagated up. Now caught + logged with finally still firing.
        Promise.all([loadUserData(user, request, operationScope), loadLeaderboard()])
            .catch(e => {
                if (accountOperationScopeRef.current.isCurrent(operationScope)) {
                    console.warn('[TimeAttack] init load failed:', e);
                }
            })
            .finally(() => {
                if (request === accountLoadRef.current
                    && accountOperationScopeRef.current.isCurrent(operationScope)) setPageLoading(false);
            });
    }, [avatarUser?.id, authLoading]);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!userId) return;
        const _ch = supabase
            .channel(`trivia-ta:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trivia_scores', filter: `user_id=eq.${userId}` }, () => {
                const operationScope = accountOperationScopeRef.current.capture();
                if (operationScope.identity !== userId) return;
                loadUserData({ id: userId }, ++accountLoadRef.current, operationScope);
            })
            .subscribe();
        return () => { supabase.removeChannel(_ch); };
    }, [userId]);

    async function loadUserData(
        user = avatarUser || getAuthUser(),
        request = ++accountLoadRef.current,
        operationScope = accountOperationScopeRef.current.capture(),
    ) {
        if (operationScope.identity !== (user?.id || null)) return;
        if (!user) {
            if (request !== accountLoadRef.current
                || !accountOperationScopeRef.current.isCurrent(operationScope)) return;
            // Drop the prior account before the hook can recover or settle
            // against stale browser custody.
            setUserId(null);
            setIsVip(false);
            setDailyDiamondsEarned(0);
            setPersonalBest(0);
            return;
        }

        // Check VIP status
        await DiamondEngine.init(user.id);
        const vipStatus = await DiamondEngine.isVIP();
        if (request !== accountLoadRef.current
            || !accountOperationScopeRef.current.isCurrent(operationScope)) return;
        setIsVip(vipStatus);

        // Get today's time attack diamonds.
        // Phase 73: was UTC date — same 6-hour drift as diamondCap.
        // Use CST start-of-day so the displayed daily total is accurate
        // for users in the CST timezone window.
        const todayStartCST = getTodayStartCST();
        const { data: scores } = await supabase
            .from('trivia_scores')
            .select('diamonds_earned')
            .eq('user_id', user.id)
            .eq('mode', 'time-attack')
            .gte('created_at', todayStartCST)
            .limit(50) // time attack scores
        if (request !== accountLoadRef.current
            || !accountOperationScopeRef.current.isCurrent(operationScope)) return;

        if (scores) {
            const total = scores.reduce((sum, s) => sum + (s.diamonds_earned || 0), 0);
            setDailyDiamondsEarned(total);
        }

        // Get personal best
        const { data: best } = await supabase
            .from('trivia_scores')
            .select('correct_count')
            .eq('user_id', user.id)
            .eq('mode', 'time-attack')
            .order('correct_count', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (request !== accountLoadRef.current
            || !accountOperationScopeRef.current.isCurrent(operationScope)) return;

        if (best) {
            setPersonalBest(best.correct_count);
        }
    }

    async function loadLeaderboard() {
        const { data } = await supabase
            .from('trivia_scores')
            .select(`
                correct_count,
                user_id,
                profiles!inner(username)
            `)
            .eq('mode', 'time-attack')
            .order('correct_count', { ascending: false })
            .limit(10);

        if (data) {
            // Dedupe by user, keep best
            const userBest = new Map();
            data.forEach(entry => {
                const existing = userBest.get(entry.user_id);
                if (!existing || entry.correct_count > existing.correct_count) {
                    userBest.set(entry.user_id, entry);
                }
            });

            setLeaderboard(Array.from(userBest.values())
                .sort((a, b) => b.correct_count - a.correct_count)
                .slice(0, 10)
                .map((entry, idx) => ({
                    rank: idx + 1,
                    username: entry.profiles?.username || 'Anonymous',
                    score: entry.correct_count
                })));
        }
    }

    async function handleStart() {
        if (isStartingRef.current) return;
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const startOperation = { operationScope };
        isStartingRef.current = true;
        startOperationRef.current = startOperation;
        try {
        if (!userId) {
            setStartError('Please Sign In To Play Time Attack.');
            return;
        }
        // Reset the per-game save pipeline. This is the REAL "Play Again" path
        // (the complete screen's button calls handleStart) - a stale phase or
        // settlement from the previous game would make this game skip its own
        // submit and re-report the old numbers.
        savePhaseRef.current = 0;
        serverResultRef.current = null;
        sessionAnswersRef.current = [];
        setSaveErrorPayload(null);
        setResult(null);

        // FIX(audit #3): the `sessionStorage.trivia_paid` short-circuit is gone.
        // Nothing writes that flag any more (TriviaLobby no longer pre-charges),
        // so all it could still do was let anyone set the flag in devtools —
        // `sessionStorage.setItem('trivia_paid','true')` — and play every game
        // free. This was the one page that still honored it; endless, mixed and
        // survival removed it long ago. Always charge.
        // Clear any stale legacy flag so an old build's receipt can't linger.
        try {
            sessionStorage.removeItem('trivia_paid');
            sessionStorage.removeItem('trivia_mode');
        } catch (e) { /* storage unavailable — nothing to clear */ }

        // Open the server session BEFORE any charge, so a start failure can
        // never eat an entry fee (same guarantee the old load-before-charge
        // order gave, now with the server dealing). The served questions are
        // used VERBATIM - their options are already permuted into grading
        // order, so reshuffling them would break the display-index mapping
        // the grader uses.
        let served;
        try {
            served = await serverRun.start({ count: QUESTIONS_PER_SESSION });
            if (!accountOperationScopeRef.current.isCurrent(operationScope)) return;
        } catch (e) {
            if (!accountOperationScopeRef.current.isCurrent(operationScope)
                || isStaleAccountOperation(e)) return;
            console.warn('[TimeAttack] Server session start failed:', e?.message || e);
            // A 402 is the balance gate, not a connection problem: show the
            // Not Enough Diamonds state alone instead of both messages.
            if (e?.status === 402) {
                setShowOutOfDiamonds(true);
                return;
            }
            setStartError('We Could Not Load Any Questions Right Now. Please Check Your Connection And Try Again.');
            return;
        }
        if (!served || !Array.isArray(served.questions) || served.questions.length === 0) {
            // A successful start may already have charged before the malformed
            // roster is detected here. Keep custody so retry reuses that exact
            // session and cannot create a second entry charge.
            setStartError('We Could Not Confirm The Dealt Questions. Retry This Same Entry Request.');
            return;
        }

        if (served.entryState === 'charged' && served.entryCost > 0) {
            busEmit.diamondsSpent(served.entryCost, 'Time Attack entry');
        }
        setQuestions(served.questions);
        setStartError(null);
        setGameState('playing');
        } finally {
            if (startOperationRef.current === startOperation) {
                startOperationRef.current = null;
                isStartingRef.current = false;
            }
        }
    }

    // Per-tap grader handed to <TimeAttackGame>. A successful verdict also
    // records the answer for session-submit; a failed call records nothing,
    // and the first answer per question is binding server-side, so the
    // component's retry after a rejection cannot double-count.
    async function gradeAnswer({ questionId, displayIndex }) {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) {
            throw new Error('stale_account_operation');
        }
        const verdict = await serverRun.answer({ questionId, displayIndex });
        if (!accountOperationScopeRef.current.isCurrent(operationScope)) {
            throw new Error('stale_account_operation');
        }
        sessionAnswersRef.current.push({ questionId, displayIndex });
        return verdict;
    }

    const [saveErrorPayload, setSaveErrorPayload] = useState(null);
    const savePhaseRef = useRef(0); // Tracks which save steps completed: 0=none, 1=settled, 2=score, 3=history
    // Server settlement result, kept in a ref so a saving_error retry re-uses
    // the already-paid result instead of re-submitting a closed session.
    const serverResultRef = useRef(null);

    useEffect(() => {
        if (gameState === 'complete' && serverResultRef.current?.sessionId) {
            serverRun.acknowledgeSettlement();
        }
    }, [gameState, result?.diamondsEarned, serverRun.acknowledgeSettlement]);

    // NOTE: a handlePlayAgain() that set gameState 'ready' used to live here. It
    // was dead code — nothing called it and no render branch existed for 'ready',
    // so its idempotency reset never ran. That reset now lives in handleStart.

    async function handleComplete(gameResult) {
        const operationScope = accountOperationScopeRef.current.capture();
        if (operationScope.identity !== (userId || null)) return;
        const isCurrentAccountOperation = () => accountOperationScopeRef.current.isCurrent(operationScope);
        setResult(gameResult);
        setGameState('saving');

        if (userId) {
            try {
                // Phase 1: settle the run server-side (only if not already
                // settled). The server grades from the answers it stored at
                // tap time, applies the daily cap and pays through a locked
                // RPC - no client-side crediting, ever. Unanswered served
                // questions are omitted from the array: the server counts
                // them wrong, which is harmless here because payout is
                // per-correct, not accuracy-based.
                if (savePhaseRef.current < 1) {
                    const submitted = await serverRun.submit(
                        sessionAnswersRef.current.map(a => ({
                            questionId: a.questionId,
                            displayIndex: a.displayIndex
                        }))
                    );
                    if (!isCurrentAccountOperation()) return;
                    serverResultRef.current = submitted;
                    savePhaseRef.current = 1;
                    if ((submitted?.diamondsAwarded || 0) > 0) {
                        busEmit.diamondsEarned(submitted.diamondsAwarded, 'Time Attack');
                    }
                }
                const settled = serverResultRef.current || {};
                const awarded = Number.isFinite(settled.diamondsAwarded) ? settled.diamondsAwarded : 0;
                const serverCorrect = Number.isFinite(settled.correct) ? settled.correct : (gameResult.correctCount || 0);

                // Phase 2: session-submit persisted the verified score in the
                // same transaction as the payout.
                if (savePhaseRef.current < 2) {
                    savePhaseRef.current = 2;
                }

                // Show what the server actually credited and graded, not what
                // the component hoped for.
                setResult(prev => (prev ? { ...prev, correctCount: serverCorrect, diamondsEarned: awarded } : prev));
                if (serverCorrect > personalBest) {
                    setPersonalBest(serverCorrect);
                }
                setDailyDiamondsEarned(prev => Math.min(DAILY_DIAMOND_CAP, prev + awarded));

                // Settlement atomically finalized history, mastery and skip
                // telemetry from the binding server answers.
                savePhaseRef.current = Math.max(savePhaseRef.current, 3);

                // Done saving — reset phase tracker for next game
                if (!isCurrentAccountOperation()) return;
                setGameState('complete');
                setSaveErrorPayload(null);
                savePhaseRef.current = 0;

            } catch (e) {
                if (!isCurrentAccountOperation() || isStaleAccountOperation(e)) return;
                console.warn('[TimeAttack] Failed to save data:', e);
                setSaveErrorPayload(gameResult);
                setGameState('saving_error');
                return; // halt and show retry UI (savePhaseRef preserves progress)
            }
        } else {
            if (!isCurrentAccountOperation()) return;
            setGameState('complete');
            setSaveErrorPayload(null);
        }

        if (isCurrentAccountOperation()) loadLeaderboard();
    }

    // Retry function for network drops — resumes from where it left off
    const handleRetrySave = () => {
        setGameState('saving');
        setSaveErrorPayload(null);
        handleComplete(result); // savePhaseRef skips already-completed steps
    };


    const primaryAction = showOutOfDiamonds
        ? { label: 'Get Diamonds', onClick: () => router.push('/hub/diamond-store') }
        : pageLoading || gameState === 'playing' || gameState === 'saving'
            ? undefined
            : gameState === 'saving_error'
                ? { label: 'Retry Save', onClick: handleRetrySave }
                : gameState === 'complete'
                    ? { label: 'Play Again', onClick: handleStart }
                    : { label: 'Start Time Attack', onClick: handleStart };

    const secondaryAction = showOutOfDiamonds
        ? { label: 'Close', onClick: () => setShowOutOfDiamonds(false) }
        : gameState === 'complete'
            ? { label: 'Back To Trivia', onClick: () => router.push('/hub/trivia') }
            : undefined;

    // The pill is a short painted slot (about eight characters at 375px).
    const stateLabel = showOutOfDiamonds
        ? 'Balance'
        : pageLoading
        ? 'Loading'
        : gameState === 'playing'
            ? 'Live'
            : gameState === 'complete'
                ? 'Complete'
                : gameState === 'saving_error'
                    ? 'Retry'
                    : gameState === 'saving'
                        ? 'Saving'
                        : '30 Sec';

    return (
        <TriviaErrorBoundary pageName="Time Attack">
            <>
                <SEOHead
                    title="Time Attack Trivia: Beat The Clock"
                    description="Race Against The Clock In Time Attack Poker Trivia On Smarter.Poker. Answer As Many Questions As You Can Before Time Runs Out. Free To Play, And Nothing In It Is A Wager."
                    canonical="/hub/trivia/time-attack"
                />

                <div
                    className="trivia-challenge-page trivia-challenge-page--time-attack"
                    data-trivia-family="challenge"
                    data-trivia-surface="time-attack"
                    data-game-state={pageLoading ? 'loading' : gameState}
                >
                    <UniversalHeader pageDepth={2} />

                    {userId && !isVip && (
                        <GameCostPopup
                            userId={userId}
                            featureKey="trivia_timeattack"
                            isVip={isVip}
                            cost={10}
                        />
                    )}

                    <main className="trivia-challenge-shell" aria-labelledby="time-attack-title">
                        <TriviaConsole
                            className="trivia-challenge-console"
                            eyebrow="Timed Challenge"
                            title="Time Attack"
                            titleId="time-attack-title"
                            subtitle="Beat The Clock"
                            pill={stateLabel}
                            aria-labelledby="time-attack-title"
                            primaryAction={primaryAction}
                            secondaryAction={secondaryAction}
                        >
                            {showOutOfDiamonds && (
                                <section
                                    className="trivia-challenge-alert trivia-challenge-alert--diamonds"
                                    role="alert"
                                    aria-labelledby="time-attack-diamonds-title"
                                >
                                    <h2 id="time-attack-diamonds-title">Not Enough Diamonds</h2>
                                    <p>
                                        Each Game Costs 10 Diamonds. Get More Diamonds Or Upgrade To VIP For Unlimited Access.
                                    </p>
                                </section>
                            )}

                            {pageLoading && (
                                <div className="trivia-challenge-state trivia-challenge-state--loading" role="status">
                                    <p>Loading Time Attack</p>
                                </div>
                            )}

                            {!pageLoading && gameState === 'lobby' && (
                                <section className="trivia-challenge-stage trivia-challenge-stage--lobby">
                                    <ResponsiveModeArt art={TRIVIA_INTRO_ART_TIME_ATTACK} priority />
                                    {startError && (
                                        <p className="trivia-challenge-state trivia-challenge-state--error" role="alert">
                                            {startError}
                                        </p>
                                    )}

                                    <div className="trivia-challenge-intro">
                                        <p>30 Seconds. How Many Can You Answer?</p>
                                    </div>

                                    <dl className="trivia-challenge-stats">
                                        <div className="trivia-challenge-stat">
                                            <dt>Personal Best</dt>
                                            <dd>{formatTriviaDisplayNumber(personalBest)}</dd>
                                        </div>
                                        <div className="trivia-challenge-stat">
                                            <dt>Today's Diamonds</dt>
                                            <dd>
                                                {formatTriviaDisplayNumber(dailyDiamondsEarned)}
                                                <span aria-hidden="true"> / </span>
                                                {formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)}
                                            </dd>
                                        </div>
                                    </dl>

                                    <section className="trivia-challenge-rules" aria-labelledby="time-attack-rewards-title">
                                        <h2 id="time-attack-rewards-title">Rewards</h2>
                                        <ul>
                                            <li>1 Diamond Per Correct Answer</li>
                                            <li>Maximum {formatTriviaDisplayNumber(DAILY_DIAMOND_CAP)} Diamonds Per Day</li>
                                            <li>Speed Is Everything</li>
                                        </ul>
                                    </section>

                                    {leaderboard.length > 0 && (
                                        <section className="trivia-challenge-leaderboard" aria-labelledby="time-attack-leaderboard-title">
                                            <h2 id="time-attack-leaderboard-title">Fastest Minds</h2>
                                            <ol className="trivia-challenge-ranking">
                                                {leaderboard.map((entry) => (
                                                    <li
                                                        key={entry.rank}
                                                        className="trivia-challenge-ranking-row"
                                                        data-rank={entry.rank}
                                                    >
                                                        <span className="trivia-challenge-ranking-rank">
                                                            #{formatTriviaDisplayNumber(entry.rank)}
                                                        </span>
                                                        <span className="trivia-challenge-ranking-name">{printPlayerName(entry.username)}</span>
                                                        <span className="trivia-challenge-ranking-score">
                                                            {formatTriviaDisplayNumber(entry.score)}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </section>
                                    )}
                                </section>
                            )}

                            {!pageLoading && gameState === 'playing' && (
                                <section className="trivia-challenge-stage trivia-challenge-stage--playing" aria-label="Time Attack Questions">
                                    <TimeAttackGame
                                        questions={questions}
                                        onComplete={handleComplete}
                                        dailyDiamondsEarned={dailyDiamondsEarned}
                                        serverGrader={gradeAnswer}
                                    />
                                </section>
                            )}

                            {!pageLoading && gameState === 'saving' && (
                                <div className="trivia-challenge-state trivia-challenge-state--saving" role="status">
                                    <p>Securing Your Time Attack Run</p>
                                </div>
                            )}

                            {!pageLoading && gameState === 'saving_error' && (
                                <section className="trivia-challenge-state trivia-challenge-state--error" role="alert">
                                    <h2>Network Disconnected</h2>
                                    <p>
                                        We Could Not Save Your Time Attack Run Because You Lost Connection. Check Your Connection And Retry To Protect {formatTriviaDisplayNumber(saveErrorPayload?.diamondsEarned)} {saveErrorPayload?.diamondsEarned === 1 ? 'Diamond' : 'Diamonds'}.
                                    </p>
                                </section>
                            )}

                            {!pageLoading && gameState === 'complete' && result && (
                                <section className="trivia-challenge-stage trivia-challenge-stage--results" aria-labelledby="time-attack-results-title">
                                    <h2 id="time-attack-results-title">Time Is Up</h2>
                                    <dl className="trivia-challenge-stats trivia-challenge-stats--results">
                                        <div className="trivia-challenge-stat">
                                            <dt>Correct</dt>
                                            <dd>{formatTriviaDisplayNumber(result.correctCount)}</dd>
                                        </div>
                                        <div className="trivia-challenge-stat" data-tone="accent">
                                            <dt>Diamonds</dt>
                                            <dd>+{formatTriviaDisplayNumber(result.diamondsEarned)}</dd>
                                        </div>
                                    </dl>
                                    {result.fastAnswers > 0 && (
                                        <p className="trivia-challenge-notice">
                                            {formatTriviaDisplayNumber(result.fastAnswers)} Lightning-Fast {result.fastAnswers === 1 ? 'Answer' : 'Answers'}
                                        </p>
                                    )}
                                </section>
                            )}
                        </TriviaConsole>
                    </main>
                </div>
            </>
          {/* Server rendered in every state (AEO phase 3, 2026-09-17): a
              crawler always arrives while the roster is still loading. */}
          <HubPageSummary page="trivia-time-attack" as="h1" />
        </TriviaErrorBoundary>
    );
}
