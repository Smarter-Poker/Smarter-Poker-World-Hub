/**
 * Runs the unchecked-money-RPC ratchet as a test, so it executes inside CI's
 * existing `node --test __tests__/...` invocation (CHECK 8) without needing a
 * new workflow step — adding one requires a PAT with the GitHub `workflow`
 * permission, which the automation token does not have.
 *
 * See scripts/check-unchecked-money-rpc.mjs for what it catches and why.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const SCRIPT = path.join(REPO, 'scripts', 'check-unchecked-money-rpc.mjs');

test('the money-RPC ratchet script still exists', () => {
    assert.ok(
        fs.existsSync(SCRIPT),
        'scripts/check-unchecked-money-rpc.mjs was deleted — without it a rejected\n' +
            'chip debit can once again look identical to a successful one.',
    );
});

test('no NEW money RPC ignores its {success:false} return value', () => {
    try {
        execFileSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
        const out = `${err.stdout || ''}${err.stderr || ''}`;
        assert.fail(
            'A money RPC was added whose {success:false} return is never read.\n' +
                'These functions do NOT raise on refusal, so checking only the Supabase\n' +
                'error lets a rejected debit or credit continue as though it worked.\n\n' +
                out,
        );
    }
});
