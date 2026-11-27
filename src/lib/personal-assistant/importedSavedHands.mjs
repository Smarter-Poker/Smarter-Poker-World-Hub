import { createHash } from 'node:crypto';
import { normalizeVariantLabel } from './savedHands.mjs';

const MAX_IMPORT_HANDS = 100;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function boardOf(hand) {
  const streets = hand.streets || {};
  const flop = Array.isArray(streets.flop?.board) ? streets.flop.board : [];
  const turn = streets.turn?.card || streets.turn?.board?.at(-1);
  const river = streets.river?.card || streets.river?.board?.at(-1);
  return [...flop, ...(turn ? [turn] : []), ...(river ? [river] : [])];
}

/** The review queue keeps imports private and distinct from authoritative Arena hands. */
export function buildImportedSavedHandRows({ userId, hands, evidenceScope, now = new Date() }) {
  if (!userId || !Array.isArray(hands) || hands.length === 0 || hands.length > MAX_IMPORT_HANDS) {
    throw new Error('A Bounded Set Of Parsed Hands And Its Authenticated Owner Are Required');
  }
  if (!['self_reported_live', 'external_upload'].includes(evidenceScope)) {
    throw new Error('An Explicit Import Evidence Scope Is Required');
  }
  const at = now.toISOString();
  const rows = new Map();
  for (const hand of hands) {
    if (!hand?.id || !hand?.site) throw new Error('Parsed Hand Identity Is Missing');
    const key = `pa-import:${digest(JSON.stringify([evidenceScope, hand.site, String(hand.id)]))}`;
    const board = boardOf(hand);
    const heroName = hand.hero?.name;
    const players = (Array.isArray(hand.players) ? hand.players : []).map((player) => {
      const isHero = Boolean(heroName && player.name === heroName);
      return {
        name: String(player.name || 'Player'),
        seatIndex: finite(player.seat),
        position: player.position || null,
        stack: finite(player.stack),
        isHero,
        holeCards: isHero && Array.isArray(hand.hero?.holeCards) ? [...hand.hero.holeCards] : [],
        cardsVisibility: isHero ? 'private' : 'hidden',
        showedCards: false,
      };
    });
    const streets = ['preflop', 'flop', 'turn', 'river'].flatMap((name) => {
      const street = hand.streets?.[name];
      if (!street) return [];
      return [{
        name,
        cards: board.slice(0, name === 'preflop' ? 0 : name === 'flop' ? 3 : name === 'turn' ? 4 : 5),
        actions: (Array.isArray(street.actions) ? street.actions : []).map((action) => ({
          playerName: String(action.player || 'Player'),
          action: String(action.action || 'action'),
          amount: finite(action.amount),
          position: action.position || null,
          isHero: Boolean(heroName && action.player === heroName),
        })),
      }];
    });
    rows.set(key, {
      id: `pa-import-${digest(JSON.stringify([userId, key]))}`,
      hand_id: key,
      user_id: userId,
      player_ids: [userId],
      table_id: 'Personal-Assistant-Import',
      club_id: null,
      hand_number: 0,
      variant: normalizeVariantLabel(hand.gameVariant || hand.variant),
      betting_structure: hand.bettingStructure === 'PL' ? 'pot_limit' : hand.bettingStructure === 'FL' ? 'fixed_limit' : 'no_limit',
      small_blind: finite(hand.smallBlind),
      big_blind: finite(hand.bigBlind),
      pot_total: finite(hand.result?.pot),
      winner_ids: [],
      hand_data: {
        source: 'manual',
        evidenceScope,
        importedHandId: String(hand.id),
        site: String(hand.site),
        format: hand.format === 'tournament' ? 'tournament' : 'cash',
        heroPosition: hand.hero?.position || null,
        heroCards: Array.isArray(hand.hero?.holeCards) ? [...hand.hero.holeCards] : [],
        players,
        communityCards: board,
        boards: board.length ? [{ index: 1, label: 'Board 1', cards: board }] : [],
        streets,
        // Imported evidence is never relabelled as a canonical Arena result.
        sourceHandId: null,
        strategySupported: hand.strategySupported === true,
        unsupportedReason: hand.unsupportedReason || null,
        review: { status: 'saved', notes: '', tags: [], revision: 1, updatedAt: at, analysisState: 'not_analyzed', analyzedAt: null, lastAuditSummary: null },
      },
      started_at: at,
      completed_at: at,
    });
  }
  return [...rows.values()];
}

/** Insert only. Retrying an import must never erase the player's subsequent review. */
export async function persistImportedSavedHands(db, options) {
  const rows = buildImportedSavedHandRows(options);
  let writeError = null;
  try {
    const write = await db.from('hand_histories').upsert(rows, {
      onConflict: 'hand_id,user_id',
      ignoreDuplicates: true,
    });
    writeError = write.error;
  } catch (error) {
    writeError = error;
  }
  // A lost acknowledgment can follow a committed insert. Read the same owner
  // and identities once before deciding the outcome; never retry the write here.
  const readback = await db.from('hand_histories')
    .select('id,hand_id,user_id')
    .eq('user_id', options.userId)
    .in('hand_id', rows.map((row) => row.hand_id));
  if (readback.error || !Array.isArray(readback.data)) throw new Error('Review Queue Readback Failed');
  const found = new Map(readback.data.filter((row) => row.user_id === options.userId).map((row) => [row.hand_id, row.id]));
  if (rows.some((row) => !found.get(row.hand_id))) {
    throw new Error(writeError ? 'Review Queue Write Could Not Be Confirmed' : 'Review Queue Readback Is Incomplete');
  }
  return { saved: true, count: rows.length, handIds: rows.map((row) => found.get(row.hand_id)) };
}
