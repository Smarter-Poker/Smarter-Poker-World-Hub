import React, { useState } from 'react';
const ACTION_COLORS_REF = {
    raise: { bg: 'rgba(239, 68, 68, 0.3)', border: '#EF4444', label: 'Raise', textColor: '#FCA5A5' },
    call: { bg: 'rgba(34, 197, 94, 0.3)', border: '#22C55E', label: 'Call', textColor: '#86EFAC' },
    fold: { bg: 'rgba(100, 116, 139, 0.2)', border: '#64748B', label: 'Fold', textColor: '#94A3B8' },
    '3bet': { bg: 'rgba(168, 85, 247, 0.3)', border: '#A855F7', label: '3-Bet', textColor: '#C4B5FD' },
    allin: { bg: 'rgba(251, 191, 36, 0.3)', border: '#FBBF24', label: 'All-In', textColor: '#FDE68A' },
};

function EnhancedReviewPanel({ gradeResult, scenario, userGrid, sessionHistory, onAskJarvis, onCoachAnalysis }) {
    const [reviewTab, setReviewTab] = useState('overview');
    const [selectedMistake, setSelectedMistake] = useState(null);
    const [showSolution, setShowSolution] = useState(false);

    if (!gradeResult || !scenario) return null;

    const solution = scenario.solution || {};
    const allHands = [];
    const RANKS_LOCAL = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

    // Build hand-by-hand breakdown
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            const hand = r === c ? `${RANKS_LOCAL[r]}${RANKS_LOCAL[c]}` :
                r < c ? `${RANKS_LOCAL[r]}${RANKS_LOCAL[c]}s` :
                    `${RANKS_LOCAL[c]}${RANKS_LOCAL[r]}o`;
            const userAction = userGrid[hand] || null;
            const correctAction = solution[hand] || null;
            const isCorrect = correctAction ? (userAction === correctAction) : (!userAction || userAction === 'fold');
            const isMissed = correctAction && (!userAction || userAction === 'fold');
            const isExtra = !correctAction && userAction && userAction !== 'fold';
            const isWrongAction = correctAction && userAction && userAction !== 'fold' && userAction !== correctAction;

            if (correctAction || (userAction && userAction !== 'fold')) {
                allHands.push({ hand, userAction, correctAction, isCorrect, isMissed, isExtra, isWrongAction });
            }
        }
    }

    const mistakes = allHands.filter(h => !h.isCorrect);
    const correctHands = allHands.filter(h => h.isCorrect);

    // Calculate position-specific accuracy
    const positionLabel = scenario.title?.match(/(UTG|MP|HJ|CO|BTN|SB|BB)/)?.[1] || 'Unknown';

    // Session stats
    const totalSessions = (sessionHistory || []).length;
    const avgAccuracy = totalSessions > 0
        ? Math.round((sessionHistory || []).reduce((sum, s) => sum + (s.score || 0), 0) / totalSessions)
        : gradeResult.score;

    const tabStyle = (active) => ({
        flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
        background: active ? 'rgba(0, 212, 255, 0.15)' : 'rgba(0,0,0,0.3)',
        color: active ? '#00d4ff' : '#64748b',
        borderBottom: active ? '2px solid #00d4ff' : '2px solid transparent',
        transition: 'all 0.2s ease',
    });

    return (
        <div style={{ marginTop: 16 }}>
            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button onClick={() => setReviewTab('overview')} style={tabStyle(reviewTab === 'overview')}>Overview</button>
                <button onClick={() => setReviewTab('mistakes')} style={tabStyle(reviewTab === 'mistakes')}>
                    Mistakes {mistakes.length > 0 ? `(${mistakes.length})` : ''}
                </button>
                <button onClick={() => setReviewTab('solution')} style={tabStyle(reviewTab === 'solution')}>Solution</button>
            </div>

            {/* ═══ TAB: OVERVIEW ═══ */}
            {reviewTab === 'overview' && (
                <div>
                    {/* Score Card */}
                    <div style={{
                        background: gradeResult.score >= 85
                            ? 'linear-gradient(135deg, rgba(0,255,136,0.1), rgba(0,212,255,0.1))'
                            : 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(251,146,60,0.1))',
                        border: `1px solid ${gradeResult.score >= 85 ? 'rgba(0,255,136,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: 16, padding: 20, marginBottom: 16, textAlign: 'center'
                    }}>
                        <div style={{ fontFamily: 'Rajdhani', fontSize: 48, fontWeight: 900, color: gradeResult.score >= 85 ? '#00ff88' : '#ef4444' }}>
                            {gradeResult.score}%
                        </div>
                        <div style={{ fontSize: 14, color: gradeResult.score >= 85 ? '#00ff88' : '#ef4444', fontWeight: 700, marginBottom: 8 }}>
                            {gradeResult.score >= 95 ? 'PERFECT RECALL' : gradeResult.score >= 85 ? 'MASTERY ACHIEVED' : gradeResult.score >= 70 ? 'ALMOST THERE' : 'KEEP PRACTICING'}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                            {positionLabel} • Level {scenario.level || '?'} • {Object.keys(solution || {}).length} hands in range
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                        {[
                            { label: 'Correct', value: gradeResult.correctHands, color: '#22C55E', icon: '' },
                            { label: 'Missed', value: gradeResult.missedHands.length, color: '#3B82F6', icon: '' },
                            { label: 'Extra', value: gradeResult.extraHands.length, color: '#EF4444', icon: '' },
                            { label: 'Wrong Action', value: gradeResult.wrongActionHands.length, color: '#F59E0B', icon: '' },
                        ].map((stat, i) => (
                            <div key={i} style={{
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 12, padding: 16, textAlign: 'center'
                            }}>
                                <div style={{ fontSize: 24, marginBottom: 4 }}>{stat.icon}</div>
                                <div style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Accuracy Breakdown Bar */}
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, fontWeight: 600 }}>RANGE ACCURACY</div>
                        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                            {gradeResult.correctHands > 0 && <div style={{ flex: gradeResult.correctHands, background: '#22C55E' }} />}
                            {gradeResult.missedHands.length > 0 && <div style={{ flex: gradeResult.missedHands.length, background: '#3B82F6' }} />}
                            {gradeResult.extraHands.length > 0 && <div style={{ flex: gradeResult.extraHands.length, background: '#EF4444' }} />}
                            {gradeResult.wrongActionHands.length > 0 && <div style={{ flex: gradeResult.wrongActionHands.length, background: '#F59E0B' }} />}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                            <span>{gradeResult.correctHands}/{Object.keys(solution || {}).length} correct</span>
                            <span>{mistakes.length} mistakes</span>
                        </div>
                    </div>

                    {/* Session Trend (if history available) */}
                    {totalSessions > 1 && (
                        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, fontWeight: 600 }}>SESSION TREND</div>
                            <div style={{ display: 'flex', alignItems: 'end', gap: 3, height: 40 }}>
                                {(sessionHistory || []).slice(-10).map((s, i) => (
                                    <div key={i} style={{
                                        flex: 1, height: `${Math.max(4, s.score * 0.4)}px`,
                                        background: s.score >= 85 ? '#22C55E' : s.score >= 70 ? '#F59E0B' : '#EF4444',
                                        borderRadius: 2, minHeight: 4, opacity: i === (sessionHistory || []).slice(-10).length - 1 ? 1 : 0.5
                                    }} />
                                ))}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                                Avg: {avgAccuracy}% over {totalSessions} sessions
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ TAB: MISTAKES ═══ */}
            {reviewTab === 'mistakes' && (
                <div>
                    {mistakes.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: '#22C55E' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                            <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 800 }}>FLAWLESS!</div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>No mistakes — you nailed this range perfectly.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Legend */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                                <span><span style={{ color: '#3B82F6' }}>●</span> Missed (should have played)</span>
                                <span><span style={{ color: '#EF4444' }}>●</span> Extra (shouldn't have played)</span>
                                <span><span style={{ color: '#F59E0B' }}>●</span> Wrong action</span>
                            </div>

                            {mistakes.map((m, i) => {
                                const mistakeType = m.isMissed ? 'missed' : m.isExtra ? 'extra' : 'wrong';
                                const typeColor = mistakeType === 'missed' ? '#3B82F6' : mistakeType === 'extra' ? '#EF4444' : '#F59E0B';
                                const correctRef = ACTION_COLORS_REF[m.correctAction];
                                const userRef = ACTION_COLORS_REF[m.userAction];

                                return (
                                    <div key={i}
                                        onClick={() => setSelectedMistake(selectedMistake === i ? null : i)}
                                        style={{
                                            background: selectedMistake === i ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${selectedMistake === i ? typeColor + '50' : 'rgba(255,255,255,0.06)'}`,
                                            borderRadius: 12, padding: 14, cursor: 'pointer', transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: typeColor + '20', border: `1px solid ${typeColor}40`,
                                                    fontWeight: 800, fontSize: 12, color: typeColor
                                                }}>
                                                    {m.hand}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                                                        {mistakeType === 'missed' ? 'Missed from range' :
                                                            mistakeType === 'extra' ? 'Not in range' :
                                                                `Wrong: ${userRef?.label || m.userAction} → ${correctRef?.label || m.correctAction}`}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                                        {m.correctAction ? `Correct: ${correctRef?.label || m.correctAction}` : 'Should fold/skip'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: typeColor + '20', color: typeColor, fontWeight: 700 }}>
                                                {mistakeType.toUpperCase()}
                                            </div>
                                        </div>

                                        {/* Expanded detail */}
                                        {selectedMistake === i && (
                                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <div style={{ flex: 1, background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>YOUR ANSWER</div>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: userRef?.textColor || '#94A3B8' }}>
                                                            {userRef?.label || m.userAction || 'Fold'}
                                                        </div>
                                                    </div>
                                                    <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>CORRECT</div>
                                                        <div style={{ fontSize: 14, fontWeight: 700, color: correctRef?.textColor || '#86EFAC' }}>
                                                            {correctRef?.label || m.correctAction || 'Fold'}
                                                        </div>
                                                    </div>
                                                </div>
                                                {onAskJarvis && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onAskJarvis(m.hand, m.correctAction, m.userAction); }}
                                                        style={{
                                                            marginTop: 10, width: '100%', padding: '10px 16px',
                                                            background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))',
                                                            border: '1px solid rgba(139,92,246,0.4)', borderRadius: 10,
                                                            color: '#A78BFA', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                                        }}
                                                    >
                                                        Ask Jarvis: Why {correctRef?.label || m.correctAction}?
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══ TAB: SOLUTION ═══ */}
            {reviewTab === 'solution' && (
                <div>
                    {/* Toggle: User vs Solution */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <button
                            onClick={() => setShowSolution(false)}
                            style={{
                                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: !showSolution ? 'rgba(0,212,255,0.15)' : 'rgba(0,0,0,0.3)',
                                color: !showSolution ? '#00d4ff' : '#64748b', fontSize: 12, fontWeight: 700
                            }}
                        >
                            Your Range
                        </button>
                        <button
                            onClick={() => setShowSolution(true)}
                            style={{
                                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: showSolution ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.3)',
                                color: showSolution ? '#22C55E' : '#64748b', fontSize: 12, fontWeight: 700
                            }}
                        >
                            GTO Solution
                        </button>
                    </div>

                    {/* Mini Grid — Solution View */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 'min(0.4vw, 2px)', maxWidth: 500, margin: '0 auto' }}>
                        {RANKS.map((_, row) => (
                            RANKS.map((_, col) => {
                                const hand = getHandName(row, col);
                                const source = showSolution ? solution : userGrid;
                                const action = source[hand];
                                const ref = action ? ACTION_COLORS_REF[action] : null;

                                // Highlight differences
                                const userAct = userGrid[hand];
                                const solAct = solution[hand];
                                const isDifferent = showSolution && (
                                    (solAct && (!userAct || userAct === 'fold')) ||
                                    (!solAct && userAct && userAct !== 'fold') ||
                                    (solAct && userAct && solAct !== userAct)
                                );

                                return (
                                    <div
                                        key={`${row}-${col}`}
                                        style={{
                                            aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 'clamp(6px, 1.4vw, 10px)', fontWeight: 600, color: '#fff',
                                            borderRadius: 'min(0.8vw, 3px)', userSelect: 'none',
                                            background: ref?.bg || 'rgba(20,20,30,0.6)',
                                            border: isDifferent ? '2px solid #FFD700' : `1px solid ${ref?.border || 'rgba(255,255,255,0.1)'}`,
                                            boxShadow: isDifferent ? '0 0 6px rgba(255,215,0,0.4)' : 'none'
                                        }}
                                    >
                                        {hand}
                                    </div>
                                );
                            })
                        ))}
                    </div>

                    {/* Legend */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 12, fontSize: 11 }}>
                        {Object.entries(ACTION_COLORS_REF || {}).filter(([k]) => k !== 'fold').map(([action, cfg]) => (
                            <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.bg, border: `1px solid ${cfg.border}` }} />
                                <span style={{ color: 'rgba(255,255,255,0.5)' }}>{cfg.label}</span>
                            </div>
                        ))}
                        {showSolution && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, border: '2px solid #FFD700' }} />
                                <span style={{ color: '#FFD700' }}>Your mistake</span>
                            </div>
                        )}
                    </div>

                    {/* Range Stats */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16, fontSize: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 800, color: '#00d4ff' }}>
                                {Object.keys(solution || {}).length}
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)' }}>Hands in Range</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 800, color: '#00d4ff' }}>
                                {Math.round(Object.keys(solution || {}).length / 169 * 100)}%
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.4)' }}>Range Width</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
export default EnhancedReviewPanel;
