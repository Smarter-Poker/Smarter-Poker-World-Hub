// Deterministic seeded Monte Carlo & analytical break-even economy simulations.
// Forecasts only — not production settlement or elapsed-event certification.
import { createHash } from 'node:crypto';
import {
    canonicalJson,
    currentRules,
    pvpMoney,
    tournamentEntryRake,
    tournamentPrizes,
} from './rules/index.mjs';
import { simulateTriviaEconomy } from './economySimulation.mjs';

export const LIVE_TREASURY_CONFIG = Object.freeze({
    openingBalance: 25000,
    floor: 0,
    dailyCeiling: 3000,
    exposureCeiling: 3000,
    warningLevel: 6000,
});

export const DEFAULT_REGIMES = Object.freeze([
    {
        id: 'S1_Launch_LowTraffic',
        label: 'Launch / Low Traffic (5-15 humans/night, 10 PvP/day, 60% horse, equal skill)',
        humansMin: 5,
        humansMax: 15,
        humanSkillRatio: 1.0,
        refundRate: 0.02,
        pvpMin: 5,
        pvpMax: 15,
        pvpHorseFallbackRate: 0.6,
        pvpHumanWinRate: 0.5,
        pvpTieRate: 0.08,
        stakeWeights: [
            { value: 10, weight: 0.5 },
            { value: 25, weight: 0.25 },
            { value: 50, weight: 0.15 },
            { value: 100, weight: 0.1 },
        ],
    },
    {
        id: 'S2_Growth_Normal',
        label: 'Growth / Normal (25-50 humans/night, 40 PvP/day, 45% horse, equal skill)',
        humansMin: 25,
        humansMax: 50,
        humanSkillRatio: 1.0,
        refundRate: 0.01,
        pvpMin: 30,
        pvpMax: 50,
        pvpHorseFallbackRate: 0.45,
        pvpHumanWinRate: 0.5,
        pvpTieRate: 0.08,
        stakeWeights: [
            { value: 10, weight: 0.4 },
            { value: 25, weight: 0.3 },
            { value: 50, weight: 0.2 },
            { value: 100, weight: 0.1 },
        ],
    },
    {
        id: 'S3_HighVolume_Balanced',
        label: 'High Volume / Balanced (60-116 humans/night, 100 PvP/day, 30% horse, equal skill)',
        humansMin: 60,
        humansMax: 116,
        humanSkillRatio: 1.0,
        refundRate: 0.01,
        pvpMin: 80,
        pvpMax: 120,
        pvpHorseFallbackRate: 0.3,
        pvpHumanWinRate: 0.5,
        pvpTieRate: 0.08,
        stakeWeights: [
            { value: 10, weight: 0.35 },
            { value: 25, weight: 0.3 },
            { value: 50, weight: 0.2 },
            { value: 100, weight: 0.15 },
        ],
    },
    {
        id: 'S4_SkilledHumans_Edge',
        label: 'Skilled Humans Edge (30-60 humans/night, 50 PvP/day, 50% horse, alpha=1.5, 60% PvP win)',
        humansMin: 30,
        humansMax: 60,
        humanSkillRatio: 1.5,
        refundRate: 0.01,
        pvpMin: 40,
        pvpMax: 60,
        pvpHorseFallbackRate: 0.5,
        pvpHumanWinRate: 0.6,
        pvpTieRate: 0.06,
        stakeWeights: [
            { value: 10, weight: 0.3 },
            { value: 25, weight: 0.3 },
            { value: 50, weight: 0.25 },
            { value: 100, weight: 0.15 },
        ],
    },
    {
        id: 'S5_Adverse_Sharks_HighStakes',
        label: 'Adverse Sharks / High Stakes (40-80 humans/night, 80 PvP/day, 60% horse, alpha=2.0, 65% PvP win)',
        humansMin: 40,
        humansMax: 80,
        humanSkillRatio: 2.0,
        refundRate: 0.0,
        pvpMin: 70,
        pvpMax: 90,
        pvpHorseFallbackRate: 0.6,
        pvpHumanWinRate: 0.65,
        pvpTieRate: 0.05,
        stakeWeights: [
            { value: 10, weight: 0.1 },
            { value: 25, weight: 0.2 },
            { value: 50, weight: 0.35 },
            { value: 100, weight: 0.35 },
        ],
    },
    {
        id: 'S6_DailyCeiling_Stress',
        label: 'Daily Ceiling Stress (90-116 humans/night, 150 PvP/day, 60% horse, heavy 50/100 stakes)',
        humansMin: 90,
        humansMax: 116,
        humanSkillRatio: 1.25,
        refundRate: 0.0,
        pvpMin: 140,
        pvpMax: 160,
        pvpHorseFallbackRate: 0.6,
        pvpHumanWinRate: 0.55,
        pvpTieRate: 0.06,
        stakeWeights: [
            { value: 10, weight: 0.1 },
            { value: 25, weight: 0.15 },
            { value: 50, weight: 0.35 },
            { value: 100, weight: 0.4 },
        ],
    },
]);

