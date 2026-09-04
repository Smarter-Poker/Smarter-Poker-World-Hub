/**
 * SIGN-OUT CONTRACT — the hamburger's Log Out must actually log you out.
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-04. "Click the hamburger, click Log Out, it silently fails."
 *
 * The row was present and wired. It called supabase.auth.signOut() and removed
 * six localStorage keys — but not `smarter-poker-auth-backup`. useRequireAuth
 * refreshes that backup on every successful auth (authUtils.backupSession) with
 * a 30-minute TTL, and ensureAuthReady calls restoreSessionBackup() whenever the
 * primary key is missing. So the redirect fired, the backup was restored on the
 * way back in, and the user landed signed in. Indistinguishable from nothing
 * happening.
 *
 * clearAuth(true) — the "sovereign logout" — already existed and dropped the
 * backup, the sb-*-auth-token keys and the sp_auth_confirmed flag together. Its
 * only caller in the repo was ProfileDropdown.tsx, which nothing imports. The
 * correct logout lived in dead code while the live one was incomplete.
 *
 * These are source-level assertions on purpose: there is no render harness for
 * this drawer, and a string pin that names the exact regression is worth more
 * than no gate at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MENU = readFileSync(join(ROOT, 'src/components/ui/HamburgerMenu.jsx'), 'utf8');
const AUTH_UTILS = readFileSync(join(ROOT, 'src/lib/authUtils.js'), 'utf8');
const CONFIGS = readFileSync(join(ROOT, 'src/config/hamburgerMenus.js'), 'utf8');

const handleLogoutBody = (() => {
  const start = MENU.indexOf('const handleLogout = useCallback(');
  assert.notEqual(start, -1, 'handleLogout must exist in HamburgerMenu.jsx');
  const end = MENU.indexOf('}, []);', start);
  assert.notEqual(end, -1, 'handleLogout must be a useCallback with a stable deps array');
  return MENU.slice(start, end);
})();

test('handleLogout calls the sovereign clearAuth, not just a key sweep', () => {
  assert.match(
    handleLogoutBody,
    /clearAuth\(\s*true\s*\)/,
    'Log Out must call clearAuth(true). Removing individual keys leaves ' +
      'smarter-poker-auth-backup behind and restoreSessionBackup() signs the user back in.'
  );
  assert.match(
    MENU,
    /import\s*\{[^}]*\bclearAuth\b[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/authUtils'/,
    'clearAuth must be imported from lib/authUtils'
  );
});

test('clearAuth(force) still drops the backup key — the thing that undid logout', () => {
  const start = AUTH_UTILS.indexOf('export function clearAuth');
  assert.notEqual(start, -1, 'clearAuth must exist');
  const body = AUTH_UTILS.slice(start, start + 1200);
  assert.match(body, /removeItem\(AUTH_BACKUP_KEY\)/,
    'the force branch must remove AUTH_BACKUP_KEY');
  assert.match(body, /removeItem\(AUTH_STORAGE_KEY\)/,
    'clearAuth must remove the primary session key');
  assert.match(body, /sp_auth_confirmed/,
    'clearAuth must clear the useRequireAuth fast-path flag');
});

test('the clear runs even when signOut fails', () => {
  assert.match(handleLogoutBody, /finally\s*\{/,
    'the local clear must sit in a finally block: supabase.auth.signOut() ' +
      'resolves with { error } rather than throwing for offline/5xx/429, and on ' +
      'that path GoTrue returns before _removeSession() — the session survives.');
  assert.match(handleLogoutBody, /const\s*\{\s*error\s*\}\s*=/,
    'signOut reports failure by return value; read it rather than relying on catch');
});

test('a second tap cannot fire a second sign-out', () => {
  assert.match(handleLogoutBody, /signingOutRef\.current/,
    'handleLogout must latch so a double tap does not fire two network calls ' +
      'and two redirects');
});

test('an unwired row labelled "Log Out" cannot suppress the working one', () => {
  assert.match(MENU, /const isWiredSignOut\s*=/,
    'the sign-out dedup must require a real handler or href. Matching on the ' +
      'label alone let a handler-less config row suppress the auto-appended Log ' +
      'Out and then be dropped by the stub guard — leaving no Log Out at all.');
  const start = MENU.indexOf('const isWiredSignOut');
  const body = MENU.slice(start, start + 400);
  assert.match(body, /typeof i\?\.onClick === 'function'/);
  assert.match(body, /typeof i\?\.href === 'string'/);
});

test('no menu config declares its own sign-out row', () => {
  // hamburgerMenus.js states sign-out "lives in exactly ONE place". Nothing
  // enforced it. A config row labelled Sign Out / Log Out would take over the
  // slot with whatever handler it happens to carry.
  const offenders = [];
  const re = /label:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(CONFIGS)) !== null) {
    if (/sign\s*out|log\s*out|logout/i.test(m[1])) {
      offenders.push(m[1]);
    }
  }
  assert.deepEqual(offenders, [],
    `MENU_CONFIGS must not declare a sign-out row; found: ${offenders.join(', ')}`);
});
