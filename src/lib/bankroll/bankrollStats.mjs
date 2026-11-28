// The figures getBankrollStats (src/lib/bankroll/calculations.ts) returns for
// a period, from one complete read of that period's ledger rows.
//
// They used to come from ten separate queries. Three of them (session count's
// rows, total hours, win rate) were unpaged, so they stopped at PostgREST's
// 1,000th row; the win rate and session count ignored the period and venue
// the other figures used; a failed read came back as 0; and the tournament,
// trip and category helpers added dollar floats. Every figure here is summed
// in cents with the same rules as the Net Results tile (ledgerMath.mjs).

import { centsToDollars, entryCents, isSessionRow, resultsCents, sessionHours } from './ledgerMath.mjs';

const POKER = ['poker_cash', 'poker_mtt'];
const NON_POKER = ['casino_table', 'slots', 'sports'];

/**
 * Leak risk from poker and non-poker results (cents): non-poker losses that eat
 * more than half of the poker profit are HIGH, more than a quarter MEDIUM; with
 * no poker profit, losses past $1,000 are HIGH and past $500 MEDIUM.
 */
export function leakRiskOf(pokerCents, nonPokerCents) {
  if (pokerCents > 0 && nonPokerCents < 0) {
    const ratio = -nonPokerCents / pokerCents;
    if (ratio > 0.5) return 'HIGH';
    if (ratio > 0.25) return 'MEDIUM';
    return 'LOW';
  }
  if (nonPokerCents < -100000) return 'HIGH';
  if (nonPokerCents < -50000) return 'MEDIUM';
  return 'LOW';
}

/**
 * Period figures from non-revision ledger rows. allInNet is sessions plus
 * expenses (never deposits or withdrawals); hourlyRate is poker results over
 * poker hours; totalHours, sessionCount and winRate cover every gaming session.
 */
export function periodStats(entries) {
  const rows = (entries || []).filter((e) => e && !e.is_revision);
  let pokerCents = 0, nonPokerCents = 0, expenseCents = 0;
  let pokerTimedCents = 0, pokerHours = 0, totalHours = 0;
  let sessions = 0, wins = 0;
  for (const entry of rows) {
    const cents = entryCents(entry);
    if (entry.category === 'expense') expenseCents += -cents;
    if (!isSessionRow(entry)) continue;
    sessions += 1;
    if (cents > 0) wins += 1;
    const hours = sessionHours(entry.start_time, entry.end_time);
    totalHours += hours;
    if (POKER.includes(entry.category)) {
      pokerCents += cents;
      if (hours > 0) { pokerTimedCents += cents; pokerHours += hours; }
    } else if (NON_POKER.includes(entry.category)) {
      nonPokerCents += cents;
    }
  }
  return {
    allInNet: centsToDollars(resultsCents(rows)),
    pokerNet: centsToDollars(pokerCents),
    nonPokerNet: centsToDollars(nonPokerCents),
    expenseTotal: centsToDollars(expenseCents),
    leakRisk: leakRiskOf(pokerCents, nonPokerCents),
    hourlyRate: pokerHours > 0 ? Math.round(pokerTimedCents / pokerHours) / 100 : 0,
    totalHours,
    sessionCount: sessions,
    winRate: sessions > 0 ? (wins / sessions) * 100 : 0,
  };
}
