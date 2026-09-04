/**
 * LAW: a workflow that restores node_modules skips the install on a hit.
 *
 * Added 2026-09-04. No World Hub workflow cached node_modules at all. The
 * required `TypeScript Check` took 7.9 minutes on every pull request - 424s of
 * `npm ci`, 30s of the advisory typecheck it exists to run - and was the
 * slowest thing between a push and a merge in this repo.
 *
 * The cache only helps if the install is GUARDED. `npm ci` removes
 * node_modules before installing, so an unguarded install throws the restored
 * tree away and pays for the download on top. Club Arena's critical-path job
 * did exactly that for three days; this pins the pairing here before it can
 * happen once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), '.github', 'workflows');

function jobsOf(text) {
  const marks = [];
  const re = /\n {2}([a-z_][a-z0-9_-]*):\n/gi;
  let m;
  while ((m = re.exec(text))) marks.push({ name: m[1], at: m.index });
  return marks.map((mk, i) => ({
    name: mk.name,
    body: text.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : text.length),
  }));
}

test('every job that restores node_modules gates its npm ci on the cache hit', () => {
  const offenders = [];
  let checked = 0;
  for (const f of readdirSync(DIR)) {
    if (!/\.ya?ml$/.test(f)) continue;
    const text = readFileSync(join(DIR, f), 'utf8');
    for (const job of jobsOf(text)) {
      if (!/path:\s*node_modules\s*$/m.test(job.body)) continue;
      if (!/run:\s*(\|\s*\n\s*)?npm ci/.test(job.body)) continue;
      checked++;
      // Bounded by the STEP, not by a byte count: the step that runs `npm ci`
      // must carry the cache-hit `if:`, however long the comment between them.
      const steps = job.body.split(/\n {6}- (?=name:|uses:)/);
      const installStep = steps.find((st) => /run:\s*(\|\s*\n\s*)?npm ci/.test(st));
      const guarded =
        installStep !== undefined &&
        /if:\s*steps\.[a-z0-9_-]+\.outputs\.cache-hit != 'true'/.test(installStep);
      if (!guarded) offenders.push(`${f} job "${job.name}"`);
    }
  }
  assert.ok(
    checked >= 3,
    `expected the three required installing jobs to be cached; saw ${checked}`
  );
  assert.deepEqual(offenders, [], 'restores node_modules and then npm ci deletes it');
});

test('the three required checks that install are the ones cached', () => {
  const gate = readFileSync(join(DIR, 'build-safety-gate.yml'), 'utf8');
  const typecheck = jobsOf(gate).find((j) => j.name === 'type-check');
  assert.ok(typecheck, 'the type-check job disappeared');
  assert.match(typecheck.body, /key: nm-wh-typecheck-/);
  for (const f of ['undefined-identifier-guard.yml', 'silent-write-guard.yml']) {
    assert.match(readFileSync(join(DIR, f), 'utf8'), /key: nm-wh-guard-/, `${f} lost its cache`);
  }
});
