/**
 * AI COACH FEEDBACK PANEL (W5-1)
 * Template-based coaching tips after each coach-mode verdict.
 *
 * The tip is DETERMINISTIC for a given spot (hashed, never Math.random) so the
 * coach cannot appear to change its mind about the same hand, and it is fed
 * real context — board texture, EV actually lost, the villain archetype — so it
 * stops reading like five interchangeable strings.
 */
import { useState, useMemo } from 'react';
import { Brain, Lightbulb, ChevronDown, Target } from 'lucide-react';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { PAStyles, hashString } from './paKit';

// ── Coaching tip templates ─────────────────────────────────────────────────
const CORRECT_TIPS = [
    ({ hand, position, action, textureClause }) =>
        `Great read — ${action} with ${hand} from ${position}${textureClause} matches solver frequency.`,
    ({ hand, position, textureClause }) =>
        `Spot on. The solver takes this line from ${position} with ${hand}${textureClause}. Keep trusting the read.`,
    ({ action, position, villainClause }) =>
        `Correct: ${action} is the equilibrium play from ${position}${villainClause}.`,
    ({ hand, action, textureClause }) =>
        `Nailed it. ${action} with ${hand}${textureClause} is solver-approved — your board reading is sharp.`,
    ({ position, villainClause }) =>
        `Perfect. You are playing ${position} at equilibrium${villainClause}. This spot is well calibrated in your game.`,
];

const INCORRECT_TIPS = [
    ({ hand, position, gtoAction, userAction, evClause, textureClause }) =>
        `The solver prefers ${gtoAction} with ${hand} from ${position}${textureClause}. ${userAction} is a common deviation${evClause}.`,
    ({ gtoAction, position, userAction, evClause }) =>
        `From ${position} the equilibrium play is ${gtoAction}. ${userAction} opens you up to observant opponents${evClause}.`,
    ({ hand, gtoAction, textureClause }) =>
        `With ${hand} the GTO line is ${gtoAction}${textureClause}. Think range composition here, not raw hand strength.`,
    ({ position, gtoAction, userAction, villainClause }) =>
        `From ${position}, ${gtoAction} preserves your range balance${villainClause}. ${userAction} can be a deliberate exploit, but it is not equilibrium.`,
    ({ hand, gtoAction, evClause, textureClause }) =>
        `${gtoAction} is correct here. With ${hand}${textureClause}, look at how your whole range interacts with this board${evClause}.`,
];

const FREQUENCY_INSIGHTS = {
    high: 'High-frequency play (65%+) — the solver takes this action nearly every time it reaches this node.',
    medium: 'Mixed-frequency spot (35–65%) — both actions are defensible; exploitative reads break the tie.',
    low: 'Low-frequency play (under 35%) — the solver only takes this line with specific combos.',
};

function boardToCards(board) {
    if (Array.isArray(board)) return board.filter(Boolean).map(String);
    if (board && typeof board === 'object') {
        return [...(board.flop || []), board.turn, board.river].filter(Boolean).map(String);
    }
    if (typeof board === 'string') return board.trim().split(/[\s,]+/).filter(Boolean);
    return [];
}

/** Compact board-texture label used inside the tip copy. */
function classifyBoardTexture(cards) {
    if (!cards || cards.length < 3) return null;
    const ranks = cards.map(c => c[0]?.toUpperCase()).filter(Boolean);
    const flopSuits = cards.slice(0, 3).map(c => c[1]?.toLowerCase()).filter(Boolean);
    const uniqueFlopSuits = new Set(flopSuits).size;
    const paired = new Set(ranks).size !== ranks.length;
    const hasAce = ranks.includes('A');
    const suitTag = uniqueFlopSuits === 1 ? 'monotone' : uniqueFlopSuits === 2 ? 'two-tone' : 'rainbow';
    const parts = [];
    if (hasAce) parts.push('ace-high');
    if (paired) parts.push('paired');
    parts.push(suitTag);
    return parts.join(' ');
}

