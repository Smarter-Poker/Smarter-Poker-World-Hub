// Tax-year arithmetic shared by the State Tax Report and the tax-report API.
//
// Defects this replaced:
// - the State Tax Report was fed the dashboard's filtered rows, so a player
//   viewing "Last 30 Days" got a tax year containing 30 days;
// - deposits counted as winnings and withdrawals and expenses as gambling
//   losses;
// - one 2024 bracket table was used for every year, and the 2026 change that
//   allows only 90% of gambling losses (and never more than winnings) was not
//   applied;
// - the W-2G slot threshold stayed at $1,200 after it rose to $2,000 for 2026.
//
// Figures are estimates for a single filer with no other income; the screens
// say so.

import { SESSION_CATEGORIES } from './ledgerReport.mjs';
import { expenseCostCents } from './ledgerMath.mjs';

// IRS single-filer brackets: upper bound of each band (taxable income).
const BRACKETS = {
  2024: [11600, 47150, 100525, 191950, 243725, 609350],
  2025: [11925, 48475, 103350, 197300, 250525, 626350],
  2026: [12400, 50400, 105700, 201775, 256225, 640600],
};
const RATES = [10, 12, 22, 24, 32, 35, 37];
const KNOWN_YEARS = Object.keys(BRACKETS).map(Number);

/** The bracket year used for a tax year: the year itself, or the nearest published one. */
export function bracketYear(year) {
  const y = Number(year);
  if (BRACKETS[y]) return y;
  return y < KNOWN_YEARS[0] ? KNOWN_YEARS[0] : KNOWN_YEARS[KNOWN_YEARS.length - 1];
}

export function federalBrackets(year) {
  const bounds = BRACKETS[bracketYear(year)];
  return RATES.map((rate, i) => ({ min: i ? bounds[i - 1] : 0, max: i < bounds.length ? bounds[i] : Infinity, rate }));
}

export function calcFederalTax(income, year) {
  if (!(income > 0)) return 0;
  let tax = 0;
  for (const band of federalBrackets(year)) {
    if (income <= band.min) break;
    tax += (Math.min(income, band.max) - band.min) * (band.rate / 100);
  }
  return Math.round(tax * 100) / 100;
}

/** Share of gambling losses that may be deducted: 90% from tax year 2026 (OBBBA section 70114). */
export function lossDeductionRate(year) {
  return Number(year) >= 2026 ? 0.9 : 1;
}

/** W-2G reporting thresholds for the tax year. */
export function w2gThresholds(year) {
  const slots = Number(year) >= 2026 ? 2000 : 1200;
  return { poker: 5000, slots, bingo: slots, keno: Number(year) >= 2026 ? 2000 : 1500 };
}

const cents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** Calendar year and quarter of a 'YYYY-MM-DD' ledger day, read as text (no time zone shift). */
function dayParts(day) {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(day || ''));
  return m ? { year: Number(m[1]), quarter: Math.floor((Number(m[2]) - 1) / 3) } : null;
}

/**
 * Session-method totals for one tax year. Each gaming session is a win or a
 * loss; expenses are reported apart; deposits and withdrawals are ignored.
 */
export function taxYearTotals(entries = [], year) {
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map((label) => ({ label, winnings: 0, losses: 0, sessions: 0 }));
  let expenses = 0;
  for (const entry of entries) {
    if (!entry || entry.is_revision) continue;
    const parts = dayParts(entry.entry_date);
    if (!parts || parts.year !== Number(year)) continue;
    if (entry.category === 'expense') {
      expenses += expenseCostCents(entry);
      continue;
    }
    if (!SESSION_CATEGORIES.includes(entry.category)) continue;
    const net = cents(entry.gross_out) - cents(entry.gross_in);
    const q = quarters[parts.quarter];
    q.sessions++;
    if (net > 0) q.winnings += net;
    else q.losses += -net;
  }
  const winnings = quarters.reduce((s, q) => s + q.winnings, 0);
  const losses = quarters.reduce((s, q) => s + q.losses, 0);
  const rate = lossDeductionRate(year);
  const deductibleLosses = Math.min(Math.round(losses * rate), winnings);
  return {
    year: Number(year),
    quarters: quarters.map((q) => ({ ...q, winnings: q.winnings / 100, losses: q.losses / 100, net: (q.winnings - q.losses) / 100 })),
    sessions: quarters.reduce((s, q) => s + q.sessions, 0),
    winnings: winnings / 100,
    losses: losses / 100,
    net: (winnings - losses) / 100,
    lossDeductionRate: rate,
    deductibleLosses: deductibleLosses / 100,
    recordedExpenses: expenses / 100,
  };
}

