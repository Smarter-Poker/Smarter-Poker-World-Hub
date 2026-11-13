/**
 * Arena Points, scoring v1.1 (approved for the I-1 build, Nov 12, 2026).
 *
 * Qualifying event: COMPLETED multi-table tournament, not a satellite, not a
 * Diamond Arena or certification-club event, not private.
 * F = entry rows (one per distinct player). Scoring finish: P <= ceil(15F/100).
 * Event points = round(10 * sqrt(F / P)), half away from zero.
 * Daily score = best 5 event points; weekly = best 10.
 * Ties: more wins, more scoring finishes, higher best single event, earlier
 * end time of that best event; still equal = shared rank shown as "T<n>".
 * Prize chips = settled main prizes only (source 'structure' with paid_at).
 * Satellite seats, tickets, bounties and playing stacks never count.
 */
export const SCORING_VERSION = 'arena-points-v1.1';
export const ELIGIBILITY_VERSION = 'e1.1';
export const STAFF_USERNAMES = ['kingfish', 'danimal', 'smarterpoker'];
export const HORSE_DISCLOSURE = 'Boards include Smarter.Poker horses, our AI players.';
export const CHIP_DISCLOSURE = 'Chips are play credits with no cash value. 18+.';

export function scoringCutoff(F) { return Math.floor((15 * F + 99) / 100); }

export function eventPoints(F, P) {
  if (!(F > 0) || !(P > 0) || P > scoringCutoff(F)) return 0;
  const x = 10 * Math.sqrt(F / P);
  return Math.sign(x) * Math.round(Math.abs(x)); // positive, so half rounds up = away from zero
}

const GAME_LABEL = { NLH: 'NLH', nlh: 'NLH', holdem: 'NLH', texas_holdem: 'NLH' };
export function gameLabel(g) {
  if (!g) return '';
  const s = String(g);
  if (GAME_LABEL[s]) return GAME_LABEL[s];
  return s.toUpperCase().replace(/_/g, ' ');
}

export function isOmaha(g) { return /^PLO|OMAHA/i.test(String(g || '')); }
export function isHoldem(g) { return /^(NLH|LHE|PLH|HOLDEM|TEXAS)/i.test(String(g || '')); }

export function excludedReason(ev) {
  if (ev.tournament_type && ev.tournament_type !== 'MTT') return 'not_mtt';
  if (ev.status !== 'COMPLETED') return 'not_completed';
  if (String(ev.variant || '').toLowerCase() === 'satellite') return 'satellite';
  if (String(ev.club_name || '') === 'Diamond Arena') return 'diamond_arena';
  if (/^Cert /.test(String(ev.club_name || ''))) return 'certification_club';
  if (ev.is_private) return 'private';
  return null;
}

/** An event is complete when every entry has a unique position 1..F and every structure prize is paid. */
export function isComplete(ev) {
  return ev.field > 0 && ev.positioned === ev.field && ev.distinct_positions === ev.field
    && ev.max_position === ev.field && ev.structure_unpaid === 0;
}

function profileMap(source) {
  const m = new Map();
  for (const p of source.profiles || []) m.set(p.id, p);
  return m;
}

export function classify(profile) {
  const username = String(profile?.username || '').toLowerCase();
  const staff = !!profile?.is_admin || STAFF_USERNAMES.includes(username);
  return { horse: !!profile?.is_horse, staff };
}

/**
 * Per-player scoring finishes over a set of qualifying, complete events.
 * Positions are taken from the source rows as recorded: nothing is re-ranked.
 */
export function collectFinishes(source, events) {
  const evById = new Map(events.map((e) => [e.id, e]));
  const out = new Map();
  for (const [tid, uid, pos] of source.players || []) {
    const ev = evById.get(tid);
    if (!ev || pos == null) continue;
    const pts = eventPoints(ev.field, pos);
    if (pts <= 0) continue;
    if (!out.has(uid)) out.set(uid, []);
    out.get(uid).push({ event_id: tid, event: eventTitle(ev), field: ev.field, position: pos, points: pts, ended_at: ev.ended_at, game_type: ev.game_type });
  }
  return out;
}

export function eventTitle(ev) {
  const g = gameLabel(ev.game_type);
  return g && !String(ev.name).includes(`(${g})`) ? `${ev.name} (${g})` : ev.name;
}

function prizeChips(source, eventIds) {
  const m = new Map();
  for (const y of source.payouts || []) {
    if (y.source !== 'structure' || !y.paid_at || !eventIds.has(y.tournament_id)) continue;
    m.set(y.user_id, (m.get(y.user_id) || 0) + Number(y.amount || 0));
  }
  return m;
}

function cmpFinish(a, b) {
  return b.points - a.points || String(a.ended_at).localeCompare(String(b.ended_at)) || String(a.event_id).localeCompare(String(b.event_id));
}

