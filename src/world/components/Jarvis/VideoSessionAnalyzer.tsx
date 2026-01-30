/* ═══════════════════════════════════════════════════════════════════════════
   VIDEO SESSION ANALYZER — Upload session recordings and mark key moments
   Allows players to log important hands from their recorded sessions
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';

interface VideoSessionAnalyzerProps {
    onAskJarvis: (question: string) => void;
    onClose?: () => void;
}

interface VideoMoment {
    id: string;
    timestamp: string;
    description: string;
    category: 'good' | 'bad' | 'question' | 'review';
}

export function VideoSessionAnalyzer({ onAskJarvis, onClose }: VideoSessionAnalyzerProps) {
    const [moments, setMoments] = useState<VideoMoment[]>([]);
    const [newMoment, setNewMoment] = useState({
        timestamp: '',
        description: '',
        category: 'review' as VideoMoment['category']
    });

    const addMoment = () => {
        if (!newMoment.timestamp || !newMoment.description) return;

        setMoments([
            ...moments,
            {
                id: Date.now().toString(),
                ...newMoment
            }
        ].sort((a, b) => a.timestamp.localeCompare(b.timestamp)));

        setNewMoment({ timestamp: '', description: '', category: 'review' });
    };

    const deleteMoment = (id: string) => {
        setMoments(moments.filter(m => m.id !== id));
    };

    const analyzeSession = () => {
        const grouped = {
            good: moments.filter(m => m.category === 'good'),
            bad: moments.filter(m => m.category === 'bad'),
            question: moments.filter(m => m.category === 'question'),
            review: moments.filter(m => m.category === 'review')
        };

        onAskJarvis(`Analyze my marked moments from this session recording:

**Good Plays (${grouped.good.length}):**
${grouped.good.map(m => `- ${m.timestamp}: ${m.description}`).join('\n') || 'None marked'}

**Mistakes (${grouped.bad.length}):**
${grouped.bad.map(m => `- ${m.timestamp}: ${m.description}`).join('\n') || 'None marked'}

**Questions (${grouped.question.length}):**
${grouped.question.map(m => `- ${m.timestamp}: ${m.description}`).join('\n') || 'None marked'}

**Needs Review (${grouped.review.length}):**
${grouped.review.map(m => `- ${m.timestamp}: ${m.description}`).join('\n') || 'None marked'}

Please analyze:
1. What patterns do you see in my mistakes?
2. Answer any questions I marked
3. What should I focus on improving?
4. What did I do well?`);
    };

    const getCategoryColor = (cat: VideoMoment['category']) => {
        switch (cat) {
            case 'good': return '#4CAF50';
            case 'bad': return '#f44336';
            case 'question': return '#2196F3';
            case 'review': return '#FF9800';
        }
    };

    const getCategoryIcon = (cat: VideoMoment['category']) => {
        switch (cat) {
            case 'good': return '✓';
            case 'bad': return '✗';
            case 'question': return '?';
            case 'review': return '◎';
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
                    🎬 Video Session Analyzer
                </h4>
                {onClose && (
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none',
                        color: 'rgba(255, 215, 0, 0.6)', fontSize: '18px', cursor: 'pointer'
                    }}>×</button>
                )}
            </div>

            {/* Add Moment Form */}
            <div style={{
                padding: '12px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
                marginBottom: '12px'
            }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                        type="text"
                        value={newMoment.timestamp}
                        onChange={e => setNewMoment({ ...newMoment, timestamp: e.target.value })}
                        placeholder="1:23:45"
                        style={{
                            width: '80px', padding: '6px',
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: '#FFD700', fontSize: '11px', textAlign: 'center'
                        }}
                    />
                    <select
                        value={newMoment.category}
                        onChange={e => setNewMoment({ ...newMoment, category: e.target.value as VideoMoment['category'] })}
                        style={{
                            padding: '6px', flex: 1,
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: getCategoryColor(newMoment.category), fontSize: '11px'
                        }}
                    >
                        <option value="good" style={{ background: '#1a0a2e' }}>Good Play</option>
                        <option value="bad" style={{ background: '#1a0a2e' }}>Mistake</option>
                        <option value="question" style={{ background: '#1a0a2e' }}>Question</option>
                        <option value="review" style={{ background: '#1a0a2e' }}>Review</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={newMoment.description}
                        onChange={e => setNewMoment({ ...newMoment, description: e.target.value })}
                        onKeyPress={e => e.key === 'Enter' && addMoment()}
                        placeholder="What happened in this hand?"
                        style={{
                            flex: 1, padding: '6px 10px',
                            background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '4px', color: '#fff', fontSize: '10px'
                        }}
                    />
                    <button
                        onClick={addMoment}
                        style={{
                            padding: '6px 14px', background: 'rgba(255, 215, 0, 0.2)',
                            border: 'none', borderRadius: '4px', color: '#FFD700',
                            fontSize: '11px', cursor: 'pointer'
                        }}
                    >
                        Add
                    </button>
                </div>
            </div>

            {/* Category Legend */}
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '12px',
                marginBottom: '10px',
                fontSize: '9px'
            }}>
                {(['good', 'bad', 'question', 'review'] as const).map(cat => (
                    <span key={cat} style={{ color: getCategoryColor(cat) }}>
                        {getCategoryIcon(cat)} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </span>
                ))}
            </div>

            {/* Moments List */}
            <div style={{
                maxHeight: '180px',
                overflowY: 'auto',
                marginBottom: '12px'
            }}>
                {moments.length === 0 ? (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: '11px'
                    }}>
                        No moments marked yet.<br />
                        Add timestamps from your session recording.
                    </div>
                ) : (
                    moments.map(moment => (
                        <div key={moment.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '6px',
                            marginBottom: '4px',
                            borderLeft: `3px solid ${getCategoryColor(moment.category)}`
                        }}>
                            <span style={{
                                fontSize: '14px',
                                color: getCategoryColor(moment.category)
                            }}>
                                {getCategoryIcon(moment.category)}
                            </span>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: '#FFD700'
                                }}>
                                    {moment.timestamp}
                                </div>
                                <div style={{
                                    fontSize: '10px',
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    lineHeight: 1.3
                                }}>
                                    {moment.description}
                                </div>
                            </div>
                            <button
                                onClick={() => deleteMoment(moment.id)}
                                style={{
                                    background: 'none', border: 'none',
                                    color: 'rgba(255, 255, 255, 0.3)',
                                    fontSize: '12px', cursor: 'pointer'
                                }}
                            >
                                ×
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Stats */}
            {moments.length > 0 && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-around',
                    padding: '8px',
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '6px',
                    marginBottom: '12px'
                }}>
                    {(['good', 'bad', 'question', 'review'] as const).map(cat => (
                        <div key={cat} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: getCategoryColor(cat) }}>
                                {moments.filter(m => m.category === cat).length}
                            </div>
                            <div style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                {cat}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Analyze Button */}
            <button
                onClick={analyzeSession}
                disabled={moments.length === 0}
                style={{
                    width: '100%', padding: '12px',
                    background: moments.length > 0
                        ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                        : 'rgba(255, 255, 255, 0.1)',
                    border: 'none', borderRadius: '8px',
                    color: moments.length > 0 ? '#000' : 'rgba(255, 255, 255, 0.3)',
                    fontSize: '12px', fontWeight: 600,
                    cursor: moments.length > 0 ? 'pointer' : 'not-allowed'
                }}
            >
                🎬 Analyze Marked Moments
            </button>
        </div>
    );
}
