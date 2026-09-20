/**
 * Phase 54 #6 — small "report this question" overlay used in all trivia modes.
 *
 * Drop into any question screen:
 *   <ReportQuestionButton questionId={q.id} userToken={accessToken} />
 *
 * Calls POST /api/trivia/report-question with the chosen reason. Three
 * unresolved reports auto-demote the question to quality_score=3, removing
 * it from gameplay until admin review.
 */
import { useState } from 'react';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';

const REASONS = [
    { id: 'wrong_answer', label: 'Wrong Answer' },
    { id: 'unclear',      label: 'Confusing Or Unclear' },
    { id: 'duplicate',    label: 'Seen This Before' },
    { id: 'broken',       label: 'Broken Or Typo' },
    { id: 'offensive',    label: 'Offensive Content' },
    { id: 'other',        label: 'Other' },
];

export default function ReportQuestionButton({ questionId, userToken, onDone }) {
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState(null);

    if (!questionId) return null;

    async function submit(reason) {
        if (submitting || done) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/trivia/report-question', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {}),
                },
                body: JSON.stringify({ question_id: questionId, reason }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setDone(true);
            setOpen(false);
            if (typeof onDone === 'function') onDone(json);
        } catch (e) {
            setError(e.message || 'Could not submit report');
        } finally {
            setSubmitting(false);
        }
    }

    if (done) {
        return (
            <div className="trivia-question-report-status" role="status">
                Report Submitted. Thank You.
            </div>
        );
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="trivia-question-report-trigger"
            >
                Report Question
            </button>
        );
    }

    return (
        <TriviaConsoleDialog
            open={open}
            onClose={() => setOpen(false)}
            eyebrow="Question Quality"
            title="Report Question"
            subtitle="Tell Us What Needs Review"
            pill={submitting ? 'Sending' : 'Review'}
            secondaryAction={{ label: 'Cancel', onClick: () => setOpen(false), disabled: submitting }}
        >
            <div className="trivia-question-report-reasons">
                {REASONS.map(reason => (
                    <button
                        key={reason.id}
                        type="button"
                        onClick={() => submit(reason.id)}
                        disabled={submitting}
                        className="trivia-question-report-reason"
                    >
                        {reason.label}
                    </button>
                ))}
            </div>
            {error ? <p className="trivia-question-report-error" role="alert">{error}</p> : null}
        </TriviaConsoleDialog>
    );
}
