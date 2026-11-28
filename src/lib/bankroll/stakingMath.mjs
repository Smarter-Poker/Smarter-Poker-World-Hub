// Staking deal arithmetic (makeup deals).
//
// A backer funds the player. A losing session is the backer's loss and adds to
// makeup; a winning session first repays makeup to the backer and only the
// profit beyond it is split. Makeup is path dependent, so a deal must be
// replayed in the order the sessions were PLAYED (ledger entry_date), not the
// order they happened to be linked. Linking last week's session after today's
// used to apply last week's result to today's makeup, which moved money
// between player and backer.
//
// Everything here works in whole cents so the two shares of a session always
// add up to its result exactly.

const toCents = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (cents) => (cents === 0 ? 0 : cents / 100);

/**
 * Normalise deal terms typed into the form. Returns { terms } or { error }.
 * The player split is an integer 0..100 (0 is a legal split; it used to be
 * replaced by 50). Starting makeup cannot be negative.
 */
export function normaliseStakingTerms(input = {}) {
  const rawSplit = String(input.split_percentage ?? '').trim();
  const split = Number(rawSplit);
  if (rawSplit === '' || !Number.isInteger(split) || split < 0 || split > 100) {
    return { error: 'Your Split Must Be A Whole Number From 0 To 100.' };
  }
  const rawMarkup = String(input.markup_percentage ?? '').trim();
  const markup = rawMarkup === '' ? 0 : Number(rawMarkup);
  if (!Number.isFinite(markup) || markup < 0 || markup > 1000 || !Number.isInteger(markup)) {
    return { error: 'Markup Must Be A Whole Number From 0 To 1000.' };
  }
  const rawMakeup = String(input.starting_makeup ?? '').trim();
  const makeup = rawMakeup === '' ? 0 : Number(rawMakeup);
  if (!Number.isFinite(makeup) || makeup < 0) {
    return { error: 'Starting Makeup Cannot Be Negative.' };
  }
  return {
    terms: {
      split_percentage: split,
      markup_percentage: markup,
      starting_makeup: fromCents(toCents(makeup)),
    },
  };
}

/** Split one session's result given the makeup carried into it. */
export function splitStakingSession({ grossResult, splitPercentage, makeupBefore = 0 }) {
  const gross = toCents(grossResult);
  const before = Math.max(0, toCents(makeupBefore));
  const pct = Math.min(100, Math.max(0, Number(splitPercentage) || 0));
  let player = 0;
  let after = before;
  if (gross > 0) {
    const payoff = Math.min(gross, before);
    after = before - payoff;
    player = Math.round(((gross - payoff) * pct) / 100);
  } else if (gross < 0) {
    after = before - gross;
  }
  // The backer's share is whatever the player did not take, so the two
  // always sum to the session result to the cent.
  const backer = gross - player;
  return {
    gross_result: fromCents(gross),
    player_share: fromCents(player),
    backer_share: fromCents(backer),
    makeup_before: fromCents(before),
    makeup_after: fromCents(after),
  };
}

/** Sort key: the day the session was played, then when it was linked. */
function playedOrder(a, b) {
  return (
    String(a.entry_date || '').localeCompare(String(b.entry_date || '')) ||
    String(a.start_time || '').localeCompare(String(b.start_time || '')) ||
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    String(a.ledger_entry_id || '').localeCompare(String(b.ledger_entry_id || ''))
  );
}

/**
 * Replay a whole deal. `sessions` are { ledger_entry_id, gross_result,
 * entry_date?, start_time?, created_at? }. Returns the sessions in played
 * order with recomputed shares and makeup, plus totals.
 */
export function replayStakingDeal({ startingMakeup = 0, splitPercentage, sessions = [] }) {
  let makeup = Math.max(0, toCents(startingMakeup));
  let gross = 0;
  let player = 0;
  let backer = 0;
  const rows = [...sessions].sort(playedOrder).map((session) => {
    const split = splitStakingSession({
      grossResult: session.gross_result,
      splitPercentage,
      makeupBefore: fromCents(makeup),
    });
    makeup = toCents(split.makeup_after);
    gross += toCents(split.gross_result);
    player += toCents(split.player_share);
    backer += toCents(split.backer_share);
    return { ...session, ...split };
  });
  return {
    sessions: rows,
    currentMakeup: fromCents(makeup),
    totals: {
      totalGrossResult: fromCents(gross),
      playerShare: fromCents(player),
      backerShare: fromCents(backer),
      sessionCount: rows.length,
    },
  };
}

const SPLIT_FIELDS = ['gross_result', 'player_share', 'backer_share', 'makeup_before', 'makeup_after'];

/** Stored rows whose split no longer matches the replay (cent comparison). */
export function stakingRowsToRewrite(stored = [], replayed = []) {
  const byId = new Map(stored.map((row) => [row.id, row]));
  return replayed.filter((row) => {
    const old = byId.get(row.id);
    return old && SPLIT_FIELDS.some((field) => toCents(old[field]) !== toCents(row[field]));
  });
}

/** A ledger entry can be linked when it is a played session inside the deal window and unlinked anywhere. */
export function linkableStakingEntries(entries = [], { startDate, endDate, linkedIds = new Set() } = {}) {
  return entries.filter(
    (entry) =>
      entry.category !== 'expense' &&
      !linkedIds.has(entry.id) &&
      (!startDate || String(entry.entry_date) >= startDate) &&
      (!endDate || String(entry.entry_date) <= endDate)
  );
}

const csvCell = (value) => {
  let text = value === null || value === undefined ? '' : String(value);
  // A cell beginning with = + - @ is run as a formula by spreadsheet apps.
  // Negative numbers are data, not formulas, so they stay as written.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};
export const toCsv = (rows) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

const money2 = (n) => (Number(n) || 0).toFixed(2);

/** Backer statement: one row per linked session in played order, then the deal totals. */
export function buildStakingStatementCsv(arrangement, replay, labels = {}) {
  const rows = [
    ['Staking Statement', arrangement.backer_name || ''],
    ['Your Split %', arrangement.split_percentage, 'Backer Split %', 100 - Number(arrangement.split_percentage || 0)],
    ['Markup %', arrangement.markup_percentage || 0, 'Starting Makeup', money2(arrangement.starting_makeup)],
    ['Start Date', arrangement.start_date || '', 'End Date', arrangement.end_date || ''],
    [],
    ['Date', 'Game', 'Result', 'Makeup Before', 'Your Share', 'Backer Share', 'Makeup After'],
    ...replay.sessions.map((s) => [
      s.entry_date || '',
      labels[s.category] || s.category || '',
      money2(s.gross_result),
      money2(s.makeup_before),
      money2(s.player_share),
      money2(s.backer_share),
      money2(s.makeup_after),
    ]),
    [],
    ['Sessions', replay.totals.sessionCount],
    ['Net Result', money2(replay.totals.totalGrossResult)],
    ['Your Share', money2(replay.totals.playerShare)],
    ['Backer Share', money2(replay.totals.backerShare)],
    ['Makeup Owed', money2(replay.currentMakeup)],
  ];
  return toCsv(rows);
}
