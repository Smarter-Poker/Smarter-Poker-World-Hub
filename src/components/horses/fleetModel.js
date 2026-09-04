/**
 * FLEET MODEL - every decision the Fleet Command tab makes, as pure functions.
 *
 * The panel renders; this file decides. Heartbeat freshness, the state counts,
 * the headroom arithmetic, the isolation report's empty state and the shape of
 * the P and L all live here so they can be unit tested without a DOM and so
 * "is the engine alive" cannot be answered two different ways on two parts of
 * one screen.
 *
 * THE ONE RULE THAT SHAPES THE WHOLE FILE: A NUMBER NOBODY MEASURED IS NOT A
 * NUMBER. PHASE1-CONTRACTS addendum item 15 and the Phase 3 migration's own
 * header both say it - an absent source reports zero AND says the source was
 * absent, so a zero is never mistaken for a measurement. Every function here
 * returns null where it does not know, never 0, and carries the sentence that
 * says why.
 *
 * Pure module: no imports, safe to unit test under `node --test`.
 */

// ═══════════════════════════════════════════════════════════════════════════
// HEARTBEAT FRESHNESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * THE ENGINE'S MAINTENANCE BREAK, as this console understands it.
 *
 * The engine takes an hourly break at :55 and comes back at the top of the
 * hour. During it the seeding cycle does not run, so no heartbeat is written,
 * so the newest beat gets older by exactly the length of the break every hour,
 * every hour, forever. A freshness check that does not know this cries wolf on
 * the same five minutes of every hour, and an alarm that is wrong on schedule
 * is an alarm nobody reads.
 *
 * WHERE THIS NUMBER COMES FROM, HONESTLY. `engine_maintenance_break` is a real
 * table in production carrying phase, reason and enforce_freeze, but there is
 * no route that reads it and no console control over it yet
 * (STABLE-ADMIN-OVERHAUL-PLAN C2), so this repository holds no authoritative
 * copy of the schedule. This constant is the hourly window the break has run
 * on, written down in one place and named, rather than a magic 55 buried in a
 * comparison. When the break becomes readable, this is the one thing that has
 * to change.
 */
