#!/usr/bin/env node
/**
 * Prints the trivia_rules_versions seed block for the Phase 2 migration from
 * src/lib/trivia/rules/index.mjs. __tests__/trivia-rules-registry.test.mjs
 * regenerates it and requires the migration to contain exactly this text.
 */
import crypto from 'node:crypto';
import { TRIVIA_RULE_VERSIONS, CURRENT_RULES, canonicalJson } from '../../src/lib/trivia/rules/index.mjs';

const q = s => `'${String(s).replace(/'/g, "''")}'`;

export function rulesSeedSql() {
    const rows = TRIVIA_RULE_VERSIONS.map(v => {
        const canonical = canonicalJson(v.rules);
        const sha = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
        return `  (${q(v.id)}, ${q(v.rulesKey)}, ${v.version}, ${q(v.family)}, ${q(v.mode)}, ${v.provisional}, ${q(v.approvalSource)}, ${q(canonical)}, ${q(sha)})`;
    });
    const current = Object.entries(CURRENT_RULES).map(([k, id]) => `  (${q(k)}, ${q(id)}, 'Phase 2 registry seed')`);
    return [
        '-- BEGIN GENERATED RULES SEED (scripts/trivia/rules-seed-sql.mjs)',
        'INSERT INTO public.trivia_rules_versions (id, rules_key, version, family, mode, provisional, approval_source, rules_canonical, rules_sha256) VALUES',
        rows.join(',\n'),
        'ON CONFLICT (id) DO NOTHING;',
        'INSERT INTO public.trivia_rules_current (rules_key, rules_version_id, reason) VALUES',
        current.join(',\n'),
        'ON CONFLICT (rules_key) DO NOTHING;',
        '-- END GENERATED RULES SEED',
    ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.stdout.write(`${rulesSeedSql()}\n`);
}
