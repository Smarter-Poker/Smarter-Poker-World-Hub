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
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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

/**
 * And the E2E servers bind a per-runner port. `next start -p 3000` in two
 * jobs sharing a box collided the hour the World Hub got six runners per box:
 * the second died with EADDRINUSE. Same fix as Club Arena's E2E ports.
 */
test('no E2E workflow starts next on a literal port', () => {
  for (const f of ['global-footer-e2e.yml', 'e2e-tests.yml']) {
    const text = readFileSync(join(DIR, f), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    assert.ok(!/next start -p \d{4}/.test(text), `${f} starts next on a literal port`);
    assert.match(text, /scripts\/ci\/e2e-port\.mjs 3000/, `${f} must derive its port`);
    assert.ok(!/127\.0\.0\.1:3000|localhost:3000/.test(text), `${f} still points at :3000`);
  }
});

// A Mac agent entering or checking a workspace must not recreate the dependency
// copies the user removed. Run the actual helpers with disposable roots and a
// recording npm executable; no package download or existing install is touched.
function runWorkspaceFunction(name, system) {
  const source = readFileSync(join(process.cwd(), 'scripts/agent-workspace.sh'), 'utf8');
  const match = source.match(new RegExp(String.raw`^${name}\(\) \{\n.*?^\}`, 'ms'));
  assert.ok(match, `${name} must remain an executable workspace function`);
  return spawnSync(
    '/bin/bash',
    [
      '-c',
      [
        'set -eu',
        `uname() { printf '%s\n' '${system}'; }`,
        'ROOT=/nonexistent-policy-fixture',
        'DIR=/nonexistent-policy-fixture',
        match[0],
        `${name} ""`,
      ].join('\n'),
    ],
    { encoding: 'utf8' }
  );
}

function runRepairFixture(t, system) {
  const root = mkdtempSync(join(tmpdir(), 'wh-dependency-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const tools = join(root, 'tools');
  mkdirSync(tools);
  const sentinel = join(root, 'npm-was-called');
  const stubs = {
    uname: `printf '%s\n' '${system}'`,
    git: 'printf "%s\n" "$POLICY_FIXTURE/.git"',
    npm: 'printf called > "$POLICY_SENTINEL"; exit 1',
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(tools, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
  const result = spawnSync('/bin/bash', [join(process.cwd(), 'scripts/check-node-modules.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${tools}:/usr/bin:/bin`,
      POLICY_FIXTURE: root,
      POLICY_SENTINEL: sentinel,
    },
  });
  return { result, npmCalled: existsSync(sentinel) };
}

test('Mac workspace provisioning returns before dependency reads, copies or installs', () => {
  const result = runWorkspaceFunction('provision_node_modules', 'Darwin');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Mac provisioning disabled/);
});

test('Mac native dependency repair remains read-only', () => {
  const result = runWorkspaceFunction('verify_native_deps', 'Darwin');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout + result.stderr, '');
});

test('Linux workspace provisioning retains its absent-package return', () => {
  const result = runWorkspaceFunction('provision_node_modules', 'Linux');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout + result.stderr, '');
});

test('a direct Mac dependency repair call cannot start npm', (t) => {
  const { result, npmCalled } = runRepairFixture(t, 'Darwin');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(npmCalled, false);
  assert.match(result.stdout, /exact lockfile in CI/);
});

test('a direct Linux dependency repair call retains its explicit repair path', (t) => {
  const { result, npmCalled } = runRepairFixture(t, 'Linux');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(npmCalled, true);
});

test('both workspace dependency helpers remain valid shell programs', () => {
  for (const name of ['agent-workspace.sh', 'check-node-modules.sh']) {
    const result = spawnSync('/bin/bash', ['-n', join(process.cwd(), 'scripts', name)], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  }
});
