import { formatTriviaDisplayNumber } from '../../../lib/trivia/formatTriviaDisplayNumber';

function transactionLabel(role) {
    if (role === 'entry') return 'Entry';
    if (role === 'reward') return 'Reward';
    if (role === 'daily_bonus') return 'Daily Bonus';
    return 'Diamond Movement';
}

/** Render only server-returned evidence; never reconstruct receipt ids. */
export default function Phase9SettlementReceipt({
    settlement,
    modeLabel = 'Run',
    correctCount,
    totalQuestions,
}) {
    const receipt = settlement?.receipt && typeof settlement.receipt === 'object'
        ? settlement.receipt
        : null;
    const sessionId = receipt?.sessionId || settlement?.sessionId;
    if (!sessionId) return null;
    const transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];
    const reward = Math.max(0, Number(settlement?.diamondsAwarded) || 0);
    const correct = Number.isFinite(Number(correctCount))
        ? Number(correctCount)
        : Math.max(0, Number(settlement?.correct) || 0);
    const total = Number.isFinite(Number(totalQuestions))
        ? Number(totalQuestions)
        : Math.max(0, Number(settlement?.total) || 0);

    return (
        <section className="phase9-settlement" aria-labelledby={`phase9-${String(modeLabel).toLowerCase().replaceAll(' ', '-')}-receipt-title`}>
            <div className="phase9-settlement__head">
                <h2 id={`phase9-${String(modeLabel).toLowerCase().replaceAll(' ', '-')}-receipt-title`}>Settlement Receipt</h2>
                <span className={settlement?.replayed ? 'tc-ink--gold' : 'tc-ink--green'}>
                    {settlement?.replayed ? 'Verified Replay' : 'Settled'}
                </span>
            </div>
            {!receipt && (
                <p className="trivia-challenge-alert" role="alert">
                    The Server Grade Was Received, But Its Verified Receipt Is Unavailable.
                </p>
            )}
            <dl className="phase9-settlement__rows">
                <div><dt>Mode</dt><dd>{modeLabel}</dd></div>
                <div><dt>Session</dt><dd data-preserve-case="true">{sessionId}</dd></div>
                {receipt?.scoreId && <div><dt>Score Record</dt><dd data-preserve-case="true">{receipt.scoreId}</dd></div>}
                {receipt?.settlementReference && <div><dt>Settlement Reference</dt><dd data-preserve-case="true">{receipt.settlementReference}</dd></div>}
                {receipt?.requestId && <div><dt>Request</dt><dd data-preserve-case="true">{receipt.requestId}</dd></div>}
                {receipt?.resultHash && <div><dt>Result Hash</dt><dd data-preserve-case="true">{receipt.resultHash}</dd></div>}
                {receipt?.submittedAt && (
                    <div><dt>Submitted</dt><dd><time data-preserve-case="true" dateTime={receipt.submittedAt}>{receipt.submittedAt}</time></dd></div>
                )}
                <div><dt>Server Grade</dt><dd>{formatTriviaDisplayNumber(correct)} / {formatTriviaDisplayNumber(total)}</dd></div>
                <div><dt>Reward</dt><dd className={reward > 0 ? 'tc-ink--gold' : undefined}>{formatTriviaDisplayNumber(reward)} Diamonds</dd></div>
                <div><dt>Voided</dt><dd>{formatTriviaDisplayNumber(Math.max(0, Number(settlement?.voided) || 0))}</dd></div>
            </dl>
            {receipt && transactions.length > 0 ? (
                <ol className="phase9-settlement__transactions" aria-label="Verified Diamond Transactions">
                    {transactions.map((transaction, index) => (
                        <li key={transaction.id || transaction.referenceId || index}>
                            <strong>{transactionLabel(transaction.role)}</strong>
                            <span className={Number(transaction.amount) > 0 ? 'tc-ink--gold' : 'tc-ink--silver'}>
                                {Number(transaction.amount) > 0 ? '+' : ''}{formatTriviaDisplayNumber(Number(transaction.amount) || 0)} Diamonds
                            </span>
                            {transaction.referenceId && <small data-preserve-case="true">{transaction.referenceId}</small>}
                        </li>
                    ))}
                </ol>
            ) : receipt ? (
                <p className="trivia-challenge-note">No Diamond Movement Was Recorded For This Settlement.</p>
            ) : null}
        </section>
    );
}
