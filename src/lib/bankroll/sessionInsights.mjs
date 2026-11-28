/** Personal session results are stored in USD; the client converts them for display. Compare whole ledger days, not timestamps. */
export const INSIGHT_WINDOWS = [7, 30, 90];
const CATEGORY_NAMES = {
  poker_cash: 'Cash Games', poker_mtt: 'Tournaments', casino_table: 'Casino Tables',
  slots: 'Slots', sports: 'Sports',
};
export const INSIGHT_CATEGORIES = Object.freeze(Object.keys(CATEGORY_NAMES));
const MIN_COMPARISON_SESSIONS = 5;
const usd = dollars => dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * A finding is carried as a sentence template plus its values, so the client
 * can show the amounts in the player's display currency (Display EUR) instead
 * of the US dollars the ledger stores. `money` names the values that are US
 * dollar amounts; every other value is shown as it is.
 *
 * `evidence` and `action` are still sent as finished US dollar sentences, for
 * a client loaded before this shape existed. Remove them once no such client
 * can be open.
 */
export function renderFindingPart(finding, part, formatMoney = usd) {
  const template = finding?.template?.[part];
  if (typeof template !== 'string') return typeof finding?.[part] === 'string' ? finding[part] : '';
  const values = finding.values || {};
  const money = new Set(finding.money || []);
  return template.replace(/\{(\w+)\}/g, (whole, key) => {
    if (!Object.hasOwn(values, key)) return whole;
    return money.has(key) ? formatMoney(values[key]) : String(values[key]);
  });
}

function finding(title, template, values, money) {
  const shaped = { title, template, values, money };
  return { ...shaped, evidence: renderFindingPart(shaped, 'evidence'), action: renderFindingPart(shaped, 'action') };
}
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;

/**
 * The player's own calendar day, if the client sent one that can be today
 * somewhere on Earth (UTC-12 to UTC+14 is at most one day either side of the
 * UTC date). The server runs in UTC, so without it every evening in the
 * Americas ended the window on tomorrow and dropped the oldest local day.
 */
export function clientToday(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = Date.parse(value + 'T00:00:00Z');
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Number.isFinite(day) && Math.abs(day - utc) <= DAY && isoDay(day) === value ? value : null;
}

export function analysisWindow(days, now = new Date(), today = null) {
  if (!INSIGHT_WINDOWS.includes(days)) throw new RangeError('Unsupported analysis window');
  const local = clientToday(today, now);
  const end = local ? Date.parse(local + 'T00:00:00Z') : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const first = end - (days - 1) * DAY;
  return { days, start: isoDay(first), end: isoDay(end), previousStart: isoDay(first - days * DAY), previousEnd: isoDay(first - DAY) };
}

function periodTotals(rows) {
  const daily = new Map();
  const formats = new Map();
  let net = 0, wins = 0, losses = 0, measured = 0, timed = 0, timeMs = 0, timedNet = 0;
  for (const row of rows) {
    if (row.net_result == null || String(row.net_result).trim() === '') continue;
    const cents = Math.round(Number(row.net_result) * 100);
    if (!Number.isSafeInteger(cents)) continue;
    measured++;
    net += cents;
    if (cents > 0) wins++;
    if (cents < 0) losses++;
    daily.set(row.entry_date, (daily.get(row.entry_date) || 0) + cents);
    const format = formats.get(row.category) || { name: CATEGORY_NAMES[row.category], count: 0, net: 0 };
    format.count++;
    format.net += cents;
    formats.set(row.category, format);
    const elapsed = Date.parse(row.end_time) - Date.parse(row.start_time);
    if (Number.isFinite(elapsed) && elapsed > 0) {
      timeMs += elapsed;
      timedNet += cents;
      timed++;
    }
  }
  let running = 0, peak = 0, drawdown = 0;
  for (const day of [...daily.keys()].sort()) {
    running += daily.get(day);
    peak = Math.max(peak, running);
    drawdown = Math.max(drawdown, peak - running);
  }
  return { net, wins, losses, measured, missing: rows.length - measured, timed, timeMs, timedNet, drawdown,
    formats: [...formats.values()].sort((a, b) => a.net - b.net || a.name.localeCompare(b.name, 'en')) };
}

