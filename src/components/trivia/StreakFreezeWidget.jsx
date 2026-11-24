import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { authedFetch } from '../../lib/authUtils';
import { eventBus, EventType } from '../../engine/EventBus';
import { formatTriviaDisplayNumber } from '../../lib/trivia/formatTriviaDisplayNumber';
import {
    STREAK_FREEZE_COST_DIAMONDS,
    STREAK_FREEZE_MAX_QUANTITY,
    STREAK_MILESTONES,
    STREAK_MILESTONE_REWARDS,
    computeClaimableMilestones,
    computeStreakMilestoneProgress,
    createStreakFreezeRequestKey,
    createStreakMilestoneRequestKey,
    normalizeStreakFreezePayload,
} from '../../lib/trivia/streakMilestoneModel.mjs';
import styles from './StreakFreezeWidget.module.css';

const PURCHASE_ERROR_COPY = Object.freeze({
    authentication_required: 'Sign In Again To Purchase A Streak Freeze.',
    insufficient_diamonds: 'Insufficient Diamonds. You Need 25 Diamonds To Buy A Streak Freeze.',
    max_streak_freezes_reached: 'Maximum Streak Freeze Inventory Reached.',
    invalid_request_key: 'Purchase Key Was Invalid. Start A Fresh Confirmation.',
    streak_freeze_purchase_failed: 'The Streak Freeze Purchase Could Not Be Completed. You Can Retry Safely.',
    internal_error: 'The Streak Freeze Service Is Temporarily Unavailable. You Can Retry Safely.',
});

const CLAIM_ERROR_COPY = Object.freeze({
    authentication_required: 'Sign In Again To Claim Your Milestone Reward.',
    milestone_not_reached: 'Reach The Required Streak Before Claiming This Milestone.',
    invalid_milestone_days: 'Selected Milestone Tier Was Not Recognized.',
    invalid_request_key: 'Claim Key Was Invalid. Retry To Generate A Fresh Key.',
    milestone_claim_failed: 'Could Not Complete Milestone Reward Claim. Retry Safely.',
    internal_error: 'Milestone Reward Service Is Temporarily Unavailable. Retry Safely.',
});