/** Rank players. cap = 5 (daily) or 10 (weekly / spotlights). */
export function rankPlayers(finishesByUser, cap, profiles, chips) {
  const rows = [];
  for (const [uid, list] of finishesByUser) {
    const sorted = [...list].sort(cmpFinish);
    const counted = sorted.slice(0, cap);
    const best = counted[0];
    const prof = profiles.get(uid) || {};
    rows.push({
      user_id: uid,
      name: prof.name || prof.username || 'Unknown player',
      avatar_url: prof.avatar_url || null,
      ...classify(prof),
      score: counted.reduce((s, f) => s + f.points, 0),
      wins: sorted.filter((f) => f.position === 1).length,
      scoring_finishes: sorted.length,
      best: best.points,
      best_ended_at: best.ended_at,
      prize_chips: chips ? Math.round(chips.get(uid) || 0) : 0,
      finishes: counted.map((f) => [f.event_id, f.event, f.field, f.position, f.points]),
    });
  }
  rows.sort((a, b) => b.score - a.score || b.wins - a.wins || b.scoring_finishes - a.scoring_finishes
    || b.best - a.best || String(a.best_ended_at).localeCompare(String(b.best_ended_at))
    || a.name.localeCompare(b.name) || a.user_id.localeCompare(b.user_id));
  const key = (r) => `${r.score}|${r.wins}|${r.scoring_finishes}|${r.best}|${r.best_ended_at}`;
  rows.forEach((r, i) => {
    r.rank = i > 0 && key(rows[i - 1]) === key(r) ? rows[i - 1].rank : i + 1;
  });
  rows.forEach((r, i) => {
    const shared = rows.some((o, j) => j !== i && o.rank === r.rank);
    r.rank_label = shared ? `T${r.rank}` : String(r.rank);
    const prev = rows[i - 1];
    if (prev && prev.score === r.score && prev.rank !== r.rank) {
      const by = prev.wins !== r.wins ? 'wins' : prev.scoring_finishes !== r.scoring_finishes ? 'scoring finishes'
        : prev.best !== r.best ? 'best single event' : 'earlier best finish';
      r.tie_note = `Tied at ${r.score}, placed on ${by}`;
    }
  });
  return rows;
}

/** Most points any single player could still add from incomplete events (sum of the 5 largest maxima). */
export function maxPendingGain(incomplete, cap) {
  return incomplete.map((e) => eventPoints(e.field || 0, 1)).sort((a, b) => b - a).slice(0, cap).reduce((s, x) => s + x, 0);
}

/**
 * Build the Daily Top 10 snapshot payload from a fn_daily_content_source read.
 * Returns {completeness: FINAL|PROVISIONAL|HELD, board: 'top10'|'top5'|'fallback', payload}.
 */
export function buildDailyBoard(source, { periodYmd, periodLabel, cap = 5, family = 'Daily Arena Top 10' } = {}) {
  const all = source.events || [];
  const excluded = {};
  const qualifying = [];
  for (const ev of all) {
    const why = excludedReason(ev);
    if (why) excluded[why] = (excluded[why] || 0) + 1; else qualifying.push(ev);
  }
  const complete = qualifying.filter(isComplete);
  const incomplete = qualifying.filter((e) => !isComplete(e));
  const profiles = profileMap(source);
  const ids = new Set(complete.map((e) => e.id));
  const ranked = rankPlayers(collectFinishes(source, complete), cap, profiles, prizeChips(source, ids));

  const nEvents = qualifying.length;
  const nScorers = ranked.length;
  let board = 'top10';
  if (nEvents < 10 || nScorers < 5) board = 'fallback';
  else if (nScorers < 10) board = 'top5';
  const size = board === 'top10' ? 10 : board === 'top5' ? 5 : 0;
  const shown = ranked.slice(0, size);
  const below = ranked[shown.length] || null;

  let completeness = 'FINAL';
  let pending = 0;
  if (incomplete.length) {
    pending = maxPendingGain(incomplete, cap);
    const scores = shown.map((r) => r.score).concat([below ? below.score : 0]);
    const gaps = scores.slice(1).map((s, i) => scores[i] - s);
    completeness = gaps.every((g) => g > pending) ? 'PROVISIONAL' : 'HELD';
  }

  // Every human scoring finish, not only the counted best 5.
  const humanAll = [];
  const finishes = collectFinishes(source, complete);
  for (const [uid, list] of finishes) {
    const c = classify(profiles.get(uid));
    if (c.horse || c.staff) continue;
    const prof = profiles.get(uid) || {};
    for (const f of list) humanAll.push({ user_id: uid, name: prof.name || prof.username, avatar_url: prof.avatar_url || null, event_id: f.event_id, event: f.event, field: f.field, position: f.position, event_points: f.points, ended_at: f.ended_at });
  }
  humanAll.sort((a, b) => b.event_points - a.event_points || a.position - b.position || String(a.ended_at).localeCompare(String(b.ended_at)));
  const callout = humanAll[0] ? { qualifies: true, ...humanAll[0], horse: false, staff: false } : { qualifies: false };

  return {
    completeness,
    board,
    payload: {
      family,
      period: { ymd: periodYmd, label: periodLabel, timezone: 'America/Chicago', from: source.from, to: source.to, basis: 'tournaments.ended_at' },
      source_read_at: source.read_at,
      scoring_version: SCORING_VERSION,
      eligibility_version: ELIGIBILITY_VERSION,
      board,
      completeness: {
        status: completeness, qualifying_events: nEvents, complete_events: complete.length,
        incomplete_events: incomplete.map((e) => e.id), max_pending_gain: pending, excluded,
      },
      rows: shown.map(({ best_ended_at, ...r }) => r),
      next_below_board: below ? { rank: below.rank, name: below.name, horse: below.horse, score: below.score,
        gap: shown.length ? shown[shown.length - 1].score - below.score : null } : null,
      human_callout: callout,
      totals: {
        events: nEvents, scoring_players: nScorers,
        entries: qualifying.reduce((s, e) => s + (e.field || 0), 0),
        biggest_field: qualifying.reduce((b, e) => (!b || e.field > b.field ? { id: e.id, event: eventTitle(e), field: e.field } : b), null),
      },
      disclosures: [HORSE_DISCLOSURE, CHIP_DISCLOSURE],
    },
  };
}
