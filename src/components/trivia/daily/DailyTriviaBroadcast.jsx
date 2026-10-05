import { useEffect, useState } from 'react';
import ResponsiveModeArt from '../console/ResponsiveModeArt';
import { printPlayerName } from '../LeaderboardDisplay';
import { formatTriviaDisplayNumber } from '../../../lib/trivia/formatTriviaDisplayNumber';
import { formatDailyResetCountdown, normalizeDailyLeaderboard, projectDailyAttempt } from './dailyTriviaModel.mjs';
import styles from './DailyTriviaBroadcast.module.css';

function inkClass(ink) {
    if (ink === 'green') return 'tc-ink--green';
    if (ink === 'gold') return 'tc-ink--gold';
    if (ink === 'red') return 'tc-ink--red';
    return 'tc-ink--blue';
}

function DailyLeaderboard({ state, entries, currentUserId, error, onRetry }) {
    const rows = normalizeDailyLeaderboard(entries);
    return (
        <section className={styles.leaderboard} aria-labelledby="daily-streak-standings">
            <div className={styles.sectionHead}>
                <h2 id="daily-streak-standings">Daily Streak Standings</h2>
                <span className="tc-label">Live Ledger</span>
            </div>
            {state === 'loading' ? (
                <p className="trivia-console-copy tc-ink--blue" role="status">Loading Verified Standings</p>
            ) : state === 'error' ? (
                <div className={styles.state} role="alert">
                    <p>{error || 'The standings could not be loaded.'}</p>
                    <button type="button" className="tc-word" onClick={onRetry}>Retry Standings</button>
                </div>
            ) : rows.length === 0 ? (
                <p className="trivia-console-copy tc-ink--muted">No verified Daily finishes are posted yet.</p>
            ) : (
                <ol className={styles.rankings} aria-label="Daily Trivia Streaks">
                    {rows.map((entry, index) => {
                        const isCurrent = entry.userId === currentUserId;
                        return (
                            <li key={entry.userId} className={styles.ranking} aria-current={isCurrent ? 'true' : undefined}>
                                <span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span>
                                <span className={styles.player}>
                                    <strong>{printPlayerName(entry.username, 'Player')}</strong>
                                    {isCurrent ? <span className="tc-label">You</span> : null}
                                </span>
                                <span className={styles.record}>
                                    <strong>{formatTriviaDisplayNumber(entry.streak)} Day Streak</strong>
                                    <span>{entry.accuracy}% Accuracy · {formatTriviaDisplayNumber(entry.gamesPlayed)} {entry.gamesPlayed === 1 ? 'Run' : 'Runs'}</span>
                                </span>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}

export default function DailyTriviaBroadcast({
    art,
    signedIn,
    online = true,
    status = 'loading',
    statusError = null,
    completed = false,
    recoverable = false,
    tagline = null,
    questionsCount = 10,
    dailyCap = 10,
    userDiamonds = 0,
    userStreak = 0,
    bestStreak = 0,
    personalBest = null,
    leaderboardState = 'loading',
    leaderboard = [],
    leaderboardError = null,
    currentUserId = null,
    onRetryStatus,
    onRetryLeaderboard,
}) {
    // Keep server and first client render identical; the browser replaces this
    // neutral label immediately with its Chicago-anchored countdown.
    const [resetIn, setResetIn] = useState('Checking');
    useEffect(() => {
        const update = () => setResetIn(formatDailyResetCountdown());
        update();
        const interval = window.setInterval(update, 30000);
        return () => window.clearInterval(interval);
    }, []);

    const attempt = projectDailyAttempt({ signedIn, online, status, completed, recoverable });
    return (
        <div className={styles.broadcast} data-daily-attempt={attempt.key}>
            <div className={styles.artStage}>
                <ResponsiveModeArt art={art} priority sizes="(min-width: 1024px) 600px, 100vw" />
                <span className={styles.frequency} aria-hidden="true">SP · DAILY · CHI</span>
            </div>

            <section className={styles.statusDeck} aria-labelledby="daily-attempt-state">
                {tagline ? <p className={styles.tagline}>{tagline}</p> : null}
                <div className={styles.attempt} aria-live="polite">
                    <span className="tc-label">Today’s Attempt</span>
                    <h2 id="daily-attempt-state" className={inkClass(attempt.ink)}>{attempt.label}</h2>
                    <p>{attempt.key === 'error' && statusError ? statusError : attempt.detail}</p>
                </div>

                <dl className={styles.telemetry}>
                    <div><dt>Questions</dt><dd>{formatTriviaDisplayNumber(questionsCount)}</dd></div>
                    <div><dt>Clock</dt><dd>Untimed</dd></div>
                    <div><dt>Entry</dt><dd className="tc-ink--green">Free</dd></div>
                    <div><dt>Completion Bonus</dt><dd className="tc-ink--gold">10 Diamonds</dd></div>
                    <div><dt>Daily Earning Cap</dt><dd>{formatTriviaDisplayNumber(dailyCap)} Diamonds</dd></div>
                    <div><dt>Current Streak</dt><dd>{signedIn ? `${formatTriviaDisplayNumber(userStreak)} Days` : 'Sign In'}</dd></div>
                    <div><dt>Best Streak</dt><dd>{signedIn ? `${formatTriviaDisplayNumber(bestStreak)} Days` : 'Sign In'}</dd></div>
                    {signedIn ? <div><dt>Your Diamonds</dt><dd className="tc-ink--gold">{formatTriviaDisplayNumber(userDiamonds)}</dd></div> : null}
                    {personalBest != null ? <div><dt>Best Score</dt><dd>{formatTriviaDisplayNumber(personalBest)}</dd></div> : null}
                    <div><dt>Daily Reset</dt><dd>{resetIn} · Chicago</dd></div>
                </dl>

                {status === 'error' && signedIn ? (
                    <button type="button" className="tc-word" onClick={onRetryStatus}>Retry Attempt Status</button>
                ) : null}
            </section>

            <DailyLeaderboard
                state={leaderboardState}
                entries={leaderboard}
                currentUserId={currentUserId}
                error={leaderboardError}
                onRetry={onRetryLeaderboard}
            />
        </div>
    );
}

export function DailySettlementReceipt({ result }) {
    if (!result?.sessionId) return null;
    const receipt = result?.receipt && typeof result.receipt === 'object' ? result.receipt : null;
    const reward = Math.max(0, Number(result.diamondsEarned) || 0);
    const bonus = Math.max(0, Number(result.dailyBonusDiamonds) || 0);
    const voided = Math.max(0, Number(result.voidedCount) || 0);
    const transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];
    const transactionLabel = role => role === 'daily_bonus'
        ? 'Bonus Transaction'
        : role === 'reward'
            ? 'Reward Transaction'
            : role === 'entry'
                ? 'Entry Transaction'
                : 'Diamond Transaction';
    return (
        <section className={styles.receipt} aria-labelledby="daily-settlement-receipt">
            <div className={styles.sectionHead}>
                <h2 id="daily-settlement-receipt">Settlement Receipt</h2>
                <span className={result.settlementReplayed ? 'tc-ink--gold' : 'tc-ink--green'}>
                    {result.settlementReplayed ? 'Verified Replay' : 'Settled'}
                </span>
            </div>
            {!receipt ? (
                <div className={styles.state} role="alert">
                    <p>The server grade was received, but its verified settlement receipt is unavailable.</p>
                </div>
            ) : null}
            <dl className={styles.receiptRows}>
                <div><dt>Session</dt><dd>{receipt?.sessionId || result.sessionId}</dd></div>
                {receipt?.scoreId ? <div><dt>Score Record</dt><dd>{receipt.scoreId}</dd></div> : null}
                {receipt?.settlementReference ? <div><dt>Settlement Reference</dt><dd>{receipt.settlementReference}</dd></div> : null}
                {receipt?.requestId ? <div><dt>Request</dt><dd>{receipt.requestId}</dd></div> : null}
                {receipt?.resultHash ? <div><dt>Result Hash</dt><dd>{receipt.resultHash}</dd></div> : null}
                {receipt?.submittedAt ? <div><dt>Submitted</dt><dd><time dateTime={receipt.submittedAt}>{receipt.submittedAt}</time></dd></div> : null}
                <div><dt>Server Grade</dt><dd>{formatTriviaDisplayNumber(result.correctCount)} / {formatTriviaDisplayNumber(result.totalQuestions)}</dd></div>
                <div><dt>Run Reward</dt><dd className={reward > 0 ? 'tc-ink--gold' : undefined}>{formatTriviaDisplayNumber(reward)} Diamonds</dd></div>
                <div><dt>Daily Bonus</dt><dd className={bonus > 0 ? 'tc-ink--gold' : undefined}>{formatTriviaDisplayNumber(bonus)} Diamonds</dd></div>
                <div><dt>Voided Questions</dt><dd>{formatTriviaDisplayNumber(voided)}</dd></div>
            </dl>
            {receipt && transactions.length > 0 ? (
                <ol className={styles.transactions} aria-label="Verified Diamond Transactions">
                    {transactions.map((transaction, index) => (
                        <li key={transaction.id || transaction.referenceId || index} className={styles.transaction}>
                            <div className={styles.transactionHead}>
                                <strong>{transactionLabel(transaction.role)}</strong>
                                <span className={Number(transaction.amount) > 0 ? 'tc-ink--gold' : 'tc-ink--silver'}>
                                    {Number(transaction.amount) > 0 ? '+' : ''}{formatTriviaDisplayNumber(Number(transaction.amount) || 0)} Diamonds
                                </span>
                            </div>
                            <dl className={styles.transactionRows}>
                                <div><dt>Reference</dt><dd>{transaction.referenceId}</dd></div>
                                {transaction.id ? <div><dt>Record</dt><dd>{transaction.id}</dd></div> : null}
                                {transaction.kind ? <div><dt>Type</dt><dd>{transaction.kind}</dd></div> : null}
                                {transaction.balanceAfter != null ? <div><dt>Balance After</dt><dd>{formatTriviaDisplayNumber(transaction.balanceAfter)}</dd></div> : null}
                                {transaction.createdAt ? <div><dt>Posted</dt><dd><time dateTime={transaction.createdAt}>{transaction.createdAt}</time></dd></div> : null}
                            </dl>
                        </li>
                    ))}
                </ol>
            ) : receipt ? (
                <p className="trivia-console-copy tc-ink--muted">No Diamond Movement Was Recorded For This Settlement.</p>
            ) : null}
            {voided > 0 ? (
                <p className="trivia-console-copy tc-ink--muted">
                    {voided === 1 ? 'One invalid question was excluded from the grade.' : `${voided} invalid questions were excluded from the grade.`}
                </p>
            ) : null}
        </section>
    );
}

export { DailyLeaderboard };
