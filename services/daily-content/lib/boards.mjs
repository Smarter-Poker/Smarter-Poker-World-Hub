/**
 * The four daily slots and their board builders (daily plan v2.2, Gate 3 I-1).
 * Builders are pure over a reader: { source(from, to, detail), schedule(from, to) }.
 */
import {
  buildDailyBoard, collectFinishes, rankPlayers, excludedReason, isComplete, eventTitle,
  classify, gameLabel, isOmaha, isHoldem, HORSE_DISCLOSURE, CHIP_DISCLOSURE,
  SCORING_VERSION, ELIGIBILITY_VERSION,
} from './scoring.mjs';
import { chicagoInstant, chicagoDayBounds, addDays, dateLabel, timeLabel, weekdayName } from './time.mjs';

export const SLOTS = {
  today:   { at: [8, 0],   snapshot: [7, 50],  expires: [9, 0],   family: 'Today On Smarter.Poker', duration: 8 },
  top10:   { at: [11, 30], snapshot: [10, 30], expires: [13, 30], family: 'Daily Arena Top 10',     duration: 15 },
  feature: { at: [15, 0],  snapshot: [14, 30], expires: [17, 0],  family: 'Feature Of The Day',     duration: 12 },
  tonight: { at: [17, 30], snapshot: [17, 20], expires: [18, 30], family: 'Tonight In The Arena',   duration: 8 },
};
export const SLOT_ORDER = ['today', 'top10', 'feature', 'tonight'];
export const POST_GRACE_MIN = 45;

export function slotTimes(ymd, slot) {
  const s = SLOTS[slot];
  const slotAt = chicagoInstant(ymd, ...s.at);
  return {
    slotAt,
    snapshotAt: chicagoInstant(ymd, ...s.snapshot),
    editionExpiresAt: chicagoInstant(ymd, ...s.expires),
    postExpiresAt: new Date(slotAt.getTime() + POST_GRACE_MIN * 60000),
  };
}

const money = (n) => Number(n || 0).toLocaleString('en-US');
const isPublicScheduleEvent = (e) => !e.is_private && !e.is_vip_only && e.club_name !== 'Diamond Arena'
  && !/^Cert /.test(String(e.club_name || '')) && e.status !== 'CANCELLED' && String(e.variant || '') !== 'satellite';

/** Schedule cards: all Free Buys plus the largest guarantees, up to 6, ordered by start time. */
function pickSchedule(events, max = 6, freeBuysFirst = true) {
  const pub = events.filter(isPublicScheduleEvent);
  const free = freeBuysFirst ? pub.filter((e) => e.free_buy) : [];
  const rest = pub.filter((e) => !free.includes(e)).sort((a, b) => Number(b.guaranteed_prize || 0) - Number(a.guaranteed_prize || 0)
    || String(a.start_time).localeCompare(String(b.start_time)));
  return [...free, ...rest].slice(0, max).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)) || a.id.localeCompare(b.id));
}

function scheduleItem(e) {
  return {
    event_id: e.id, start_time: e.start_time, time: timeLabel(e.start_time), name: e.name,
    game: gameLabel(e.game_type), variant: e.variant || null, free_buy: !!e.free_buy, guarantee: Number(e.guaranteed_prize || 0), status: e.status,
  };
}

export async function buildToday(reader, ymd) {
  const from = chicagoInstant(ymd, 8, 0);
  const to = chicagoDayBounds(ymd).end;
  const sched = await reader.schedule(from.toISOString(), to.toISOString());
  const items = pickSchedule(sched.events).map(scheduleItem);
  const freeCount = items.filter((i) => i.free_buy).length;
  const ok = items.length >= 3;
  return {
    family: SLOTS.today.family, completeness: 'NOT_APPLICABLE', status: ok ? 'ok' : 'insufficient',
    reason: ok ? null : `Only ${items.length} public events from 8:00 AM; 3 needed`,
    period: { start: from.toISOString(), end: to.toISOString() },
    payload: { family: SLOTS.today.family, kind: 'schedule', date: ymd, date_label: dateLabel(ymd), source_read_at: sched.read_at,
      window: { from: from.toISOString(), to: to.toISOString() }, items, disclosures: [CHIP_DISCLOSURE] },
    headline: freeCount ? `Today: ${freeCount} Free Buy${freeCount === 1 ? '' : 's'}, Zero Buy-In` : `Today On Smarter.Poker: ${items.length} Featured Events`,
    caption: items.length ? `${items.length} featured tournaments today, first at ${items[0].time}. Times Central. Chips are play credits with no cash value.` : '',
  };
}

