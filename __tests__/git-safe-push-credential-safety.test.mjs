import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL('../scripts/git-safe-push.sh', import.meta.url);

test('the authenticated push URL is never persisted as the branch upstream', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.doesNotMatch(
    script,
    /git push[^\n]*--set-upstream[^\n]*\$AUTH_URL|git push[^\n]*--set-upstream[^\n]*"\$\{?AUTH_URL\}?"/,
  );
  assert.match(script, /git push[^\n]*"\$AUTH_URL"[^\n]*"HEAD:refs\/heads\/\$\{BRANCH\}"/);
  assert.match(script, /git update-ref "refs\/remotes\/\$\{REMOTE\}\/\$\{BRANCH\}" HEAD/);
  assert.match(
    script,
    /git branch --set-upstream-to="\$\{REMOTE\}\/\$\{BRANCH\}" "\$\{BRANCH\}"/,
  );
});

test('the credential-bearing URL is not printed explicitly', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.doesNotMatch(script, /echo[^\n]*(?:AUTH_URL|GH_TOKEN)/);
  assert.doesNotMatch(script, /printf[^\n]*(?:AUTH_URL|GH_TOKEN)/);
});