const FINISH_TIERS = [1, 2, 3, 3, 5, 5, 5, 5];

function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pickWeighted(rng, items) {
    let r = rng();
    for (const item of items) {
        r -= item.weight;
        if (r <= 0) return item.value;
    }
    return items[items.length - 1].value;
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
    return sorted[idx];
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function sampleEightFinishers(rng, horses, humans, humanSkillRatio) {
    let remH = horses;
    let remU = humans;
    const isHorse = [];
    for (let slot = 0; slot < 8; slot += 1) {
        const wH = remH * 1.0;
        const wU = remU * humanSkillRatio;
        const totalW = wH + wU;
        if (totalW <= 0) {
            isHorse.push(true);
            continue;
        }
        if (rng() < wH / totalW) {
            isHorse.push(true);
            remH -= 1;
        } else {
            isHorse.push(false);
            remU -= 1;
        }
    }
    return isHorse;
}

export function runMonteCarloRegime(
    regime,
    days,
    { trials = 2000, seed = 20261124, config = LIVE_TREASURY_CONFIG } = {},
) {
    if (![30, 90].includes(days)) throw new Error('Monte Carlo horizon must be 30 or 90 days');
    if (!Number.isSafeInteger(trials) || trials < 1) throw new Error('trials must be a positive integer');

    const tournament = currentRules('tournament.nightly');
    const pvp = currentRules('pvp.standard');
    const tr = tournament.rules;
    const pr = pvp.rules;
    const fee = tr.entry.fee;

    const endingBalances = [];
    const maxDrawdowns = [];
    const totalSubsidies = [];
    const totalHorseReturns = [];
    const totalTournamentRakes = [];
    const totalPvpRakes = [];
    const totalPlatformNets = [];
    const blockedEventsArr = [];
    const dailyCapDaysArr = [];
    let warningBreaches = 0;
    let floorHits = 0;
    let firstWarningDaySum = 0;
    let totalVariance = 0;
    let maxTerminalEscrow = 0;
    let minBalanceEver = Infinity;

    const rng = mulberry32(seed ^ (days * 7919) ^ (regime.id.length * 104729));

    for (let t = 0; t < trials; t += 1) {
        let balance = config.openingBalance;
        let minBal = balance;
        let exposure = 0;
        let breachedWarning = false;
        let firstWarningDay = null;
        let hitFloor = false;
        let subsidySum = 0;
        let horseReturnSum = 0;
        let tournRakeSum = 0;
        let pvpRakeSum = 0;
        let humanNetSum = 0;
        let blockedEvents = 0;
        let dailyCapDays = 0;

        for (let day = 1; day <= days; day += 1) {
            let dailyDebit = 0;
            let dayCapped = false;

            const horseTarget =
                tr.field.horse_target.min +
                Math.floor(rng() * (tr.field.horse_target.max - tr.field.horse_target.min + 1));
            const maxHumans = tr.field.bracket_size - horseTarget;
            const rawHumans =
                regime.humansMin + Math.floor(rng() * (regime.humansMax - regime.humansMin + 1));
            const humanEntrants = Math.min(maxHumans, rawHumans);
            const players = horseTarget + humanEntrants;
            const subsidy = horseTarget * fee;
            const humanHold = humanEntrants * fee;

            if (
                balance - subsidy < config.floor ||
                dailyDebit + subsidy > config.dailyCeiling ||
                exposure + subsidy > config.exposureCeiling
            ) {
                blockedEvents += 1;
                if (dailyDebit + subsidy > config.dailyCeiling) dayCapped = true;
                if (balance - subsidy < config.floor) hitFloor = true;
            } else {
                balance -= subsidy;
                dailyDebit += subsidy;
                exposure += subsidy;
                subsidySum += subsidy;
                minBal = Math.min(minBal, balance);

                const isRefund = rng() < regime.refundRate;
                const gross = players * fee;
                const houseRake = isRefund ? 0 : players * tournamentEntryRake(tr, fee);
                let horseReturn = 0;
                let humanReturn = 0;

                if (isRefund) {
                    horseReturn = subsidy;
                    humanReturn = humanHold;
                } else {
                    const winnersAreHorse = sampleEightFinishers(
                        rng,
                        horseTarget,
                        humanEntrants,
                        regime.humanSkillRatio,
                    );
                    const finishers = FINISH_TIERS.map((finishTier, idx) => ({
                        userId: winnersAreHorse[idx] ? `h${idx}` : `u${idx}`,
                        finishTier,
                        isHorse: winnersAreHorse[idx],
                    }));
                    const prizes = tournamentPrizes(tr, gross - houseRake, finishers);
                    for (let i = 0; i < prizes.length; i += 1) {
                        if (finishers[i].isHorse) horseReturn += prizes[i].amount;
                        else humanReturn += prizes[i].amount;
                    }
                }

                const legSum = -(subsidy + humanHold) + houseRake + horseReturn + humanReturn;
                if (legSum !== 0) {
                    totalVariance += Math.abs(legSum);
                    throw new Error(`Tournament conservation violation: ${legSum}`);
                }
                balance += horseReturn;
                exposure -= subsidy;
                horseReturnSum += horseReturn;
                tournRakeSum += houseRake;
                humanNetSum += humanReturn - humanHold;
                minBal = Math.min(minBal, balance);
            }

            const pvpCount =
                regime.pvpMin + Math.floor(rng() * (regime.pvpMax - regime.pvpMin + 1));
            for (let m = 0; m < pvpCount; m += 1) {
                const stake = pickWeighted(rng, regime.stakeWeights);
                const pm = pvpMoney(pr, stake);
                const isHorseFallback = rng() < regime.pvpHorseFallbackRate;

                if (!isHorseFallback) {
                    const isTie = rng() < regime.pvpTieRate;
                    const rake = isTie ? 0 : pm.rake;
                    const legSum = -(2 * stake) + rake + (isTie ? 2 * stake : pm.winnerPayout);
                    if (legSum !== 0) {
                        totalVariance += Math.abs(legSum);
                        throw new Error(`PvP HH conservation violation: ${legSum}`);
                    }
                    pvpRakeSum += rake;
                    humanNetSum -= rake;
                } else {
                    if (
                        balance - stake < config.floor ||
                        dailyDebit + stake > config.dailyCeiling ||
                        exposure + stake > config.exposureCeiling
                    ) {
                        blockedEvents += 1;
                        if (dailyDebit + stake > config.dailyCeiling) dayCapped = true;
                        if (balance - stake < config.floor) hitFloor = true;
                        continue;
                    }
                    balance -= stake;
                    dailyDebit += stake;
                    exposure += stake;
                    subsidySum += stake;
                    minBal = Math.min(minBal, balance);

                    const r = rng();
                    let rake = 0;
                    let horseReturn = 0;
                    let humanReturn = 0;
                    if (r < regime.pvpTieRate) {
                        horseReturn = stake;
                        humanReturn = stake;
                    } else if (r < regime.pvpTieRate + (1 - regime.pvpTieRate) * regime.pvpHumanWinRate) {
                        rake = pm.rake;
                        humanReturn = pm.winnerPayout;
                    } else {
                        rake = pm.rake;
                        horseReturn = pm.winnerPayout;
                    }

                    const legSum = -(2 * stake) + rake + horseReturn + humanReturn;
                    if (legSum !== 0) {
                        totalVariance += Math.abs(legSum);
                        throw new Error(`PvP Horse conservation violation: ${legSum}`);
                    }
                    balance += horseReturn;
                    exposure -= stake;
                    horseReturnSum += horseReturn;
                    pvpRakeSum += rake;
                    humanNetSum += humanReturn - stake;
                    minBal = Math.min(minBal, balance);
                }
            }

            if (dayCapped) dailyCapDays += 1;
            if (minBal <= config.warningLevel && !breachedWarning) {
                breachedWarning = true;
                firstWarningDay = day;
            }
            if (balance < config.floor || exposure !== 0) {
                throw new Error(`Floor/exposure violation: balance=${balance} exposure=${exposure}`);
            }
            maxTerminalEscrow = Math.max(maxTerminalEscrow, Math.abs(exposure));
        }

        const treasuryDelta = balance - config.openingBalance;
        const platformNet = treasuryDelta + tournRakeSum + pvpRakeSum;
        if (platformNet + humanNetSum !== 0) {
            throw new Error(`Global conservation violation: platform=${platformNet} human=${humanNetSum}`);
        }

        endingBalances.push(balance);
        maxDrawdowns.push(config.openingBalance - minBal);
        totalSubsidies.push(subsidySum);
        totalHorseReturns.push(horseReturnSum);
        totalTournamentRakes.push(tournRakeSum);
        totalPvpRakes.push(pvpRakeSum);
        totalPlatformNets.push(platformNet);
        blockedEventsArr.push(blockedEvents);
        dailyCapDaysArr.push(dailyCapDays);
        if (breachedWarning) {
            warningBreaches += 1;
            firstWarningDaySum += firstWarningDay;
        }
        if (hitFloor) floorHits += 1;
        minBalanceEver = Math.min(minBalanceEver, minBal);
    }

    endingBalances.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);
    totalPlatformNets.sort((a, b) => a - b);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
        regime: regime.id,
        label: regime.label,
        days,
        trials,
        dailyAvg: {
            grossSubsidy: round2(avg(totalSubsidies) / days),
            horseReturn: round2(avg(totalHorseReturns) / days),
            treasuryNetDraw: round2((config.openingBalance - avg(endingBalances)) / days),
            tournamentRake: round2(avg(totalTournamentRakes) / days),
            pvpRake: round2(avg(totalPvpRakes) / days),
            totalRake: round2((avg(totalTournamentRakes) + avg(totalPvpRakes)) / days),
            platformNet: round2(avg(totalPlatformNets) / days),
        },
        horizonTotals: {
            meanGrossSubsidy: round2(avg(totalSubsidies)),
            meanHorseReturn: round2(avg(totalHorseReturns)),
            meanTreasuryNetDraw: round2(config.openingBalance - avg(endingBalances)),
            meanTotalRake: round2(avg(totalTournamentRakes) + avg(totalPvpRakes)),
            meanPlatformNet: round2(avg(totalPlatformNets)),
            p5PlatformNet: percentile(totalPlatformNets, 5),
        },
        treasuryBalance: {
            opening: config.openingBalance,
            meanEnding: round2(avg(endingBalances)),
            p5Ending: percentile(endingBalances, 5),
            p50Ending: percentile(endingBalances, 50),
            p95Ending: percentile(endingBalances, 95),
            minEnding: endingBalances[0],
            minIntradayEver: minBalanceEver,
        },
        drawdown: {
            meanMax: round2(avg(maxDrawdowns)),
            p95Max: percentile(maxDrawdowns, 95),
            p99Max: percentile(maxDrawdowns, 99),
            worstMax: maxDrawdowns[maxDrawdowns.length - 1],
        },
        limitsAndRisk: {
            warningBreachPct: round2((warningBreaches / trials) * 100),
            meanDayOfFirstWarning: warningBreaches > 0 ? round2(firstWarningDaySum / warningBreaches) : null,
            floorHitPct: round2((floorHits / trials) * 100),
            meanDailyCapDays: round2(avg(dailyCapDaysArr)),
            meanBlockedEvents: round2(avg(blockedEventsArr)),
        },
        invariants: {
            variance: totalVariance,
            maxTerminalEscrow,
            allTrajectoriesConserved:
                totalVariance === 0 && maxTerminalEscrow === 0 && minBalanceEver >= config.floor,
        },
    };
}

