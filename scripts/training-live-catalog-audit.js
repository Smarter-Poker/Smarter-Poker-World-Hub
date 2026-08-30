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
const { Pool } = require('pg');

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

// `question_data` can carry solver matrices, making 1,000-row responses exceed
// the production gateway's practical payload ceiling. Smaller pages keep this
// audit deterministic instead of occasionally receiving the payload through
// the client's error channel before validation begins.
const PAGE_SIZE = 250;
const FALLBACK_QUESTION_COUNT = 4;
const CACHE_READ_CONCURRENCY = Math.max(1, Number(process.env.TRAINING_AUDIT_DB_CONCURRENCY || 3));
const CACHE_READ_ATTEMPTS = 4;

const AUDIT_TABLE_COLUMNS = {
    training_question_cache: new Set([
        'id', 'question_id', 'game_id', 'level', 'engine_type', 'question_data',
    ]),
    solved_spots_gold: new Set([
        'id', 'scenario_hash', 'street', 'stack_depth', 'game_type',
        'strategy_matrix', 'strategy_matrix_v2',
    ]),
    memory_charts_gold: new Set(['stack_depth']),
};

function assertAuditIdentifier(identifier, allowedColumns) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
        throw new Error(`Unsafe audit identifier: ${identifier}`);
    }
    if (allowedColumns && !allowedColumns.has(identifier)) {
        throw new Error(`Column is not allowlisted for the live audit: ${identifier}`);
    }
    return `"${identifier}"`;
}

class ReadOnlyPgQuery {
    constructor(pool, table) {
        if (!Object.prototype.hasOwnProperty.call(AUDIT_TABLE_COLUMNS, table)) {
            throw new Error(`Table is not allowlisted for the live audit: ${table}`);
        }
        this.pool = pool;
        this.table = table;
        this.columns = '*';
        this.filters = [];
        this.params = [];
        this.orderBy = null;
        this.rowLimit = null;
        this.rowOffset = null;
        this.countMode = null;
        this.head = false;
    }

    select(columns = '*', options = {}) {
        const allowedColumns = AUDIT_TABLE_COLUMNS[this.table];
        this.columns = columns === '*'
            ? '*'
            : String(columns)
                .split(',')
                .map((column) => assertAuditIdentifier(column.trim(), allowedColumns))
                .join(', ');
        this.countMode = options.count || null;
        this.head = options.head === true;
        return this;
    }

    addFilter(column, operator, value) {
        const allowedColumns = AUDIT_TABLE_COLUMNS[this.table];
        const safeColumn = assertAuditIdentifier(column, allowedColumns);
        if (value === null && operator === '=') {
            this.filters.push(`${safeColumn} IS NULL`);
            return this;
        }
        this.params.push(value);
        this.filters.push(`${safeColumn} ${operator} $${this.params.length}`);
        return this;
    }

    eq(column, value) { return this.addFilter(column, '=', value); }
    lte(column, value) { return this.addFilter(column, '<=', value); }
    gte(column, value) { return this.addFilter(column, '>=', value); }
    ilike(column, value) { return this.addFilter(column, 'ILIKE', value); }

    order(column, { ascending = true } = {}) {
        const allowedColumns = AUDIT_TABLE_COLUMNS[this.table];
        this.orderBy = `${assertAuditIdentifier(column, allowedColumns)} ${ascending ? 'ASC' : 'DESC'}`;
        return this;
    }

    limit(value) {
        this.rowLimit = Math.max(0, Number(value));
        return this;
    }

    range(from, to) {
        this.rowOffset = Math.max(0, Number(from));
        this.rowLimit = Math.max(0, Number(to) - this.rowOffset + 1);
        return this;
    }

    async execute() {
        try {
            const table = assertAuditIdentifier(this.table);
            const where = this.filters.length > 0 ? ` WHERE ${this.filters.join(' AND ')}` : '';
            if (this.countMode) {
                const result = await this.pool.query(
                    `SELECT count(*)::int AS count FROM ${table}${where}`,
                    this.params
                );
                return {
                    data: this.head ? null : result.rows,
                    count: Number(result.rows[0]?.count || 0),
                    error: null,
                };
            }

            let sql = `SELECT ${this.columns} FROM ${table}${where}`;
            if (this.orderBy) sql += ` ORDER BY ${this.orderBy}`;
            if (this.rowLimit !== null) sql += ` LIMIT ${Math.floor(this.rowLimit)}`;
            if (this.rowOffset !== null) sql += ` OFFSET ${Math.floor(this.rowOffset)}`;
            const result = await this.pool.query(sql, this.params);
            return { data: result.rows, count: null, error: null };
        } catch (error) {
            return { data: null, count: null, error };
        }
    }