export const MAINTENANCE_BREAK = Object.freeze({
  startMinute: 55,
  lengthMinutes: 5,
  label: 'The Hourly Maintenance Break',
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const BREAK_START_MS = MAINTENANCE_BREAK.startMinute * MINUTE_MS;
const BREAK_LENGTH_MS = MAINTENANCE_BREAK.lengthMinutes * MINUTE_MS;

/** How long the heartbeat may be silent before the console says so. */
export const DEFAULT_STALE_AFTER_SECONDS = 300;

function toMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Total break milliseconds elapsed between the epoch and `t`. O(1), exact. */
function breakMsBefore(t) {
  if (!Number.isFinite(t) || t <= 0) return 0;
  const hours = Math.floor(t / HOUR_MS);
  const rem = t - hours * HOUR_MS;
  const partial = Math.min(Math.max(rem - BREAK_START_MS, 0), BREAK_LENGTH_MS);
  return hours * BREAK_LENGTH_MS + partial;
}

/** True when this instant falls inside an hourly maintenance break. */
export function isInMaintenanceBreak(at) {
  const ms = toMs(at);
  if (ms === null) return false;
  const rem = ((ms % HOUR_MS) + HOUR_MS) % HOUR_MS;
  return rem >= BREAK_START_MS && rem < BREAK_START_MS + BREAK_LENGTH_MS;
}

/** Milliseconds of maintenance break inside [from, to]. Zero when inverted. */
export function maintenanceBreakOverlapMs(from, to) {
  const a = toMs(from);
  const b = toMs(to);
  if (a === null || b === null || b <= a) return 0;
  return Math.max(0, breakMsBefore(b) - breakMsBefore(a));
}

export const HEARTBEAT_STATUS = Object.freeze({
  NEVER: 'never',
  FRESH: 'fresh',
  BREAK: 'stale_in_break',
  STALE: 'stale',
});

/**
 * IS THE ENGINE ALIVE?
 *
 * Four answers, and the fourth one is the reason this function exists:
 *
 *   never          No heartbeat has ever been recorded. That is not a stale
 *                  fleet, it is an engine that has never published, and the
 *                  two need different sentences: one is an outage, the other
 *                  is a feature that has not shipped in the engine repo yet.
 *   fresh          The last beat is inside the threshold.
 *   stale_in_break The last beat is outside the threshold, but subtracting
 *                  the maintenance break the engine is entitled to takes it
 *                  back inside. This is the DO NOT CRY WOLF case: the console
 *                  says "During The Maintenance Break" and keeps its voice
 *                  down, because a known blackout is not an incident.
 *   stale          Outside the threshold with the break already accounted
 *                  for. This one is stated loudly.
 *
 * The clock is the SERVER's. `now` comes from the route's `serverNow`, not
 * from Date.now(), because the browser's clock is not the one the beats were
 * stamped by and a laptop three minutes fast would otherwise invent an outage.
 *
 * @returns {{ status, ageSeconds, awakeSeconds, breakSeconds, inBreak,
 *             clockSkew, headline, detail, tone, loud }}
 */
export function classifyHeartbeat({
  beatAt = null,
  now = null,
  staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS,
} = {}) {
  const nowMs = toMs(now) ?? Date.now();
  const beatMs = toMs(beatAt);
  const threshold = Number.isFinite(Number(staleAfterSeconds))
    ? Math.max(1, Number(staleAfterSeconds))
    : DEFAULT_STALE_AFTER_SECONDS;

  if (beatMs === null) {
    return {
      status: HEARTBEAT_STATUS.NEVER,
      ageSeconds: null,
      awakeSeconds: null,
      breakSeconds: 0,
      inBreak: false,
      clockSkew: false,
      tone: 'warn',
      loud: true,
      headline: 'The Engine Has Never Published A Heartbeat',
      detail:
        'No Cycle Has Ever Been Recorded. Everything On This Tab That Comes From The Engine Is Empty Because Nothing Has Written It Yet, Not Because The Fleet Is Idle.',
    };
  }

  const ageSeconds = Math.round((nowMs - beatMs) / 1000);
  const inBreak = isInMaintenanceBreak(nowMs);

  // A beat stamped in the future is a clock disagreement, not freshness. It is
  // reported as fresh - the engine plainly just wrote - and flagged, because
  // silently trusting it would hide a real skew.
  if (ageSeconds < 0) {
    return {
      status: HEARTBEAT_STATUS.FRESH,
      ageSeconds,
      awakeSeconds: ageSeconds,
      breakSeconds: 0,
      inBreak,
      clockSkew: true,
      tone: 'info',
      loud: false,
      headline: 'The Heartbeat Is Ahead Of The Server Clock',
      detail:
        'The Newest Beat Is Stamped In The Future. The Engine Is Publishing, But One Of The Two Clocks Is Wrong.',
    };
  }

  if (ageSeconds <= threshold) {
    return {
      status: HEARTBEAT_STATUS.FRESH,
      ageSeconds,
      awakeSeconds: ageSeconds,
      breakSeconds: 0,
      inBreak,
      clockSkew: false,
      tone: 'good',
      loud: false,
      headline: 'The Engine Is Publishing',
      detail: `The Last Cycle Was ${formatGap(ageSeconds)} Ago.`,
    };
  }

  const breakSeconds = Math.round(maintenanceBreakOverlapMs(beatMs, nowMs) / 1000);
  const awakeSeconds = Math.max(0, ageSeconds - breakSeconds);

  if (breakSeconds > 0 && awakeSeconds <= threshold) {
    return {
      status: HEARTBEAT_STATUS.BREAK,
      ageSeconds,
      awakeSeconds,
      breakSeconds,
      inBreak,
      clockSkew: false,
      tone: 'info',
      loud: false,
      headline: `The Gap Falls During ${MAINTENANCE_BREAK.label}`,
      detail:
        `The Last Cycle Was ${formatGap(ageSeconds)} Ago, And ${formatGap(breakSeconds)} Of That ` +
        `Was ${MAINTENANCE_BREAK.label} At ${MAINTENANCE_BREAK.startMinute} Minutes Past The Hour. ` +
        'Outside The Break The Engine Has Been Publishing Normally, So This Is A Known Blackout And Not An Outage.',
    };
  }

  return {
    status: HEARTBEAT_STATUS.STALE,
    ageSeconds,
    awakeSeconds,
    breakSeconds,
    inBreak,
    clockSkew: false,
    tone: 'danger',
    loud: true,
    headline: 'The Heartbeat Is Stale',
    detail:
      `The Last Cycle Was ${formatGap(ageSeconds)} Ago` +
      (breakSeconds > 0 ? `, And Only ${formatGap(breakSeconds)} Of That Was ${MAINTENANCE_BREAK.label}` : '') +
      '. Every State Count On This Tab Is As Old As That Beat, Because The Engine Publishes Them Together.',
  };
}

/** A gap in seconds, as a human reads it. Title Case, house rule. */
export function formatGap(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return 'An Unknown Time';
  const abs = Math.abs(Math.round(n));
  if (abs < 60) return `${abs} Second${abs === 1 ? '' : 's'}`;
  const minutes = Math.round(abs / 60);
  if (minutes < 60) return `${minutes} Minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} Hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `${days} Day${days === 1 ? '' : 's'}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE COUNTS AND HEADROOM
// ═══════════════════════════════════════════════════════════════════════════

/** ca_horse_fleet_state.state, in the order the Health tab reads them. */
export const FLEET_STATES = Object.freeze([
  'playing',
  'seated',
  'idle',
  'sitting_out',
  'busted',
  'suspended',
  'retired',
  'unknown',
]);

export const FLEET_STATE_LABELS = Object.freeze({
  playing: 'Playing',
  seated: 'Seated',
  idle: 'Idle',
  sitting_out: 'Sitting Out',
  busted: 'Busted',
  suspended: 'Suspended',
  retired: 'Retired',
  unknown: 'Unknown',
});

export function fleetStateLabel(state) {
  return FLEET_STATE_LABELS[String(state || '')] || 'Unknown';
}

/** The two states that mean this horse is holding a seat right now. */
export const SEATED_STATES = Object.freeze(['seated', 'playing']);

function countOf(map, key) {
  const value = map && typeof map === 'object' ? map[key] : undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The state counts, every state present even at zero.
 *
 * A tab that hides `busted` because it happens to be zero teaches the operator
 * that busted is not a thing. The RPC returns all eight for the same reason;
 * this keeps them all through the client too.
 *
 * `total` is the RPC's own total where it sent one, because summing the map
 * would silently agree with itself about a map that arrived truncated.
 */
export function summariseStates(overview) {
  const states = overview && typeof overview === 'object' ? overview.states : null;
  const known = states && typeof states === 'object';
  const rows = FLEET_STATES.map((state) => ({
    state,
    label: fleetStateLabel(state),
    count: known ? countOf(states, state) : null,
  }));
  const summed = known ? rows.reduce((acc, r) => acc + (r.count || 0), 0) : null;
  const reported = typeof overview?.total === 'number' ? overview.total : null;
  const seated = known ? SEATED_STATES.reduce((acc, s) => acc + countOf(states, s), 0) : null;
  const stuck = typeof overview?.stuck === 'number' ? overview.stuck : null;

  return {
    known,
    rows,
    total: reported !== null ? reported : summed,
    // The two can only differ if the payload was assembled from two reads. If
    // they do, the panel says so rather than picking one.
    totalDisagrees: reported !== null && summed !== null && reported !== summed,
    seated,
    idle: known ? countOf(states, 'idle') : null,
    stuck,
    // A horse holding a seat that has not acted inside the window. Never a
    // percentage of a total we may not have.
    stuckShare: stuck !== null && seated ? stuck / seated : null,
  };
}

/**
 * Capacity, and what is genuinely unknown about it.
 *
 * `fn_ca_fleet_overview` returns null for every capacity field whose source
 * it could not read, and it names the source in `capacity.sources`. Those
 * nulls travel all the way to the screen: an occupancy percentage computed
 * from a missing denominator is a fabricated number, and this tab exists to
 * be believed.
 *
 * CLAUDE.md 10.5: these are seats, not horse seats. A horse counts everywhere
 * a human counts, so `seatsFilled` is every occupied seat on the platform.
 */
export function capacityModel(capacity) {
  const c = capacity && typeof capacity === 'object' ? capacity : {};
  const numberOrNull = (v) => {
    const n = Number(v);
    return v === null || v === undefined || !Number.isFinite(n) ? null : n;
  };
  const tablesLive = numberOrNull(c.tables_live);
  const seatsTotal = numberOrNull(c.seats_total);
  const seatsFilled = numberOrNull(c.seats_filled);
  const seatsFree = numberOrNull(c.seats_free);
  const missing = [];
  const sources = c.sources && typeof c.sources === 'object' ? c.sources : {};
  if (sources.tables === false) missing.push('tables');
  if (sources.table_seats === false) missing.push('table_seats');

  return {
    tablesLive,
    seatsTotal,
    seatsFilled,
    seatsFree,
    occupancy: seatsTotal && seatsTotal > 0 && seatsFilled !== null ? seatsFilled / seatsTotal : null,
    missing,
    complete: missing.length === 0,
    note: missing.length
      ? `Capacity Is Incomplete: ${missing.join(' And ')} Could Not Be Read, So The Missing Figures Are Shown As Not Known Rather Than As Zero.`
      : null,
  };
}

export const ALLOCATION_STATUS = Object.freeze({
  NO_QUOTA: 'no_quota',
  UNDER: 'under',
  AT_CAP: 'at_cap',
  OVER_CAP: 'over_cap',
});

export const ALLOCATION_LABELS = Object.freeze({
  no_quota: 'No Cap',
  under: 'Under Cap',
  at_cap: 'At Cap',
  over_cap: 'Over Cap',
});

/**
 * Per-club allocation: how many horses a club is carrying against the cap its
 * effective policy sets.
 *
 * OVER CAP IS NOT AN EVICTION ORDER, and the note says so. A cap lowered under
 * a club that is already above it means the engine seats nobody new there; it
 * never removes a seated horse, because there is no mechanism that could and
 * PHASE3-CONTRACTS section 0 forbids inventing one. The fleet drains through
 * the paths that already exist.
 */
export function clubAllocation(clubs) {
  const list = Array.isArray(clubs) ? clubs : [];
  return list.map((row) => {
    const actual = Number(row?.actual);
    const seated = Number(row?.seated);
    const quota = row?.quota === null || row?.quota === undefined ? null : Number(row.quota);
    const hasQuota = quota !== null && Number.isFinite(quota);
    const headroom = hasQuota && Number.isFinite(actual) ? quota - actual : null;
    let status = ALLOCATION_STATUS.NO_QUOTA;
    if (headroom !== null) {
      if (headroom > 0) status = ALLOCATION_STATUS.UNDER;
      else if (headroom === 0) status = ALLOCATION_STATUS.AT_CAP;
      else status = ALLOCATION_STATUS.OVER_CAP;
    }
    return {
      clubId: row?.club_id || null,
      // The route joins the club names onto the overview's per-club rows
      // (review M-5): `club_label` is the name and `club_code` the short code,
      // and the panel prefers the name, falls back to the code and only then
      // shows the raw id. A screen an operator opens to decide which club to
      // cap has to be able to name the club.
      clubLabel: row?.club_label || null,
      clubCode: row?.club_code || null,
      actual: Number.isFinite(actual) ? actual : null,
      seated: Number.isFinite(seated) ? seated : null,
      quota: hasQuota ? quota : null,
      headroom,
      status,
      statusLabel: ALLOCATION_LABELS[status],
      enabled: row?.enabled === undefined ? null : row.enabled === true,
      paused: row?.paused === undefined ? null : row.paused === true,
      note:
        status === ALLOCATION_STATUS.OVER_CAP
          ? 'This Club Is Carrying More Horses Than Its Cap Allows. The Engine Will Seat Nobody New Here. Nothing Removes A Seated Horse, So It Drains Through Bust-Outs And The Session Rotator.'
          : null,
    };
  });
}

/**
 * WHY WAS NOTHING SEATED LAST CYCLE?
 *
 * The engine writes its reason into `detail.reason` on the heartbeat when it
 * withholds seating, precisely so a stopped fleet can explain itself rather
 * than looking broken. A cycle with no reason recorded is reported as that -
 * not as "everything is fine".
 */
export function lastCycleReason(beat) {
  const detail = beat && typeof beat === 'object' ? beat.detail : null;
  const reason = detail && typeof detail === 'object' ? detail.reason : null;
  const seated = Number(beat?.seats_filled);
  const filledAny = Number.isFinite(seated) && seated > 0;
  if (typeof reason === 'string' && reason.trim()) {
    return { reason: reason.trim(), stated: true, seatsFilled: Number.isFinite(seated) ? seated : null };
  }
  if (!beat) return { reason: null, stated: false, seatsFilled: null };
  return {
    reason: filledAny ? null : 'The Last Cycle Seated Nobody And Recorded No Reason.',
    stated: false,
    seatsFilled: Number.isFinite(seated) ? seated : null,
  };
}

/** The engine fell back to its hardcoded defaults on its last cycle. */
export function degradedNote(beat) {
  if (!beat || beat.degraded !== true) return null;
  return 'The Engine Could Not Read The Fleet Policy On Its Last Cycle And Fell Back To Its Built-In Defaults, Which Are Today Behaviour. Nothing On The Policy Tab Was In Force For That Cycle.';
}

// ═══════════════════════════════════════════════════════════════════════════
// ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

export const ISOLATION_STATE = Object.freeze({
  CLEAN: 'clean',
  FINDINGS: 'findings',
  INCOMPLETE: 'incomplete',
  UNKNOWN: 'unknown',
});

/** The RPC's own sentence, kept as the fallback so the two never diverge. */
const ISOLATION_RULING =
  'A Horse Plays Inside Its Own Club Or Union Only. An Empty Report Is The Correct Answer.';

/**
 * The isolation report's four states.
 *
 * THE ONE THAT MATTERS IS `incomplete`. `fn_ca_fleet_isolation_report` answers
 * with zero rows and `complete: false` when a source it needs is missing, and
 * zero rows is also what a clean fleet looks like. Rendering the first as the
 * second would put "No Horse Is In Two Clubs" on a screen where nothing
 * actually looked, which is the worst sentence this tab could produce.
 */
export function isolationState(payload) {
  const p = payload && typeof payload === 'object' ? payload : null;
  if (!p) {
    return {
      kind: ISOLATION_STATE.UNKNOWN,
      tone: 'warn',
      headline: 'The Isolation Report Has Not Been Read',
      detail: 'Nothing Has Answered Yet, So This Says Nothing Either Way.',
      ruling: ISOLATION_RULING,
      missing: [],
    };
  }
  const rows = Array.isArray(p.rows) ? p.rows : [];
  const total = typeof p.total === 'number' ? p.total : null;
  const ruling = typeof p.ruling === 'string' && p.ruling ? p.ruling : ISOLATION_RULING;
  const sources = p.sources && typeof p.sources === 'object' ? p.sources : {};
  const missing = Object.keys(sources).filter((key) => sources[key] === false);

  if (p.complete !== true) {
    return {
      kind: ISOLATION_STATE.INCOMPLETE,
      tone: 'warn',
      headline: 'This Report Could Not Read Every Source',
      detail:
        (missing.length
          ? `These Sources Were Missing Or Unreadable: ${missing.join(', ')}. `
          : '') +
        'An Empty Result Here Is Not A Clean Bill Of Health, Because Nothing Looked.',
      ruling,
      missing,
    };
  }

  if (total === 0 || (total === null && rows.length === 0)) {
    // WHICH POPULATION WAS LOOKED AT (review L-12). The report asks
    // profiles.is_horse who is in the fleet and falls back to
    // ca_horse_fleet_register when that column cannot be read - and a register
    // that has never been synced is a short list. The query ran, so `complete`
    // is true and the finding is real for the accounts it covered; saying "No
    // Horse Is In Two Clubs" without naming the narrower population would be a
    // clean bill of health over a set nobody has checked the size of.
    const fromRegister = sources.profiles_is_horse === false;
    return {
      kind: ISOLATION_STATE.CLEAN,
      tone: fromRegister ? 'warn' : 'good',
      headline: 'No Horse Is In Two Clubs',
      detail: fromRegister
        ? `${ruling} The Fleet Was Identified From The Disclosure Register Rather Than From The Profiles Horse Flag, Which Could Not Be Read, So This Answer Covers Every Account The Register Holds And No Others. Sync The Register From The Register Section If It Has Never Been Run.`
        : ruling,
      ruling,
      missing,
      fleetFrom: fromRegister ? 'register' : 'profiles_is_horse',
    };
  }

  return {
    kind: ISOLATION_STATE.FINDINGS,
    tone: 'danger',
    headline:
      total === 1
        ? 'One Horse Is Holding Seats In More Than One Scope'
        : `${total === null ? rows.length : total} Horses Are Holding Seats In More Than One Scope`,
    detail:
      'Two Clubs Of The Same Union Are One Scope And Are Not A Finding. Every Row Below Crosses A Scope Boundary.',
    ruling,
    missing,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// P AND L
// ═══════════════════════════════════════════════════════════════════════════

/** The three tables fn_ca_fleet_pnl may read, and what each one supplies. */
export const PNL_SOURCE_ROLES = Object.freeze({
  horse_daily_nets: 'Fleet Chips',
  ca_club_player_daily: 'Fleet Chips (Fallback) And Rake (Fallback)',
  club_rake_daily_user: 'Rake',
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The P and L, shaped, WITH THE SOURCES NOTE.
 *
 * The note is the point of this function. `fn_ca_fleet_pnl` resolves its
 * tables and their column names at run time and reports in `sources` exactly
 * which it used, because none of them is created by this feature and their
 * spellings are not knowable from this repository. So:
 *
 *   - `measured` is false when no chip source was read at all, and then every
 *     chip figure is a REPORTED ZERO and the panel says so instead of drawing
 *     a break-even line;
 *   - rake is reported separately and never folded into the chip total. Rake
 *     is the platform's revenue and chips are the fleet's swing, and adding
 *     them produces a number that means nothing;
 *   - `note` names the table and the columns each figure came from, so a
 *     reader can check it against the database rather than trusting the tab.
 */
export function shapePnl(pnl) {
  const p = pnl && typeof pnl === 'object' ? pnl : null;
  const totals = p && typeof p.totals === 'object' ? p.totals : {};
  const sources = p && typeof p.sources === 'object' ? p.sources : {};

  const entries = Object.keys(PNL_SOURCE_ROLES).map((table) => {
    const s = sources[table] && typeof sources[table] === 'object' ? sources[table] : {};
    const columns = s.columns && typeof s.columns === 'object' ? s.columns : {};
    return {
      table,
      role: PNL_SOURCE_ROLES[table],
      present: s.present === true,
      used: s.used === true,
      columns: Object.keys(columns)
        .filter((key) => columns[key])
        .map((key) => `${key}: ${columns[key]}`),
    };
  });

  const chipSource = entries.find((e) => e.used && e.table !== 'club_rake_daily_user') || null;
  const rakeSource =
    entries.find((e) => e.used && e.table === 'club_rake_daily_user') ||
    (entries.find((e) => e.used && e.table === 'ca_club_player_daily') || null);

  const measured = Boolean(chipSource);
  const rakeMeasured = Boolean(rakeSource);

  const parts = [];
  if (chipSource) {
    parts.push(
      `Chips Come From ${chipSource.table}` +
        (chipSource.columns.length ? ` (${chipSource.columns.join(', ')})` : '')
    );
  } else {
    parts.push('No Chip Source Could Be Read, So Every Chip Figure Below Is A Reported Zero And Not A Measurement');
  }
  if (rakeMeasured) {
    parts.push(`Rake Comes From ${rakeSource.table}`);
  } else {
    parts.push('No Rake Source Could Be Read, So The Rake Column Is A Reported Zero And Not A Measurement');
  }

  return {
    known: Boolean(p),
    from: p?.from || null,
    to: p?.to || null,
    readOnly: p?.read_only === true,
    totals: {
      net: measured ? numberOrNull(totals.net) : null,
      hands: measured ? numberOrNull(totals.hands) : null,
      // Kept in its own field, never added to net.
      rake: rakeMeasured ? numberOrNull(totals.rake) : null,
    },
    // The raw zeros, so a panel can show what the database literally returned
    // beside the honest nulls if it wants to.
    reported: {
      net: numberOrNull(totals.net),
      hands: numberOrNull(totals.hands),
      rake: numberOrNull(totals.rake),
    },
    byClub: Array.isArray(p?.by_club) ? p.by_club : [],
    byStake: Array.isArray(p?.by_stake) ? p.by_stake : [],
    byDay: Array.isArray(p?.by_day) ? p.by_day : [],
    sources: entries,
    measured,
    rakeMeasured,
    note: `${parts.join('. ')}. Every Figure Is A Sum Of Rows The Platform Already Keeps. Nothing Here Recomputes Money And Nothing Here Moves A Chip.`,
    notes: Array.isArray(p?.notes) ? p.notes : [],
  };
}

/** A stake band as a human reads it. Null is a real answer, not a blank. */
export function stakeBandLabel(band) {
  if (band === null || band === undefined || band === '') return 'Not Recorded';
  return String(band);
}