export function computeAnalyticalBreakEven() {
    const meanHorseTarget = 105;
    const tournament = [0.75, 1.0, 1.25, 1.5, 2.0].map((alpha) => {
        const platformBreakEvenHumans =
            9 * alpha <= 10 ? 0 : Math.ceil(((9 * alpha - 10) / alpha) * meanHorseTarget);
        const treasuryOnlyBreakEvenHumans =
            9 - 10 * alpha > 0 ? Math.ceil(meanHorseTarget / (9 - 10 * alpha)) : null;
        const drawAt = (U) =>
            round2(10 * meanHorseTarget - (9 * (meanHorseTarget + U) * meanHorseTarget) / (meanHorseTarget + alpha * U));
        const platAt = (U) => round2(-drawAt(U) + (meanHorseTarget + U));
        return {
            humanSkillRatioAlpha: alpha,
            meanHorseTarget,
            treasuryOnlyBreakEvenHumans,
            platformConsolidatedBreakEvenHumans: platformBreakEvenHumans,
            expectedDailyTreasuryDrawAt20Humans: drawAt(20),
            expectedDailyPlatformNetAt20Humans: platAt(20),
            expectedDailyTreasuryDrawAt60Humans: drawAt(60),
            expectedDailyPlatformNetAt60Humans: platAt(60),
        };
    });

    const pvp = [0.4, 0.4444, 0.5, 0.5556, 0.6, 0.65, 0.7].map((humanWinRate) => ({
        humanWinRate,
        treasuryDeltaPer100Stake: round2((0.8 - 1.8 * humanWinRate) * 100),
        platformDeltaPer100Stake: round2((1.0 - 1.8 * humanWinRate) * 100),
        requiredHumanVsHumanShareForPlatformBreakEven:
            humanWinRate <= 5 / 9
                ? 0
                : round2(((1.8 * humanWinRate - 1.0) / (1.8 * humanWinRate - 0.8)) * 100),
    }));

    return {
        tournament,
        pvp,
        pvpTreasuryBreakEvenHumanWinRate: round2((4 / 9) * 100),
        pvpPlatformBreakEvenHumanWinRate: round2((5 / 9) * 100),
    };
}

