import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

test('UI hooks inspect their own repository from an unrelated working directory', () => {
  const root = mkdtempSync(join(process.cwd(), '.tmp-hook-paths with spaces-'));
  try {
    mkdirSync(join(root, 'scripts', 'ci'), { recursive: true });
    mkdirSync(join(root, 'pages'));
    writeFileSync(join(root, 'pages', 'example.jsx'), 'export default function Page() { return <p>lowercase copy \u2014 visible</p>; }');
    for (const name of ['check-ui-text.mjs', 'check-title-case.mjs']) {
      const script = join(root, 'scripts', 'ci', name);
      copyFileSync(join(process.cwd(), 'scripts', 'ci', name), script);
      const result = spawnSync(process.execPath, [script], { cwd: join(root, 'pages'), encoding: 'utf8' });
      assert.equal(result.status, 1, `${name} must reject the actual fixture: ${result.stderr}`);
      assert.match(result.stderr, /example\.jsx/, `${name} must inspect page content rather than fail to load`);
    }
  } finally {
    assert.equal(dirname(root), process.cwd(), 'cleanup stays within this test workspace');
    rmSync(root, { recursive: true, force: true });
  }
});
