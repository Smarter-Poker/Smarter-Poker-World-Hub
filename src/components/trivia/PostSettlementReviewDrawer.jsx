import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';
import { TriviaGlassAction } from './console/TriviaConsole';
import { authedFetch } from '../../lib/authUtils';
import { resolveTrainingSpotForCategory } from '../../lib/trivia/socialGrowthHelpers.mjs';
import { toTitleCase } from '../../lib/trivia/titleCase';

export default function PostSettlementReviewDrawer({
    open,
    onClose,
    sessionId,
    title = 'Post-Settlement Question Review',
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lockedMessage, setLockedMessage] = useState('');
    const [review, setReview] = useState(null);
    const requestIdRef = useRef(0);
    const activeControllerRef = useRef(null);

    useEffect(() => {
        activeControllerRef.current?.abort();
        activeControllerRef.current = null;
        requestIdRef.current += 1;
        setReview(null);
        setError('');
        setLockedMessage('');
        setLoading(false);
    }, [sessionId]);

    useEffect(() => () => {
        activeControllerRef.current?.abort();
        activeControllerRef.current = null;
    }, []);

    const loadReview = useCallback(async (signal) => {
        if (!sessionId) return;
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setError('');
        setLockedMessage('');
        try {
            const response = await authedFetch(
                `/api/trivia/session-review?sessionId=${encodeURIComponent(sessionId)}`,
                { method: 'GET', signal },
            );
            const payload = await response.json().catch(() => ({}));
            if (signal?.aborted || requestIdRef.current !== requestId) return;
            if (response.status === 409 && payload?.error === 'review_not_available_before_settlement') {
                setReview(null);
                setLockedMessage('Question Review Unlocks Automatically After Your Match Or Round Settles.');
                return;
            }
            if (!response.ok || payload?.success !== true) {
                throw new Error(payload?.error || 'Could Not Load Question Review.');
            }
            setReview(payload);
        } catch (err) {
            if (err?.name === 'AbortError' || signal?.aborted || requestIdRef.current !== requestId) return;
            setError(err?.message || 'Could Not Load Question Review.');
        } finally {
            if (!signal?.aborted && requestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [sessionId]);

    const triggerLoadReview = useCallback(() => {
        if (!sessionId) return null;
        activeControllerRef.current?.abort();
        const controller = new AbortController();
        activeControllerRef.current = controller;
        void loadReview(controller.signal);
        return controller;
    }, [loadReview, sessionId]);

    useEffect(() => {
        if (!open || !sessionId) return undefined;
        const controller = triggerLoadReview();
        return () => {
            controller?.abort();
            if (activeControllerRef.current === controller) {
                activeControllerRef.current = null;
            }
        };
    }, [open, sessionId, triggerLoadReview]);

    const items = Array.isArray(review?.items) ? review.items : [];

    return (
        <TriviaConsoleDialog
            open={open}
            onClose={onClose}
            eyebrow="Verified Answer Key"
            title={title}
            subtitle={review ? `${review.correctCount ?? 0} Of ${review.totalQuestions ?? items.length} Correct` : 'Available After Settlement'}
            pill={loading ? 'Loading' : lockedMessage ? 'Locked' : items.length > 0 ? `${items.length} Questions` : 'Review'}
            pillInk={lockedMessage ? 'blue' : error ? 'red' : 'blue'}
            secondaryAction={{ label: 'Close Review', onClick: onClose }}
            primaryAction={error ? { label: 'Retry', onClick: () => triggerLoadReview() } : undefined}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '62vh', overflowY: 'auto' }}>
                {loading ? (
                    <p className="trivia-console-copy tc-ink--muted">Loading Settled Question Ledger...</p>
                ) : null}

                {lockedMessage ? (
                    <div role="status" style={{ padding: '12px', border: '1px solid #86daff', background: '#050607' }}>
                        <strong className="tc-ink--cyan">Review Locked Until Settlement</strong>
                        <p className="trivia-console-copy tc-ink--silver">{lockedMessage}</p>
                    </div>
                ) : null}

                {error ? (
                    <div role="alert" style={{ padding: '12px', border: '1px solid #f02849', background: '#050607' }}>
                        <p className="trivia-console-copy tc-ink--red">{error}</p>
                        <TriviaGlassAction label="Retry Review" ink="red" onClick={() => triggerLoadReview()} />
                    </div>
                ) : null}

                {!loading && !lockedMessage && !error && items.length === 0 ? (
                    <p className="trivia-console-copy tc-ink--muted">No Settled Questions Found For This Session.</p>
                ) : null}

                {!loading && !lockedMessage && !error && items.map((item) => {
                    const spot = item.trainingSpot || resolveTrainingSpotForCategory(item.category);
                    const statusInk = item.wasSkipped ? 'muted' : item.wasCorrect ? 'green' : 'red';
                    const statusLabel = item.wasSkipped ? 'Skipped' : item.wasCorrect ? 'Correct' : 'Missed';
                    return (
                        <article
                            key={item.questionId || item.position}
                            style={{
                                border: '1px solid #6d747c',
                                background: '#050607',
                                padding: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                <span className="tc-label">
                                    Question {item.position} {item.category ? `| ${toTitleCase(String(item.category).replace(/_/g, ' '))}` : ''}
                                </span>
                                <strong className={`tc-ink--${statusInk}`}>{statusLabel}</strong>
                            </div>
                            <p style={{ margin: 0, color: '#f4f7fb', fontWeight: 600 }}>{item.question}</p>
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {(item.options || []).map((optionText, optionIndex) => {
                                    const isCorrectOpt = optionIndex === item.correctIndex;
                                    const isPickedOpt = optionIndex === item.selectedIndex;
                                    const optInk = isCorrectOpt
                                        ? '#35d95a'
                                        : isPickedOpt
                                            ? '#ff5b6e'
                                            : '#9aa5b3';
                                    return (
                                        <li
                                            key={optionIndex}
                                            style={{
                                                color: optInk,
                                                padding: '4px 8px',
                                                border: isCorrectOpt ? '1px solid #35d95a' : isPickedOpt ? '1px solid #f02849' : '1px solid #050607',
                                            }}
                                        >
                                            <span>{String.fromCharCode(65 + optionIndex)}. {optionText}</span>
                                            {isCorrectOpt ? <strong> (Correct)</strong> : null}
                                            {isPickedOpt && !isCorrectOpt ? <strong> (Your Pick)</strong> : null}
                                        </li>
                                    );
                                })}
                            </ul>
                            {item.explanation ? (
                                <p style={{ margin: 0, color: '#e4e7ec', fontSize: '13px' }}>{item.explanation}</p>
                            ) : null}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Link
                                    href={spot.href}
                                    className="tc-word tc-ink--blue"
                                    style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', padding: '0 8px' }}
                                >
                                    Train This Spot
                                </Link>
                            </div>
                        </article>
                    );
                })}
            </div>
        </TriviaConsoleDialog>
    );
}
