// Deterministic forecasts, not production settlement or elapsed-event evidence.
import { currentRules, tournamentEntryRake, tournamentPrizes, pvpMoney } from './rules/index.mjs';
import { createHash } from 'node:crypto';
import { canonicalJson } from './rules/index.mjs';

export function simulateTriviaEconomy({ days, openingBalance, floor, dailyCeiling, exposureCeiling,
    horseTarget, humanEntrants = 0, humanWinners = false, pvpPerDay = 0, pvpStake = 100,
    humanPvpWinner = true, refundEvery = 0 }) {
    for (const value of [days, openingBalance, floor, dailyCeiling, exposureCeiling, horseTarget,
        humanEntrants, pvpPerDay, pvpStake, refundEvery]) {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid integer simulation input');
    }
    if (![30, 90].includes(days) || openingBalance < floor) throw new Error('invalid forecast horizon or floor');
    const tournament = currentRules('tournament.nightly');
    const pvp = currentRules('pvp.standard');
    const tr = tournament.rules;
    if (horseTarget < tr.field.horse_target.min || horseTarget > tr.field.horse_target.max
        || horseTarget + humanEntrants > tr.field.bracket_size || (humanWinners && humanEntrants < 8)) {
        throw new Error('invalid tournament field');
    }
    const pm = pvpMoney(pvp.rules, pvpStake);
    if (!pm) throw new Error('invalid PvP stake');
    const fee = tr.entry.fee;
    let balance = openingBalance, minBalance = balance, exposure = 0, dailyDebit = 0;
    let admitted = 0, blocked = 0, rake = 0, humanPayout = 0, refunds = 0, variance = 0;
    const journals = new Map();
    function journal(key, legs) {
        if (journals.has(key)) return false;
        const sum = legs.reduce((a, b) => a + b, 0);
        if (sum !== 0 || legs.some(v => !Number.isSafeInteger(v))) throw new Error('unbalanced forecast journal');
        variance += sum; journals.set(key, legs); return true;
    }
    function event(key, subsidy, playerHold, houseRake, horseReturn, playerReturn, refund) {
        if (balance - subsidy < floor || dailyDebit + subsidy > dailyCeiling
            || exposure + subsidy > exposureCeiling) { blocked++; return; }
        admitted++; balance -= subsidy; dailyDebit += subsidy; exposure += subsidy;
        minBalance = Math.min(minBalance, balance);
        journal(key + ':hold', [-subsidy, -playerHold, subsidy + playerHold]);
        const legs = [-(subsidy + playerHold), houseRake, horseReturn, playerReturn];
        if (journal(key + ':exit', legs)) {
            balance += horseReturn; exposure -= subsidy; rake += houseRake;
            humanPayout += playerReturn; if (refund) refunds++;
        }
        // Retry the identical exit. It must change neither balance nor any ledger total.
        if (journal(key + ':exit', legs)) throw new Error('duplicate forecast settlement');
        minBalance = Math.min(minBalance, balance);
        if (balance < floor || exposure !== 0) throw new Error('forecast floor/exposure violation');
    }
    for (let day = 1; day <= days; day++) {
        dailyDebit = 0;
        const players = horseTarget + humanEntrants;
        const subsidy = horseTarget * fee;
        const gross = players * fee;
        const isRefund = refundEvery > 0 && day % refundEvery === 0;
        const houseRake = isRefund ? 0 : players * tournamentEntryRake(tr, fee);
        const finishers = [1, 2, 3, 3, 5, 5, 5, 5].map((finishTier, i) => ({ userId: String(i), finishTier }));
        const prizes = tournamentPrizes(tr, gross - houseRake, finishers);
        const prizeTotal = prizes.reduce((n, prize) => n + prize.amount, 0);
        if (!isRefund && prizeTotal !== gross - houseRake) throw new Error('forecast prize split loses remainder');
        event(`nightly:${day}`, subsidy, humanEntrants * fee, houseRake,
            isRefund ? subsidy : (humanWinners ? 0 : prizeTotal),
            isRefund ? humanEntrants * fee : (humanWinners ? prizeTotal : 0), isRefund);
        for (let match = 0; match < pvpPerDay; match++) {
            event(`pvp:${day}:${match}`, pvpStake, pvpStake, pm.rake,
                humanPvpWinner ? 0 : pm.winnerPayout,
                humanPvpWinner ? pm.winnerPayout : 0, false);
        }
    }
    return { days, openingBalance, endingBalance: balance, minBalance, admitted, blocked,
        sustainableAtRequestedVolume: blocked === 0, rake, humanPayout, refunds,
        terminalEscrow: exposure, variance, journalCount: journals.size,
        ruleHashes: [tournament, pvp].map(v => ({ id: v.id,
            sha256: createHash('sha256').update(canonicalJson(v.rules)).digest('hex') })) };
}
