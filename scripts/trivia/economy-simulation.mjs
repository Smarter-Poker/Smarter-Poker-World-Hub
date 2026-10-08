import { simulateTriviaEconomy } from '../../src/lib/trivia/economySimulation.mjs';
// Explicit production readback inputs as of 2026-10-08; no automatic funding.
const config = { openingBalance: 20000, floor: 0, dailyCeiling: 3000, exposureCeiling: 3000 };
const reports = [];
for (const days of [30, 90]) for (const horseTarget of [70, 100, 140]) {
    for (const scenario of ['horse-prizes', 'human-prizes', 'refunds', 'human-prizes-plus-pvp-stress']) {
        reports.push({ scenario, horseTarget, ...simulateTriviaEconomy({ ...config, days, horseTarget,
            humanEntrants: scenario === 'horse-prizes' ? 0 : 8,
            humanWinners: scenario !== 'horse-prizes', refundEvery: scenario === 'refunds' ? 1 : 0,
            pvpPerDay: scenario === 'human-prizes-plus-pvp-stress' ? 40 : 0 }) });
    }
}
console.log(JSON.stringify({ contract: 'trivia-economy-forecast/1',
    assumptions: 'One nightly/day; all eight prizes return to horses or humans per scenario; stress adds forty 100-diamond human-horse matches/day, all human wins. No replenishment, no public launch certification, no database execution.',
    configuration: config, reports }, null, 2));
