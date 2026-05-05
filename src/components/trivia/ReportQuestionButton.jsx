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

const REASONS = [
    { id: 'wrong_answer', label: 'Wrong answer' },
    { id: 'unclear',      label: "Confusing / unclear" },
    { id: 'duplicate',    label: "I've seen this before" },
    { id: 'broken',       label: 'Looks broken / typo' },
    { id: 'offensive',    label: 'Offensive content' },
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
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', padding: '6px 8px' }}>
                ✓ Thanks — report submitted
            </div>
        );
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.5)',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: 'pointer',
                }}
                title="Report this question"
            >
                ⚐ Report
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
        }}
        onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div style={{
                background: '#0a0a15',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: 24,
                maxWidth: 380,
                width: '100%',
            }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#fff' }}>Report question</h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    What's wrong with this one?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {REASONS.map(r => (
                        <button key={r.id}
                            onClick={() => submit(r.id)}
                            disabled={submitting}
                            style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#fff',
                                padding: '10px 14px',
                                borderRadius: 8,
                                fontSize: 14,
                                textAlign: 'left',
                                cursor: submitting ? 'wait' : 'pointer',
                                opacity: submitting ? 0.5 : 1,
                            }}>
                            {r.label}
                        </button>
                    ))}
                </div>
                {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 12 }}>{error}</div>}
                <button onClick={() => setOpen(false)}
                    style={{
                        marginTop: 16,
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 12,
                        cursor: 'pointer',
                    }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
