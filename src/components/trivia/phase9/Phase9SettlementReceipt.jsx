import { useMemo, useState } from 'react';
import { formatTriviaDisplayNumber } from '../../../lib/trivia/formatTriviaDisplayNumber';
import ShareResultCardModal from '../ShareResultCardModal';
import PostSettlementReviewDrawer from '../PostSettlementReviewDrawer';

function transactionLabel(role) {
    if (role === 'entry') return 'Entry';
    if (role === 'reward') return 'Reward';
    if (role === 'daily_bonus') return 'Daily Bonus';
    return 'Diamond Movement';
}

function resolveModeSlug(modeLabel) {
    const normalized = String(modeLabel || 'run').trim().toLowerCase();
    if (normalized.startsWith('survival')) return 'survival';
    if (normalized.startsWith('time attack') || normalized.startsWith('time-attack')) return 'time-attack';
    if (normalized.startsWith('endless')) return 'endless';
    if (normalized.startsWith('mixed')) return 'mixed';
    if (normalized.startsWith('arcade') || normalized.startsWith('quick stakes')) return 'arcade';
    if (normalized.startsWith('history')) return 'history';
    if (normalized.startsWith('rules')) return 'rules';
    if (normalized.startsWith('pro')) return 'pro';
    return normalized.replace(/[^a-z0-9-]+/g, '-') || 'daily';
}

/** Render only server-returned evidence; never reconstruct receipt ids. */
export default function Phase9SettlementReceipt({
    settlement,
    modeLabel = 'Run',
    correctCount,
    totalQuestions,
    streak = 0,
    playerName = '',
    showShareReviewActions = true,
}) {
    const [shareCardOpen, setShareCardOpen] = useState(false);
    const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);

    const receipt = settlement?.receipt && typeof settlement.receipt === 'object'
        ? settlement.receipt
        : null;
    const sessionId = receipt?.sessionId || settlement?.sessionId;
    const isSettled = Boolean(
        sessionId
        && settlement?.settled !== false
        && (receipt || settlement?.replayed === true || settlement?.submittedAt || settlement?.success !== false),
    );

    const shareGrid = useMemo(() => {
        if (!Array.isArray(settlement?.perQuestion) || settlement.perQuestion.length === 0) return '';
        return settlement.perQuestion.slice(0, 20).map((entry) => {
            if (entry?.wasSkipped || entry?.outcome === 'skip' || entry?.outcome === 'voided') return 'S';
            return entry?.wasCorrect ? 'C' : 'W';
        }).join('');
    }, [settlement?.perQuestion]);

    if (!sessionId) return null;
    const transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];
    const reward = Math.max(0, Number(settlement?.diamondsAwarded) || 0);
    const correct = Number.isFinite(Number(correctCount))
        ? Number(correctCount)
        : Math.max(0, Number(settlement?.correct) || 0);
    const total = Number.isFinite(Number(totalQuestions))
        ? Number(totalQuestions)
        : Math.max(0, Number(settlement?.total) || 0);
    const modeSlug = resolveModeSlug(modeLabel);
    const canShowActions = Boolean(showShareReviewActions && isSettled);

    return (
        <section className="phase9-settlement" aria-labelledby={`phase9-${String(modeLabel).toLowerCase().replaceAll(' ', '-')}-receipt-title`}>
            <div className="phase9-settlement__head">
                <h2 id={`phase9-${String(modeLabel).toLowerCase().replaceAll(' ', '-')}-receipt-title`}>Settlement Receipt</h2>
                <span className={settlement?.replayed ? 'tc-ink--cyan' : 'tc-ink--green'}>
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
                <div><dt>Reward</dt><dd className={reward > 0 ? 'tc-ink--green' : undefined}>{formatTriviaDisplayNumber(reward)} Diamonds</dd></div>
                <div><dt>Voided</dt><dd>{formatTriviaDisplayNumber(Math.max(0, Number(settlement?.voided) || 0))}</dd></div>
            </dl>
            {receipt && transactions.length > 0 ? (
                <ol className="phase9-settlement__transactions" aria-label="Verified Diamond Transactions">
                    {transactions.map((transaction, index) => (
                        <li key={transaction.id || transaction.referenceId || index}>
                            <strong>{transactionLabel(transaction.role)}</strong>
                            <span className={Number(transaction.amount) > 0 ? 'tc-ink--green' : 'tc-ink--silver'}>
                                {Number(transaction.amount) > 0 ? '+' : ''}{formatTriviaDisplayNumber(Number(transaction.amount) || 0)} Diamonds
                            </span>
                            {transaction.referenceId && <small data-preserve-case="true">{transaction.referenceId}</small>}
                        </li>
                    ))}
                </ol>
            ) : receipt ? (
                <p className="trivia-challenge-note">No Diamond Movement Was Recorded For This Settlement.</p>
            ) : null}

            {canShowActions ? (
                <>
                    <div className="phase9-settlement__actions">
                        <button
                            type="button"
                            className="tc-word tc-ink--cyan phase9-settlement__action"
                            onClick={() => setShareCardOpen(true)}
                        >
                            Share Score Card
                        </button>
                        <button
                            type="button"
                            className="tc-word tc-ink--blue phase9-settlement__action"
                            onClick={() => setReviewDrawerOpen(true)}
                        >
                            Review Questions
                        </button>
                    </div>
                    <ShareResultCardModal
                        open={shareCardOpen}
                        onClose={() => setShareCardOpen(false)}
                        mode={modeSlug}
                        score={correct}
                        total={total}
                        diamonds={reward}
                        streak={streak}
                        player={playerName || 'Smarter.Poker Player'}
                        grid={shareGrid}
                        sessionId={sessionId}
                    />
                    <PostSettlementReviewDrawer
                        open={reviewDrawerOpen}
                        onClose={() => setReviewDrawerOpen(false)}
                        sessionId={sessionId}
                        title={`${modeLabel} Question Review`}
                    />
                </>
            ) : null}
        </section>
    );
}
