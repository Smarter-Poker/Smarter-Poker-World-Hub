/**
 * 🎯 DETERMINISTIC Post-Game Analysis API (Operation Grok-Sweep — 2026-05)
 * ═══════════════════════════════════════════════════════════════════════════
 * Analyzes mistakes from a completed Memory-Matrix session and produces a
 * structured breakdown with patterns and recommendations. NO LLM CALLS.
 *
 * Prior implementation used grok-3 with `temperature: 0.5` to "analyze" the
 * mistakes — generating prose that sounded like coaching but was based on
 * whatever the LLM imagined the session looked like.
 *
 * The new implementation uses pure pattern analysis on the actual mistake
 * data the client already has:
 *   • Hand-class breakdown (pairs / suited / offsuit / broadways / connectors)
 *   • Action-mistake breakdown (over-folding, over-calling, missed 3-bets)
 *   • Hand-tier severity (premium / strong / marginal / trash)
 *   • Position-specific pattern detection
 *   • Score-based encouragement
 *
 * Output shape preserved exactly so frontend consumers
 * (pages/hub/memory-games.js etc.) keep working.
 *
 * POST /api/gto/analyze-game
 * Body: { mistakes, scenario, finalScore, position, stackDepth }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getCachedResponse, setCachedResponse } from '../../../src/lib/jarvisCache';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient as _createAuthClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Hand classification ──────────────────────────────────────────────────────
function classifyHand(hand) {
    if (!hand || typeof hand !== 'string') return 'unknown';
    const h = hand.trim();
    if (h.length === 2 && h[0] === h[1]) {
        if ('AK'.includes(h[0])) return 'premium_pair';
        if ('QJ'.includes(h[0])) return 'high_pair';
        if ('T98'.includes(h[0])) return 'medium_pair';
        return 'small_pair';
    }
    if (h.endsWith('s')) {
        if (h[0] === 'A' && 'KQJT'.includes(h[1])) return 'premium_suited_ace';
        if (h[0] === 'A') return 'suited_ace';
        if ('KQ'.includes(h[0]) && 'KQJT'.includes(h[1])) return 'suited_broadway';
        const r1 = '23456789TJQKA'.indexOf(h[0]);
        const r2 = '23456789TJQKA'.indexOf(h[1]);
        if (Math.abs(r1 - r2) === 1) return 'suited_connector';
        if (Math.abs(r1 - r2) === 2) return 'suited_one_gapper';
        return 'suited_other';
    }
    if (h.endsWith('o')) {
        if (h[0] === 'A' && 'KQJ'.includes(h[1])) return 'premium_offsuit';
        if ('KQ'.includes(h[0]) && 'KQJ'.includes(h[1])) return 'offsuit_broadway';
        return 'marginal_offsuit';
    }
    return 'unknown';
}

const HAND_CLASS_LABEL = {
    premium_pair: 'premium pocket pairs',
    high_pair: 'high pocket pairs',
    medium_pair: 'medium pocket pairs',
    small_pair: 'small pocket pairs',
    premium_suited_ace: 'premium suited aces',
    suited_ace: 'suited aces',
    suited_broadway: 'suited broadways',
    suited_connector: 'suited connectors',
    suited_one_gapper: 'suited one-gappers',
    suited_other: 'other suited hands',
    premium_offsuit: 'premium offsuit broadways',
    offsuit_broadway: 'offsuit broadways',
    marginal_offsuit: 'marginal offsuit hands',
    unknown: 'miscellaneous hands',
};

// ── Pattern detectors ────────────────────────────────────────────────────────
function detectPatterns(mistakes) {
    if (!Array.isArray(mistakes) || mistakes.length === 0) return [];

    const insights = [];

    // 1. Action-direction patterns
    const overFolds = mistakes.filter(m =>
        normalizeAction(m.userAction) === 'fold' &&
        ['raise', 'call', '3bet', 'allin'].includes(normalizeAction(m.correctAction))
    );
    const overAggression = mistakes.filter(m => {
        const u = normalizeAction(m.userAction);
        const c = normalizeAction(m.correctAction);
        return ['raise', '3bet', 'allin'].includes(u) && c === 'fold';
    });
    const callInsteadOfRaise = mistakes.filter(m =>
        normalizeAction(m.userAction) === 'call' &&
        ['raise', '3bet'].includes(normalizeAction(m.correctAction))
    );
    const raiseInsteadOfCall = mistakes.filter(m =>
        ['raise', '3bet'].includes(normalizeAction(m.userAction)) &&
        normalizeAction(m.correctAction) === 'call'
    );

    if (overFolds.length >= Math.max(2, mistakes.length * 0.4)) {
        insights.push({
            pattern: 'Range Too Tight',
            insight: `You folded ${overFolds.length} hand${overFolds.length !== 1 ? 's' : ''} that the solver plays — your opening/defense range is narrower than equilibrium.`,
            severity: 'high',
        });
    }
    if (overAggression.length >= Math.max(2, mistakes.length * 0.4)) {
        insights.push({
            pattern: 'Range Too Wide',
            insight: `You raised or 3-bet ${overAggression.length} hand${overAggression.length !== 1 ? 's' : ''} that the solver folds — your aggressive range is leaking value.`,
            severity: 'high',
        });
    }
    if (callInsteadOfRaise.length >= 2) {
        insights.push({
            pattern: 'Missing Raises',
            insight: `On ${callInsteadOfRaise.length} hand${callInsteadOfRaise.length !== 1 ? 's' : ''}, you called when the solver raises for value — flat-calling these hands gives up fold equity.`,
            severity: 'medium',
        });
    }
    if (raiseInsteadOfCall.length >= 2) {
        insights.push({
            pattern: 'Over-3-Betting',
            insight: `${raiseInsteadOfCall.length} of your raises should have been calls — flatting keeps the opener's range wide and lets you realize equity in position.`,
            severity: 'medium',
        });
    }

    // 2. Hand-class concentration
    const byClass = {};
    for (const m of mistakes) {
        const cls = classifyHand(m.hand);
        byClass[cls] = (byClass[cls] || 0) + 1;
    }
    const topClass = Object.entries(byClass).sort((a, b) => b[1] - a[1])[0];
    if (topClass && topClass[1] >= Math.max(2, Math.ceil(mistakes.length * 0.3))) {
        const [cls, count] = topClass;
        const label = HAND_CLASS_LABEL[cls] || 'this hand class';
        insights.push({
            pattern: 'Hand-Class Leak',
            insight: `${count} of your ${mistakes.length} mistakes were on ${label} — drill this category specifically.`,
            severity: 'medium',
        });
    }

    // 3. Boundary-hand awareness (always at least one — top tip)
    const totalMistakes = mistakes.length;
    if (totalMistakes >= 5) {
        insights.push({
            pattern: 'Boundary-Hand Focus',
            insight: 'The hands at the edge of any range (mixed-frequency spots) are the highest-leverage to memorize — one wrong frequency there costs more EV than missing a clear value hand.',
            severity: 'low',
        });
    }

    return insights.slice(0, 4); // cap at 4 insights
}

function normalizeAction(action) {
    if (!action || typeof action !== 'string') return 'fold';
    const a = action.toLowerCase();
    if (a === 'fold' || a.startsWith('fold')) return 'fold';
    if (a.startsWith('check')) return 'check';
    if (a === '3bet' || a.startsWith('3bet')) return '3bet';
    if (a === '4bet' || a.startsWith('4bet')) return '4bet';
    if (a === 'allin' || a === 'jam' || a === 'shove' || a.startsWith('allin')) return 'allin';
    if (a.startsWith('raise')) return 'raise';
    if (a.startsWith('call')) return 'call';
    return a;
}

// ── Recommendations ──────────────────────────────────────────────────────────
function buildRecommendations(insights, mistakes, finalScore, position, stackDepth) {
    const recs = [];
    const sd = Number(stackDepth) || 100;
    const heroPos = (position || '').toUpperCase();

    // Pattern-driven recommendations
    for (const ins of insights) {
        if (ins.pattern === 'Range Too Tight') {
            recs.push(`Open or defend wider from ${heroPos || 'this position'} — the solver opens ~${heroPos === 'BTN' ? '50%' : heroPos === 'CO' ? '30%' : '15-25%'} at ${sd}bb effective.`);
        } else if (ins.pattern === 'Range Too Wide') {
            recs.push(`Tighten your aggressive range; many speculative hands are folds preflop, not raises.`);
        } else if (ins.pattern === 'Missing Raises') {
            recs.push(`Convert flats to value-raises with hands like AKs, AQs, JJ+ when in position.`);
        } else if (ins.pattern === 'Over-3-Betting') {
            recs.push(`Add more flats with hands like AJs, KQs, TT — they realize equity better than 3-bets at 100bb.`);
        } else if (ins.pattern === 'Hand-Class Leak') {
            // Pull the hand class from the insight text
            recs.push(`Run a focused drill on the leaky hand class — repetition closes the gap fastest.`);
        }
    }

    // Position-specific recommendation
    if (heroPos === 'UTG' || heroPos === 'MP') {
        recs.push(`From ${heroPos}, range discipline matters most — the solver is tight here for a reason.`);
    } else if (heroPos === 'CO' || heroPos === 'BTN') {
        recs.push(`From ${heroPos}, fold equity rewards wider opens — practice the marginal-edge hands.`);
    } else if (heroPos === 'BB') {
        recs.push(`BB defense is mostly flat-calls; reserve 3-bets for the polar value+bluff range.`);
    }

    // Score-based encouragement (always at least one)
    recs.push(getEncouragement(finalScore));

    // Dedupe + cap at 3
    const seen = new Set();
    const out = [];
    for (const r of recs) {
        if (!seen.has(r)) {
            seen.add(r);
            out.push(r);
            if (out.length >= 3) break;
        }
    }
    return out;
}

function getEncouragement(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return 'Every mistake is a lesson — drill these spots and your accuracy will compound.';
    if (s >= 90) return 'Almost perfect — keep grinding the boundary hands to lock in mastery.';
    if (s >= 75) return 'Strong session. The remaining gaps are the highest-leverage to study.';
    if (s >= 60) return 'Solid foundation. Focus on the patterns above — they compound fast.';
    if (s >= 40) return 'Decent effort. The patterns above are the next step — drill them deliberately.';
    return 'Great learning opportunity. Re-run this exact range type a few times — accuracy climbs quickly.';
}

// ── Summary ──────────────────────────────────────────────────────────────────
function buildSummary(mistakes, finalScore, position, stackDepth) {
    const count = mistakes.length;
    const sd = Number(stackDepth) || 100;
    const heroPos = position ? `${position} `.replace(/\b[a-z]/g, c => c.toUpperCase()) : '';
    const scoreFrag = Number.isFinite(Number(finalScore))
        ? ` Your accuracy: ${Math.round(Number(finalScore))}%.`
        : '';

    if (count === 0) {
        return `Perfect session — zero mistakes.${scoreFrag} Keep the discipline going.`;
    }

    const plural = count !== 1 ? 's' : '';
    const lead = count <= 3
        ? `Small session leak: ${count} mistake${plural}`
        : count <= 7
            ? `${count} mistakes this run — clear pattern visible below.`
            : `${count} mistakes — the patterns below are the fastest path to closing the gap.`;

    return `${lead}${scoreFrag} ${heroPos}at ${sd}bb effective — review the leaks and re-drill this range type.`;
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    try {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        // Auth (preserved exactly)
        const _authSupa = _createAuthClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        const _token = req.headers.authorization?.replace('Bearer ', '');
        if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { data: authData, error: _authErr } = await _authSupa.auth.getUser(_token);
        const _authUser = authData?.user;
        if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        try {
            const {
                mistakes,
                scenario,
                finalScore,
                position,
                stackDepth,
            } = req.body || {};

            const safeMistakes = Array.isArray(mistakes) ? mistakes : [];

            if (safeMistakes.length === 0) {
                return res.status(200).json({
                    success: true,
                    analysis: {
                        summary: 'Perfect game! Zero mistakes — locked-in execution at this stack depth.',
                        patternInsights: [],
                        recommendations: ['Keep this range type warm with one drill per day to maintain edge.'],
                    },
                    source: 'DETERMINISTIC_TEMPLATES',
                });
            }

            // Cache key (kept — even deterministic output benefits from caching)
            const sortedMistakes = safeMistakes
                .map(m => `${m.hand || '?'}:${m.userAction || '?'}>${m.correctAction || '?'}`)
                .sort()
                .join('|');
            const cacheParams = {
                mistakesHash: sortedMistakes,
                scenarioTitle: scenario?.title || null,
                position: position || null,
                stackDepth: stackDepth || null,
                finalScore: typeof finalScore === 'number' ? finalScore : null,
            };

            const cached = await getCachedResponse('analyze-game', cacheParams);
            if (cached) {
                return res.status(200).json({ ...cached, fromCache: true });
            }

            const patternInsights = detectPatterns(safeMistakes);
            const recommendations = buildRecommendations(
                patternInsights, safeMistakes, finalScore, position, stackDepth
            );
            const summary = buildSummary(safeMistakes, finalScore, position, stackDepth);

            const response = {
                success: true,
                analysis: {
                    summary,
                    patternInsights,
                    recommendations,
                },
                source: 'DETERMINISTIC_TEMPLATES',
                meta: {
                    mistakeCount: safeMistakes.length,
                    score: finalScore,
                    generatedAt: new Date().toISOString(),
                },
            };

            await setCachedResponse('analyze-game', cacheParams, response, 30);

            return res.status(200).json(response);
        } catch (error) {
            console.warn('[AnalyzeGame] Error:', error);
            const mistakeCount = req.body?.mistakes?.length || 0;
            return res.status(200).json({
                success: true,
                analysis: {
                    summary: `You made ${mistakeCount} mistake${mistakeCount !== 1 ? 's' : ''} this game. ${getEncouragement(req.body?.finalScore)}`,
                    patternInsights: [
                        { pattern: 'Range Construction', insight: 'Focus on memorizing starting ranges by position.' },
                    ],
                    recommendations: [
                        'Practice this scenario again to reinforce the correct plays.',
                        'Review the hands you missed most frequently.',
                    ],
                },
                source: 'DETERMINISTIC_FALLBACK',
                fallback: true,
                meta: {
                    mistakeCount,
                    score: req.body?.finalScore,
                    generatedAt: new Date().toISOString(),
                },
            });
        }
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {
            console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
        }
        console.warn('[API Error]', err);
        if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
