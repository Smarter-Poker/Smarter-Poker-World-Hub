import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const hookUrl = new URL('../scripts/hooks/pre-push-js-safety.sh', import.meta.url);

test('TypeScript pre-push baseline never mutates the current worktree or shared stash', async () => {
  const hook = await readFile(hookUrl, 'utf8');

  assert.doesNotMatch(hook, /^\s*git stash\b/m);
  assert.doesNotMatch(hook, /^\s*git stash pop\b/m);
  assert.match(hook, /worktree add --detach/);
  assert.match(hook, /core\.hooksPath=\/dev\/null/);
  assert.match(hook, /worktree remove --force/);
});

test('TypeScript pre-push comparison is safe when Husky invokes a shell wrapper', async () => {
  const hook = await readFile(hookUrl, 'utf8');

  assert.doesNotMatch(hook, /<\(\s*(?:echo|printf)/);
  assert.match(hook, /grep -Fqx "\$error_line"/);
});
