/**
 * The Training reference charts are open to everyone.
 *
 * Owner decision (Dan, 2026-10-12), verbatim answer to "should these training
 * charts be open to everyone or get a sign-in button?":
 *   "THEY SHOULD OPEN TO EVERYONE."
 *
 * Before this, a signed-out visitor saw "Authentication Required" on Spot
 * Study and was bounced to the sign-in screen from the Solutions library. The
 * contract pinned here:
 *   - spot-drill GET serves anonymous visitors, still behind the durable
 *     request-fingerprint rate limit, and never writes a user id for them;
 *   - browse-solutions GET never answers 401 for a missing user;
 *   - bookmark-solution stays signed-in only (it is personal);
 *   - the Solutions page has no page-level sign-in gate.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

const spotDrill = read('pages/api/training/spot-drill.js');
const browse = read('pages/api/training/browse-solutions.js');
const bookmark = read('pages/api/training/bookmark-solution.js');
const solutionsPage = read('pages/hub/training/solutions.js');
const spotTrainerPage = read('pages/hub/training/spot-trainer.js');

function handlerBody(source) {
  const start = source.indexOf('export default async function handler');
  assert.notEqual(start, -1, 'route must export a handler');
  return source.slice(start);
}

test('spot-drill serves anonymous GETs instead of answering 401', () => {
  const handler = handlerBody(spotDrill);
  assert.doesNotMatch(handler, /status\(401\)/, 'spot study must not refuse a signed-out visitor');
  assert.doesNotMatch(handler, /Authentication required/);
  // Identity is optional and comes only from the verified token.
  assert.match(handler, /let user = null;/);
  assert.match(handler, /if \(token\) \{[\s\S]*?getServerUserWithFallback\(req, supabase\)/);
  assert.doesNotMatch(handler, /req\.query\.(?:userId|user_id)/, 'identity must never come from the query string');
});

test('spot-drill keeps the durable fingerprint limit in front of every request', () => {
  const handler = handlerBody(spotDrill);
  const preauth = handler.indexOf('training:spot-study:preauth:${fingerprint}');
  const auth = handler.indexOf('getServerUserWithFallback');
  const lookup = handler.indexOf('findCanonicalStudyCandidate');
  assert.ok(preauth > -1, 'the durable pre-auth fingerprint bucket must remain');
  assert.ok(preauth < auth, 'the fingerprint bucket must run before token verification');
  assert.ok(preauth < lookup, 'the fingerprint bucket must run before the solver lookup');
  assert.match(spotDrill, /const PREAUTH_RATE_LIMIT = Object\.freeze\(\{ max: 24, windowSeconds: 60 \}\);/);
  assert.match(spotDrill, /createHash\('sha256'\)\.update\(address\)\.digest\('hex'\)/);
});

test('spot-drill bounds anonymous traffic and keeps the per-user limit for signed-in viewers', () => {
  const handler = handlerBody(spotDrill);
  assert.match(handler, /key: `training:spot-study:user:\$\{user\.id\}`,\s*\.\.\.USER_RATE_LIMIT/);
  assert.match(handler, /key: `training:spot-study:anon:\$\{fingerprint\}`,\s*\.\.\.ANONYMOUS_RATE_LIMIT/);
  assert.match(spotDrill, /const USER_RATE_LIMIT = Object\.freeze\(\{ max: 12, windowSeconds: 60 \}\);/);
  assert.match(spotDrill, /const ANONYMOUS_RATE_LIMIT = Object\.freeze\(\{ max: 12, windowSeconds: 60 \}\);/);
  const anon = handler.indexOf('training:spot-study:anon:');
  const lookup = handler.indexOf('findCanonicalStudyCandidate');
  assert.ok(anon > -1 && anon < lookup, 'the anonymous bucket must run before the solver lookup');
});

test('spot-drill never writes a user id for an anonymous visitor and stays private', () => {
  const handler = handlerBody(spotDrill);
  assert.match(handler, /userId: user \? user\.id : null,/);
  assert.doesNotMatch(handler, /userId: user\.id,/);
  // Every response is a fresh random study spot, so it is never shared-cached.
  assert.match(handler.slice(0, 200), /setHeader\('Cache-Control', 'private, no-store, max-age=0'\)/);
  assert.match(handler.slice(0, 260), /setHeader\('Vary', 'Authorization'\)/);
});

test('browse-solutions GET has no 401 for a missing user and keeps its rate limit', () => {
  const handler = handlerBody(browse);
  assert.doesNotMatch(handler, /status\(401\)/, 'the shared solution library must not refuse a signed-out visitor');
  assert.doesNotMatch(browse, /Authentication required/);
  assert.doesNotMatch(browse, /requireUser/);
  assert.match(handler, /if \(!applyRateLimit\(req, res, LIMITS\.read\)\) return;/);
  assert.doesNotMatch(browse, /req\.query\.(?:userId|user_id)/);
  // Errors and refusals stay private; only a verified library page may be shared.
  assert.match(handler.slice(0, 200), /setHeader\('Cache-Control', 'private, no-store, max-age=0'\)/);
  assert.match(browse, /const PUBLIC_LIBRARY_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';/);
});

test('bookmark-solution stays signed-in only', () => {
  const handler = handlerBody(bookmark);
  assert.match(handler, /if \(!userId\) \{\s*return res\.status\(401\)\.json\(\{ success: false, error: 'Authentication required' \}\);/);
  const authGate = handler.indexOf('if (!userId)');
  const get = handler.indexOf("req.method === 'GET'");
  const post = handler.indexOf("req.method === 'POST'");
  assert.ok(authGate > -1 && authGate < get && authGate < post, 'every bookmark read and write requires a verified user');
  assert.match(handler, /getServerUserWithFallback\(req, getSupabase\(\)\)/);
  assert.doesNotMatch(bookmark, /headers\[['"]x-user-id['"]\]|req\.query\.(?:userId|user_id)/);
});

test('the Solutions page has no sign-in gate and only bookmarks prompt sign-in', () => {
  assert.doesNotMatch(solutionsPage, /router\.replace\('\/auth\/login/, 'the library must not bounce visitors to sign-in');
  assert.doesNotMatch(solutionsPage, /useRequireAuth|RequireAuth|AuthGuard|getServerSideProps/);
  assert.doesNotMatch(solutionsPage, /Secure Sign In/);
  // Browse reads no longer treat 401 as a reason to leave the page.
  const fetchSpotsStart = solutionsPage.indexOf('const fetchSpots = useCallback');
  const detailEnd = solutionsPage.indexOf('const visibleSpots');
  assert.ok(fetchSpotsStart > -1 && detailEnd > fetchSpotsStart);
  assert.doesNotMatch(solutionsPage.slice(fetchSpotsStart, detailEnd), /401|auth\/login/);
  // The personal bookmark API is not called without a session token.
  assert.match(solutionsPage, /const signedIn = Boolean\(getAccessToken\(\)\);[\s\S]*?if \(!signedIn\) \{[\s\S]*?return;[\s\S]*?trainingFetch\('\/api\/training\/bookmark-solution'\)/);
  // Bookmark controls send a signed-out visitor to the existing sign-in route and back.
  assert.match(solutionsPage, /const BOOKMARK_SIGN_IN_ROUTE = '\/auth\/login\?redirect=\/hub\/training\/solutions';/);
  assert.match(solutionsPage, /if \(!getAccessToken\(\)\) \{\s*await router\.push\(BOOKMARK_SIGN_IN_ROUTE\);/);
  assert.match(solutionsPage, /Sign in to bookmark this spot/);
});

test('the Spot Study page loads for signed-out visitors through the optional-token transport', () => {
  assert.match(spotTrainerPage, /import \{ authedFetch \} from '\.\.\/\.\.\/\.\.\/src\/lib\/authUtils';/);
  assert.match(spotTrainerPage, /authedFetch\(\s*`\/api\/training\/spot-drill\?/);
  assert.doesNotMatch(spotTrainerPage, /Authentication Required|auth\/login|useRequireAuth/);
});
