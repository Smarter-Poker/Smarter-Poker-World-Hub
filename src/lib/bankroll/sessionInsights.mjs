/** Personal session results are stored in USD. Compare whole ledger days, not timestamps. */
export const INSIGHT_WINDOWS = [7, 30, 90];
const CATEGORY_NAMES = {
  poker_cash: 'Cash Games', poker_mtt: 'Tournaments', casino_table: 'Casino Tables',
  slots: 'Slots', sports: 'Sports',
};
export const INSIGHT_CATEGORIES = Object.freeze(Object.keys(CATEGORY_NAMES));
const MIN_COMPARISON_SESSIONS = 5;
const money = cents => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;

export function analysisWindow(days, now = new Date()) {
  if (!INSIGHT_WINDOWS.includes(days)) throw new RangeError('Unsupported analysis window');
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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
    if (bestCandidate) findings.push({
      title: bestCandidate.name + ' Results',
      evidence: bestCandidate.count + ' sessions totaled ' + money(bestCandidate.net) + ', the lowest net among formats with at least ' + MIN_COMPARISON_SESSIONS + ' recorded results.',
      action: 'Review these entries and their stakes in the ledger.',
    });
    if (!missing && !prior.missing && count >= MIN_COMPARISON_SESSIONS && prior.measured >= MIN_COMPARISON_SESSIONS) {
      const average = Math.round(current.net / count), before = Math.round(prior.net / prior.measured);
      const difference = average - before;
      findings.push({
        title: 'Change Per Session',
        evidence: money(average) + ' across ' + count + ' sessions this period, versus ' + money(before) + ' across ' + prior.measured + ' from ' + window.previousStart + ' through ' + window.previousEnd + '.',
        action: difference === 0 ? 'The two recorded averages are equal.' : 'Review the change of ' + money(Math.abs(difference)) + (difference > 0 ? ' more' : ' less') + ' per session alongside the formats you played.',
      });
    }
    if (current.timed < count) findings.push({
      title: 'Time Coverage',
      evidence: current.timed + ' of ' + count + ' measured sessions have a valid start and end time.',
      action: 'Add missing session times in the ledger to improve hourly coverage.',
    });
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
