/**
 * A RULE POINTS AT THE SECTION IT NAMES
 *
 * CLAUDE.md section 1.3 records what a promised-but-absent safety net costs:
 * somebody reads it, assumes they are covered, and stops checking. A rule
 * that cites the WRONG section is the same failure one step smaller. The
 * scheduler ban is 10.9 in this repo and 10.85 in Club Arena; two references
 * in the rule book cited only 10.85, which here is the credential rule, so an
 * agent who followed the pointer found the wrong law and no ban at all.
 *
 * This walks every `CLAUDE.md <n>` the rule book cites and asserts the section
 * exists in THIS repo's CLAUDE.md, or is explicitly attributed to Club Arena.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const RULES = '.agents/rules/00-agent-playbook.md';

test('every CLAUDE.md section the rule book cites exists here, or says which repo it is in', () => {
    const rules = read(RULES);
    const claude = read('CLAUDE.md');
    const sections = new Set([...claude.matchAll(/^## (\d+(?:\.\d+)?)/gm)].map((m) => m[1]));
    assert.ok(sections.size > 5, 'CLAUDE.md has numbered sections to point at');

    const missing = [];
    for (const m of rules.matchAll(/`?CLAUDE\.md`?\s+(\d+\.\d+)/g)) {
        const cited = m[1];
        if (sections.has(cited)) continue;
        // A Club Arena number is fine when the line says so.
        const line = rules.slice(rules.lastIndexOf('\n', m.index) + 1, rules.indexOf('\n', m.index));
        const context = rules.slice(Math.max(0, m.index - 200), m.index + 200);
        if (/Club Arena/i.test(line) || /Club Arena/i.test(context)) continue;
        missing.push(`${cited} (${line.trim().slice(0, 90)})`);
    }
    assert.deepEqual(missing, [], `these point at sections this repo does not have: ${missing.join(' | ')}`);
});

test('the scheduler ban is stated once and not contradicted', () => {
    const rules = read(RULES);
    assert.match(rules, /NEVER SET A TIMER, AND NEVER USE THE `schedule` TOOL/);
    // The INSTRUCTION is gone. The rule still quotes it to explain the fix,
    // which is why this looks for the numbered step rather than the words:
    // a test that greps prose matches the paragraph disowning it.
    assert.doesNotMatch(rules, /^\s*\d+\.\s*Call `schedule`/m, 'the old timer step must stay gone');
    assert.match(rules, /used to\s+say the opposite/, 'and the correction says what it replaced');
    assert.match(read('CLAUDE.md'), /^## 10\.9 NEVER SCHEDULE ANYTHING ON THE CLAUDE SCHEDULER/m);
});

test('a catch that only logs is an ERROR where the money decisions live', () => {
    const config = read('eslint.config.mjs');
    const at = config.indexOf("'src/lib/bankroll/receipt*'");
    assert.ok(at > 0, 'the receipt pipeline is scoped');
    const block = config.slice(at, config.indexOf('globalIgnores', at));
    assert.match(block, /'src\/lib\/gates\/\*\*'/);
    assert.match(block, /'scripts\/ci\/\*\*'/);
    assert.match(block, /'no-restricted-syntax': \[\s*'error'/, 'error, not warn, in this scope');
    assert.match(block, /CatchClause\[body\.body\.length=1\]/);
});
