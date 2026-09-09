/* ═══════════════════════════════════════════════════════════════════════════
   TRAINING STUDY PLAN — Honest launcher for the verified Training experience
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';
import { useRouter } from 'next/router';

interface StudyPlanAIProps {
    // Kept in the public prop contract because Jarvis tools share one mount
    // signature. Study-plan authority lives in Training, not a chat prompt.
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

const STUDY_PLAN_ROUTE = '/hub/training/study-plan?source=jarvis';

export function StudyPlanAI({ onClose }: StudyPlanAIProps) {
    const router = useRouter();

    const openTrainingStudyPlan = () => {
        onClose?.();
        void router.push(STUDY_PLAN_ROUTE);
    };

    return (
        <div
            role="dialog"
            aria-label="Training Study Plan"
            style={{
                background: 'linear-gradient(145deg, rgba(24, 20, 32, 0.99), rgba(6, 17, 28, 0.99))',
                border: '1px solid rgba(103, 232, 249, 0.38)',
                borderRadius: '12px',
                padding: '16px',
                maxWidth: '380px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
            }}
        >
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h4 style={{ margin: 0, color: '#67e8f9', fontSize: '14px', fontWeight: 700 }}>
                    Training Study Plan
                </h4>
                {onClose && (
                    <button
                        type="button"
                        aria-label="Close Training Study Plan"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(226, 232, 240, 0.72)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            <div style={{
                padding: '14px',
                marginBottom: '12px',
                border: '1px solid rgba(56, 189, 248, 0.18)',
                borderRadius: '8px',
                background: 'rgba(2, 132, 199, 0.08)'
            }}>
                <div style={{ color: '#e2e8f0', fontSize: '12px', lineHeight: 1.6 }}>
                    Open The Full Training Study Plan To Review Your Verified Session History,
                    Identify Focus Areas, And Launch Canonical Training Games.
                </div>
                <div style={{
                    color: '#94a3b8',
                    fontSize: '10px',
                    lineHeight: 1.55,
                    marginTop: '8px'
                }}>
                    Progress Is Shown Only From Server-Recorded Arena Sessions. Opening A Drill
                    Never Marks It Complete.
                </div>
            </div>

            <button
                type="button"
                onClick={openTrainingStudyPlan}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: 'linear-gradient(180deg, #67e8f9 0%, #0891b2 100%)',
                    border: '1px solid rgba(207, 250, 254, 0.72)',
                    borderRadius: '8px',
                    color: '#021018',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 6px 18px rgba(8, 145, 178, 0.25)'
                }}
            >
                Open Training Study Plan
            </button>
        </div>
    );
}
