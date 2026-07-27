/**
 * API: Opponent Matchmaking + Decision Engine
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GET  /api/training/horse-opponent      → Select a random opponent (from horse roster)
 * POST /api/training/horse-opponent      → Get opponent's decision for a game state
 *
 * The player never knows the opponent is AI. Responses look identical to
 * a real player's data. Internal _engine config drives decision personality.
 *
 * GET Response:
 *   { player: { id, name, avatar, rating, tier }, _engine: { ... } }
 *
 * POST Body:
 *   { personality: {...}, holeCards, boardCards, potSize, betToCall, etc. }
 *
 * POST Response:
 *   { action, amount, confidence, thinkTimeMs }
 *
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// 2026-07-19 AUDIT FIX: raw @supabase/supabase-js import violated repo rule #4
// (API routes must use the patched server client with JWT-decode fallback).
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
// ●● Lazy Supabase (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
    }
    return _supabase;
}

// ●● Fallback personalities (when DB is unavailable) ●●●●●●●●●●●●●●●●●●●●●●●
// Horses already have real names & profiles in content_authors table.
// These fallbacks are last resort only — personality drives AI decisions.
const FALLBACK_HORSES = [
    { name: 'PokerShark99', personality: { aggression: 8, humor: 4, technical: 9, contrarian: 3, gto: 'gto_purist', risk: 'aggressive' } },
    { name: 'SolverPro', personality: { aggression: 3, humor: 7, technical: 6, contrarian: 2, gto: 'balanced', risk: 'conservative' } },
    { name: 'RangeKing', personality: { aggression: 9, humor: 2, technical: 8, contrarian: 8, gto: 'exploitative', risk: 'degen' } },
    { name: 'NitHunter', personality: { aggression: 5, humor: 5, technical: 7, contrarian: 4, gto: 'balanced', risk: 'moderate' } },
    { name: 'BluffCatcher', personality: { aggression: 7, humor: 3, technical: 8, contrarian: 6, gto: 'exploitative', risk: 'aggressive' } },
    { name: 'EquityKid', personality: { aggression: 2, humor: 8, technical: 5, contrarian: 1, gto: 'gto_purist', risk: 'conservative' } },
    { name: 'ThreeBetQueen', personality: { aggression: 10, humor: 1, technical: 9, contrarian: 9, gto: 'exploitative', risk: 'degen' } },
    { name: 'GTO_Grinder', personality: { aggression: 4, humor: 6, technical: 7, contrarian: 3, gto: 'balanced', risk: 'moderate' } },
];

// ●● Preflop hand strength tiers ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
const PREMIUM_HANDS = new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AKo']);
const STRONG_HANDS = new Set(['TT', '99', 'AQs', 'AQo', 'AJs', 'KQs', 'ATs']);
const MEDIUM_HANDS = new Set(['88', '77', '66', 'AJo', 'KQo', 'KJs', 'QJs', 'JTs', 'ATo', 'A9s', 'A8s', 'KTs']);
const SPECULATIVE_HANDS = new Set(['55', '44', '33', '22', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', 'K9s', 'Q9s', 'J9s', 'T9s', '98s', '87s', '76s', '65s', '54s']);

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function classifyHand(card1, card2) {
    if (!card1 || !card2) return 'unknown';
    const r1 = card1[0], r2 = card2[0];
    const s1 = card1[1], s2 = card2[1];
    const [high, low] = RANKS.indexOf(r1) >= RANKS.indexOf(r2) ? [r1, r2] : [r2, r1];
    let key;
    if (high === low) key = `${high}${low}`;
    else if (s1 === s2) key = `${high}${low}s`;
    else key = `${high}${low}o`;

    if (PREMIUM_HANDS.has(key)) return 'premium';
    if (STRONG_HANDS.has(key)) return 'strong';
    if (MEDIUM_HANDS.has(key)) return 'medium';
    if (SPECULATIVE_HANDS.has(key)) return 'speculative';
    return 'weak';
}

// ●● Simple equity estimation (no Monte Carlo needed for training) ●●●●●●●●●
function estimateEquity(handClass, street, boardTexture) {
    const BASE = { premium: 0.82, strong: 0.68, medium: 0.55, speculative: 0.42, weak: 0.30, unknown: 0.40 };
    let eq = BASE[handClass] || 0.40;

    // Adjust for street (later streets = more info = less uncertainty)
    if (street === 'flop') eq *= 0.95;
    if (street === 'turn') eq *= 0.92;
    if (street === 'river') eq *= 0.88;

    // Texture adjustments
    if (boardTexture === 'monotone' && handClass !== 'premium') eq *= 0.85;
    if (boardTexture === 'paired') eq *= 1.05;
    if (boardTexture === 'dry') eq *= 1.08;

    return Math.min(0.95, Math.max(0.08, eq));
}

function classifyBoardTexture(boardCards) {
    if (!boardCards || boardCards.length < 3) return 'preflop';
    const suits = boardCards.map(c => c[1]);
    const ranks = boardCards.map(c => RANKS.indexOf(c[0]));

    const suitCounts = {};
    suits.forEach(s => { suitCounts[s] = (suitCounts[s] || 0) + 1; });
    const maxSuit = Math.max(...Object.values(suitCounts || {}));

    if (maxSuit >= 3) return 'monotone';

    const uniqueRanks = new Set(ranks);
    if (uniqueRanks.size < boardCards.length) return 'paired';

    const sorted = [...ranks].sort((a, b) => a - b);
    const spread = sorted[sorted.length - 1] - sorted[0];
    if (spread <= 4) return 'connected';
    if (spread >= 8) return 'dry';

    return maxSuit >= 2 ? 'two_tone' : 'rainbow';
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// HORSE AI DECISION ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function makeHorseDecision(gameState, personality) {
    const {
        holeCards = [],
        boardCards = [],
        potSize = 0,
        betToCall = 0,
        stackSize = 1000,
        bigBlind = 10,
        position = 'BTN',
        street = 'preflop',
        legalActions = ['fold', 'call', 'raise'],
    } = gameState;

    const handClass = holeCards.length >= 2 ? classifyHand(holeCards[0], holeCards[1]) : 'unknown';
    const boardTexture = classifyBoardTexture(boardCards);
    const equity = estimateEquity(handClass, street, boardTexture);
    const potOdds = betToCall > 0 ? betToCall / (potSize + betToCall) : 0;
    const spr = potSize > 0 ? stackSize / potSize : 10;

    // ●● Personality modulation ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
    const aggression = (personality?.aggression || 5) / 10;       // 0-1
    const contrarian = (personality?.contrarian || 5) / 10;       // 0-1
    const gtoStyle = personality?.gto || 'balanced';
    const riskProfile = personality?.risk || 'moderate';

    // Base GTO thresholds
    let foldThreshold = potOdds + 0.05;        // Fold if equity < pot odds + margin
    let raiseThreshold = 0.60;                 // Raise with 60%+ equity
    let betSizePct = 0.66;                     // 2/3 pot default

    // Aggression modulation
    raiseThreshold -= aggression * 0.15;        // Aggressive horses raise wider (0.45-0.60)
    betSizePct += (aggression - 0.5) * 0.3;    // Aggressive = bigger bets (0.51-0.81)
    foldThreshold -= aggression * 0.08;         // Aggressive horses fold less

    // Risk profile adjustments
    if (riskProfile === 'degen') {
        raiseThreshold -= 0.10;
        foldThreshold -= 0.10;
    } else if (riskProfile === 'conservative') {
        raiseThreshold += 0.08;
        foldThreshold += 0.05;
    }

    // GTO style adjustments
    if (gtoStyle === 'exploitative') {
        // Wider value range, more bluffs
        raiseThreshold -= 0.05;
        betSizePct += 0.10;
    } else if (gtoStyle === 'gto_purist') {
        // Tighter, more balanced frequencies
        raiseThreshold += 0.03;
        betSizePct = 0.66; // Standard sizing
    }

    // Contrarian: occasionally makes unexpected plays
    const contrRoll = Math.random();
    if (contrRoll < contrarian * 0.15) {
        // Surprise play — invert the obvious action
        if (equity > raiseThreshold && legalActions.includes('call')) {
            return buildDecision('call', null, 0.45, personality, 'slowplay');
        }
        if (equity < foldThreshold && legalActions.includes('raise')) {
            const bluffSize = Math.round(potSize * (0.5 + Math.random() * 0.5));
            return buildDecision('raise', bluffSize, 0.30, personality, 'bluff');
        }
    }

    // ●● SPR-aware postflop sizing ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
    if (street !== 'preflop' && spr < 3 && equity > 0.55 && legalActions.includes('raise')) {
        // Short SPR = commit or fold territory
        return buildDecision('raise', stackSize, 0.85, personality, 'spr_commit');
    }

    // ●● Decision tree ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

    // Preflop: use hand tiers
    if (street === 'preflop') {
        if (handClass === 'premium') {
            if (legalActions.includes('raise')) {
                const raiseSize = Math.round(bigBlind * (2.5 + aggression * 1.5));
                return buildDecision('raise', raiseSize, 0.92, personality, 'premium_raise');
            }
            return buildDecision('call', null, 0.88, personality, 'premium_call');
        }
        if (handClass === 'strong') {
            if (legalActions.includes('raise') && Math.random() < 0.65 + aggression * 0.2) {
                const raiseSize = Math.round(bigBlind * (2.2 + aggression));
                return buildDecision('raise', raiseSize, 0.78, personality, 'strong_raise');
            }
            if (legalActions.includes('call')) return buildDecision('call', null, 0.70, personality, 'strong_call');
        }
        if (handClass === 'medium') {
            if (betToCall <= bigBlind * 3 && legalActions.includes('call')) {
                return buildDecision('call', null, 0.55, personality, 'medium_call');
            }
            if (legalActions.includes('raise') && Math.random() < aggression * 0.4) {
                return buildDecision('raise', Math.round(bigBlind * 2.5), 0.45, personality, 'medium_raise');
            }
            if (betToCall > bigBlind * 4) return buildDecision('fold', null, 0.60, personality, 'medium_fold');
            if (legalActions.includes('call')) return buildDecision('call', null, 0.50, personality, 'medium_call');
        }
        if (handClass === 'speculative') {
            if (betToCall <= bigBlind * 2.5 && legalActions.includes('call') && Math.random() < 0.45 + aggression * 0.2) {
                return buildDecision('call', null, 0.40, personality, 'spec_call');
            }
            return buildDecision('fold', null, 0.70, personality, 'spec_fold');
        }
        // Weak hand
        if (legalActions.includes('check')) return buildDecision('check', null, 0.65, personality, 'weak_check');
        return buildDecision('fold', null, 0.80, personality, 'weak_fold');
    }

    // Postflop: equity-based
    if (equity >= raiseThreshold && legalActions.includes('raise')) {
        const raiseSize = Math.round(potSize * betSizePct);
        return buildDecision('raise', Math.max(raiseSize, bigBlind * 2), equity * 100, personality, 'value_raise');
    }
    if (equity >= raiseThreshold && legalActions.includes('bet')) {
        const betSize = Math.round(potSize * betSizePct);
        return buildDecision('bet', Math.max(betSize, bigBlind), equity * 100, personality, 'value_bet');
    }
    if (equity >= foldThreshold) {
        if (betToCall > 0 && legalActions.includes('call')) {
            return buildDecision('call', null, equity * 100, personality, 'equity_call');
        }
        if (legalActions.includes('check')) {
            return buildDecision('check', null, equity * 80, personality, 'check_back');
        }
    }
    if (legalActions.includes('check')) {
        return buildDecision('check', null, 0.40, personality, 'weak_check');
    }
    return buildDecision('fold', null, 0.70, personality, 'give_up');
}

function buildDecision(action, amount, confidence, personality, reasoning) {
    // Simulate human-like "thinking time" — 1.5-6 seconds with natural variance
    const baseThink = 1500 + Math.random() * 2500;
    const confidenceAdj = confidence > 70 ? -500 : confidence < 40 ? 800 : 0;
    // Add random jitter so timing doesn't feel mechanical
    const jitter = (Math.random() - 0.5) * 600;
    const thinkTimeMs = Math.round(Math.max(1000, baseThink + confidenceAdj + jitter));

    return {
        action,
        amount: amount ? Math.max(1, amount) : null,
        confidence: Math.round(Math.min(100, Math.max(5, typeof confidence === 'number' ? confidence : 50))),
        thinkTimeMs,
    };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// API HANDLER
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    // ●● GET: Select a random horse opponent ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
    if (req.method === 'GET') {
        try {
            const sb = getSupabase();
            let horse = null;

            if (sb) {
                // Load a random active horse from the DB — they already have real names & profiles
                const { data: horses, error } = await sb
                    .from('content_authors')
                    .select(`
                        id,
                        display_name,
                        avatar_url,
                        horse_personality (
                            aggression_level,
                            humor_level,
                            technical_depth,
                            contrarian_tendency,
                            gto_philosophy,
                            risk_tolerance
                        )
                    `)
                    .eq('is_active', true)
                    .limit(50);

                if (!error && horses && horses.length > 0) {
                    const pick = horses[Math.floor(Math.random() * horses.length)];
                    const p = pick.horse_personality?.[0] || pick.horse_personality || {};
                    const rating = 1200 + Math.floor(Math.random() * 600);
                    horse = {
                        // Public-facing fields — looks like a real player
                        id: pick.id,
                        name: pick.display_name || 'Player',
                        avatar: pick.avatar_url || null,
                        rating,
                        tier: getRankTierName(rating),
                        // Internal only — personality drives AI decisions, never exposed to UI
                        _personality: {
                            aggression: p.aggression_level || 5,
                            humor: p.humor_level || 5,
                            technical: p.technical_depth || 5,
                            contrarian: p.contrarian_tendency || 5,
                            gto: p.gto_philosophy || 'balanced',
                            risk: p.risk_tolerance || 'moderate',
                        },
                    };
                }
            }

            // Fallback if DB unavailable
            if (!horse) {
                const pick = FALLBACK_HORSES[Math.floor(Math.random() * FALLBACK_HORSES.length)];
                const rating = 1200 + Math.floor(Math.random() * 600);
                horse = {
                    id: `fb_${Date.now()}`,
                    name: pick.name,
                    avatar: null,
                    rating,
                    tier: getRankTierName(rating),
                    _personality: pick.personality,
                };
            }

            // Response looks identical to a real player joining — no AI indicators
            return res.status(200).json({
                player: {
                    id: horse.id,
                    name: horse.name,
                    avatar: horse.avatar,
                    rating: horse.rating,
                    tier: horse.tier,
                },
                // _internal: decision engine config (client stores this but never renders it)
                _engine: horse._personality,
            });
        } catch (err) {
            console.warn('[horse-opponent] GET error:', err.message);
            // Always return an opponent — never fail the matchmaking
            const pick = FALLBACK_HORSES[Math.floor(Math.random() * FALLBACK_HORSES.length)];
            const rating = 1200 + Math.floor(Math.random() * 400);
            return res.status(200).json({
                player: { id: `fb_${Date.now()}`, name: pick.name, avatar: null, rating, tier: getRankTierName(rating) },
                _engine: pick.personality,
            });
        }
    }

    // ●● POST: Get horse's decision for current game state ●●●●●●●●●●●●●●●●
    if (req.method === 'POST') {
        try {
            const { horseId, personality, ...gameState } = req.body;

            // If personality was passed in (cached from GET), use it directly
            let horsePersonality = personality;

            // Otherwise try to load from DB
            if (!horsePersonality && horseId && !horseId.startsWith('fallback_')) {
                const sb = getSupabase();
                if (sb) {
                    const { data } = await sb
                        .from('horse_personality')
                        .select('aggression_level, humor_level, technical_depth, contrarian_tendency, gto_philosophy, risk_tolerance')
                        .eq('profile_id', horseId)
                        .maybeSingle();

                    if (data) {
                        horsePersonality = {
                            aggression: data.aggression_level || 5,
                            humor: data.humor_level || 5,
                            technical: data.technical_depth || 5,
                            contrarian: data.contrarian_tendency || 5,
                            gto: data.gto_philosophy || 'balanced',
                            risk: data.risk_tolerance || 'moderate',
                        };
                    }
                }
            }

            // Fallback personality
            if (!horsePersonality) {
                horsePersonality = { aggression: 5, humor: 5, technical: 5, contrarian: 5, gto: 'balanced', risk: 'moderate' };
            }

            const decision = makeHorseDecision(gameState, horsePersonality);
            return res.status(200).json(decision);
        } catch (err) {
            try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
            console.warn('[horse-opponent] POST error:', err.message);
            // Fail gracefully — default to a check/fold
            return res.status(200).json({
                action: 'check',
                amount: null,
                confidence: 30,
                thinkTimeMs: 1500,
                reasoning: 'fallback',
            });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

function getRankTierName(rating) {
    if (rating >= 2200) return 'Diamond';
    if (rating >= 2000) return 'Platinum';
    if (rating >= 1800) return 'Gold';
    if (rating >= 1600) return 'Silver';
    if (rating >= 1400) return 'Bronze';
    return 'Iron';
}