/**
 * Estimate for the State Tax Report. Itemized deductions are what the player
 * enters; the gambling-loss deduction is capped as the law requires.
 */
export function estimateTax(totals, { stateRate = 0, deductions = 0 } = {}) {
  const extra = Math.max(0, Number(deductions) || 0);
  const taxable = Math.max(0, Math.round((totals.winnings - totals.deductibleLosses - extra) * 100) / 100);
  const federal = calcFederalTax(taxable, totals.year);
  const state = Math.round(taxable * (Number(stateRate) || 0)) / 100;
  const total = Math.round((federal + state) * 100) / 100;
  return { taxable, federal, state, total, effectiveRate: taxable > 0 ? ((total / taxable) * 100).toFixed(1) : '0.0' };
}

/**
 * The tax-report API's JSON (and the PDF built from it) for one tax year.
 * Lived inside pages/api/bankroll/tax-report.js, where no test could reach it,
 * and added dollar floats for the cash/tournament breakdown and the expenses by
 * type. Everything is summed in cents here, from the same rows and rules as
 * taxYearTotals, so the breakdown always adds up to the headline figures.
 */
export function taxYearReport(rows = [], trips = [], year) {
  const totals = taxYearTotals(rows, year);
  const threshold = w2gThresholds(year).poker;
  const venueOf = (row) => row.bankroll_locations?.name || row.tournament_name || 'Unknown';
  const inYear = (row) => String(row?.entry_date || '').slice(0, 4) === String(year);
  const games = rows.filter((row) => row && !row.is_revision && inYear(row) && SESSION_CATEGORIES.includes(row.category));
  const netCents = (row) => cents(row.gross_out) - cents(row.gross_in);

  const side = (match) => {
    let winnings = 0, losses = 0;
    for (const row of games.filter(match)) {
      const n = netCents(row);
      if (n > 0) winnings += n; else losses += -n;
    }
    return { winnings: winnings / 100, losses: losses / 100, net: (winnings - losses) / 100 };
  };

  // A poker tournament win is W-2G reportable at $5,000 or more net of the buy-in.
  const w2gEvents = games
    .filter((row) => row.category === 'poker_mtt' && netCents(row) >= threshold * 100)
    .map((row) => ({ date: row.entry_date, type: 'Tournament', venue: venueOf(row), amount: netCents(row) / 100, threshold }));

  // Expenses are the ledger's own expense entries, by type.
  const expenseCents = {};
  for (const row of rows) {
    if (!row || row.is_revision || !inYear(row) || row.category !== 'expense') continue;
    const key = row.expense_type || 'other';
    expenseCents[key] = (expenseCents[key] || 0) + expenseCostCents(row);
  }
  const expenses = {};
  for (const [key, value] of Object.entries(expenseCents)) expenses[key] = value / 100;

  return {
    year,
    summary: {
      totalSessions: totals.sessions,
      totalTrips: trips.length,
      totalWinnings: totals.winnings,
      totalLosses: totals.losses,
      netGamblingResult: totals.net,
      lossDeductionRate: totals.lossDeductionRate,
      deductibleLosses: totals.deductibleLosses,
      totalExpenses: totals.recordedExpenses,
      // Gambling income left after the losses the law allows. Expenses are
      // listed apart: only a professional gambler may deduct them.
      taxableIncome: (cents(totals.winnings) - cents(totals.deductibleLosses)) / 100,
    },
    quarters: totals.quarters,
    breakdown: {
      cashGame: side((row) => row.category !== 'poker_mtt'),
      tournament: side((row) => row.category === 'poker_mtt'),
    },
    expenses,
    w2gEvents,
    sessions: games.map((s) => ({
      date: s.entry_date,
      venue: venueOf(s),
      type: s.category === 'poker_mtt' ? 'Tournament' : s.category === 'poker_cash' ? 'Cash' : s.category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      buyIn: Number(s.gross_in) || 0,
      cashOut: Number(s.gross_out) || 0,
      net: netCents(s) / 100,
    })),
  };
}
