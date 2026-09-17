import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

test('every reward detail owns verified signed-in earning telemetry', () => {
  const page = read('pages/hub/smarter-rewards/[rewardId].js');
  const file = 'src/components/store/RewardTelemetryConsole.jsx';
  assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
  const consoleSource = read(file);

  assert.match(page, /<RewardTelemetryConsole reward=\{reward\}/);
  assert.match(consoleSource, /\/api\/rewards\/progress/);
  assert.match(consoleSource, /authedFetch/);
  assert.match(consoleSource, /role=["']progressbar["']/);
  assert.match(consoleSource, /aria-valuenow/);
  assert.match(consoleSource, /Daily Earning Circuit/);
  assert.match(consoleSource, /Monthly Earning Circuit/);
  assert.match(consoleSource, /Login Streak/);
  assert.match(consoleSource, /Share Multiplier/);
  assert.match(consoleSource, /\/auth\/login\?redirect=/);
});

test('VIP command center reads a private server-owned membership record', () => {
  const endpoint = 'pages/api/store/vip-membership-status.js';
  assert.ok(existsSync(join(ROOT, endpoint)), `${endpoint} must exist`);
  const api = read(endpoint);

  assert.match(api, /getServerUserWithFallback/);
  assert.match(api, /from\('profiles'\)/);
  assert.match(api, /from\('vip_subscriptions'\)/);
  assert.match(api, /cancelAtPeriodEnd/);
  assert.match(api, /canSwitch/);
  assert.match(api, /setPrivateCommerceResponse\(res\)/);
  assert.match(
    read('src/lib/store/privateCommerceResponse.js'),
    /Cache-Control['"],\s*['"]private, no-store, max-age=0/
  );
  assert.doesNotMatch(api, /select\(['"]\*['"]\)/);
  assert.doesNotMatch(api, /req\.(body|query)\.userId|req\.(body|query)\?\.userId/);
  const verifier = read('scripts/verify-marketplace-deployment.mjs');
  assert.match(verifier, /smarter-rewards\/daily_login/);
  assert.match(verifier, /data-marketplace-route/);
  assert.match(verifier, /marketplaceRouteMarker\(route\.canonical\)/);
  assert.match(verifier, /'\/api\/store\/vip-membership-status'/);
  assert.match(verifier, /`\$\{privatePath\} \(private\)`/);
});

test('VIP plan switching and cancellation stay inside the marketplace page', () => {
  const page = read('pages/hub/vip-membership/manage.js');

  assert.match(page, /\/api\/store\/vip-membership-status/);
  assert.match(page, /\/api\/store\/switch-vip-plan/);
  assert.match(page, /\/api\/store\/cancel-vip/);
  assert.match(page, /Switch To Yearly/);
  assert.match(page, /Switch To Monthly/);
  assert.match(page, /Schedule End Of Membership/);
  assert.match(page, /role=["']dialog["']/);
  assert.match(page, /aria-modal=["']true["']/);
  assert.match(page, /acquireScrollLock\(['"]VipMembershipCancelDialog['"]\)/);
  assert.doesNotMatch(page, /target=["']_blank["']|window\.open/);
});

test('VIP management and reward telemetry reject stale account work', () => {
  const manage = read('pages/hub/vip-membership/manage.js');
  const rewards = read('src/components/store/RewardTelemetryConsole.jsx');

  for (const source of [manage, rewards]) {
    assert.match(source, /useAvatar/);
    assert.match(source, /const synchronousAccountId = getAuthUser\(\)\?\.id \|\| null/);
    assert.match(source, /const committedAccountId =/);
    assert.match(source, /contextUser\?\.id === synchronousAccountId/);
    assert.match(source, /const activeAccountIdRef = useRef/);
    assert.match(source, /useIsomorphicLayoutEffect\(\(\) => \{/);
    assert.match(source, /getAuthUser\(\)\?\.id === expectedAccountId/);
  }

  assert.match(manage, /viewOwnerId === committedAccountId/);
  assert.match(manage, /membershipControllerRef\.current\?\.abort\(\)/);
  assert.match(manage, /actionGenerationRef\.current === actionId/);
  assert.match(manage, /actionControllerRef\.current === controller/);
  assert.match(manage, /actionControllerRef\.current = null;\s*actionBusyRef\.current = false/);
  assert.match(manage, /if \(!attemptOwnsCurrentAccount\(\)\) return/);
  assert.match(manage, /const identity = JSON\.stringify\(\{ accountId, endpoint, body \}\)/);
  assert.match(manage, /membershipActionKeys\.get\(identity\)/);
  assert.match(manage, /clearRetainedMembershipAction\(intentIdentity, intentKey\)/);
  assert.match(manage, /accountView\.status !== 'ready'/);

  assert.match(rewards, /stateOwnerId === committedAccountId/);
  assert.match(rewards, /requestRef\.current === requestId/);
  assert.match(rewards, /abortRef\.current === controller/);
  assert.match(rewards, /const accountState =/);
  assert.match(rewards, /Promise\.race\(\[response\.json\(\)\.catch\(\(\) => null\), deadline\]\)/);
  assert.match(rewards, /accountState\.status === 'ready' && \([\s\S]{0,120}Ledger Verified/);
});

test('diamond VIP passes are never sent to Stripe cancellation', () => {
  const cancel = read('pages/api/store/cancel-vip.js');
  assert.match(cancel, /startsWith\(['"]diamond_['"]\)/);
  assert.match(cancel, /does not renew/i);
});

test('phase 12 surfaces preserve the cyan steel palette and accessible controls', () => {
  const sources = [
    read('src/components/store/RewardTelemetryConsole.module.css'),
    read('src/components/store/VipMembershipConsole.module.css'),
    read('pages/hub/vip-membership/manage.js'),
  ].join('\n');

  assert.doesNotMatch(sources, /#22c55e|#10b981|34,\s*197,\s*94|\bgreen\b/i);
  assert.match(sources, /min-height:\s*44px/);
  assert.match(sources, /:focus-visible/);
  assert.match(sources, /prefers-reduced-motion/);
});

test('VIP and reward console controls use the approved painted shells without Lucide glyphs', () => {
  const compare = read('pages/hub/vip-membership/compare.js');
  const manage = read('pages/hub/vip-membership/manage.js');
  const rewards = read('src/components/store/RewardTelemetryConsole.jsx');
  const controlStyles = [
    read('pages/hub/vip-membership/compare.module.css'),
    read('src/components/store/VipMembershipConsole.module.css'),
    read('src/components/store/RewardTelemetryConsole.module.css'),
  ].join('\n');

  assert.doesNotMatch(
    `${compare}\n${manage}\n${rewards}`,
    /lucide-react|<(?:Activity|CalendarClock|CreditCard|Crown|Gauge|Gem|RefreshCw|ShieldCheck|Sparkles|WalletCards|X)\b/
  );
  assert.match(compare, /compare\.module\.css/);
  assert.match(controlStyles, /shark-panel\/button-primary\.png/);
  assert.match(controlStyles, /shark-panel\/button-secondary\.png/);
  assert.doesNotMatch(controlStyles, /navigation\/nav-shell\.(?:png|webp)/);
  assert.match(controlStyles, /Roboto Condensed/);
  assert.doesNotMatch(controlStyles, /Rajdhani|border-radius|\bgreen\b|\bpurple\b/i);
});
