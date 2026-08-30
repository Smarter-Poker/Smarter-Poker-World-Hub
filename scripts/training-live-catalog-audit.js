/**
 * Live Training Catalog Audit
 * ===========================
 * Read-only production-source validation for every canonical game and all
 * twelve levels (107 x 12 = 1,284 runtime paths).
 *
 * Usage:
 *   TRAINING_AUDIT_ENV_FILE=/absolute/path/.env.local \
 *     node scripts/training-live-catalog-audit.js
 *
 * The script validates every compatible cached question after applying the
 * exact API question contract. A cell with no compatible cache rows is driven
 * through the real DeterministicGTOEngine against the configured live solver
 * tables. It never writes to Supabase.
 */
'use strict';

if (process.env.TRAINING_AUDIT_VERBOSE !== '1') console.debug = () => {};

const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const sucrase = require('sucrase');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');
const originalJsLoader = Module._extensions['.js'];
Module._extensions['.js'] = function trainingAuditLoader(mod, filename) {
    if (filename.includes('node_modules')) return originalJsLoader(mod, filename);
    const code = fs.readFileSync(filename, 'utf8');
    if (!/\b(import|export)\b/.test(code)) return originalJsLoader(mod, filename);
    const result = babel.transformSync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
        parserOpts: {
            plugins: [
                'jsx',
                'classProperties',
                'optionalChaining',
                'nullishCoalescingOperator',
                'objectRestSpread',
            ],
        },
    });
    mod._compile(result.code, filename);
};
Module._extensions['.ts'] = function trainingAuditTypeScriptLoader(mod, filename) {
    const code = fs.readFileSync(filename, 'utf8');
    const result = sucrase.transform(code, {
        transforms: ['typescript', 'imports'],
        filePath: filename,
    });
    mod._compile(result.code, filename);
};

const envFile = process.env.TRAINING_AUDIT_ENV_FILE;
if (envFile) dotenv.config({ path: envFile, quiet: true });

const { TRAINING_LIBRARY } = require(path.join(ROOT, 'src/data/TRAINING_LIBRARY.js'));
const { GAME_CONFIGS } = require(path.join(ROOT, 'src/config/gameConfigs.js'));
const { pioQueryService } = require(path.join(ROOT, 'src/services/PIOQueryService.js'));
const { getGameScenarioConfig } = require(path.join(ROOT, 'src/config/GameScenarioMap.ts'));
const {
    DeterministicGTOEngine,
} = require(path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'));
const {
    applyDeterministicEnginePatches,
} = require(path.join(ROOT, 'src/engines/deterministicEnginePatches.js'));

const PAGE_SIZE = 1000;
const FALLBACK_QUESTION_COUNT = 4;

async function fetchAllCacheRows(supabase) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('training_question_cache')
            .select('id, question_id, game_id, level, engine_type, question_data')
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`training_question_cache page ${from}: ${error.message}`);
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) break;
    }
    return rows;
}

async function main() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    const {
        filterCachedRowsForGame,
    } = await import(path.join(ROOT, 'src/lib/training/cacheContract.mjs'));
    const {
        enforceTrainingQuestionContract,
        validateTrainingQuestion,
    } = await import(path.join(ROOT, 'src/lib/training/questionContract.mjs'));

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
    const engine = new DeterministicGTOEngine();
    applyDeterministicEnginePatches(engine);
    engine.setSupabaseClient(supabase);

    const allRows = await fetchAllCacheRows(supabase);
    const canonicalIds = new Set(TRAINING_LIBRARY.map((game) => game.id));
    const grouped = new Map();
    for (const row of allRows) {
        if (!canonicalIds.has(row.game_id)) continue;
        const key = `${row.game_id}:${Number(row.level)}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
    }

    const failures = [];
    const totals = {
        games: TRAINING_LIBRARY.length,
        levels: 12,
        cells: 0,
        cacheBackedCells: 0,
        engineBackedCells: 0,
        cacheRowsChecked: 0,
        generatedQuestionsChecked: 0,
        incompatibleRowsRejected: 0,
    };

    const validate = (question, label) => {
        const contracted = enforceTrainingQuestionContract(structuredClone(question));
        const result = validateTrainingQuestion(contracted);
        if (!result.valid) {
            failures.push(`${label}: ${result.issues.join(' | ')}`);
            return false;
        }
        return true;
    };

    for (const game of TRAINING_LIBRARY) {
        const pioConfig = pioQueryService.getGameConfig(game.id);
        const gameConfig = GAME_CONFIGS[game.id];
        const scenarioConfig = getGameScenarioConfig(game.id);

        for (let level = 1; level <= 12; level++) {
            totals.cells++;
            const key = `${game.id}:${level}`;
            const rawRows = grouped.get(key) || [];
            const compatibleRows = filterCachedRowsForGame(rawRows, pioConfig);
            totals.incompatibleRowsRejected += rawRows.length - compatibleRows.length;

            if (compatibleRows.length > 0) {
                totals.cacheBackedCells++;
                for (const row of compatibleRows) {
                    totals.cacheRowsChecked++;
                    validate(row.question_data, `${key} cache ${row.question_id || row.id}`);
                }
                continue;
            }

            totals.engineBackedCells++;
            let batch = [];
            try {
                batch = await engine.generateBatch({
                    gameId: game.id,
                    level,
                    count: FALLBACK_QUESTION_COUNT,
                    gameConfig: pioConfig || gameConfig,
                    targetPositions: scenarioConfig?.positions || undefined,
                    difficulty: 'standard',
                    scenarioLevels: scenarioConfig?.scenarioLevels || undefined,
                    spotTypes: scenarioConfig?.spotTypes || undefined,
                    stackDepths: scenarioConfig?.stackDepths || undefined,
                    seenIds: [],
                });
            } catch (error) {
                failures.push(`${key} engine threw: ${error.message}`);
                continue;
            }

            if (!Array.isArray(batch) || batch.length === 0) {
                failures.push(`${key} has no compatible cache row and engine returned zero questions`);
                continue;
            }
            for (const question of batch) {
                totals.generatedQuestionsChecked++;
                validate(question, `${key} generated ${question?.id || 'unknown'}`);
            }
        }
    }

    console.log(JSON.stringify({
        success: failures.length === 0,
        totals,
        failures: failures.slice(0, 100),
        omittedFailureCount: Math.max(0, failures.length - 100),
    }, null, 2));
    process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error) => {
    console.error(JSON.stringify({ success: false, fatal: error.message }, null, 2));
    process.exit(2);
});
