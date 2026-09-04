/**
 * EnhancedReviewPanel: the post-game review (overview, mistakes, solution).
 *
 * Mobile phase 2 (docs/mobile-standard, rule 2 "no hidden-content tabs"):
 * the three panels used to be tabs that unmounted everything but the active
 * one. They now render stacked, each under its own heading, and the old tab
 * row is an in-page jump list (it scrolls to a section, it hides nothing).
 * The solution view uses PreflopStaticGrid, the same 13x13 layout as the
 * live matrix (rank headers, pairs keep their label on phones), instead of a
 * 13-column grid of 6px text. No text under 12px anywhere in the panel.
 */
import React, { useCallback, useRef, useState } from 'react';
import { PreflopStaticGrid } from './PreflopRangeMatrix';

const ACTION_COLORS_REF = {
    raise: { bg: 'rgba(239, 68, 68, 0.3)', border: '#EF4444', label: 'Raise', textColor: '#FCA5A5' },
    call: { bg: 'rgba(34, 197, 94, 0.3)', border: '#22C55E', label: 'Call', textColor: '#86EFAC' },
    fold: { bg: 'rgba(100, 116, 139, 0.2)', border: '#64748B', label: 'Fold', textColor: '#94A3B8' },
    '3bet': { bg: 'rgba(168, 85, 247, 0.3)', border: '#A855F7', label: '3-Bet', textColor: '#C4B5FD' },
    allin: { bg: 'rgba(251, 191, 36, 0.3)', border: '#FBBF24', label: 'All-In', textColor: '#FDE68A' },
    all_in: { bg: 'rgba(251, 191, 36, 0.3)', border: '#FBBF24', label: 'All-In', textColor: '#FDE68A' },
    raise_small: { bg: 'rgba(249, 115, 22, 0.3)', border: '#F97316', label: 'Raise Small', textColor: '#FDBA74' },
    raise_big: { bg: 'rgba(168, 85, 247, 0.3)', border: '#A855F7', label: 'Raise Big', textColor: '#C4B5FD' },
};

const REVIEW_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const REVIEW_SECTIONS = [
    { key: 'overview', label: 'Overview' },
    { key: 'mistakes', label: 'Mistakes' },
    { key: 'solution', label: 'Solution' },
];

function getReviewHandName(row, col) {
    if (row === col) return REVIEW_RANKS[row] + REVIEW_RANKS[col];
    if (row < col) return REVIEW_RANKS[row] + REVIEW_RANKS[col] + 's';
    return REVIEW_RANKS[col] + REVIEW_RANKS[row] + 'o';
}

function normalizeReviewAction(action) {
    const normalized = String(action || '').toLowerCase().replace(/[-\s]/g, '_');
    if (normalized.startsWith('raise_small')) return 'raise_small';
    if (normalized.startsWith('raise_big')) return 'raise_big';
    if (normalized.startsWith('all_in') || normalized.startsWith('allin') || normalized.startsWith('jam')) return 'all_in';
    if (normalized.startsWith('raise') || normalized.startsWith('3bet') || normalized.startsWith('4bet')) return 'raise';
    if (normalized.startsWith('call') || normalized.startsWith('complete')) return 'call';
    if (normalized.startsWith('fold') || normalized.startsWith('check')) return 'fold';
    return normalized.replace(/\d+$/, '');
}