export async function buildTonight(reader, ymd) {
  const from = chicagoInstant(ymd, 17, 30);
  const to = chicagoDayBounds(ymd).end;
  const sched = await reader.schedule(from.toISOString(), to.toISOString());
  const items = pickSchedule(sched.events, 6, false).map(scheduleItem);
  const top = [...items].sort((a, b) => b.guarantee - a.guarantee)[0];
  const ok = items.length >= 3;
  return {
    family: SLOTS.tonight.family, completeness: 'NOT_APPLICABLE', status: ok ? 'ok' : 'insufficient',
    reason: ok ? null : `Only ${items.length} public events after 5:30 PM; 3 needed`,
    period: { start: from.toISOString(), end: to.toISOString() },
    payload: { family: SLOTS.tonight.family, kind: 'schedule', date: ymd, date_label: dateLabel(ymd), source_read_at: sched.read_at,
      window: { from: from.toISOString(), to: to.toISOString() }, items, disclosures: [CHIP_DISCLOSURE] },
    headline: top ? `Tonight: ${top.name}${top.guarantee ? `, ${money(top.guarantee)} Chip Guarantee` : ''}` : 'Tonight In The Arena',
    caption: items.length ? `${items.length} events from ${items[0].time}. Times Central. Chips are play credits with no cash value.` : '',
  };
}

/** The closing frame for the Top 10: tonight's largest guarantee, read at build time. */
export async function tonightFeature(reader, ymd) {
  const from = chicagoInstant(ymd, 17, 30);
  const to = chicagoDayBounds(ymd).end;
  const sched = await reader.schedule(from.toISOString(), to.toISOString());
  const pub = sched.events.filter(isPublicScheduleEvent).sort((a, b) => Number(b.guaranteed_prize || 0) - Number(a.guaranteed_prize || 0));
  const e = pub[0];
  return e ? { event_id: e.id, event: eventTitle(e), name: e.name, game: gameLabel(e.game_type), time: timeLabel(e.start_time),
    start_time: e.start_time, guarantee: Number(e.guaranteed_prize || 0), read_at: sched.read_at } : null;
}

