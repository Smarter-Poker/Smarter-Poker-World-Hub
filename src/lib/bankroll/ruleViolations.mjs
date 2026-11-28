// Bankroll Rules, evaluated against the entry the player just saved.
//
// The check that ran after every save measured the wrong things:
// - "today" summed every row dated today, deposits and withdrawals included,
//   so moving $2,000 out of the roll tripped the Daily Stop-Loss;
// - the "session" it judged was simply the newest-dated row, so logging last
//   Tuesday's session judged today's instead, and an expense or a withdrawal
//   could be measured as a Max Buy-In against the bankroll;
// - Monthly Stop-Loss and Session Time Limit could be switched on in Bankroll
//   Rules but were never evaluated at all.
//
// Rules here apply to gambling sessions only. An expense, a deposit and a
// withdrawal never trip a stop-loss or a buy-in limit.

import {
  entryCents,
  formatCents,
  isSessionRow,
  sessionHours,
  toCents,
} from './ledgerMath.mjs';

const sameRow = (a, b) => a && b && a.id && b.id && a.id === b.id;

function sumSessions(rows, saved, keep) {
  let total = 0;
  let sawSaved = false;
  for (const row of rows || []) {
    if (!isSessionRow(row) || !keep(row)) continue;
    if (sameRow(row, saved)) {
      sawSaved = true;
      total += entryCents(saved);
    } else {
      total += entryCents(row);
    }
  }
  // The saved row is counted once even if the re-read did not return it yet.
  if (!sawSaved && keep(saved)) total += entryCents(saved);
  return total;
}

function hoursLabel(hours) {
  return (Math.round(hours * 10) / 10) + ' hrs';
}

/**
 * @param {object} input
 * @param {Array} input.rules          active bankroll_rules rows
 * @param {object} input.entry         the ledger row just saved
 * @param {Array} input.monthEntries   ledger rows for the entry's calendar month
 * @param {number} input.bankrollCents bankroll balance after the save, in cents
 * @returns {Array<{rule: string, limit: string, actual: string, severity: string}>}
 */
export function evaluateRuleViolations({ rules, entry, monthEntries, bankrollCents }) {
  if (!entry || !isSessionRow(entry) || !entry.entry_date) return [];
  const day = String(entry.entry_date).slice(0, 10);
  const month = day.slice(0, 7);
  const sessionCents = entryCents(entry);
  const dayCents = sumSessions(monthEntries, entry, (row) => String(row.entry_date).slice(0, 10) === day);
  const monthCents = sumSessions(monthEntries, entry, (row) => String(row.entry_date).slice(0, 7) === month);
  const violations = [];

  for (const rule of rules || []) {
    if (!rule || rule.is_active === false) continue;
    const limitCents = toCents(rule.value);
    if (!(limitCents > 0)) continue;
    switch (rule.rule_type) {
      case 'stop_loss_session':
        if (sessionCents < 0 && -sessionCents >= limitCents)
          violations.push({ rule: 'Session Stop-Loss', limit: formatCents(limitCents), actual: formatCents(sessionCents), limitCents, actualCents: sessionCents, severity: 'high' });
        break;
      case 'stop_loss_day':
        if (dayCents < 0 && -dayCents >= limitCents)
          violations.push({ rule: 'Daily Stop-Loss', limit: formatCents(limitCents), actual: formatCents(dayCents), limitCents, actualCents: dayCents, severity: 'high' });
        break;
      case 'stop_loss_month':
        if (monthCents < 0 && -monthCents >= limitCents)
          violations.push({ rule: 'Monthly Stop-Loss', limit: formatCents(limitCents), actual: formatCents(monthCents), limitCents, actualCents: monthCents, severity: 'high' });
        break;
      case 'max_buyin_percent': {
        // Judged against the roll the player sat down with, not the roll the
        // session's own result left behind.
        const before = Math.round(Number(bankrollCents) || 0) - sessionCents;
        const buyIn = toCents(entry.gross_in);
        const percent = Number(rule.value);
        if (before > 0 && buyIn > 0 && (buyIn / before) * 100 > percent)
          violations.push({ rule: 'Max Buy-In %', limit: percent + '%', actual: ((buyIn / before) * 100).toFixed(1) + '%', severity: 'medium' });
        break;
      }
      case 'win_goal_session':
        if (sessionCents > 0 && sessionCents >= limitCents)
          violations.push({ rule: 'Session Win Goal Reached', limit: formatCents(limitCents), actual: '+' + formatCents(sessionCents), limitCents, actualCents: sessionCents, signedActual: true, severity: 'info' });
        break;
      case 'time_limit_session': {
        const hours = sessionHours(entry.start_time, entry.end_time);
        const limit = Number(rule.value);
        if (hours > 0 && hours > limit)
          violations.push({ rule: 'Session Time Limit', limit: hoursLabel(limit), actual: hoursLabel(hours), severity: 'medium' });
        break;
      }
      default:
        break;
    }
  }
  return violations;
}

/** First and last calendar day of the month containing a YYYY-MM-DD day. */
export function monthBounds(day) {
  const [y, m] = String(day).slice(0, 7).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