export default function StreakFreezeWidget({
    signedIn = false,
    online = true,
    userId = null,
    currentStreak = null,
    bestStreak = null,
    initialBalance = null,
    onBalanceChange,
    className = '',
}) {
    const headingId = useId();
    const [loading, setLoading] = useState(Boolean(signedIn));
    const [readError, setReadError] = useState('');
    const [inventory, setInventory] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingRequestKey, setPendingRequestKey] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [purchaseError, setPurchaseError] = useState('');
    const [purchaseErrorCode, setPurchaseErrorCode] = useState('');
    const [receipt, setReceipt] = useState(null);
    const [claimingMilestone, setClaimingMilestone] = useState(null);
    const [milestoneKeys, setMilestoneKeys] = useState({});
    const [claimError, setClaimError] = useState('');
    const [claimReceipt, setClaimReceipt] = useState(null);

    const requestGenRef = useRef(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const loadInventory = useCallback(async (signal) => {
        if (!signedIn) {
            setLoading(false);
            setReadError('');
            setInventory(null);
            return;
        }
        if (!online) {
            setLoading(false);
            return;
        }
        const gen = ++requestGenRef.current;
        setLoading(true);
        setReadError('');
        try {
            const response = await authedFetch('/api/trivia/streak-freeze', {
                method: 'GET',
                cache: 'no-store',
                signal,
            });
            const payload = await response.json().catch(() => null);
            if (!mountedRef.current || gen !== requestGenRef.current) return;
            if (response.status === 401) {
                setInventory(null);
                setReadError('Sign In Again To View Streak Freeze Inventory.');
                return;
            }
            if (!response.ok || payload?.success !== true) {
                setReadError('Could Not Load Streak Freeze Inventory.');
                return;
            }
            const normalized = normalizeStreakFreezePayload(payload);
            setInventory(normalized);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            if (!mountedRef.current || gen !== requestGenRef.current) return;
            setReadError('Could Not Load Streak Freeze Inventory.');
        } finally {
            if (mountedRef.current && gen === requestGenRef.current) {
                setLoading(false);
            }
        }
    }, [online, signedIn]);

    // Reset account-scoped state immediately when identity changes.
    useEffect(() => {
        requestGenRef.current += 1;
        setInventory(null);
        setConfirmOpen(false);
        setPendingRequestKey(null);
        setSubmitting(false);
        setPurchaseError('');
        setPurchaseErrorCode('');
        setReceipt(null);
        setClaimingMilestone(null);
        setMilestoneKeys({});
        setClaimError('');
        setClaimReceipt(null);
        setReadError('');

        if (!signedIn) {
            setLoading(false);
            return undefined;
        }
        const controller = new AbortController();
        void loadInventory(controller.signal);
        return () => controller.abort();
    }, [loadInventory, signedIn, userId]);

    const resolvedStreak = inventory?.currentStreak != null
        ? inventory.currentStreak
        : Math.max(0, Math.floor(Number(currentStreak) || 0));
    const resolvedBestStreak = inventory?.bestStreak != null
        ? inventory.bestStreak
        : Math.max(0, Math.floor(Number(bestStreak) || 0));
    const resolvedQuantity = inventory?.quantity ?? null;
    const resolvedMax = inventory?.maxQuantity ?? STREAK_FREEZE_MAX_QUANTITY;
    const resolvedCost = inventory?.costDiamonds ?? STREAK_FREEZE_COST_DIAMONDS;
    const resolvedBalance = inventory?.balance != null
        ? inventory.balance
        : (Number.isFinite(Number(initialBalance)) ? Math.max(0, Math.floor(Number(initialBalance))) : null);

    const claimedMilestones = Array.isArray(inventory?.claimedMilestones) ? inventory.claimedMilestones : [];
    const claimedSet = new Set(claimedMilestones.map((c) => Number(c.milestoneDays)));
    const effectiveStreak = Math.max(resolvedStreak, resolvedBestStreak);
    const claimableMilestones = Array.isArray(inventory?.claimableMilestones)
        ? inventory.claimableMilestones
        : computeClaimableMilestones(effectiveStreak, claimedMilestones);

    const milestone = computeStreakMilestoneProgress(resolvedStreak);
    const atMaxCapacity = resolvedQuantity !== null && resolvedQuantity >= resolvedMax;
    const knownInsufficientBalance = resolvedBalance !== null && resolvedBalance < resolvedCost;

    const beginConfirmation = () => {
        if (!signedIn || !online || submitting || atMaxCapacity) return;
        setPurchaseError('');
        setPurchaseErrorCode('');
        setPendingRequestKey((prev) => prev || createStreakFreezeRequestKey());
        setConfirmOpen(true);
    };

    const cancelConfirmation = () => {
        if (submitting) return;
        setConfirmOpen(false);
        setPendingRequestKey(null);
        setPurchaseError('');
        setPurchaseErrorCode('');
    };

    const submitPurchase = async () => {
        if (!signedIn || !online || submitting) return;
        const activeKey = pendingRequestKey || createStreakFreezeRequestKey();
        if (!pendingRequestKey) setPendingRequestKey(activeKey);

        const opGen = requestGenRef.current;
        setSubmitting(true);
        setPurchaseError('');
        setPurchaseErrorCode('');

        try {
            const response = await authedFetch('/api/trivia/streak-freeze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestKey: activeKey }),
            });
            const payload = await response.json().catch(() => null);
            if (!mountedRef.current || opGen !== requestGenRef.current) return;

            if (!response.ok || payload?.success !== true) {
                const code = payload?.error || (response.status === 402 ? 'insufficient_diamonds' : 'streak_freeze_purchase_failed');
                setPurchaseErrorCode(code);
                setPurchaseError(PURCHASE_ERROR_COPY[code] || 'Could Not Complete Streak Freeze Purchase.');
                if (Number.isFinite(Number(payload?.balance)) || Number.isFinite(Number(payload?.quantity))) {
                    setInventory((prev) => ({
                        ...(prev || {
                            itemType: 'streak_shield',
                            quantity: 0,
                            maxQuantity: STREAK_FREEZE_MAX_QUANTITY,
                            costDiamonds: STREAK_FREEZE_COST_DIAMONDS,
                            currentStreak: resolvedStreak,
                            bestStreak: resolvedBestStreak,
                            balance: resolvedBalance,
                            claimedMilestones: [],
                            claimableMilestones: [],
                            lastFreezeConsumedDate: null,
                        }),
                        ...(Number.isFinite(Number(payload?.balance)) ? { balance: Math.max(0, Math.floor(Number(payload.balance))) } : {}),
                        ...(Number.isFinite(Number(payload?.quantity)) ? { quantity: Math.max(0, Math.floor(Number(payload.quantity))) } : {}),
                        ...(Number.isFinite(Number(payload?.maxQuantity)) ? { maxQuantity: Math.max(1, Math.floor(Number(payload.maxQuantity))) } : {}),
                    }));
                }
                if (code === 'insufficient_diamonds' || code === 'max_streak_freezes_reached' || code === 'invalid_request_key') {
                    setPendingRequestKey(null);
                    setConfirmOpen(false);
                }
                return;
            }

            const normalized = normalizeStreakFreezePayload(payload);
            setInventory((prev) => ({
                ...(prev || {}),
                ...normalized,
                currentStreak: prev?.currentStreak ?? resolvedStreak,
                bestStreak: prev?.bestStreak ?? resolvedBestStreak,
                claimedMilestones: prev?.claimedMilestones ?? [],
                claimableMilestones: prev?.claimableMilestones ?? [],
                lastFreezeConsumedDate: prev?.lastFreezeConsumedDate ?? null,
            }));
            setReceipt({
                referenceId: normalized?.referenceId || null,
                journalId: normalized?.journalId || null,
                diamondsCharged: normalized?.diamondsCharged ?? resolvedCost,
                replayed: normalized?.replayed === true,
                quantity: normalized?.quantity ?? resolvedQuantity,
                balance: normalized?.balance ?? resolvedBalance,
            });
            setConfirmOpen(false);
            setPendingRequestKey(null);
            if (typeof onBalanceChange === 'function' && normalized?.balance != null) {
                onBalanceChange(normalized.balance);
            }
            if ((normalized?.diamondsCharged || 0) > 0) {
                try {
                    eventBus.emit(EventType.DIAMONDS_SPENT, {
                        amount: normalized.diamondsCharged,
                        source: 'trivia_streak_freeze',
                        balance: normalized.balance,
                    });
                } catch (_) { /* best effort bus emit */ }
            }
        } catch (err) {
            if (!mountedRef.current || opGen !== requestGenRef.current) return;
            setPurchaseErrorCode('network_error');
            setPurchaseError('Network Error While Purchasing Streak Freeze. Retry Uses The Same Idempotent Key.');
        } finally {
            if (mountedRef.current && opGen === requestGenRef.current) {
                setSubmitting(false);
            }
        }
    };

    const submitMilestoneClaim = async (milestoneDays) => {
        if (!signedIn || !online || claimingMilestone !== null) return;
        const activeKey = milestoneKeys[milestoneDays] || createStreakMilestoneRequestKey(milestoneDays);
        if (!milestoneKeys[milestoneDays]) {
            setMilestoneKeys((prev) => ({ ...prev, [milestoneDays]: activeKey }));
        }

        const opGen = requestGenRef.current;
        setClaimingMilestone(milestoneDays);
        setClaimError('');

        try {
            const response = await authedFetch('/api/trivia/streak-freeze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'claim_milestone',
                    milestoneDays,
                    requestKey: activeKey,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!mountedRef.current || opGen !== requestGenRef.current) return;

            if (!response.ok || payload?.success !== true) {
                const code = payload?.error || 'milestone_claim_failed';
                setClaimError(CLAIM_ERROR_COPY[code] || 'Could Not Complete Milestone Reward Claim. Retry Safely.');
                if (code === 'invalid_request_key') {
                    setMilestoneKeys((prev) => {
                        const next = { ...prev };
                        delete next[milestoneDays];
                        return next;
                    });
                }
                return;
            }

            const claimedEntry = {
                milestoneDays: Number(payload.milestoneDays) || milestoneDays,
                rewardDiamonds: Number(payload.rewardDiamonds) || STREAK_MILESTONE_REWARDS[milestoneDays] || 0,
                journalId: payload.journalId || null,
                referenceId: payload.referenceId || null,
                claimedAt: payload.claimedAt || null,
            };

            setInventory((prev) => {
                const existing = Array.isArray(prev?.claimedMilestones) ? prev.claimedMilestones : [];
                const nextClaimed = [
                    ...existing.filter((item) => Number(item.milestoneDays) !== claimedEntry.milestoneDays),
                    claimedEntry,
                ].sort((a, b) => a.milestoneDays - b.milestoneDays);
                const nextBalance = Number.isFinite(Number(payload.balance))
                    ? Math.max(0, Math.floor(Number(payload.balance)))
                    : prev?.balance ?? resolvedBalance;
                return {
                    ...(prev || {
                        itemType: 'streak_shield',
                        quantity: resolvedQuantity ?? 0,
                        maxQuantity: resolvedMax,
                        costDiamonds: resolvedCost,
                        currentStreak: resolvedStreak,
                        bestStreak: resolvedBestStreak,
                        lastFreezeConsumedDate: null,
                    }),
                    balance: nextBalance,
                    claimedMilestones: nextClaimed,
                    claimableMilestones: computeClaimableMilestones(
                        Math.max(prev?.currentStreak ?? resolvedStreak, prev?.bestStreak ?? resolvedBestStreak),
                        nextClaimed,
                    ),
                };
            });

            setClaimReceipt({
                milestoneDays: claimedEntry.milestoneDays,
                rewardDiamonds: claimedEntry.rewardDiamonds,
                diamondsAwarded: Number(payload.diamondsAwarded) || 0,
                replayed: payload.replayed === true,
                journalId: claimedEntry.journalId,
                referenceId: claimedEntry.referenceId,
                balance: Number.isFinite(Number(payload.balance))
                    ? Math.max(0, Math.floor(Number(payload.balance)))
                    : resolvedBalance,
            });
            setMilestoneKeys((prev) => {
                const next = { ...prev };
                delete next[milestoneDays];
                return next;
            });

            if (typeof onBalanceChange === 'function' && Number.isFinite(Number(payload.balance))) {
                onBalanceChange(Math.max(0, Math.floor(Number(payload.balance))));
            }
            if ((Number(payload.diamondsAwarded) || 0) > 0) {
                try {
                    eventBus.emit(EventType.DIAMONDS_EARNED, {
                        amount: Number(payload.diamondsAwarded),
                        source: 'trivia_streak_milestone',
                        balance: Number(payload.balance),
                    });
                } catch (_) { /* best effort bus emit */ }
            }
        } catch (_) {
            if (!mountedRef.current || opGen !== requestGenRef.current) return;
            setClaimError('Network Error While Claiming Milestone Reward. Retry Uses The Same Idempotent Key.');
        } finally {
            if (mountedRef.current && opGen === requestGenRef.current) {
                setClaimingMilestone(null);
            }
        }
    };

    return (
        <section className={`${styles.card} ${className}`.trim()} aria-labelledby={headingId}>
            <div className={styles.header}>
                <div className={styles.headingGroup}>
                    <span className={styles.eyebrow}>Daily Streak Protection</span>
                    <h2 id={headingId} className={styles.title}>Streak Freeze And Milestones</h2>
                </div>
                <span className={styles.inventoryBadge}>
                    {!signedIn
                        ? 'Sign In'
                        : loading && resolvedQuantity === null
                            ? 'Loading Vault'
                            : resolvedQuantity !== null
                                ? `${formatTriviaDisplayNumber(resolvedQuantity)} / ${formatTriviaDisplayNumber(resolvedMax)} Freezes`
                                : 'Vault Unavailable'}
                </span>
            </div>

            {!signedIn ? (
                <p className={styles.notice}>
                    Sign In To Track Your Daily Streak Milestones And Store Up To 5 Streak Freezes.
                </p>
            ) : (
                <>
                    <dl className={styles.metrics}>
                        <div className={styles.metricItem}>
                            <dt>Current Streak</dt>
                            <dd className="tc-ink--gold">{formatTriviaDisplayNumber(resolvedStreak)} {resolvedStreak === 1 ? 'Day' : 'Days'}</dd>
                        </div>
                        <div className={styles.metricItem}>
                            <dt>Streak Freezes</dt>
                            <dd className="tc-ink--blue">
                                {resolvedQuantity !== null
                                    ? `${formatTriviaDisplayNumber(resolvedQuantity)} / ${formatTriviaDisplayNumber(resolvedMax)}`
                                    : loading ? 'Checking' : 'Unavailable'}
                            </dd>
                        </div>
                        <div className={styles.metricItem}>
                            <dt>Diamond Balance</dt>
                            <dd className="tc-ink--silver">
                                {resolvedBalance !== null
                                    ? `${formatTriviaDisplayNumber(resolvedBalance)} Diamonds`
                                    : loading ? 'Checking' : 'Server Verified'}
                            </dd>
                        </div>
                    </dl>

                    {inventory?.lastFreezeConsumedDate ? (
                        <p className={styles.notice}>
                            Last Streak Freeze Protected Missed Day <span data-preserve-case="true">{inventory.lastFreezeConsumedDate}</span>.
                        </p>
                    ) : null}

                    <div className={styles.milestoneBlock}>
                        <div className={styles.milestoneSummary}>
                            <span className="tc-ink--silver">
                                {milestone.allMilestonesReached
                                    ? 'All Streak Milestones Reached (100+ Days)'
                                    : `Next Milestone: ${formatTriviaDisplayNumber(milestone.nextMilestone)} Days`}
                            </span>
                            <span className={milestone.allMilestonesReached ? 'tc-ink--green' : 'tc-ink--gold'}>
                                {milestone.allMilestonesReached
                                    ? '100% Complete'
                                    : `${formatTriviaDisplayNumber(milestone.daysRemaining)} ${milestone.daysRemaining === 1 ? 'Day' : 'Days'} Left (${milestone.progressPct}%)`}
                            </span>
                        </div>
                        <div
                            className={styles.progressTrack}
                            role="progressbar"
                            aria-label="Daily Streak Milestone Progress"
                            aria-valuemin={0}
                            aria-valuemax={milestone.nextMilestone || 100}
                            aria-valuenow={Math.min(resolvedStreak, milestone.nextMilestone || 100)}
                        >
                            <div
                                className={milestone.allMilestonesReached ? styles.progressFillComplete : styles.progressFill}
                                style={{ width: `${milestone.progressPct}%` }}
                            />
                        </div>
                        <ol className={styles.milestoneList} aria-label="Streak Milestones">
                            {STREAK_MILESTONES.map((day) => {
                                const claimed = claimedSet.has(day);
                                const reached = effectiveStreak >= day;
                                const isNext = milestone.nextMilestone === day;
                                const reward = STREAK_MILESTONE_REWARDS[day];
                                const nodeClass = claimed || reached
                                    ? `${styles.milestoneNode} ${styles.milestoneNodeReached}`
                                    : isNext
                                        ? `${styles.milestoneNode} ${styles.milestoneNodeNext}`
                                        : styles.milestoneNode;
                                return (
                                    <li
                                        key={day}
                                        className={nodeClass}
                                        data-milestone-days={day}
                                        data-reached={reached ? 'true' : 'false'}
                                        data-claimed={claimed ? 'true' : 'false'}
                                    >
                                        <span>{day} Days</span>
                                        <span className={styles.milestoneRewardTag}>
                                            {claimed ? 'Claimed' : `+${reward} Diamonds`}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>

                        {claimableMilestones.length > 0 ? (
                            <div className={styles.claimBar} role="region" aria-label="Claimable Streak Milestones">
                                {claimableMilestones.map((day) => {
                                    const reward = STREAK_MILESTONE_REWARDS[day];
                                    const isClaiming = claimingMilestone === day;
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            className={styles.claimButton}
                                            disabled={!online || claimingMilestone !== null}
                                            onClick={() => submitMilestoneClaim(day)}
                                        >
                                            {isClaiming
                                                ? `Claiming ${day} Day Reward...`
                                                : `Claim Milestone Reward (${day} Days, +${formatTriviaDisplayNumber(reward)} Diamonds)`}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    {claimError ? (
                        <div className={styles.errorBox} role="alert">
                            <p className={styles.errorCopy}>{claimError}</p>
                        </div>
                    ) : null}

                    {claimReceipt ? (
                        <div className={styles.receiptBox} role="status" aria-live="polite">
                            <span className={styles.receiptHead}>
                                {claimReceipt.replayed
                                    ? `Verified ${claimReceipt.milestoneDays} Day Milestone Replay`
                                    : `${claimReceipt.milestoneDays} Day Milestone Reward Claimed`}
                            </span>
                            <dl className={styles.receiptRows}>
                                <div>
                                    <dt>Reward Credited</dt>
                                    <dd className="tc-ink--gold">+{formatTriviaDisplayNumber(claimReceipt.rewardDiamonds)} Diamonds</dd>
                                </div>
                                {claimReceipt.referenceId ? (
                                    <div>
                                        <dt>Ledger Reference</dt>
                                        <dd data-preserve-case="true">{claimReceipt.referenceId}</dd>
                                    </div>
                                ) : null}
                                {claimReceipt.journalId ? (
                                    <div>
                                        <dt>Journal Record</dt>
                                        <dd data-preserve-case="true">{claimReceipt.journalId}</dd>
                                    </div>
                                ) : null}
                                {claimReceipt.balance != null ? (
                                    <div>
                                        <dt>Balance After</dt>
                                        <dd>{formatTriviaDisplayNumber(claimReceipt.balance)} Diamonds</dd>
                                    </div>
                                ) : null}
                            </dl>
                        </div>
                    ) : null}

                    {readError ? (
                        <div className={styles.errorBox} role="alert">
                            <p className={styles.errorCopy}>{readError}</p>
                            {online ? (
                                <button type="button" className={styles.cancelButton} onClick={() => loadInventory()}>
                                    Retry Vault Read
                                </button>
                            ) : null}
                        </div>
                    ) : null}

                    {purchaseError ? (
                        <div className={styles.errorBox} role="alert">
                            <p className={styles.errorCopy}>{purchaseError}</p>
                            {pendingRequestKey && purchaseErrorCode === 'network_error' ? (
                                <button type="button" className={styles.confirmButton} disabled={submitting || !online} onClick={submitPurchase}>
                                    {submitting ? 'Retrying Purchase...' : 'Retry Same Purchase'}
                                </button>
                            ) : null}
                        </div>
                    ) : null}

                    {receipt ? (
                        <div className={styles.receiptBox} role="status" aria-live="polite">
                            <span className={styles.receiptHead}>
                                {receipt.replayed ? 'Verified Replay Receipt' : 'Streak Freeze Added'}
                            </span>
                            <dl className={styles.receiptRows}>
                                {receipt.referenceId ? (
                                    <div>
                                        <dt>Ledger Reference</dt>
                                        <dd data-preserve-case="true">{receipt.referenceId}</dd>
                                    </div>
                                ) : null}
                                {receipt.journalId ? (
                                    <div>
                                        <dt>Journal Record</dt>
                                        <dd data-preserve-case="true">{receipt.journalId}</dd>
                                    </div>
                                ) : null}
                                <div>
                                    <dt>Charged</dt>
                                    <dd className="tc-ink--gold">{formatTriviaDisplayNumber(receipt.diamondsCharged)} Diamonds</dd>
                                </div>
                                {receipt.balance != null ? (
                                    <div>
                                        <dt>Balance After</dt>
                                        <dd>{formatTriviaDisplayNumber(receipt.balance)} Diamonds</dd>
                                    </div>
                                ) : null}
                            </dl>
                        </div>
                    ) : null}

                    {confirmOpen ? (
                        <div className={styles.confirmBox} role="region" aria-label="Confirm Streak Freeze Purchase">
                            <p className={styles.confirmCopy}>
                                Spend {formatTriviaDisplayNumber(resolvedCost)} Diamonds For 1 Streak Freeze? Your Ledger Receipt Will Be Recorded Immediately.
                            </p>
                            <div className={styles.confirmActions}>
                                <button
                                    type="button"
                                    className={styles.confirmButton}
                                    disabled={submitting || !online}
                                    onClick={submitPurchase}
                                >
                                    {submitting ? 'Processing Purchase...' : `Confirm Purchase (${resolvedCost} Diamonds)`}
                                </button>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    disabled={submitting}
                                    onClick={cancelConfirmation}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.actions}>
                            <button
                                type="button"
                                className={styles.actionButton}
                                disabled={!online || loading || submitting || atMaxCapacity || knownInsufficientBalance}
                                onClick={beginConfirmation}
                            >
                                {atMaxCapacity
                                    ? `Max Freezes Held (${resolvedMax}/${resolvedMax})`
                                    : `Buy Streak Freeze (${resolvedCost} Diamonds)`}
                            </button>
                            {!online ? (
                                <span className="tc-ink--gold">Connect To Buy</span>
                            ) : knownInsufficientBalance && !atMaxCapacity ? (
                                <span className="tc-ink--red">Need {formatTriviaDisplayNumber(resolvedCost)} Diamonds</span>
                            ) : (
                                <span className="tc-ink--muted">Protects 1 Missed Daily Reset</span>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