export async function buildTop10(reader, ymd) {
  const period = addDays(ymd, -1);
  const { start, end } = chicagoDayBounds(period);
  const src = await reader.source(start.toISOString(), end.toISOString(), true);
  const label = dateLabel(period);
  const res = buildDailyBoard(src, { periodYmd: period, periodLabel: label });
  res.payload.closing_frame = await tonightFeature(reader, ymd);
  const p = res.payload;
  const first = p.rows[0];
  const ok = res.board !== 'fallback' && res.completeness !== 'HELD';
  const hc = p.human_callout;
  const base = {
    family: SLOTS.top10.family, completeness: res.completeness, period: { start: start.toISOString(), end: end.toISOString() },
    payload: p, board: res.board,
  };
  if (ok) {
    return { ...base, status: 'ok', reason: res.completeness === 'PROVISIONAL' ? `Provisional: ${p.completeness.incomplete_events.length} events still settling; these ranks cannot change` : null,
      headline: `Yesterday's ${res.board === 'top5' ? 'Top 5' : 'Top 10'}: ${first.name} Takes #1`,
      caption: `Arena Points from ${p.totals.events} tournaments on ${label}. ${HORSE_DISCLOSURE}${hc.qualifies ? ` Best human finish: ${hc.name}, ${ordinal(hc.position)} of ${hc.field} in ${hc.event}.` : ''} #AIplayers` };
  }
  // Fallback: "Yesterday In Numbers"
  return { ...base, status: res.completeness === 'HELD' ? 'held' : 'fallback',
    reason: res.completeness === 'HELD' ? 'Incomplete events could still change the ranks' : `Too little evidence for a board (${p.totals.events} events, ${p.totals.scoring_players} scoring players)`,
    fallback: 'yesterday_in_numbers',
    headline: `Yesterday In Numbers: ${p.totals.events} Tournaments, ${money(p.totals.entries)} Entries`,
    caption: `${label}: ${p.totals.events} tournaments and ${money(p.totals.entries)} entries.${p.totals.biggest_field ? ` Biggest field: ${p.totals.biggest_field.field} in ${p.totals.biggest_field.event}.` : ''} ${HORSE_DISCLOSURE}` };
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']; const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// ── 3:00 PM rotation ──────────────────────────────────────────────────────
export const FEATURES = {
  Monday: 'weekly_top10', Tuesday: 'omaha_spotlight', Wednesday: 'holdem_spotlight',
  Thursday: 'biggest_fields', Friday: 'free_buy_winners', Saturday: 'nightly_spotlight', Sunday: 'week_in_numbers',
};
export const FEATURE_TITLES = {
  weekly_top10: 'Weekly Top 10', omaha_spotlight: 'Omaha Spotlight', holdem_spotlight: "Hold'em Spotlight",
  biggest_fields: 'Biggest Fields', free_buy_winners: 'Free Buy Winners', nightly_spotlight: 'Nightly Spotlight', week_in_numbers: 'Week In Numbers',
};
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Monday (YYYY-MM-DD) of the Chicago week containing ymd. */
export function weekStart(ymd) {
  const idx = WEEK.indexOf(weekdayName(ymd));
  return addDays(ymd, -idx);
}

function lastSevenDays(ymd) {
  return { start: chicagoDayBounds(addDays(ymd, -7)).start, end: chicagoDayBounds(addDays(ymd, -1)).end, label: `${dateLabel(addDays(ymd, -7))} to ${dateLabel(addDays(ymd, -1))}` };
}

function qualifyingComplete(src, filter = () => true) {
  return (src.events || []).filter((e) => !excludedReason(e) && isComplete(e) && filter(e));
}

function profileOf(src, id) { return (src.profiles || []).find((p) => p.id === id) || {}; }

async function featureBoard(reader, ymd, key, { avoidUserIds = [] } = {}) {
  const title = FEATURE_TITLES[key];
  const common = { family: SLOTS.feature.family, feature: key, feature_title: title, completeness: 'FINAL' };
  if (key === 'weekly_top10' || key === 'omaha_spotlight' || key === 'holdem_spotlight') {
    const w = key === 'weekly_top10'
      ? { start: chicagoDayBounds(addDays(weekStart(ymd), -7)).start, end: chicagoDayBounds(addDays(weekStart(ymd), -1)).end,
          label: `${dateLabel(addDays(weekStart(ymd), -7))} to ${dateLabel(addDays(weekStart(ymd), -1))}` }
      : lastSevenDays(ymd);
    const src = await reader.source(w.start.toISOString(), w.end.toISOString(), true);
    const filt = key === 'omaha_spotlight' ? (e) => isOmaha(e.game_type) : key === 'holdem_spotlight' ? (e) => isHoldem(e.game_type) : () => true;
    const evs = qualifyingComplete(src, filt);
    const need = key === 'weekly_top10' ? 50 : 10;
    const profiles = new Map((src.profiles || []).map((p) => [p.id, p]));
    const ranked = rankPlayers(collectFinishes(src, evs), 10, profiles, null).filter((r) => !avoidUserIds.includes(r.user_id));
    const size = key === 'weekly_top10' ? 10 : 5;
    const rows = ranked.slice(0, size).map(({ best_ended_at, ...r }) => r);
    const ok = evs.length >= need && rows.length >= Math.min(size, 5);
    return { ...common, status: ok ? 'ok' : 'insufficient', reason: ok ? null : `${evs.length} qualifying events; ${need} needed`,
      period: { start: w.start.toISOString(), end: w.end.toISOString() },
      payload: { family: SLOTS.feature.family, kind: 'board', feature: key, title, period_label: w.label, source_read_at: src.read_at,
        scoring_version: SCORING_VERSION, eligibility_version: ELIGIBILITY_VERSION, board: size === 10 ? 'top10' : 'top5',
        qualifying_events: evs.length, rows, avoided_user_ids: avoidUserIds, disclosures: [HORSE_DISCLOSURE, CHIP_DISCLOSURE] },
      headline: ok ? `${title}: ${rows[0].name} Leads` : title,
      caption: ok ? `${title}, Arena Points from ${evs.length} tournaments, ${w.label}. ${HORSE_DISCLOSURE} #AIplayers` : '' };
  }
  const w = lastSevenDays(ymd);
  if (key === 'biggest_fields' || key === 'free_buy_winners') {
    const src = await reader.source(w.start.toISOString(), w.end.toISOString(), false);
    let evs = qualifyingComplete(src);
    if (key === 'free_buy_winners') evs = evs.filter((e) => e.free_buy).sort((a, b) => String(a.ended_at).localeCompare(String(b.ended_at)));
    else evs = evs.filter((e) => e.field >= 50).sort((a, b) => b.field - a.field || String(a.ended_at).localeCompare(String(b.ended_at)));
    const need = 5;
    const items = evs.slice(0, key === 'free_buy_winners' ? 6 : 5).map((e) => {
      const p = profileOf(src, e.winner_user_id); const c = classify(p);
      return { event_id: e.id, event: eventTitle(e), ended_at: e.ended_at, field: e.field, winner_user_id: e.winner_user_id,
        winner: p.name || p.username || 'Unknown player', horse: c.horse, staff: c.staff, avatar_url: p.avatar_url || null };
    });
    const ok = evs.length >= need;
    return { ...common, status: ok ? 'ok' : 'insufficient', reason: ok ? null : `${evs.length} eligible events; ${need} needed`,
      period: { start: w.start.toISOString(), end: w.end.toISOString() },
      payload: { family: SLOTS.feature.family, kind: 'list', feature: key, title, period_label: w.label, source_read_at: src.read_at,
        eligibility_version: ELIGIBILITY_VERSION, eligible_events: evs.length, items, disclosures: [HORSE_DISCLOSURE, CHIP_DISCLOSURE] },
      headline: ok ? (key === 'biggest_fields' ? `Biggest Fields: ${items[0].field} Players In ${items[0].event}` : `Free Buy Winners: ${items.length} Free Tournaments This Week`) : title,
      caption: ok ? `${title}, ${w.label}. ${HORSE_DISCLOSURE} #AIplayers` : '' };
  }
  if (key === 'nightly_spotlight') {
    const src = await reader.source(w.start.toISOString(), w.end.toISOString(), false);
    const nightly = qualifyingComplete(src, (e) => /^Nightly/i.test(e.name)).sort((a, b) => String(b.ended_at).localeCompare(String(a.ended_at)))[0];
    if (!nightly) return { ...common, status: 'insufficient', reason: 'No completed Nightly event in the last 7 days', period: { start: w.start.toISOString(), end: w.end.toISOString() }, payload: { family: SLOTS.feature.family, kind: 'board', feature: key, title, source_read_at: src.read_at }, headline: title, caption: '' };
    const t = new Date(nightly.ended_at).getTime();
    const det = await reader.source(new Date(t - 1000).toISOString(), new Date(t + 1000).toISOString(), true);
    const top = (det.players || []).filter(([tid, , pos]) => tid === nightly.id && pos != null && pos <= 3).sort((a, b) => a[2] - b[2])
      .map(([, uid, pos]) => { const p = profileOf(det, uid); const c = classify(p); return { rank: pos, rank_label: String(pos), user_id: uid, name: p.name || p.username, avatar_url: p.avatar_url || null, ...c, position: pos, field: nightly.field }; });
    return { ...common, status: top.length === 3 ? 'ok' : 'insufficient', reason: top.length === 3 ? null : 'Nightly top 3 not recorded',
      period: { start: w.start.toISOString(), end: w.end.toISOString() },
      payload: { family: SLOTS.feature.family, kind: 'board', feature: key, title, event: eventTitle(nightly), event_id: nightly.id, field: nightly.field, ended_at: nightly.ended_at,
        source_read_at: det.read_at, rows: top, board: 'podium', disclosures: [HORSE_DISCLOSURE, CHIP_DISCLOSURE] },
      headline: top[0] ? `Nightly Spotlight: ${top[0].name} Wins ${eventTitle(nightly)}` : title,
      caption: top[0] ? `${top[0].name} won ${eventTitle(nightly)}, 1st of ${nightly.field}. ${HORSE_DISCLOSURE} #AIplayers` : '' };
  }
  // week_in_numbers: always runs
  const src = await reader.source(w.start.toISOString(), w.end.toISOString(), true);
  const daily = buildDailyBoard(src, { periodYmd: addDays(ymd, -1), periodLabel: w.label, cap: 10 });
  const t = daily.payload.totals; const hc = daily.payload.human_callout;
  const stats = [
    { label: 'Tournaments', value: t.events },
    { label: 'Entries', value: t.entries },
    { label: 'Biggest Field', value: t.biggest_field ? t.biggest_field.field : 0, detail: t.biggest_field?.event || null },
  ];
  if (hc.qualifies) stats.push({ label: 'Best Human Finish', value: `${ordinal(hc.position)} of ${hc.field}`, detail: `${hc.name}, ${hc.event}` });
  return { ...common, status: 'ok', reason: null, period: { start: w.start.toISOString(), end: w.end.toISOString() },
    payload: { family: SLOTS.feature.family, kind: 'stats', feature: key, title, period_label: w.label, source_read_at: src.read_at, stats, disclosures: [HORSE_DISCLOSURE, CHIP_DISCLOSURE] },
    headline: `Week In Numbers: ${money(t.events)} Tournaments, ${money(t.entries)} Entries`,
    caption: `${w.label}: ${money(t.events)} tournaments, ${money(t.entries)} entries. ${HORSE_DISCLOSURE}` };
}

/**
 * The 3:00 PM feature: the weekday's feature, else the next unused feature this week, else skip.
 * usedThisWeek: feature keys already published or rendered this Chicago week.
 */
export async function buildFeature(reader, ymd, { usedThisWeek = [], avoidUserIds = [] } = {}) {
  const day = weekdayName(ymd);
  const order = [FEATURES[day], ...WEEK.map((d) => FEATURES[d]).filter((k) => k !== FEATURES[day] && !usedThisWeek.includes(k))];
  const tried = [];
  for (const key of order) {
    const res = await featureBoard(reader, ymd, key, { avoidUserIds });
    if (res.status === 'ok') return { ...res, tried, weekday_feature: FEATURES[day] };
    tried.push({ feature: key, reason: res.reason });
  }
  return { family: SLOTS.feature.family, status: 'insufficient', completeness: 'NOT_APPLICABLE', reason: 'No feature has enough evidence this week',
    tried, payload: { family: SLOTS.feature.family, kind: 'none', tried }, headline: null, caption: null };
}

export async function buildSlot(reader, ymd, slot, ctx = {}) {
  if (slot === 'today') return buildToday(reader, ymd);
  if (slot === 'top10') return buildTop10(reader, ymd);
  if (slot === 'feature') return buildFeature(reader, ymd, ctx);
  if (slot === 'tonight') return buildTonight(reader, ymd);
  throw new Error(`unknown slot ${slot}`);
}