export default function CoachFeedback({
    results,
    heroHand,
    heroPosition,
    coachUserPick,
    isCorrect,
    /** Optional — the sandbox board ({flop,turn,river} or array). */
    board = null,
    /** Optional — villains[0], used for the archetype clause. */
    villain = null,
    /** Optional — when provided a "drill this spot" CTA is shown. */
    onDrill = null,
}) {
    const [expanded, setExpanded] = useState(false);

    const feedback = useMemo(() => {
        if (!results?.optimalAction?.label) return null;

        const hand = heroHand ? `${heroHand.card1 || '?'}${heroHand.card2 || '?'}` : '??';
        const position = (heroPosition || 'Unknown').toUpperCase();
        const gtoAction = results.optimalAction.label;
        const userAction = coachUserPick || 'Your pick';

        const cards = boardToCards(board);
        const texture = classifyBoardTexture(cards);
        const textureClause = texture ? ` on a ${texture} board` : '';

        const archetypeName = villain?.archetype?.name || villain?.archetype?.id || null;
        const villainClause = archetypeName ? ` against a ${archetypeName} opponent` : '';

        const evLossRaw = Number(results?.ev?.evLoss);
        const evLoss = Number.isFinite(evLossRaw) ? Math.abs(evLossRaw) : null;
        const evClause = (!isCorrect && evLoss != null && evLoss > 0.005)
            ? ` — about ${evLoss.toFixed(2)} BB of EV`
            : '';

        const data = { hand, position, gtoAction, userAction, action: gtoAction, textureClause, villainClause, evClause };

        // Deterministic pick: the same spot always yields the same tip.
        const tips = isCorrect ? CORRECT_TIPS : INCORRECT_TIPS;
        const idx = hashString(`${hand}|${position}|${gtoAction}|${userAction}|${isCorrect ? 1 : 0}`) % tips.length;
        const tip = tips[idx](data);

        // Frequency breakdown — prefer the STRUCTURED value; the label-keyed map
        // misses whenever the optimal label carries a size suffix.
        const breakdown = results.actionBreakdown
            || results.optimalAction?.breakdown
            || (Array.isArray(results.actions)
                ? Object.fromEntries(
                    results.actions
                        .filter(a => a && (a.label || a.id))
                        .map(a => [a.label || a.id, Number(a.frequency) || 0])
                )
                : null);

        const structuredFreq = Array.isArray(results.actions)
            ? Number(results.actions.find(a => a?.isOptimal)?.frequency)
            : NaN;
        const optimalFreq = Number.isFinite(structuredFreq)
            ? structuredFreq
            : (Number(results.optimalAction?.frequency) || Number(breakdown?.[gtoAction]) || 0);

        let freqLevel = null;
        if (breakdown || optimalFreq > 0) {
            if (optimalFreq >= 65) freqLevel = 'high';
            else if (optimalFreq >= 35) freqLevel = 'medium';
            else freqLevel = 'low';
        }

        return { tip, freqLevel, breakdown, optimalFreq, evLoss, texture, position, gtoAction };
    }, [results, heroHand, heroPosition, coachUserPick, isCorrect, board, villain]);

    if (!feedback) return null;

    const tone = isCorrect ? T.success : T.warn;

    return (
        <div style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md,
            overflow: 'hidden', marginTop: S.sm, marginBottom: S.sm, boxSizing: 'border-box', width: '100%',
        }}>
            <PAStyles />
            <button
                type="button"
                className="pa-btn"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm,
                    width: '100%', minHeight: 44, padding: `0 ${S.md}px`,
                    background: 'none', border: 'none', cursor: 'pointer', color: T.text,
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: S.sm, minWidth: 0 }}>
                    {isCorrect
                        ? <Brain size={18} strokeWidth={2} color={tone} />
                        : <Lightbulb size={18} strokeWidth={2} color={tone} />}
                    <span style={{ fontSize: F.label, fontWeight: 700, color: tone }}>
                        {isCorrect ? 'Coach: well played' : 'Coach tip'}
                    </span>
                </span>
                <ChevronDown
                    size={18}
                    strokeWidth={2}
                    color={T.textMuted}
                    style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}
                />
            </button>

            {/* Tip text is always visible — the collapse only hides the detail. */}
            <div style={{ padding: `0 ${S.md}px ${S.md}px` }}>
                <p style={{ fontSize: F.bodySm, color: T.textMuted, lineHeight: 1.5, margin: 0 }}>
                    {feedback.tip}
                </p>

                {(feedback.evLoss != null && !isCorrect && feedback.evLoss > 0.005) && (
                    <div style={{ marginTop: S.sm, display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                        <span style={pill('danger')}>−{feedback.evLoss.toFixed(2)} BB</span>
                        {feedback.texture && <span style={pill('neutral')}>{feedback.texture}</span>}
                    </div>
                )}
            </div>

            {expanded && (
                <div style={{ padding: `0 ${S.md}px ${S.md}px`, display: 'flex', flexDirection: 'column', gap: S.md }}>
                    {feedback.freqLevel && (
                        <div style={{
                            fontSize: F.caption, color: T.textMuted, lineHeight: 1.45,
                            background: T.surface2, padding: S.md, borderRadius: R.sm,
                            borderLeft: `3px solid ${T.purple}`, boxSizing: 'border-box',
                        }}>
                            {FREQUENCY_INSIGHTS[feedback.freqLevel]}
                            {feedback.optimalFreq > 0 && (
                                <span style={{ color: T.purple, fontWeight: 700, ...numeric }}>
                                    {' '}({Math.round(feedback.optimalFreq)}% here)
                                </span>
                            )}
                        </div>
                    )}

                    {feedback.breakdown && Object.keys(feedback.breakdown).length > 0 && (
                        <div>
                            <div style={{
                                fontSize: F.caption, color: T.textMuted, textTransform: 'uppercase',
                                letterSpacing: 0.6, fontWeight: 700, marginBottom: S.sm,
                            }}>
                                Action frequencies
                            </div>
                            <div style={{ display: 'flex', gap: S.sm, flexWrap: 'wrap' }}>
                                {Object.entries(feedback.breakdown)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([action, freq]) => {
                                        const optimal = action === feedback.gtoAction;
                                        return (
                                            <span key={action} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: S.xs,
                                                minHeight: 32, padding: `0 ${S.md}px`, borderRadius: R.pill,
                                                background: optimal ? T.successSoft : T.surface2,
                                                border: `1px solid ${optimal ? 'rgba(34,197,94,0.4)' : T.border}`,
                                                fontSize: F.caption, color: optimal ? T.success : T.textMuted,
                                                boxSizing: 'border-box',
                                            }}>
                                                <span style={{ fontWeight: 700 }}>{action}</span>
                                                <span style={{ ...numeric }}>{Math.round(Number(freq) || 0)}%</span>
                                            </span>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {typeof onDrill === 'function' && (
                        <button
                            type="button"
                            className="pa-btn"
                            style={btn('secondary', { block: true })}
                            onClick={() => onDrill({ position: feedback.position, street: results?.street || null })}
                        >
                            <Target size={18} strokeWidth={2} />
                            Drill more spots from {feedback.position}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
