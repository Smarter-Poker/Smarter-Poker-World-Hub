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
                    minHeight: 44,
                    padding: '8px 16px',
                    borderRadius: 10,
                    border: '2px solid transparent',
                    background: 'linear-gradient(180deg, #34434c 0%, #0d1b25 12%, #030a0e 52%, #07151d 86%, #142e3b 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
                    color: state.sent ? '#53f2a0' : '#f3f7fb',
                    fontSize: 13,
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
                        gap: 8,
                        paddingTop: 6,
                    }}
                >
                    {REASONS.map(([reason, label]) => (
                        <button
                            type="button"
                            key={reason}
                            disabled={state.submitting}
                            onClick={() => submit(reason)}
                            style={{
                                minHeight: 44,
                                padding: '6px 14px',
                                borderRadius: 10,
                                border: '2px solid transparent',
                                background: 'linear-gradient(180deg, #3d1c23 0%, #1c0b10 60%, #110609 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 18%, #e6f7ff 45%, #4c6470 72%, #e6f4fa 100%) border-box',
                                color: '#fecaca',
                                fontSize: 13,
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
                            style={{ flexBasis: '100%', color: '#fecaca', fontSize: 12 }}
                        >
                            {state.error}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
