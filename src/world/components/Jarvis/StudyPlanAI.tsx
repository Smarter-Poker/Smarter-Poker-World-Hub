/* ═══════════════════════════════════════════════════════════════════════════
   STUDY PLAN AI — Personalized study recommendations based on leaks
   Analyzes training data and suggests focused improvement paths
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface StudyPlanAIProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface StudySession {
    id: string;
    topic: string;
    duration: number; // minutes
    resources: string[];
    priority: 'high' | 'medium' | 'low';
    completed: boolean;
}

const STUDY_TOPICS = {
    preflop: {
        name: 'Preflop Fundamentals',
        subtopics: ['Opening Ranges', '3-Betting', 'Defending Blinds', 'Position Awareness']
    },
    postflop: {
        name: 'Postflop Strategy',
        subtopics: ['C-Betting', 'Check-Raising', 'Probe Betting', 'Delayed C-Bets']
    },
    ranges: {
        name: 'Range Construction',
        subtopics: ['Polarization', 'Range Advantage', 'Board Texture', 'Equity Denial']
    },
    tournament: {
        name: 'Tournament Concepts',
        subtopics: ['ICM', 'Stack Dynamics', 'Bubble Play', 'Final Table Strategy']
    },
    mental: {
        name: 'Mental Game',
        subtopics: ['Tilt Control', 'Focus', 'Bankroll Mindset', 'Session Management']
    }
};

export function StudyPlanAI({ onAskJarvis, onClose }: StudyPlanAIProps) {
    const [selectedFocus, setSelectedFocus] = useState<string | null>(null);
    const [studyPlan, setStudyPlan] = useState<StudySession[]>([]);
    const [generating, setGenerating] = useState(false);

    const generateStudyPlan = () => {
        setGenerating(true);

        // Simulate plan generation (in production, this would call an API)
        setTimeout(() => {
            const focus = selectedFocus || 'preflop';
            const topic = STUDY_TOPICS[focus as keyof typeof STUDY_TOPICS];

            const plan: StudySession[] = topic.subtopics.map((subtopic, i) => ({
                id: `${Date.now()}-${i}`,
                topic: subtopic,
                duration: 20 + (i % 3) * 10,
                resources: ['Training Games', 'Video Review', 'Hand Analysis'],
                priority: i === 0 ? 'high' : i === 1 ? 'medium' : 'low',
                completed: false
            }));

            setStudyPlan(plan);
            setGenerating(false);
        }, 1000);
    };

    const toggleCompleted = (id: string) => {
        setStudyPlan(studyPlan.map(s =>
            s.id === id ? { ...s, completed: !s.completed } : s
        ));
    };

    const askForDetailedPlan = () => {
        const focus = selectedFocus ? STUDY_TOPICS[selectedFocus as keyof typeof STUDY_TOPICS]?.name : 'general poker';
        const completed = studyPlan.filter(s => s.completed).length;

        onAskJarvis(`Create a detailed weekly study plan for ${focus}.

**Current Progress:** ${completed}/${studyPlan.length} sessions completed

Include:
1. Specific daily study sessions (30-60 min each)
2. What resources to use (videos, articles, training)
3. Practice hands to review
4. Key concepts to memorize
5. How to measure improvement

Make it practical and actionable for a busy player.`);
    };

    const getPriorityColor = (priority: StudySession['priority']) => {
        switch (priority) {
            case 'high': return '#f44336';
            case 'medium': return '#FF9800';
            case 'low': return '#4CAF50';
        }
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '380px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                    📚 Study Plan AI
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Focus Area Selection */}
            <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', marginBottom: '6px' }}>
                    What do you want to focus on?
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.entries(STUDY_TOPICS).map(([key, topic]) => (
                        <button
                            key={key}
                            onClick={() => setSelectedFocus(key)}
                            style={{
                                padding: '6px 10px',
                                background: selectedFocus === key ? 'rgba(255, 215, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                                border: selectedFocus === key ? '1px solid #FFD700' : '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                color: selectedFocus === key ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
                                fontSize: '10px',
                                cursor: 'pointer'
                            }}
                        >
                            {topic.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Generate Button */}
            {studyPlan.length === 0 && (
                <button
                    onClick={generateStudyPlan}
                    disabled={!selectedFocus || generating}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: selectedFocus ? 'linear-gradient(135deg, #FFD700, #FFA500)' : 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        borderRadius: '8px',
                        color: selectedFocus ? '#000' : 'rgba(255, 255, 255, 0.3)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: selectedFocus ? 'pointer' : 'not-allowed',
                        marginBottom: '12px'
                    }}
                >
                    {generating ? 'Generating...' : '🧠 Generate Study Plan'}
                </button>
            )}

            {/* Study Plan */}
            {studyPlan.length > 0 && (
                <>
                    <div style={{
                        padding: '8px',
                        background: 'rgba(255, 215, 0, 0.1)',
                        borderRadius: '6px',
                        marginBottom: '10px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' }}>
                            Focus: {STUDY_TOPICS[selectedFocus as keyof typeof STUDY_TOPICS]?.name}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#FFD700' }}>
                            {studyPlan.filter(s => s.completed).length}/{studyPlan.length} completed
                        </div>
                    </div>

                    <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                        {studyPlan.map(session => (
                            <div
                                key={session.id}
                                onClick={() => toggleCompleted(session.id)}
                                style={{
                                    padding: '10px',
                                    background: session.completed ? 'rgba(76, 175, 80, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                                    border: session.completed ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    marginBottom: '6px',
                                    cursor: 'pointer',
                                    opacity: session.completed ? 0.7 : 1
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '4px'
                                }}>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: session.completed ? '#4CAF50' : '#fff',
                                        textDecoration: session.completed ? 'line-through' : 'none'
                                    }}>
                                        {session.completed ? '✓ ' : ''}{session.topic}
                                    </span>
                                    <span style={{
                                        padding: '2px 6px',
                                        background: `${getPriorityColor(session.priority)}20`,
                                        borderRadius: '3px',
                                        fontSize: '8px',
                                        color: getPriorityColor(session.priority)
                                    }}>
                                        {session.priority}
                                    </span>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '9px',
                                    color: 'rgba(255, 255, 255, 0.5)'
                                }}>
                                    <span>⏱️ {session.duration} min</span>
                                    <span>{session.resources[0]}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Ask Jarvis */}
            <button
                onClick={askForDetailedPlan}
                style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(255, 215, 0, 0.2)',
                    border: '1px solid rgba(255, 215, 0, 0.4)',
                    borderRadius: '8px',
                    color: '#FFD700',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                📋 Get Detailed Weekly Plan
            </button>
        </div>
    );
}
