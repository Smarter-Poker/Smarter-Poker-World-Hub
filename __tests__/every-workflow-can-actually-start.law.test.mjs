// ----------------------------------------------------------------------------
// EVERY WORKFLOW CAN ACTUALLY START (law, 2026-09-08)
//
// A workflow file that GitHub cannot parse does not fail a check. It fails to
// produce a RUN: 0 seconds, `jobs: 0`, conclusion "failure", and in the UI it
// is listed by its FILE PATH instead of its name, because the name lives in
// the file it could not read. Nothing else notices. The workflow is simply
// gone, and every summary of the branch still looks normal.
//
// Both of the mistakes this law exists for were mine, both on 2026-09-08, and
// both survived `yaml.safe_load` because they are valid YAML and invalid
// Actions:
//
//   e2e-tests.yml       - a cache step was spliced between "- name: Build
//                         Next.js" and its own `run:`, leaving a step with a
//                         name and nothing to do.
//   agent-apply-patch.yml - `workflows: write` in `permissions:`. The scope is
//                         real for a PAT or a GitHub App; the KEY does not
//                         exist here, and an unknown key is a parse error.
//
// Two workflows were dead on main for about half an hour.
// ----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.github/workflows');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

// The complete set GitHub accepts in a `permissions:` block. Anything else is
// a parse error, not a warning.
const PERMISSION_KEYS = new Set([
  'actions', 'attestations', 'checks', 'contents', 'deployments', 'discussions',
  'id-token', 'issues', 'models', 'packages', 'pages', 'pull-requests',
  'repository-projects', 'security-events', 'statuses',
]);

test('there are workflows to check', () => {
  assert.ok(FILES.length > 10, `only found ${FILES.length} workflow files`);
});

// No YAML parser is a dependency of this repo and this law is not worth adding
// one for - both defects it guards are visible in the line structure, and a
// line scanner cannot itself be broken by a file it fails to parse.
const indent = (l) => l.length - l.trimStart().length;
const meaningful = (l) => l.trim() !== '' && !l.trim().startsWith('#');

test('every step has something to do', () => {
  const orphans = [];
  for (const f of FILES) {
    const lines = readFileSync(join(DIR, f), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)- (name|id):/);
      if (!m) continue;
      const stepIndent = m[1].length;
      // Only inside a steps: list - the nearest shallower `steps:` header.
      let inSteps = false;
      for (let k = i - 1; k >= 0; k--) {
        if (!meaningful(lines[k])) continue;
        if (indent(lines[k]) < stepIndent) {
          inSteps = /^\s*steps:\s*$/.test(lines[k]);
          break;
        }
      }
      if (!inSteps) continue;

      let hasWork = /^\s*- (run|uses):/.test(lines[i]);
      for (let j = i + 1; j < lines.length && !hasWork; j++) {
        if (!meaningful(lines[j])) continue;
        if (indent(lines[j]) <= stepIndent) break; // next step, or out of the list
        if (/^\s*(run|uses):/.test(lines[j])) hasWork = true;
      }
      if (!hasWork) orphans.push(`${f}:${i + 1}  ${lines[i].trim()}`);
    }
  }
  assert.deepEqual(
    orphans,
    [],
    'A step with neither `run` nor `uses` makes the whole workflow unparseable, ' +
      'so it produces NO RUN AT ALL - 0 seconds, jobs: 0, listed by file path ' +
      'instead of name:\n  ' + orphans.join('\n  ') +
      '\n\nThe usual cause is inserting a new step header in the middle of an ' +
      'existing step, between its name and its run.'
  );
});

test('every permissions key is one GitHub actually accepts', () => {
  const bad = [];
  for (const f of FILES) {
    const lines = readFileSync(join(DIR, f), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*permissions:\s*$/.test(lines[i])) continue;
      const base = indent(lines[i]);
      for (let j = i + 1; j < lines.length; j++) {
        if (!meaningful(lines[j])) continue;
        if (indent(lines[j]) <= base) break;
        const kv = lines[j].match(/^\s*([A-Za-z][A-Za-z0-9-]*):\s*(read|write|none)\s*$/);
        if (kv && !PERMISSION_KEYS.has(kv[1])) bad.push(`${f}:${j + 1}  ${kv[1]}: ${kv[2]}`);
      }
    }
  }
  assert.deepEqual(
    bad,
    [],
    'These keys do not exist in a permissions block, and an unknown key is a ' +
      'PARSE error rather than a warning:\n  ' + bad.join('\n  ') +
      '\n\n`workflows` is the one that catches people - it is a real PAT and ' +
      'GitHub App scope, and it is NOT a permissions key. GITHUB_TOKEN cannot ' +
      'push a workflow file no matter what this block says.'
  );
});