    then(resolve, reject) {
        return this.execute().then(resolve, reject);
    }
}

function createReadOnlyDatabaseClient() {
    if (process.env.SUPABASE_DB_PASSWORD) {
        const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
        const pool = new Pool({
            host: `db.${projectRef}.supabase.co`,
            port: 5432,
            user: 'postgres',
            password: process.env.SUPABASE_DB_PASSWORD,
            database: 'postgres',
            ssl: { rejectUnauthorized: false },
            max: CACHE_READ_CONCURRENCY,
            connectionTimeoutMillis: 15000,
            statement_timeout: 30000,
            options: '-c default_transaction_read_only=on',
        });
        return {
            client: { from: (table) => new ReadOnlyPgQuery(pool, table) },
            source: 'read-only-postgres',
            close: () => pool.end(),
        };
    }

    const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );
    return { client, source: 'supabase-rest', close: async () => {} };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchCachePage(supabase, from) {
    let lastError = null;
    for (let attempt = 1; attempt <= CACHE_READ_ATTEMPTS; attempt++) {
        const { data, error } = await supabase
            .from('training_question_cache')
            .select('id, question_id, game_id, level, engine_type, question_data')
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        if (!error) return data || [];
        lastError = error;
        if (attempt < CACHE_READ_ATTEMPTS) await wait(500 * attempt);
    }
    throw new Error(`training_question_cache page ${from}: ${lastError?.message || 'unknown read error'}`);
}

async function fetchAllCacheRows(supabase) {
    let count = null;
    let countError = null;
    for (let attempt = 1; attempt <= CACHE_READ_ATTEMPTS; attempt++) {
        const response = await supabase
            .from('training_question_cache')
            .select('id', { count: 'exact', head: true });
        count = response.count;
        countError = response.error;
        if (!countError && Number.isInteger(count)) break;
        if (attempt < CACHE_READ_ATTEMPTS) await wait(500 * attempt);
    }
    const knownPageCount = !countError && Number.isInteger(count)
        ? Math.ceil(count / PAGE_SIZE)
        : null;
    const pages = knownPageCount === null ? [] : new Array(knownPageCount);
    let nextPage = 0;
    let terminalPage = knownPageCount;
    const workerCount = knownPageCount === null
        ? CACHE_READ_CONCURRENCY
        : Math.min(CACHE_READ_CONCURRENCY, knownPageCount);
    const workers = Array.from({ length: workerCount }, async () => {
        while (terminalPage === null || nextPage < terminalPage) {
            const pageIndex = nextPage++;
            if (terminalPage !== null && pageIndex >= terminalPage) break;
            const page = await fetchCachePage(supabase, pageIndex * PAGE_SIZE);
            pages[pageIndex] = page;
            if (knownPageCount === null && page.length < PAGE_SIZE) {
                terminalPage = Math.min(terminalPage ?? Infinity, pageIndex + 1);
            }
        }
    });
    await Promise.all(workers);
    return pages.slice(0, terminalPage ?? pages.length).flat();
}

async function main() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
    }
    if (!process.env.SUPABASE_DB_PASSWORD && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_DB_PASSWORD or SUPABASE_SERVICE_ROLE_KEY is required');
    }

    const {
        filterCachedRowsForGame,
    } = await import(path.join(ROOT, 'src/lib/training/cacheContract.mjs'));
    const {
        enforceTrainingQuestionContract,
        validateTrainingQuestion,
    } = await import(path.join(ROOT, 'src/lib/training/questionContract.mjs'));

    const database = createReadOnlyDatabaseClient();
    const supabase = database.client;
    const engine = new DeterministicGTOEngine();
    applyDeterministicEnginePatches(engine);
    engine.setSupabaseClient(supabase);

    try {
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
            const optionSummary = (contracted?.options || [])
                .map((option) => `${option?.id || 'missing-id'}=${option?.text || 'missing-text'}`)
                .join(' ; ');
            failures.push(`${label}: ${result.issues.join(' | ')} [${optionSummary}]`);
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
            databaseSource: database.source,
            totals,
            failures: failures.slice(0, 100),
            omittedFailureCount: Math.max(0, failures.length - 100),
        }, null, 2));
        process.exitCode = failures.length === 0 ? 0 : 1;
    } finally {
        await database.close();
    }
}

main().catch((error) => {
    console.error(JSON.stringify({ success: false, fatal: error.message }, null, 2));
    process.exit(2);
});
