/**
 * THE HELP PAGE WORKS WITHOUT AN ACCOUNT (AEO phase 3, 2026-09-17).
 *
 * /hub/commander/responsible-gaming is in the sitemap and is the page
 * /about links under Policies. It is also behind useRequireAuth, so a
 * signed-out visitor met a spinner and nothing else, and measured on
 * production as OAI-SearchBot it returned 0 words of prose.
 *
 * That is the wrong page to hide. Someone looking for "self exclusion
 * poker room" is the person this page exists for, and asking them to make
 * an account first is asking at the worst possible moment.
 *
 * The informational half now renders on the server in both branches and
 * asks for nothing. The controls that change a player's own limits stay
 * behind the account, where they belong.
 *
 * THE HELPLINE NUMBER IS CHECKED, NOT REMEMBERED. The National Council on
 * Problem Gambling adopted 1-800-MY-RESET (1-800-697-3738) on 29 January
 * 2026, after a New Jersey Supreme Court decision about the number it had
 * been using. This page and the Commander FAQ both still printed
 * 1-800-522-4700, which NCPG says stays active but no longer promotes. A
 * helpline number written from memory sends someone in trouble to the
 * wrong place, so the current number leads and the old one is named as
 * still working.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PAGE = 'pages/hub/commander/responsible-gaming/index.js';
const INFO = 'src/components/commander/ResponsibleGamingInfo.js';

test('the page explains itself before it asks who is asking', () => {
  const src = read(PAGE);
  assert.match(src, /import ResponsibleGamingInfo/, 'the page imports the public half');

  // The loading branch is what a crawler and a signed-out visitor get.
  const loading = src.slice(src.indexOf('if (loading) {'), src.indexOf('return (\n    <CommanderPageShell>'));
  assert.ok(loading.includes('<ResponsibleGamingInfo'), 'the loading branch renders it');
  assert.ok(loading.includes('as="h1"'), 'and it carries the h1, because nothing else on that branch does');

  // And the signed-in page keeps it, so the two never disagree.
  assert.ok(
    (src.match(/<ResponsibleGamingInfo/g) || []).length >= 2,
    'the signed-in page renders it too',
  );
});

/** Comments explain the trap; only code can fall into it. */
function withoutComments(source) {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('the public half asks for nothing', () => {
  const src = withoutComments(read(INFO));
  for (const forbidden of ['useRequireAuth', 'getAccessToken', 'supabase', 'useSWR', 'useState', 'useEffect']) {
    assert.ok(!src.includes(forbidden), `the public half must not use ${forbidden}`);
  }
  // Enough prose to answer the question someone actually typed.
  const words = src
    .split('const styles')[0]
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w)).length;
  assert.ok(words >= 250, `${words} words is too thin for the page that explains the safety tools`);

  for (const control of ['Spending Limits', 'Session Limits', 'Cooling Off Periods', 'Self Exclusion']) {
    assert.ok(src.includes(control), `it names ${control}`);
  }
  // JSX wraps the sentence across lines, so compare on collapsed whitespace.
  const flat = src.replace(/\s+/g, ' ');
  assert.ok(flat.includes('There Is No Real-Money Gambling On Smarter.Poker'),
    'it repeats what the platform is not');
  assert.ok(flat.includes('No Cash Value'), 'and what the chips are');
});

test('the helpline number is the one NCPG operates today', () => {
  const info = read(INFO);
  assert.match(info, /phone: '1-800-MY-RESET'/, 'the current number leads');
  assert.match(info, /phoneDigits: '1-800-697-3738'/, 'with the digits, because letters do not dial everywhere');
  assert.match(info, /alternate: '1-800-522-4700'/, 'the older access point is named as still working');
  assert.match(info, /ncpgambling\.org\/news\/1-800-my-reset-announcement/, 'the source it was checked against is recorded');

  // No surface prints the old number as if it were the current one.
  for (const file of [PAGE, 'pages/hub/commander/faq.js']) {
    const src = read(file);
    if (!src.includes('1-800-522-4700')) continue;
    assert.ok(
      src.includes('1-800-MY-RESET'),
      `${file} prints 1-800-522-4700 without naming the current helpline number`,
    );
  }
});
