import React, { useEffect, useState } from 'react';
import { authedFetch } from '../../lib/authUtils';

const REASONS = [
    ['inaccurate_answer', 'Answer'],
    ['unclear_wording', 'Wording'],
    ['illegal_action', 'Actions'],
    ['visual_mismatch', 'Visual'],
];

/**
 * The same canonical reporting control is used by the poker table and the
 * psychology trainer. Keeping it here prevents one gameplay family from
 * silently losing the audit/reporting path when its feedback UI changes.
 */
export default function TrainingQuestionReport({ gameId, question }) {
    const [state, setState] = useState({
        open: false,
        submitting: false,
        sent: false,
        error: '',
    });

    const questionId = question?.id || question?.scenario?.id;

    useEffect(() => {
        setState({ open: false, submitting: false, sent: false, error: '' });
    }, [questionId]);

    const submit = async (reason) => {
        if (!gameId || !questionId) {
            setState((current) => ({
                ...current,
                error: 'This question has no canonical report id.',
            }));
            return;
        }

        setState({ open: true, submitting: true, sent: false, error: '' });
        try {
            const response = await authedFetch('/api/training/report-question', {
                method: 'POST',
                body: JSON.stringify({ gameId, questionId, reason }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.success === false) {
                throw new Error(data.error || `Report failed (${response.status})`);
            }
            setState({ open: false, submitting: false, sent: true, error: '' });
        } catch (error) {
            setState({
                open: true,
                submitting: false,
                sent: false,
                error: error?.message || 'Could not submit report.',
            });
        }
    };

    return (
        <div style={{ display: 'contents' }}>
            <button
                type="button"
                onClick={() => setState((current) => ({
                    ...current,
                    open: !current.open,
                    sent: false,
                    error: '',
                }))}
                aria-expanded={state.open}
                style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.03)',
                    color: state.sent ? '#53f2a0' : '#9db0bb',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                }}
            >
                {state.sent ? 'Report Sent' : 'Report'}
            </button>
            {state.open && (
                <div
                    role="group"
                    aria-label="Report question problem"
                    style={{
                        flexBasis: '100%',
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        gap: 6,
                        paddingTop: 2,
                    }}
                >
                    {REASONS.map(([reason, label]) => (
                        <button
                            type="button"
                            key={reason}
                            disabled={state.submitting}
                            onClick={() => submit(reason)}
                            style={{
                                padding: '6px 10px',
                                border: '1px solid rgba(248,113,113,.3)',
                                background: 'rgba(127,29,29,.2)',
                                color: '#fecaca',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: state.submitting ? 'wait' : 'pointer',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                    {state.error && (
                        <span
                            role="alert"
                            style={{ flexBasis: '100%', color: '#fecaca', fontSize: 10 }}
                        >
                            {state.error}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
