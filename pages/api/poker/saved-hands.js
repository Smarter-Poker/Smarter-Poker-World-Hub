/**
 * Saved Hands API - the player's own uploaded hands (AI Hand Scanner).
 *
 *   GET  /api/poker/saved-hands         the caller's saved hands, newest first
 *   POST /api/poker/saved-hands         save one reviewed hand for the caller
 *
 * WHY THIS EXISTS (2026-10-19)
 * ---------------------------
 * /hub/hand-history saved a scanned hand straight from the browser into
 * public.hand_history and ignored the result. `authenticated` has no INSERT on
 * that table, so every save failed, and the page still said the hand was saved
 * - after the player had paid Diamonds for the scan. The read beside it named
 * columns hand_history does not have (player_ids, hand_data, pot_total ...), so
 * it errored as well and the list was always empty.
 *
 * Those columns are the shape of public.hand_histories, the per-player saved
 * hand table this page was built against (user_id, UNIQUE(hand_id, user_id)).
 * public.hand_history is the engine's dealt-hand record: 7.8M rows with stats,
 * mission and jackpot triggers, which a hand typed in from a screenshot must
 * never reach. So uploaded hands live in hand_histories, written here with the
 * service role for the verified caller only:
 *
 *   - identity comes from the bearer token, never from the body
 *   - user_id and player_ids are always the caller; nothing in the body can
 *     name another account
 *   - the stored hand_data is rebuilt server-side from validated fields;
 *     arbitrary JSON from the browser is not stored
 *   - hand_histories RLS stays as it is (club admins only), so reads also come
 *     through here, filtered to user_id = caller
 */
import { randomUUID } from 'crypto';
import { getServiceSupabase } from '../../../src/lib/apiSupabase';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

export const SAVED_HAND_TABLE_ID = 'AI-Scan';
const VARIANTS = ['NLH', 'PLO', 'PLO5', 'Mixed'];
const MAX_CHIPS = 1_000_000_000_000;
const LIST_COLUMNS =
  'id,table_id,club_id,hand_number,variant,small_blind,big_blind,player_ids,hand_data,pot_total,winner_ids,started_at,completed_at,created_at';

function cardList(value, max) {
  if (!Array.isArray(value) || value.length > max) return null;
  const cards = [];
  for (const c of value) {
    if (!Number.isInteger(c) || c < 0 || c > 51) return null;
    if (cards.includes(c)) return null;
    cards.push(c);
  }
  return cards;
}

function chips(value, { allowNegative = false } = {}) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (!allowNegative && n < 0) return null;
  if (Math.abs(n) > MAX_CHIPS) return null;
  return n;
}

/** Validate a POST body. Returns { hand } or { error }. Exported for tests. */
export function validateSavedHand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Hand Details Are Required' };
  const heroCards = cardList(body.heroCards ?? [], 6);
  if (!heroCards) return { error: 'Your Cards Are Not Valid Cards' };
  const boardCards = cardList(body.boardCards ?? [], 5);
  if (!boardCards) return { error: 'The Board Cards Are Not Valid Cards' };
  if (heroCards.some((c) => boardCards.includes(c))) return { error: 'A Card Cannot Be In Your Hand And On The Board' };
  const smallBlind = chips(body.smallBlind);
  const bigBlind = chips(body.bigBlind);
  const pot = chips(body.pot);
  const heroNet = chips(body.heroNet, { allowNegative: true });
  if (smallBlind === null || bigBlind === null || pot === null || heroNet === null) {
    return { error: 'Stakes, Pot And Amount Must Be Whole Numbers' };
  }
  const result = body.result === 'Won' ? 'Won' : body.result === 'Lost' ? 'Lost' : null;
  if (!result) return { error: 'Result Must Be Won Or Lost' };
  const variant = VARIANTS.includes(body.variant) ? body.variant : 'NLH';
  const signedNet = result === 'Lost' && heroNet > 0 ? -heroNet : heroNet;
  return { hand: { heroCards, boardCards, smallBlind, bigBlind, pot, heroNet: signedNet, result, variant } };
}

/** The stored row for a validated hand. Exported for tests. */
export function savedHandRow(userId, hand, now = new Date()) {
  const id = `ai-scan-${randomUUID()}`;
  const at = now.toISOString();
  const { heroCards, boardCards } = hand;
  return {
    id,
    hand_id: id,
    user_id: userId,
    player_ids: [userId],
    table_id: SAVED_HAND_TABLE_ID,
    club_id: null,
    hand_number: 0,
    variant: hand.variant,
    betting_structure: 'no_limit',
    small_blind: hand.smallBlind,
    big_blind: hand.bigBlind,
    pot_total: hand.pot,
    winner_ids: hand.result === 'Won' ? [userId] : [],
    hand_data: {
      source: 'ai-scan',
      players: [
        { id: userId, seatIndex: 1, holeCards: heroCards, netResult: hand.heroNet, showedCards: heroCards.length > 0 },
      ],
      winners: hand.result === 'Won' ? [{ hand: 'Winning Hand', amount: hand.pot }] : [],
      communityCards: boardCards,
      streets: {
        flop: { cards: boardCards.slice(0, 3), actions: [] },
        turn: { cards: boardCards.slice(3, 4), actions: [] },
        river: { cards: boardCards.slice(4, 5), actions: [] },
      },
    },
    started_at: at,
    completed_at: at,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
    res.setHeader('Cache-Control', 'private, no-store');

    const supabase = getServiceSupabase();
    const { user, error: authError, status: authStatus } = await getServerUserWithFallback(req, supabase);
    if (authError || !user?.id) {
      return res.status(authStatus || 401).json({ success: false, error: 'Sign In To Use Your Hand History' });
    }

    if (req.method === 'GET') {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '200'), 10) || 200, 1), 1000);
      const { data, error } = await supabase
        .from('hand_histories')
        .select(LIST_COLUMNS)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) {
        console.warn('[saved-hands] list failed:', error.message);
        return res.status(500).json({ success: false, error: 'Could Not Load Your Saved Hands' });
      }
      return res.status(200).json({ success: true, hands: data || [] });
    }

    const { hand, error: invalid } = validateSavedHand(req.body);
    if (invalid) return res.status(400).json({ success: false, error: invalid });

    const row = savedHandRow(user.id, hand);
    const { data, error } = await supabase.from('hand_histories').insert(row).select(LIST_COLUMNS).maybeSingle();
    if (error || !data) {
      console.warn('[saved-hands] insert failed:', error?.message || 'no row returned');
      return res.status(500).json({ success: false, error: 'Could Not Save This Hand' });
    }
    return res.status(201).json({ success: true, hand: data });
  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[saved-hands] report failed:', _reportError?.message || _reportError); }
    console.warn('[saved-hands] error:', err?.message || err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
