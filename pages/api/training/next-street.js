import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
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
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
// 2026-07-19 engine-audit runtime patches (see that module's header)
applyDeterministicEnginePatches(deterministicEngine);
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

      if (!gameId || !street || !boardCards) {
          return res.status(400).json({ success: false, error: 'gameId, street, and boardCards are required' });
      }

      try {
          // Parse board cards from comma-separated string
          const parsedBoardCards = boardCards.split(',').map(c => c.trim()).filter(Boolean);

          // Get PIO game config
          const gameConfig = pioQueryService.getGameConfig(gameId);
          if (!gameConfig) {
              return res.status(404).json({ success: false, error: 'Game config not found' });
          }

          // Deal a new card for the next street
          const SUITS = ['s', 'h', 'd', 'c'];
          const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
          const deadCards = new Set([...parsedBoardCards.map(c => c.toLowerCase())]);
          // Prefer real hero cards when provided (comma-separated, e.g. 'Ah,Kd')
          const CARD_RE = /^[2-9TJQKA][shdc]$/;
          const parsedHeroCards = rawHeroCards
              ? String(rawHeroCards).split(',').map(c => c.trim()).filter(Boolean)
              : [];
          const realHeroCards = parsedHeroCards.length === 2 && parsedHeroCards.every(c => CARD_RE.test(c))
              ? parsedHeroCards
              : null;
          // Add hero hand cards to dead cards
          if (realHeroCards) {
              realHeroCards.forEach(c => deadCards.add(c.toLowerCase()));
          } else if (heroHand && heroHand.length >= 2) {
              const r1 = heroHand[0], r2 = heroHand[1];
              const suffix = heroHand.length >= 3 ? heroHand[2] : '';
              if (r1 === r2) { deadCards.add(`${r1}h`); deadCards.add(`${r2}s`); }
              else if (suffix === 's') { deadCards.add(`${r1}s`); deadCards.add(`${r2}s`); }
              else { deadCards.add(`${r1}s`); deadCards.add(`${r2}h`); }
          }

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
              heroHand: heroHand || 'AKs',
              boardCards: newBoardCards,
              street,
              pot: parseFloat(pot) || 6,
              stackDepth: parseInt(stackDepth, 10) || 100,
              heroPosition: heroPosition || 'BTN',
              villainPosition: villainPosition || 'BB',
          });

          if (question) {
              // Attach the new card dealt
              question.scenario = {
                  ...question.scenario,
                  board: newBoardCards.join(' '),
                  isMultiStreet: true,
              };

              return res.status(200).json({
                  success: true,
                  question,
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
