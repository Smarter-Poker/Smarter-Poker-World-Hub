/**
 * Trivia Casino Realism, Phase 2: versioned rules, the balanced Trivia
 * diamond journal and the settlement foundation.
 *
 * The database half is proven on the replica and in production (see
 * docs/trivia/PHASE-2-RELEASE-REPORT.md). This file keeps the repository
 * half honest:
 *   - the JS rules module is the one source the migration seed is generated
 *     from, and every paid solo mode is seeded exactly as it is priced, capped
 *     and sized today;
 *   - the money helpers (PvP pot and rake, tournament prize split) conserve
 *     every diamond;
 *   - the migrations keep browser roles out, pin search_path, install the
 *     solo switch OFF and refuse to rewire a function that changed since the
 *     phase was prepared;
 *   - the lifeline spend route and the daily economy audit use the new
 *     functions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    TRIVIA_RULES_CONTRACT,
    SOLO_MODES,
    PAID_SOLO_MODES,
    TRIVIA_RULE_VERSIONS,
    CURRENT_RULES,
    canonicalJson,
    currentRules,
    rulesKeyForMode,
    pvpMoney,
    tournamentEntryRake,
    tournamentPrizes,
} from '../src/lib/trivia/rules/index.mjs';
import { rulesSeedSql } from '../scripts/trivia/rules-seed-sql.mjs';
import { PVP_ALLOWED_STAKES, PVP_QUESTION_COUNT } from '../src/lib/trivia/pvpSettlementPolicy.mjs';
import { fixedSpendAmount } from '../src/lib/diamonds/spendReceiptPolicy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function migration(suffix) {
    const dir = path.join(ROOT, 'supabase/migrations');
    const matches = fs.readdirSync(dir).filter(f => f.endsWith(`_${suffix}.sql`));
    assert.equal(matches.length, 1, `exactly one migration named *_${suffix}.sql`);
    return fs.readFileSync(path.join(dir, matches[0]), 'utf8');
}

const FOUNDATION = migration('trivia_p2_ledger_foundation');
const SOLO_SWITCH = migration('trivia_p2_solo_paths_switch');

function objectLiteral(source, marker) {
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `${marker} not found`);
    const open = source.indexOf('{', start);
    const close = source.indexOf('}', open);
    const out = {};
    for (const m of source.slice(open + 1, close).matchAll(/'?([a-z-]+)'?\s*:\s*([A-Z_0-9]+|\d+)/g)) {
        out[m[1]] = m[2];
    }
    return out;
}

test('the rules registry has one current version per rules key and canonical, integer-only rules', () => {
    assert.equal(TRIVIA_RULES_CONTRACT, 'trivia-rules/1');
    const ids = TRIVIA_RULE_VERSIONS.map(v => v.id);
    assert.equal(new Set(ids).size, ids.length, 'rules version ids are unique');
    assert.equal(TRIVIA_RULE_VERSIONS.length, SOLO_MODES.length + 2);
    for (const v of TRIVIA_RULE_VERSIONS) {
        assert.equal(v.id, `${v.rulesKey}@${v.version}`);
        assert.equal(v.rules.contract, TRIVIA_RULES_CONTRACT);
        assert.equal(v.rules.family, v.family);
        assert.doesNotThrow(() => canonicalJson(v.rules), `${v.id} is canonical`);
        assert.equal(CURRENT_RULES[v.rulesKey], v.id);
        assert.equal(rulesKeyForMode(v.mode), v.rulesKey);
        assert.ok(Object.isFrozen(v));
    }
    assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
    assert.throws(() => canonicalJson({ rate: 0.1 }), /integers only/);
    assert.equal(currentRules('pvp.standard').provisional, false);
    assert.equal(currentRules('tournament.nightly').provisional, true, 'nightly tournament economics stay provisional until approved');
});

test('the migration seed is exactly the output of the rules generator', () => {
    const seed = rulesSeedSql();
    assert.match(seed, /^-- BEGIN GENERATED RULES SEED/m);
    assert.ok(FOUNDATION.includes(seed), 'regenerate the seed with scripts/trivia/rules-seed-sql.mjs and rebuild the migration');
    for (const v of TRIVIA_RULE_VERSIONS) {
        assert.ok(seed.includes(`'${v.id}'`), `${v.id} is seeded`);
    }
});

test('every paid solo mode is seeded exactly as it is priced, capped and sized today', () => {
    const engine = read('src/lib/trivia/triviaEngine.ts');
    const caps = objectLiteral(engine, 'export const DAILY_DIAMOND_CAPS');
    const sessionStart = read('pages/api/trivia/session-start.js');
    const counts = objectLiteral(sessionStart, 'const SESSION_QUESTION_COUNTS');
    const costCase = SOLO_SWITCH.match(/v_cost int := CASE p_mode([\s\S]*?)ELSE 0 END;/);
    assert.ok(costCase, 'create_trivia_session_v2 still prices entry in SQL');
    const sqlCosts = Object.fromEntries([...costCase[1].matchAll(/WHEN '([a-z-]+)' THEN (\d+)/g)].map(m => [m[1], Number(m[2])]));

    assert.deepEqual([...PAID_SOLO_MODES].sort(), Object.keys(sqlCosts).sort(), 'the paid modes are the modes SQL charges for');
    for (const mode of SOLO_MODES) {
        const rules = currentRules(`solo.${mode}`).rules;
        const block = engine.slice(engine.indexOf(`id: '${mode}'`));
        const engineCost = Number(block.match(/diamondCost:\s*(\d+)/)[1]);
        assert.equal(rules.entry.cost, engineCost, `${mode} entry cost (triviaEngine diamondCost)`);
        assert.equal(rules.entry.cost, sqlCosts[mode] ?? 0, `${mode} entry cost (create_trivia_session_v2)`);
        assert.equal(rules.daily_cap.per_mode_per_day, Number(caps[mode]), `${mode} daily diamond cap`);
        assert.equal(rules.questions.count, Number(counts[mode]), `${mode} question count`);
        assert.equal(rules.entry.vip_plays_free, rules.entry.cost > 0);
        if (rules.entry.cost > 0) {
            assert.equal(rules.entry.wallet_kind, 'trivia_entry');
            assert.equal(rules.entry.reference, 'trivia_entry_<session>');
            assert.equal(rules.refund.reference, 'trivia_entry_refund_<session>');
        }
        assert.equal(rules.payout.wallet_kind, 'trivia_run');
    }
    for (const mode of ['endless', 'survival']) {
        assert.equal(currentRules(`solo.${mode}`).rules.lifeline.skip_cost, fixedSpendAmount('trivia_lifeline'));
    }
    assert.equal(currentRules('solo.daily').rules.daily_bonus.amount, 10);
});

test('PvP v1 follows the competitive contract and a settled pot conserves every diamond', () => {
    const rules = currentRules('pvp.standard').rules;
    assert.deepEqual(rules.stakes, [...PVP_ALLOWED_STAKES]);
    assert.equal(rules.questions.count, PVP_QUESTION_COUNT);
    assert.equal(rules.horse.max_horses_per_match, 1);
    assert.equal(rules.horse.seat_funding, 'treasury');
    assert.equal(rules.horse.winnings_to, 'treasury');
    for (const stake of PVP_ALLOWED_STAKES) {
        const money = pvpMoney(rules, stake);
        assert.equal(money.pot, stake * 2);
        assert.equal(money.rake + money.winnerPayout, money.pot);
        assert.equal(money.rake, Math.floor(money.pot / 10));
    }
    assert.equal(pvpMoney(rules, 11), null, 'an unlisted stake has no price');
});

test('nightly tournament v1 (provisional) splits any pool without creating or losing a diamond', () => {
    const rules = currentRules('tournament.nightly').rules;
    assert.equal(rules.entry.fee, 10);
    assert.equal(tournamentEntryRake(rules, rules.entry.fee), 1);
    assert.equal(tournamentEntryRake(rules, 0), 0);
    const bp = rules.prizes.tiers.reduce((sum, t) => sum + t.bp, 0);
    assert.equal(bp, 10000, 'prize tiers pay out the whole final prize pool');
    const finishers = [
        { userId: 'a', finishTier: 1 }, { userId: 'b', finishTier: 2 },
        { userId: 'c', finishTier: 3 }, { userId: 'd', finishTier: 3 },
        { userId: 'e', finishTier: 5 }, { userId: 'f', finishTier: 5 },
        { userId: 'g', finishTier: 5 }, { userId: 'h', finishTier: 5 },
    ];
    for (const pool of [0, 1, 7, 99, 230, 1000, 2297, 4096]) {
        const prizes = tournamentPrizes(rules, pool, finishers);
        assert.equal(prizes.reduce((sum, p) => sum + p.amount, 0), pool, `pool ${pool} is paid exactly`);
        assert.ok(prizes.every(p => Number.isSafeInteger(p.amount) && p.amount > 0));
    }
});

test('the ledger migrations keep browser roles out and install every switch OFF', () => {
    for (const sql of [FOUNDATION, SOLO_SWITCH]) {
        for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION\s+(public\.[a-z0-9_]+)\s*\(([\s\S]*?)\bAS\s+\$/gi)) {
            assert.match(m[2], /SET\s+search_path/i, `${m[1]} pins search_path`);
        }
        assert.doesNotMatch(sql, /GRANT\s+[A-Z, ]+\s+ON\s+[\s\S]{0,200}?\s+TO\s+(anon|authenticated|public)\b/i);
        const topLevel = sql.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/g, '');
        assert.equal(/UPDATE\s+public\.trivia_ledger_switches/i.test(topLevel), false, 'no migration flips a ledger switch');
    }
    assert.match(FOUNDATION, /REVOKE ALL ON public\.%I FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(FOUNDATION, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(FOUNDATION, /ENABLE ROW LEVEL SECURITY/i);
    assert.match(FOUNDATION, /VALUES \('solo_journal', false,/);
    assert.match(FOUNDATION, /DEFERRABLE INITIALLY DEFERRED/i, 'journal balance is checked at commit');
    assert.match(SOLO_SWITCH, /pre-image check: % changed since Phase 2 was prepared/);
    assert.match(SOLO_SWITCH, /GRANT EXECUTE ON FUNCTION public\.trivia_solo_spend\(uuid, integer, text, text, text\) TO service_role;/);
    for (const call of [
        'public.trivia_solo_charge_entry(p_session_id, p_user_id, p_mode, v_cost)',
        'public.trivia_solo_credit(',
    ]) {
        assert.ok(SOLO_SWITCH.includes(call), `${call} is wired into the solo paths`);
    }
});

test('the lifeline spend route and the economy audit use the Phase 2 functions', () => {
    const spend = read('pages/api/diamonds/spend.js');
    assert.match(spend, /source === 'trivia_lifeline' \? 'trivia_solo_spend' : 'deduct_diamonds'/);
    assert.match(spend, /supabase\.rpc\(spendRpc,\s*\{/);
    const audit = read('pages/api/cron/trivia-economy-audit.js');
    assert.match(audit, /rpc\('run_trivia_economy_audit_v1'\)/);
    assert.match(audit, /rpc\('trivia_ledger_health_v1'\)/);
    assert.match(audit, /const healthy = economyHealthy && ledgerHealthy;/);
    assert.match(audit, /status\(healthy \? 200 : 503\)/);
});