export function runFullEconomySimulation({
    trials = 2000,
    seed = 20261124,
    config = LIVE_TREASURY_CONFIG,
    regimes = DEFAULT_REGIMES,
} = {}) {
    const reports = [];
    for (const days of [30, 90]) {
        for (const horseTarget of [70, 100, 140]) {
            for (const scenario of ['horse-prizes', 'human-prizes', 'refunds', 'human-prizes-plus-pvp-stress']) {
                reports.push({
                    scenario,
                    horseTarget,
                    ...simulateTriviaEconomy({
                        openingBalance: config.openingBalance,
                        floor: config.floor,
                        dailyCeiling: config.dailyCeiling,
                        exposureCeiling: config.exposureCeiling,
                        days,
                        horseTarget,
                        humanEntrants: scenario === 'horse-prizes' ? 0 : 8,
                        humanWinners: scenario !== 'horse-prizes',
                        refundEvery: scenario === 'refunds' ? 1 : 0,
                        pvpPerDay: scenario === 'human-prizes-plus-pvp-stress' ? 40 : 0,
                    }),
                });
            }
        }
    }

    const monteCarlo = [];
    for (const days of [30, 90]) {
        for (const regime of regimes) {
            monteCarlo.push(runMonteCarloRegime(regime, days, { trials, seed, config }));
        }
    }

    const tournamentRules = currentRules('tournament.nightly');
    const pvpRules = currentRules('pvp.standard');

    return {
        contract: 'trivia-economy-forecast/2',
        assumptions:
            'Live production rules and treasury limits (25,000 opening, 0 floor, 3,000 daily/exposure ceilings, 6,000 warning level). Includes deterministic 24-scenario baseline, seeded 30/90-day Monte Carlo regimes, and analytical break-even thresholds. Forecasts only; no database execution or elapsed-event certification.',
        seed,
        trialsPerRegime: trials,
        configuration: config,
        ruleHashes: [tournamentRules, pvpRules].map((v) => ({
            id: v.id,
            sha256: createHash('sha256').update(canonicalJson(v.rules)).digest('hex'),
        })),
        reports,
        monteCarlo,
        analyticalBreakEven: computeAnalyticalBreakEven(),
    };
}