const headingStyle = { margin: '0 0 12px', fontFamily: "var(--font-orbitron), 'Orbitron', sans-serif", fontSize: 14, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b7cad9' };
const sectionStyle = { marginTop: 16, scrollMarginTop: 'calc(var(--sp-header-height, 56px) + 12px)' };

function EnhancedReviewPanel({ gradeResult, scenario, userGrid, sessionHistory, onAskJarvis, onCoachAnalysis }) {
    const [selectedMistake, setSelectedMistake] = useState(null);
    const [showSolution, setShowSolution] = useState(true);
    const sectionRefs = useRef({});

    const jumpTo = useCallback((key) => {
        const el = sectionRefs.current[key];
        if (el && typeof el.scrollIntoView === 'function') {
            try { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) { el.scrollIntoView(); }
        }
    }, []);

    if (!gradeResult || !scenario) return null;

    const solution = scenario.solution || {};
    const allHands = [];
    for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
            const hand = getReviewHandName(r, c);
            const userAction = userGrid[hand] || null;
            const correctAction = solution[hand] ? normalizeReviewAction(solution[hand]) : null;
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
    const positionLabel = scenario.title?.match(/(UTG|MP|HJ|CO|BTN|SB|BB)/)?.[1] || 'Unknown';
    const totalSessions = (sessionHistory || []).length;
    const avgAccuracy = totalSessions > 0
        ? Math.round((sessionHistory || []).reduce((sum, s) => sum + (s.score || 0), 0) / totalSessions)
        : gradeResult.score;

    const jumpStyle = {
        flex: '1 1 auto', minHeight: 44, padding: '10px 8px', border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
        background: 'rgba(0,0,0,0.3)', color: '#9fb6c6', touchAction: 'manipulation',
    };

    const solutionCellState = (hand) => {
        const source = showSolution ? solution : userGrid;
        const action = source[hand] ? normalizeReviewAction(source[hand]) : null;
        const ref = action ? ACTION_COLORS_REF[action] : null;
        const userAct = userGrid[hand];
        const solAct = solution[hand] ? normalizeReviewAction(solution[hand]) : null;
        const isDifferent = showSolution && (
            (solAct && (!userAct || userAct === 'fold')) ||
            (!solAct && userAct && userAct !== 'fold') ||
            (solAct && userAct && solAct !== userAct)
        );
        return {
            fill: ref?.bg || 'rgba(20, 20, 30, 0.6)',
            stroke: ref?.border || 'rgba(255, 255, 255, 0.1)',
            mark: isDifferent ? 'diff' : undefined,
        };
    };

    return (
        <div className="preflop-review-panel" style={{ marginTop: 16 }}>
            {/* Jump list: every section below is always rendered; these only scroll. */}
            <div role="navigation" aria-label="Jump to a review section" style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 4, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                {REVIEW_SECTIONS.map((section) => (
                    <button
                        key={section.key}
                        type="button"
                        onClick={() => jumpTo(section.key)}
                        style={jumpStyle}
                    >
                        {section.label}{section.key === 'mistakes' && mistakes.length > 0 ? ` (${mistakes.length})` : ''}
                    </button>
                ))}
            </div>

            {/* OVERVIEW */}
            <section ref={(el) => { sectionRefs.current.overview = el; }} id="preflop-review-overview" aria-labelledby="preflop-review-overview-title" style={sectionStyle}>
                <h3 id="preflop-review-overview-title" style={headingStyle}>Overview</h3>
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
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        {positionLabel} / Level {scenario.level || '?'} / {Object.keys(solution || {}).length} Hands In Range
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                    {[
                        { label: 'Correct', value: gradeResult.correctHands, color: '#22C55E' },
                        { label: 'Missed', value: gradeResult.missedHands.length, color: '#3B82F6' },
                        { label: 'Extra', value: gradeResult.extraHands.length, color: '#EF4444' },
                        { label: 'Wrong Action', value: gradeResult.wrongActionHands.length, color: '#F59E0B' },
                    ].map((stat) => (
                        <div key={stat.label} style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 12, padding: 16, textAlign: 'center'
                        }}>
                            <div style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{stat.label}</div>
                        </div>
                    ))}
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, fontWeight: 600 }}>RANGE ACCURACY</div>
                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                        {gradeResult.correctHands > 0 && <div style={{ flex: gradeResult.correctHands, background: '#22C55E' }} />}
                        {gradeResult.missedHands.length > 0 && <div style={{ flex: gradeResult.missedHands.length, background: '#3B82F6' }} />}
                        {gradeResult.extraHands.length > 0 && <div style={{ flex: gradeResult.extraHands.length, background: '#EF4444' }} />}
                        {gradeResult.wrongActionHands.length > 0 && <div style={{ flex: gradeResult.wrongActionHands.length, background: '#F59E0B' }} />}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        <span>{gradeResult.correctHands}/{Object.keys(solution || {}).length} Correct</span>
                        <span>{mistakes.length} Mistakes</span>
                    </div>
                </div>

                {totalSessions > 1 && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, fontWeight: 600 }}>SESSION TREND</div>
                        <div style={{ display: 'flex', alignItems: 'end', gap: 3, height: 40 }}>
                            {(sessionHistory || []).slice(-10).map((s, i, arr) => (
                                <div key={i} style={{
                                    flex: 1, height: `${Math.max(4, s.score * 0.4)}px`,
                                    background: s.score >= 85 ? '#22C55E' : s.score >= 70 ? '#F59E0B' : '#EF4444',
                                    borderRadius: 2, minHeight: 4, opacity: i === arr.length - 1 ? 1 : 0.5
                                }} />
                            ))}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                            Avg: {avgAccuracy}% Over {totalSessions} Sessions
                        </div>
                    </div>
                )}
            </section>

            {/* MISTAKES */}
            <section ref={(el) => { sectionRefs.current.mistakes = el; }} id="preflop-review-mistakes" aria-labelledby="preflop-review-mistakes-title" style={sectionStyle}>
                <h3 id="preflop-review-mistakes-title" style={headingStyle}>Mistakes{mistakes.length > 0 ? ` (${mistakes.length})` : ''}</h3>
                {mistakes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 16px', color: '#22C55E', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 12 }}>
                        <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 800 }}>FLAWLESS</div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>No Mistakes. You Nailed This Range Perfectly.</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 4, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                            <span><span style={{ color: '#3B82F6' }}>&#9679;</span> Missed (Should Have Played)</span>
                            <span><span style={{ color: '#EF4444' }}>&#9679;</span> Extra (Should Not Have Played)</span>
                            <span><span style={{ color: '#F59E0B' }}>&#9679;</span> Wrong Action</span>
                        </div>

                        {mistakes.map((m, i) => {
                            const mistakeType = m.isMissed ? 'missed' : m.isExtra ? 'extra' : 'wrong';
                            const typeColor = mistakeType === 'missed' ? '#3B82F6' : mistakeType === 'extra' ? '#EF4444' : '#F59E0B';
                            const correctRef = ACTION_COLORS_REF[m.correctAction];
                            const userRef = ACTION_COLORS_REF[m.userAction];

                            return (
                                <article key={m.hand}
                                    style={{
                                        background: selectedMistake === i ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${selectedMistake === i ? typeColor + '50' : 'rgba(255,255,255,0.06)'}`,
                                        borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s ease'
                                    }}
                                >
                                    <button
                                        type="button"
                                        aria-expanded={selectedMistake === i}
                                        aria-controls={`preflop-mistake-detail-${i}`}
                                        onClick={() => setSelectedMistake(selectedMistake === i ? null : i)}
                                        style={{ width: '100%', minHeight: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 14, border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                            <div style={{
                                                width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                background: typeColor + '20', border: `1px solid ${typeColor}40`,
                                                fontWeight: 800, fontSize: 13, color: typeColor
                                            }}>
                                                {m.hand}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                                                    {mistakeType === 'missed' ? 'Missed From Range' :
                                                        mistakeType === 'extra' ? 'Not In Range' :
                                                            `Wrong: ${userRef?.label || m.userAction} To ${correctRef?.label || m.correctAction}`}
                                                </div>
                                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                                    {m.correctAction ? `Correct: ${correctRef?.label || m.correctAction}` : 'Should Fold Or Skip'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: typeColor + '20', color: typeColor, fontWeight: 700, flexShrink: 0 }}>
                                            {mistakeType.toUpperCase()}
                                        </div>
                                    </button>

                                    {selectedMistake === i && (
                                        <div id={`preflop-mistake-detail-${i}`} style={{ padding: '12px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <div style={{ flex: 1, background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>YOUR ANSWER</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: userRef?.textColor || '#94A3B8' }}>
                                                        {userRef?.label || m.userAction || 'Fold'}
                                                    </div>
                                                </div>
                                                <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>CORRECT</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: correctRef?.textColor || '#86EFAC' }}>
                                                        {correctRef?.label || m.correctAction || 'Fold'}
                                                    </div>
                                                </div>
                                            </div>
                                            {onAskJarvis && (
                                                <button
                                                    type="button"
                                                    onClick={() => onAskJarvis(m.hand, m.correctAction, m.userAction)}
                                                    style={{
                                                        marginTop: 10, width: '100%', minHeight: 44, padding: '10px 16px',
                                                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))',
                                                        border: '1px solid rgba(139,92,246,0.4)', borderRadius: 10,
                                                        color: '#A78BFA', fontSize: 13, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                                    }}
                                                >
                                                    Ask Jarvis: Why {correctRef?.label || m.correctAction}?
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* SOLUTION */}
            <section ref={(el) => { sectionRefs.current.solution = el; }} id="preflop-review-solution" aria-labelledby="preflop-review-solution-title" style={sectionStyle}>
                <h3 id="preflop-review-solution-title" style={headingStyle}>Solution</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                        type="button"
                        aria-pressed={!showSolution}
                        onClick={() => setShowSolution(false)}
                        style={{
                            flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', touchAction: 'manipulation',
                            background: !showSolution ? 'rgba(0,212,255,0.15)' : 'rgba(0,0,0,0.3)',
                            color: !showSolution ? '#00d4ff' : '#9fb6c6', fontSize: 13, fontWeight: 700
                        }}
                    >
                        Your Range
                    </button>
                    <button
                        type="button"
                        aria-pressed={showSolution}
                        onClick={() => setShowSolution(true)}
                        style={{
                            flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', touchAction: 'manipulation',
                            background: showSolution ? 'rgba(34,197,94,0.15)' : 'rgba(0,0,0,0.3)',
                            color: showSolution ? '#22C55E' : '#9fb6c6', fontSize: 13, fontWeight: 700
                        }}
                    >
                        GTO Solution
                    </button>
                </div>

                <div className="preflop-lab-grid-frame is-review">
                    <PreflopStaticGrid
                        ranks={REVIEW_RANKS}
                        getHandName={getReviewHandName}
                        cellState={solutionCellState}
                        ariaLabel={showSolution ? 'Solver range with your mistakes outlined in gold' : 'Your submitted range'}
                    />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', justifyContent: 'center', marginTop: 12, fontSize: 12 }}>
                    {Object.entries(ACTION_COLORS_REF || {}).filter(([k]) => k !== 'fold' && k !== '3bet' && k !== 'allin').map(([action, cfg]) => (
                        <div key={action} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 12, height: 12, borderRadius: 2, background: cfg.bg, border: `1px solid ${cfg.border}` }} />
                            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{cfg.label}</span>
                        </div>
                    ))}
                    {showSolution && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 12, height: 12, borderRadius: 2, border: '2px solid #FFD700' }} />
                            <span style={{ color: '#FFD700' }}>Your Mistake</span>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16, fontSize: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 800, color: '#00d4ff' }}>
                            {Object.keys(solution || {}).length}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Hands In Range</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 800, color: '#00d4ff' }}>
                            {Math.round(Object.keys(solution || {}).length / 169 * 100)}%
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>Range Width</div>
                    </div>
                </div>
            </section>
        </div>
    );
}
export default EnhancedReviewPanel;
