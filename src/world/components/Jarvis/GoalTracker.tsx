/* ═══════════════════════════════════════════════════════════════════════════
   GOAL TRACKER — Set and track poker improvement goals
   Create goals, track progress, celebrate achievements
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';

interface GoalTrackerProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface PokerGoal {
    id: string;
    title: string;
    description: string;
    category: 'training' | 'study' | 'results' | 'habits';
    target: number;
    current: number;
    unit: string;
    deadline?: string;
    completed: boolean;
    createdAt: string;
}

const GOAL_TEMPLATES = [
    { title: 'Complete 10 Training Games', category: 'training', target: 10, unit: 'games' },
    { title: 'Reach 80% Accuracy', category: 'training', target: 80, unit: '% accuracy' },
    { title: 'Study 5 Hours This Week', category: 'study', target: 5, unit: 'hours' },
    { title: 'Review 20 Hands', category: 'study', target: 20, unit: 'hands' },
    { title: 'Play 10 Sessions', category: 'results', target: 10, unit: 'sessions' },
    { title: 'Log Tilt Triggers', category: 'habits', target: 7, unit: 'entries' }
];

export function GoalTracker({ onAskJarvis, onClose }: GoalTrackerProps) {
    const [goals, setGoals] = useState<PokerGoal[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [newGoalTitle, setNewGoalTitle] = useState('');

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('jarvis_poker_goals');
        if (saved) {
            try {
                setGoals(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse goals:', e);
            }
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        localStorage.setItem('jarvis_poker_goals', JSON.stringify(goals));
    }, [goals]);

    const addGoal = (template?: typeof GOAL_TEMPLATES[0]) => {
        const newGoal: PokerGoal = {
            id: Date.now().toString(),
            title: template?.title || newGoalTitle || 'New Goal',
            description: '',
            category: template?.category as PokerGoal['category'] || 'training',
            target: template?.target || 10,
            current: 0,
            unit: template?.unit || 'units',
            completed: false,
            createdAt: new Date().toISOString()
        };
        setGoals([...goals, newGoal]);
        setNewGoalTitle('');
        setShowTemplates(false);
    };

    const updateProgress = (id: string, delta: number) => {
        setGoals(goals.map(g => {
            if (g.id !== id) return g;
            const newCurrent = Math.max(0, Math.min(g.target, g.current + delta));
            return {
                ...g,
                current: newCurrent,
                completed: newCurrent >= g.target
            };
        }));
    };

    const deleteGoal = (id: string) => {
        setGoals(goals.filter(g => g.id !== id));
    };

    const askForGoalAdvice = () => {
        const activeGoals = goals.filter(g => !g.completed);
        const completedGoals = goals.filter(g => g.completed);

        onAskJarvis(`Help me with my poker improvement goals:

**Active Goals (${activeGoals.length}):**
${activeGoals.map(g => `- ${g.title}: ${g.current}/${g.target} ${g.unit}`).join('\n') || 'None yet'}

**Completed Goals (${completedGoals.length}):**
${completedGoals.map(g => `- ${g.title}`).join('\n') || 'None yet'}

What should be my next priority, and how can I stay on track?`);
    };

    const completedCount = goals.filter(g => g.completed).length;
    const totalProgress = goals.length > 0
        ? Math.round(goals.reduce((sum, g) => sum + (g.current / g.target * 100), 0) / goals.length)
        : 0;

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
                <div>
                    <h4 style={{ margin: 0, color: '#FFD700', fontSize: '14px', fontWeight: 600 }}>
                        🎯 Goal Tracker
                    </h4>
                    {goals.length > 0 && (
                        <div style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                            {completedCount}/{goals.length} completed • {totalProgress}% overall
                        </div>
                    )}
                </div>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Goals List */}
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
                {goals.length === 0 ? (
                    <div style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '11px'
                    }}>
                        No goals yet. Add one to start tracking!
                    </div>
                ) : (
                    goals.map(goal => (
                        <div key={goal.id} style={{
                            padding: '10px',
                            background: goal.completed ? 'rgba(76, 175, 80, 0.1)' : 'rgba(0, 0, 0, 0.2)',
                            border: goal.completed ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            marginBottom: '6px'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '6px'
                            }}>
                                <span style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: goal.completed ? '#4CAF50' : '#fff',
                                    textDecoration: goal.completed ? 'line-through' : 'none'
                                }}>
                                    {goal.completed && '✓ '}{goal.title}
                                </span>
                                <button
                                    onClick={() => deleteGoal(goal.id)}
                                    style={{
                                        background: 'none', border: 'none',
                                        color: 'rgba(255, 255, 255, 0.3)',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ×
                                </button>
                            </div>

                            {/* Progress Bar */}
                            <div style={{
                                height: '6px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '3px',
                                overflow: 'hidden',
                                marginBottom: '6px'
                            }}>
                                <div style={{
                                    width: `${Math.min(100, (goal.current / goal.target) * 100)}%`,
                                    height: '100%',
                                    background: goal.completed
                                        ? '#4CAF50'
                                        : 'linear-gradient(90deg, #FFD700, #FFA500)',
                                    borderRadius: '3px',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>

                            {/* Progress Controls */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)' }}>
                                    {goal.current}/{goal.target} {goal.unit}
                                </span>
                                {!goal.completed && (
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                            onClick={() => updateProgress(goal.id, -1)}
                                            style={{
                                                padding: '2px 8px',
                                                background: 'rgba(255, 255, 255, 0.1)',
                                                border: 'none',
                                                borderRadius: '3px',
                                                color: '#fff',
                                                fontSize: '10px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            -
                                        </button>
                                        <button
                                            onClick={() => updateProgress(goal.id, 1)}
                                            style={{
                                                padding: '2px 8px',
                                                background: 'rgba(255, 215, 0, 0.2)',
                                                border: 'none',
                                                borderRadius: '3px',
                                                color: '#FFD700',
                                                fontSize: '10px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            +1
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Goal Section */}
            {showTemplates ? (
                <div style={{
                    padding: '10px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '8px',
                    marginBottom: '12px'
                }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', marginBottom: '8px' }}>
                        Quick Templates:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {GOAL_TEMPLATES.map((t, i) => (
                            <button
                                key={i}
                                onClick={() => addGoal(t)}
                                style={{
                                    padding: '4px 8px',
                                    background: 'rgba(255, 215, 0, 0.1)',
                                    border: '1px solid rgba(255, 215, 0, 0.2)',
                                    borderRadius: '4px',
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    fontSize: '9px',
                                    cursor: 'pointer'
                                }}
                            >
                                {t.title}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    <input
                        value={newGoalTitle}
                        onChange={e => setNewGoalTitle(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && addGoal()}
                        placeholder="Add custom goal..."
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '11px'
                        }}
                    />
                    <button
                        onClick={() => setShowTemplates(true)}
                        style={{
                            padding: '8px 12px',
                            background: 'rgba(255, 215, 0, 0.2)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#FFD700',
                            fontSize: '11px',
                            cursor: 'pointer'
                        }}
                    >
                        Templates
                    </button>
                </div>
            )}

            {/* Ask Jarvis */}
            <button
                onClick={askForGoalAdvice}
                style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#000',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                }}
            >
                🎯 Get Goal Coaching
            </button>
        </div>
    );
}
