import {
    LIVE_TREASURY_CONFIG,
    runFullEconomySimulation,
} from '../../src/lib/trivia/economySimulationMonteCarlo.mjs';

const trialsIdx = process.argv.indexOf('--trials');
const trials = trialsIdx !== -1 ? Number.parseInt(process.argv[trialsIdx + 1], 10) : 2000;

const report = runFullEconomySimulation({
    trials: Number.isSafeInteger(trials) && trials > 0 ? trials : 2000,
    seed: 20261124,
    config: LIVE_TREASURY_CONFIG,
});

console.log(JSON.stringify(report, null, 2));