// One fixed window and one set of verified ledger records always yield the same result.
export function analyzeSessionRecords(rows, window) {
  const eligible = rows.filter(r => INSIGHT_CATEGORIES.includes(r.category) && !r.is_revision);
  const current = periodTotals(eligible.filter(r => r.entry_date >= window.start && r.entry_date <= window.end));
  const prior = periodTotals(eligible.filter(r => r.entry_date >= window.previousStart && r.entry_date <= window.previousEnd));
  const { measured: count, missing } = current;
  const total = count + missing;
  const state = total === 0 ? 'empty' : missing ? 'incomplete' : count < MIN_COMPARISON_SESSIONS ? 'small' : 'recorded';
  const findings = [];
  if (count) {
    const bestCandidate = current.formats.find(f => f.net < 0 && f.count >= MIN_COMPARISON_SESSIONS);
    if (bestCandidate) findings.push(finding(bestCandidate.name + ' Results', {
      evidence: '{sessions} sessions totaled {net}, the lowest net among formats with at least {minimum} recorded results.',
      action: 'Review these entries and their stakes in the ledger.',
    }, { sessions: bestCandidate.count, net: bestCandidate.net / 100, minimum: MIN_COMPARISON_SESSIONS }, ['net']));
    if (!missing && !prior.missing && count >= MIN_COMPARISON_SESSIONS && prior.measured >= MIN_COMPARISON_SESSIONS) {
      const average = Math.round(current.net / count), before = Math.round(prior.net / prior.measured);
      const difference = average - before;
      findings.push(finding('Change Per Session', {
        evidence: '{average} across {sessions} sessions this period, versus {before} across {priorSessions} from {priorStart} through {priorEnd}.',
        action: difference === 0 ? 'The two recorded averages are equal.' : 'Review the change of {difference} ' + (difference > 0 ? 'more' : 'less') + ' per session alongside the formats you played.',
      }, {
        average: average / 100, sessions: count, before: before / 100, priorSessions: prior.measured,
        priorStart: window.previousStart, priorEnd: window.previousEnd, difference: Math.abs(difference) / 100,
      }, ['average', 'before', 'difference']));
    }
    if (current.timed < count) findings.push(finding('Time Coverage', {
      evidence: '{timed} of {sessions} measured sessions have a valid start and end time.',
      action: 'Add missing session times in the ledger to improve hourly coverage.',
    }, { timed: current.timed, sessions: count }, []));
  }
  return {
    window, state, sample: { eligible: total, measured: count, missing, minimumComparison: MIN_COMPARISON_SESSIONS },
    metrics: {
      totalSessions: count, netPL: count ? current.net / 100 : null, avgSession: count ? Math.round(current.net / count) / 100 : null,
      wins: current.wins, losses: current.losses, even: count - current.wins - current.losses,
      winRate: count ? Math.round(current.wins * 1000 / count) / 10 : null,
      timedSessions: current.timed, hours: current.timeMs / 3600000, timedNet: current.timedNet / 100,
      hourlyRate: current.timeMs ? Math.round(current.timedNet / (current.timeMs / 3600000)) / 100 : null,
      dailyDrawdown: count && !missing ? current.drawdown / 100 : null,
    },
    formats: current.formats.map(f => ({ name: f.name, sessions: f.count, net: f.net / 100 })),
    findings,
  };
}

export async function readSessionInsights(db, ownerId, window) {
  const rows = [];
  let lastId = null, expected;
  // Cursor based on immutable unique IDs; a smaller PostgREST row cap is supported.
  do {
    let page = db.from('bankroll_ledger')
      .select('id,category,entry_date,net_result,start_time,end_time', lastId ? {} : { count: 'exact' })
      .eq('user_id', ownerId).eq('is_revision', false)
      // in-list: bounded by the five built-in session categories, independent of ledger size.
      .in('category', INSIGHT_CATEGORIES)
      .gte('entry_date', window.previousStart).lte('entry_date', window.end)
      .order('id', { ascending: true }).limit(500);
    if (lastId) page = page.gt('id', lastId);
    const { data, count, error } = await page;
    if (error || !Array.isArray(data)) throw new Error('Session records are unavailable');
    if (lastId === null) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Session count is unavailable');
      expected = count;
    }
    if (data.length === 0) break;
    for (const row of data) {
      if (!row.id || (lastId && row.id <= lastId)) throw new Error('Session ordering changed');
      lastId = row.id;
      rows.push(row);
    }
  } while (rows.length < expected);
  if (rows.length !== expected) throw new Error('Session records changed during the analysis');
  return analyzeSessionRecords(rows, window);
}
