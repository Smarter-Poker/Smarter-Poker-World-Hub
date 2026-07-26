/**
 * AI COACH FEEDBACK PANEL (W5-1)
 * Template-based coaching tips after each coach mode verdict.
 * Shows contextual advice based on hand, position, action, and correctness.
 * No API call — purely deterministic for instant rendering.
 */
import { useState, useMemo } from 'react';

const M = {
    card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', red: '#EF5350',
    gold: '#F5A623', text: '#E4E6EB', sub: '#B0B3B8',
    dim: 'rgba(255,255,255,0.4)', purple: '#a78bfa',
};

// ── Coaching tip templates ─────────────────────────────────────────────────
const CORRECT_TIPS = [
    ({ hand, position, action }) =>
        `Great read! ${action} with ${hand} from ${position} aligns perfectly with solver frequencies.`,
    ({ hand, position }) =>
        `Spot on. The solver prefers this line from ${position} with ${hand}—you're playing like a machine.`,
    ({ action, position }) =>
        `Correct! ${action} is the GTO play from ${position}. Continue trusting your reads here.`,
    ({ hand, action }) =>
        `Nailed it. ${action} with ${hand} is the solver-approved line. Your positional awareness is sharp.`,
    ({ position }) =>
        `Perfect. You're playing ${position} optimally. This spot is well-calibrated in your game.`,
];

const INCORRECT_TIPS = [
    ({ hand, position, gtoAction, userAction }) =>
        `The solver prefers ${gtoAction} with ${hand} from ${position}. Your pick (${userAction}) is a common deviation—many players overvalue this hand here.`,
    ({ gtoAction, position, userAction }) =>
        `From ${position}, the equilibrium play is ${gtoAction}. ${userAction} exposes you to exploitation by observant opponents.`,
    ({ hand, gtoAction }) =>
        `With ${hand}, the GTO line is ${gtoAction}. The key insight is to focus on your range composition, not just hand strength.`,
    ({ position, gtoAction, userAction }) =>
        `Playing ${position}, ${gtoAction} preserves your range balance. ${userAction} can work as an exploit, but the solver disagrees at equilibrium.`,
    ({ hand, gtoAction }) =>
        `${gtoAction} is correct here. With ${hand}, consider how your entire range interacts with this board texture.`,
];

const FREQUENCY_INSIGHTS = {
    high: 'This is a high-frequency play (65%+) — the solver takes this action nearly every time.',
    medium: 'This is a mixed-frequency spot (35–65%) — both actions can be correct depending on exploitative reads.',
    low: 'This is a low-frequency play (<35%) — the solver only takes this action with specific combos.',
};

function getRandomTip(tips, data) {
    const idx = Math.floor(Math.random() * tips.length);
    return tips[idx](data);
}

export default function CoachFeedback({ results, heroHand, heroPosition, coachUserPick, isCorrect }) {
    const [expanded, setExpanded] = useState(false);

    const feedback = useMemo(() => {
        if (!results?.optimalAction?.label) return null;

        const hand = heroHand
            ? `${heroHand.card1 || '?'}${heroHand.card2 || '?'}`
            : '??';
        const position = (heroPosition || 'Unknown').toUpperCase();
        const gtoAction = results.optimalAction.label;
        const userAction = coachUserPick || 'Unknown';
        const action = gtoAction;

        const data = { hand, position, gtoAction, userAction, action };
        const tip = isCorrect
            ? getRandomTip(CORRECT_TIPS, data)
            : getRandomTip(INCORRECT_TIPS, data);

        // Determine frequency insight.
        // The analyze API returns `actions: [{ id, label, frequency, isOptimal }]`
        // (0-100). Older/mock payloads may carry an explicit map instead.
        const breakdown = results.actionBreakdown
            || results.optimalAction?.breakdown
            || (Array.isArray(results.actions)
                ? Object.fromEntries(
                    results.actions
                        .filter(a => a && (a.label || a.id))
                        .map(a => [a.label || a.id, Number(a.frequency) || 0])
                )
                : null);
        let freqLevel = null;
        if (breakdown) {
            const gtoFreq = breakdown[gtoAction] || 0;
            if (gtoFreq >= 65) freqLevel = 'high';
            else if (gtoFreq >= 35) freqLevel = 'medium';
            else freqLevel = 'low';
        }

        return { tip, freqLevel, breakdown };
    }, [results, heroHand, heroPosition, coachUserPick, isCorrect]);

    if (!feedback) return null;

    return (
        <div style={s.card}>
            <button onClick={() => setExpanded(!expanded)} style={s.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{isCorrect ? '🧠' : '💡'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? M.green : M.gold }}>
                        {isCorrect ? 'Coach says: Well played' : 'Coach tip'}
                    </span>
                </div>
                <span style={{
                    fontSize: 10, color: M.dim,
                    transform: expanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                }}>▼</span>
            </button>

            {/* Tip text always visible */}
            <div style={{ padding: '0 10px 8px' }}>
                <p style={{ fontSize: 10, color: M.sub, lineHeight: 1.5, margin: 0 }}>
                    {feedback.tip}
                </p>
            </div>

            {/* Expanded: frequency insight + action breakdown */}
            {expanded && (
                <div style={{ padding: '0 10px 10px' }}>
                    {feedback.freqLevel && (
                        <div style={{
                            fontSize: 9, color: M.dim, lineHeight: 1.4,
                            background: 'rgba(255,255,255,0.03)',
                            padding: '6px 8px', borderRadius: 6,
                            marginBottom: 6,
                            borderLeft: `2px solid ${M.purple}`,
                        }}>
                            {FREQUENCY_INSIGHTS[feedback.freqLevel]}
                        </div>
                    )}

                    {feedback.breakdown && Object.keys(feedback.breakdown || {}).length > 0 && (
                        <div>
                            <span style={{ fontSize: 8, color: M.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Action Frequencies
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                {Object.entries(feedback.breakdown || {})
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([action, freq]) => (
                                        <div key={action} style={{
                                            padding: '3px 6px', borderRadius: 4,
                                            background: action === results?.optimalAction?.label
                                                ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${action === results?.optimalAction?.label
                                                ? M.green + '44' : M.border}`,
                                            fontSize: 9, color: M.sub,
                                        }}>
                                            <span style={{ fontWeight: 700 }}>{action}</span>
                                            <span style={{ color: M.dim, marginLeft: 4 }}>{freq}%</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const s = {
    card: {
        background: M.card,
        border: `1px solid ${M.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        marginTop: 6,
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px',
        background: 'none', border: 'none', width: '100%',
        cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
};
