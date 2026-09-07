import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { randomUUID } from 'node:crypto';
/**
 * GET /api/training/next-street
 * Fetches the next street question for multi-street hand progression.
 * Uses the DeterministicGTOEngine to query solver data for turn/river.
 *
 * Query params:
 * - gameId: Game identifier
 * - heroHand: Hero's hand notation (e.g., 'AKs')
 * - boardCards: Current board cards (comma-separated, e.g., '3h,7c,7s,9d')
 * - street: Street to query ('turn' or 'river')
 * - pot: Current pot size in BB
 * - stackDepth: Stack depth in BB
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches, toHandClass } from '../../../src/engines/deterministicEnginePatches';
// 2026-07-19 engine-audit runtime patches (see that module's header)
applyDeterministicEnginePatches(deterministicEngine);
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
    enforceTrainingQuestionContract,
    isTrainingQuestionValid,
} from '../../../src/lib/training/questionContract.mjs';
import { SolverPolicyService } from '../../../src/services/SolverPolicyService.js';
import { persistCanonicalTrainingQuestions } from '../../../src/lib/training/cacheTruthPersistence.mjs';
import { trainingPersistenceUnavailableBody } from '../../../src/lib/training/trainingPersistence.mjs';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
export default async function handler(req, res) {
  try {
      withTiming(res);
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      // Auth
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const _authUser = authData?.user;
      if (authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      const { gameId, heroHand, heroCards: rawHeroCards, boardCards, street, pot, stackDepth, heroPosition, villainPosition } = req.query;

      if (!gameId || !street || !boardCards || !heroHand || !rawHeroCards || !heroPosition || !villainPosition) {
          return res.status(400).json({ success: false, error: 'Exact game, hand, board, and position state is required' });
      }

      try {
          // Parse board cards from comma-separated string
          const parsedBoardCards = boardCards.split(',').map(c => c.trim()).filter(Boolean);
          const targetStreet = String(street).toLowerCase();
          const CARD_RE = /^[2-9TJQKA][shdc]$/;
          const parsedHeroCards = String(rawHeroCards).split(',').map(c => c.trim()).filter(Boolean);
          const expectedPriorBoard = targetStreet === 'turn' ? 3 : targetStreet === 'river' ? 4 : 0;
          const validPositions = new Set(['UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
          const exactCards = [...parsedHeroCards, ...parsedBoardCards].map(card => card.toLowerCase());
          const parsedPot = Number.parseFloat(pot);
          if (expectedPriorBoard === 0
              || parsedBoardCards.length !== expectedPriorBoard
              || parsedHeroCards.length !== 2
              || ![...parsedBoardCards, ...parsedHeroCards].every(card => CARD_RE.test(card))
              || toHandClass(parsedHeroCards) !== toHandClass(String(heroHand))
              || new Set(exactCards).size !== exactCards.length
              || !validPositions.has(String(heroPosition).toUpperCase())
              || !validPositions.has(String(villainPosition).toUpperCase())
              || String(heroPosition).toUpperCase() === String(villainPosition).toUpperCase()
              || !Number.isFinite(parsedPot) || parsedPot <= 0) {
              return res.status(400).json({ success: false, error: 'Invalid exact next-street state' });
          }

          // Get PIO game config
          const gameConfig = pioQueryService.getGameConfig(gameId);
          if (!gameConfig) {
              return res.status(404).json({ success: false, error: 'Game config not found' });
          }

          // Deal a new card for the next street
          const SUITS = ['s', 'h', 'd', 'c'];
          const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
          const deadCards = new Set([...parsedBoardCards.map(c => c.toLowerCase())]);
          parsedHeroCards.forEach(c => deadCards.add(c.toLowerCase()));

          // Deal new card — IMP-5 FIX: Deterministic seeded RNG + PHASE 21 texture-weighted dealing
          const allCards = [];
          for (const r of RANKS) {
              for (const s of SUITS) {
                  if (!deadCards.has((r + s).toLowerCase())) {
                      allCards.push(r + s);
                  }
              }
          }

          // ●●● PHASE 21: Texture-weighted card selection ●●●
          // Weight cards that create more educational board textures:
          // - Flush-completing cards (3rd of suit on turn, 4th never forced)
          // - Straight-completing cards
          // - Overcards / undercards
          // - Board-pairing cards
          // This creates more interesting decision points for training
          const boardSuitCounts = {};
          const boardRankSet = new Set();
          const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
          parsedBoardCards.forEach(c => {
              const s = c[c.length - 1].toLowerCase();
              boardSuitCounts[s] = (boardSuitCounts[s] || 0) + 1;
              boardRankSet.add(c[0].toUpperCase());
          });
          const boardRankVals = parsedBoardCards.map(c => RANK_VALUES[c[0].toUpperCase()] || 0);
          const maxBoardRank = Math.max(...boardRankVals);

          const weightedCards = allCards.map(card => {
              const r = card[0].toUpperCase();
              const s = card[card.length - 1].toLowerCase();
              let weight = 1.0;

              // Flush draw potential (3rd suited card = interesting, but not 4th which is too obvious)
              if (boardSuitCounts[s] === 2) weight += 0.8;  // Creates flush draw
              if (boardSuitCounts[s] === 3) weight += 0.3;  // Completes flush (less common = more interesting)

              // Overcards to board (create interesting decision dynamics)
              if ((RANK_VALUES[r] || 0) > maxBoardRank) weight += 0.5;

              // Board-pairing cards (test for full house/trips understanding)
              if (boardRankSet.has(r)) weight += 0.6;

              // Connected cards for straight potential
              const rv = RANK_VALUES[r] || 0;
              const connectivity = boardRankVals.filter(v => Math.abs(v - rv) <= 2 && v !== rv).length;
              if (connectivity >= 2) weight += 0.4;

              return { card, weight };
          });

          // Seeded hash based on hero hand + board state for deterministic dealing
          let cardSeed = 0;
          const seedStr = `${heroHand || ''}_${boardCards}_${street}`;
          for (let i = 0; i < seedStr.length; i++) {
              cardSeed = ((cardSeed << 5) - cardSeed + seedStr.charCodeAt(i)) | 0;
          }

          // Weighted selection using seeded random
          const totalWeight = weightedCards.reduce((sum, wc) => sum + wc.weight, 0);
          const targetWeight = (Math.abs(cardSeed) % 10000) / 10000 * totalWeight;
          let cumulative = 0;
          let newCard = allCards[0]; // fallback
          for (const wc of weightedCards) {
              cumulative += wc.weight;
              if (cumulative >= targetWeight) {
                  newCard = wc.card;
                  break;
              }
          }
          const newBoardCards = [...parsedBoardCards, newCard];

          // Query solver for this street — inject service-role client
          deterministicEngine.setSupabaseClient(getSupabase());
          const question = await deterministicEngine.queryNextStreet({
              gameConfig,
              heroHand,
              boardCards: newBoardCards,
              street,
              pot: parsedPot,
              stackDepth: parseInt(stackDepth, 10) || 100,
              heroPosition,
              villainPosition,
          });

          if (question) {
              // Attach the new card dealt
              question.scenario = {
                  ...question.scenario,
                  board: newBoardCards.join(' '),
                  isMultiStreet: true,
              };

              const contracted = enforceTrainingQuestionContract(question);
              const canonical = new SolverPolicyService({ db: getSupabase() })
                  .attachToQuestion(contracted, 'next-street');
              if (!canonical?.id || !isTrainingQuestionValid(canonical)) {
                  return res.status(422).json({
                      success: false,
                      error: 'The next-street question did not pass the training integrity audit.',
                  });
              }
              let servedQuestion;
              try {
                  [servedQuestion] = await persistCanonicalTrainingQuestions(getSupabase(), {
                      questions: [canonical],
                      gameId,
                      questionKind: 'PIO',
                      gameType: String(gameId).startsWith('mtt-') ? 'tournament'
                          : String(gameId).startsWith('spins-') ? 'sng' : 'cash',
                      level: Math.min(12, Math.max(1, Number(canonical.level) || 1)),
                      userId: _authUser.id,
                      requestId: randomUUID(),
                      label: 'NextStreet:canonicalize',
                  });
              } catch (canonicalizeError) {
                  console.warn('[NextStreet] Refusing to serve an uncanonicalized question:', canonicalizeError.message);
                  return res.status(503).json(trainingPersistenceUnavailableBody());
              }

              return res.status(200).json({
                  success: true,
                  question: servedQuestion,
                  newCard,
                  boardCards: newBoardCards,
                  street,
              });
          }

          // No solver data for next street
          return res.status(200).json({
              success: false,
              error: 'No solver data available for next street',
              boardCards: newBoardCards,
              newCard,
          });

      } catch (err) {
          console.warn('[NextStreet] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
