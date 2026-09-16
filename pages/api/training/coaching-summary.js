/**
 * DETERMINISTIC POST-LEVEL COACHING (Operation Grok-Sweep — 2026-05)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Generates personalized post-level coaching feedback from one sealed,
 * server-owned Training session. The browser supplies only the session id;
 * every score, count, classification and measured-EV value is re-read from
 * the completed attempt projection. NO LLM.
 *
 * Prior implementation called grok-3 with `temperature: 0.7` to "synthesize"
 * coaching prose from the metrics — turning hard numbers into vague advice.
 * Every level completion fired a token-burning grok-3 call.
 *
 * The new implementation is pure template synthesis. Output shape preserved
 * exactly so the frontend (pages/hub/training/session-dashboard.js) renders
 * the same UI. Every claim in the prose is grounded in the input metrics.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import {
    deriveTrainingSessionAccuracy,
    projectTrainingSessionEvidence,
} from '../../../src/lib/training/sessionEvidence.mjs';

let _supabaseAdmin = null;
function getSupabaseAdmin() {
    if (!_supabaseAdmin) {
        _supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabaseAdmin;
}

// ●● Quotes (rotated deterministically by accuracy bucket) ●●●●●●●●●●●●●●●●●●●●
const QUOTES_HIGH = [
    '"The best players are always learning." - Daniel Negreanu',
    '"Discipline is remembering what you want." - common poker adage',
    '"Patience is the secret to winning poker." - Doyle Brunson',
    '"GTO is the foundation; reads are the building." - Phil Galfond',
];
const QUOTES_MID = [
    '"You can\'t lose what you don\'t put in the middle… but you can\'t win much, either." - Matt Damon, Rounders',
    '"Poker is a skill game pretending to be a chance game." - James Altucher',
    '"Every mistake is a lesson." - common training maxim',
    '"Aggression is the missing ingredient for most players." - Doug Polk',
];
const QUOTES_LOW = [
    '"Poker is a hard way to make an easy living." - Doyle Brunson',
    '"In poker, the difference between winning and losing is mostly choice." - common training maxim',
    '"You don\'t have to be perfect - you just have to be better than your opponent." - common adage',
    '"The cards don\'t care if you\'re tilted." - modern training reminder',
];

function pickQuote(accuracy, level) {
    const seed = (Number(level) || 1) * 7 + Math.floor(Number(accuracy) || 0);
    if (accuracy >= 80) return QUOTES_HIGH[seed % QUOTES_HIGH.length];
    if (accuracy >= 60) return QUOTES_MID[seed % QUOTES_MID.length];
    return QUOTES_LOW[seed % QUOTES_LOW.length];
}

// ●● Grade + headline ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function computeGrade(accuracy) {
    if (accuracy >= 90) return 'A';
    if (accuracy >= 80) return 'B';
    if (accuracy >= 70) return 'C';
    if (accuracy >= 60) return 'D';
    return 'F';
}

function buildHeadline({ accuracy, classificationCounts, gtowScore, streak }) {
    const acc = Number(accuracy) || 0;
    const cc = classificationCounts || {};
    const blunders = Number(cc.blunder) || 0;
    const bestCount = Number(cc.best) || 0;
    const score = Number(gtowScore);

    if (acc === 100) return 'Flawless Run - Every Recorded Decision Was Correct.';
    if (acc >= 90 && blunders === 0) return 'Excellent session - zero blunders, near-pure accuracy.';
    if (acc >= 90) return 'Strong run with one slip - ready for harder levels.';
    if (acc >= 80 && Number.isFinite(score) && score >= 75) return 'Solid Training Score - Your Decision Quality Is Sharpening.';
    if (acc >= 80) return 'Above the pass line - focus on the mixed-strategy spots.';
    if (acc >= 70) return 'Passing grade - the patterns below close the gap fastest.';
    if (acc >= 60 && bestCount > blunders) return 'You found more best plays than blunders - momentum is yours to keep.';
    if (acc >= 60) return 'Foundation is there - discipline on the boundary spots is the next step.';
    if (Number(streak) > 0) return `Tough run, but a ${streak}-question streak shows you can find the line.`;
    return 'Treat this as the data - patterns below are the fastest path forward.';
}

// ●● Strengths / areas to improve ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function buildStrengths({ accuracy, classificationCounts, positionStats, streak, gtowScore }) {
    const out = [];
    const cc = classificationCounts || {};
    const acc = Number(accuracy) || 0;
    const score = Number(gtowScore);

    if (acc >= 95) out.push('Near-perfect accuracy across the recorded decisions');
    else if (acc >= 80) out.push('Strong overall accuracy across the recorded decisions');

    const best = Number(cc.best) || 0;
    if (best >= 5) out.push(`Recorded ${best} BEST-classified decisions`);

    if (Number(streak) >= 5) out.push(`Recorded a ${streak}-question correct-answer streak`);

    if (Number.isFinite(score) && score >= 80) out.push('Training Score Above 80 - Strong Results Across The Recorded Session');

    // Best position
    if (positionStats && Object.keys(positionStats).length > 0) {
        const ranked = Object.entries(positionStats)
            .filter(([, s]) => (s?.total || 0) >= 3)
            .map(([pos, s]) => ({
                pos,
                acc: (s.correct || 0) / Math.max(1, s.total || 1),
                n: s.total,
            }))
            .sort((a, b) => b.acc - a.acc);
        if (ranked.length > 0 && ranked[0].acc >= 0.85) {
            out.push(`Strongest position: ${ranked[0].pos} (${Math.round(ranked[0].acc * 100)}% over ${ranked[0].n} hands)`);
        }
    }

    if (out.length === 0) {
        out.push('Completed the level with a fully recorded decision history');
    }
    return out.slice(0, 2);
}

function buildAreasToImprove({ accuracy, classificationCounts, weakSpots, positionStats, totalEVLoss }) {
    const out = [];
    const cc = classificationCounts || {};
    const acc = Number(accuracy) || 0;
    const blunders = Number(cc.blunder) || 0;
    const wrong = Number(cc.wrong) || 0;
    const inacc = Number(cc.inaccuracy) || 0;

    if (blunders >= 2) out.push(`${blunders} highest-severity mistakes this session - review their recorded answer evidence and spot labels`);
    else if (wrong >= 3) out.push(`${wrong} WRONG-classified actions - review the recorded explanations before choosing the next drill`);
    else if (inacc >= 3) out.push(`${inacc} INACCURACY-classified actions - review the recorded explanations before choosing the next drill`);

    // Top weak spot
    if (Array.isArray(weakSpots) && weakSpots.length > 0) {
        const ws = weakSpots[0];
        if (ws.position && ws.street && ws.spotType) {
            const rate = Math.round((ws.mistakeRate || 0) * 100);
            out.push(`${ws.position}/${ws.street} ${ws.spotType}: ${rate}% mistake rate - focus repetitions here`);
        }
    }

    // Worst position
    if (positionStats && Object.keys(positionStats).length > 0) {
        const ranked = Object.entries(positionStats)
            .filter(([, s]) => (s?.total || 0) >= 3)
            .map(([pos, s]) => ({
                pos,
                acc: (s.correct || 0) / Math.max(1, s.total || 1),
                n: s.total,
            }))
            .sort((a, b) => a.acc - b.acc);
        if (ranked.length > 0 && ranked[0].acc < 0.6) {
            out.push(`Weakest position: ${ranked[0].pos} (${Math.round(ranked[0].acc * 100)}%) - drill this position type next`);
        }
    }

    // EV loss callout
    if (typeof totalEVLoss === 'number' && totalEVLoss > 5) {
        out.push(`Measured EV loss: ${totalEVLoss.toFixed(1)}bb - review the solver-measured decisions contributing to this total`);
    }

    if (out.length === 0) {
        if (acc < 100) out.push('Push for higher consistency - shave the inaccuracies first, then chase BEST plays');
        else out.push('Maintain this level - drill the same range type tomorrow to lock in the pattern');
    }
    return out.slice(0, 2);
}

// ●● Detailed feedback (paragraph) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function buildDetailedFeedback({
    accuracy, gtowScore, totalEVLoss, classificationCounts,
    weakSpots, mistakes, level, crossSessionContext,
}) {
    const acc = Number(accuracy) || 0;
    const cc = classificationCounts || {};
    const score = Number(gtowScore);

    const sentences = [];

    // Sentence 1: headline + score frame
    const evLossStr = typeof totalEVLoss === 'number' ? ` and gave up ${totalEVLoss.toFixed(2)}bb in EV` : '';
    sentences.push(
        Number.isFinite(score)
            ? `You Finished Level ${level} At ${Math.round(acc)}% Accuracy With A Training Score Of ${Math.round(score)}/100${evLossStr}.`
            : `You finished Level ${level} at ${Math.round(acc)}% accuracy${evLossStr}.`
    );

    // Sentence 2: classification breakdown
    if (Object.keys(cc).length > 0) {
        const total = (cc.best || 0) + (cc.correct || 0) + (cc.inaccuracy || 0) + (cc.wrong || 0) + (cc.blunder || 0);
        if (total > 0) {
            sentences.push(
                `Move breakdown: ${cc.best || 0} BEST, ${cc.correct || 0} CORRECT, ${cc.inaccuracy || 0} inaccuracies, ${cc.wrong || 0} wrong, ${cc.blunder || 0} blunders.`
            );
        }
    }

    // Sentence 3: weak-spot specifics
    if (Array.isArray(weakSpots) && weakSpots.length > 0) {
        const ws = weakSpots[0];
        const rate = Math.round((ws.mistakeRate || 0) * 100);
        sentences.push(
            `Top leak: ${ws.position || '?'}/${ws.street || '?'} ${ws.spotType || ''} at ${rate}% mistake rate - that\'s the highest-leverage spot to drill.`
        );
    } else if (Array.isArray(mistakes) && mistakes.length > 0) {
        // Fall back to listing one mistake spot
        const m = mistakes[0];
        const pos = m?.question?.scenario?.heroPosition || '?';
        const street = m?.question?.scenario?.street || '?';
        sentences.push(
            `Most-Recent Miss: ${pos} On The ${street} - Review The Verified Answer And Re-Drill The Spot Type.`
        );
    }

    // Sentence 4: cross-session trend
    if (crossSessionContext?.milestones) {
        const m = crossSessionContext.milestones;
        if (m.trending === 'up') {
            sentences.push(`Cross-session trend: trending up over your last 5 scored sessions${m.trendDelta ? ` (+${m.trendDelta}pts)` : ''}.`);
        } else if (m.trending === 'down') {
            sentences.push(`Cross-session trend: down over your last 5 scored sessions${m.trendDelta ? ` (${m.trendDelta}pts)` : ''}. Review the recorded decisions before assigning a cause.`);
        } else if (m.last5Avg !== null && m.last5Avg !== undefined) {
            sentences.push(`Rolling 5-session average: ${m.last5Avg}%.`);
        }
    }

    return sentences.join(' ');
}

// ●● Recommended drill ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function buildRecommendedDrill({ weakSpots, positionStats, accuracy, level }) {
    if (Array.isArray(weakSpots) && weakSpots.length > 0) {
        const ws = weakSpots[0];
        return {
            name: `${ws.position || '?'}/${ws.street || '?'} ${ws.spotType || ''} drill`.trim(),
            reason: `Highest-leverage spot from this session at ${Math.round((ws.mistakeRate || 0) * 100)}% mistake rate.`,
        };
    }

    if (positionStats && Object.keys(positionStats).length > 0) {
        const worst = Object.entries(positionStats)
            .filter(([, s]) => (s?.total || 0) >= 3)
            .map(([pos, s]) => ({ pos, acc: (s.correct || 0) / Math.max(1, s.total || 1) }))
            .sort((a, b) => a.acc - b.acc)[0];
        if (worst && worst.acc < 0.7) {
            return {
                name: `${worst.pos} decision review`,
                reason: `Your recorded ${worst.pos} accuracy is ${Math.round(worst.acc * 100)}%. Review those explanations before selecting a matching drill.`,
            };
        }
    }

    if (accuracy >= 85) {
        return {
            name: `Level ${Math.min(10, Number(level) + 1)} - next difficulty tier`,
            reason: 'You\'ve cleared this level\'s threshold. Step up to keep the pattern fresh.',
        };
    }

    return {
        name: 'Re-run this level',
        reason: 'Solidify the patterns from this session before advancing.',
    };
}

function buildWeakSpotDrill(weakSpots) {
    if (!Array.isArray(weakSpots) || weakSpots.length === 0) return '';
    const ws = weakSpots[0];
    const parts = [];
    if (ws.position) parts.push(ws.position);
    if (ws.street) parts.push(`on the ${ws.street}`);
    if (ws.spotType) parts.push(`(${ws.spotType})`);
    return parts.length > 0 ? `Focus practice: ${parts.join(' ')}.` : '';
}

// ●● Coaching builder ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
function buildCoaching(input) {
    const accuracy = Number(input.accuracy) || 0;
    const grade = computeGrade(accuracy);
    const headline = buildHeadline(input);
    const strengths = buildStrengths(input);
    const areasToImprove = buildAreasToImprove(input);
    const detailedFeedback = buildDetailedFeedback(input);
    const recommendedDrill = buildRecommendedDrill(input);
    const weakSpotDrill = buildWeakSpotDrill(input.weakSpots);
    const motivationalQuote = pickQuote(accuracy, input.level);
    const readyForNextLevel = accuracy >= 70;

    return {
        overallGrade: grade,
        headline,
        strengths,
        areasToImprove,
        detailedFeedback,
        recommendedDrill,
        weakSpotDrill,
        motivationalQuote,
        readyForNextLevel,
    };
}

// ●● Handler ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
export default async function handler(req, res) {
    try {
        withTiming(res);
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            if (!applyRateLimit(req, res, LIMITS.write)) return;
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const bodySize = JSON.stringify(req.body || {}).length;
        if (bodySize > 51200) {
            return res.status(413).json({ success: false, error: 'Request body too large' });
        }

        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Authorization');

        // Auth
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
        const { user, error: authErr } = await getServerUserWithFallback(req, getSupabaseAdmin());
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const sessionId = String(req.body?.sessionId || '').trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
            return res.status(400).json({
                success: false,
                error: 'A valid verified Training session id is required.',
                code: 'TRAINING_COACHING_SESSION_REQUIRED',
            });
        }

        try {
            const sessionResult = await getSupabaseAdmin()
                .from('training_sessions')
                .select('id, user_id, game_id, game_name, level, hands_played, correct_count, accuracy, best_streak, gtow_score, score_scale, total_ev_loss, classification_counts, position_stats, hand_history, attempt_id')
                .eq('id', sessionId)
                .eq('user_id', user.id)
                .maybeSingle();
            if (sessionResult.error) throw sessionResult.error;
            const session = sessionResult.data;
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'The verified Training session was not found.',
                    code: 'TRAINING_COACHING_SESSION_NOT_FOUND',
                });
            }

            if (!session.attempt_id) {
                return res.status(409).json({
                    success: false,
                    error: 'Coaching is available only for a sealed Training attempt.',
                    code: 'TRAINING_COACHING_VERIFIED_ATTEMPT_REQUIRED',
                });
            }
            const attemptResult = await getSupabaseAdmin()
                .from('training_attempts')
                .select('id, user_id, status, practice_only')
                .eq('id', session.attempt_id)
                .eq('user_id', user.id)
                .eq('status', 'completed')
                .eq('practice_only', false)
                .maybeSingle();
            if (attemptResult.error) throw attemptResult.error;
            if (!attemptResult.data) {
                return res.status(409).json({
                    success: false,
                    error: 'This session is not a completed, progress-bearing Training attempt.',
                    code: 'TRAINING_COACHING_VERIFIED_ATTEMPT_REQUIRED',
                });
            }

            const recordedHands = Array.isArray(session.hand_history) ? session.hand_history : [];
            const evidence = projectTrainingSessionEvidence(session);
            const verifiedAccuracy = deriveTrainingSessionAccuracy(session);
            if (verifiedAccuracy === null) {
                return res.status(409).json({
                    success: false,
                    error: 'This sealed Training session does not contain a complete scored-decision record.',
                    code: 'TRAINING_COACHING_SCORE_UNAVAILABLE',
                });
            }
            const mistakes = recordedHands.filter((hand) => (
                hand?.isCorrect === false || hand?.is_correct === false
            ));
            const questionsAnswered = Number(session.hands_played) || 0;
            const questionsCorrect = Number(session.correct_count) || 0;
            const coaching = buildCoaching({
                gameId: session.game_id,
                gameName: session.game_name,
                level: Number(session.level) || 1,
                questionsAnswered,
                questionsCorrect,
                accuracy: verifiedAccuracy,
                streak: Number(session.best_streak) || 0,
                mistakes,
                gtowScore: evidence.gtow_score_signed,
                totalEVLoss: evidence.total_ev_loss,
                classificationCounts: session.classification_counts || {},
                positionStats: evidence.position_stats,
                weakSpots: [],
                crossSessionContext: null,
            });

            return res.status(200).json({
                success: true,
                coaching,
                generatedBy: 'sealed-training-attempt',
                sessionId: session.id,
                attemptId: session.attempt_id,
            });
        } catch (error) {
            console.warn('[Coaching] Error building coaching:', error?.message || error);
            return res.status(503).json({
                success: false,
                error: 'Verified coaching is temporarily unavailable. No estimated result was generated.',
                code: 'TRAINING_COACHING_UNAVAILABLE',
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
