/**
 * bankroll-write-live: WRITE-PATH verification of the PUBLISHED Bankroll
 * Manager on https://smarter.poker, through its own UI.
 *
 * The read-only bankroll-live suite proved every section renders, but nobody
 * knew whether the platform service account had any ledger rows, so the trend
 * chart may only ever have been checked empty. This suite:
 *
 *   a. ensures a deterministic fixture on that account: a starting bankroll
 *      (only if none is set) and thirteen cash sessions, Feb-Nov 2026, that
 *      rebuild Dan's reported case (the running net climbs to +$29,217 and
 *      the same month closes at -$14,363). Every fixture row carries the note
 *      "bankroll-live fixture #NN"; existing rows are found first and never
 *      logged twice;
 *   b. asserts, on All Time, that the trend line's SVG path rises and falls
 *      and that Peak Net and Lowest Net read +$29,217 and -$14,363;
 *   c. drives each write path and checks the totals after every step, then
 *      removes exactly the rows that step created: Log Entry, Adjust Bankroll
 *      deposit and withdrawal, link and unlink a session on a staking deal it
 *      creates and deletes, delete an entry, start and complete a trip;
 *   d. judges every request before it leaves the browser
 *      (e2e/fixtures/bankrollWriteGuard.mjs): a write that is not to the
 *      suite's own marked rows, for the signed-in user, is aborted and fails.
 *
 * Every write is the app's own request, signed in as TEST_USER_EMAIL (the
 * platform service account; never service-role, never another user, never
 * Dan's account). Reads the suite makes itself use the same session.
 *
 * Run only through playwright.bankroll-write-live.config.ts (the
 * `bankroll-write-live` suite of .github/workflows/e2e-tests.yml).
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { installRealtimeSessionGuard } from './fixtures/realtimeSessionGuard';
import { APP_ORIGIN, describeRequest, normaliseSha } from './fixtures/bankrollLiveGuard.mjs';
import {
  FIXTURE_LOW_CENTS, FIXTURE_PEAK_CENTS, FIXTURE_STARTING_BANKROLL, TEST_MARKER,
  fixtureMismatches, fixtureNote, isFixtureRow, isTestRow, judgeRequest, missingFixtureSessions,
} from './fixtures/bankrollWriteGuard.mjs';
import { buildTrend } from '../src/lib/bankroll/analyticsView.mjs';

const EXPECTED_SHA = normaliseSha(process.env.BANKROLL_LIVE_EXPECTED_SHA);
const RECEIPT = path.resolve(__dirname, '../test-results/bankroll-write-live/receipt.json');
const RUN = (process.env.GITHUB_RUN_ID || String(Date.now())).slice(-8);

type Owned = { ledger: Set<string>; trips: Set<string>; arrangements: Set<string>; stakingSessions: Set<string> };
type Ctx = {
  uid: string | null; token: string | null; apikey: string | null; supabase: string | null;
  owned: Owned; allowStartingBankroll: boolean; allowDeactivateAll: boolean;
  refused: string[]; allowed: string[]; shell: number; telemetry: number; pageErrors: string[];
};

const receipt: Record<string, unknown> = { expectedSha: EXPECTED_SHA, run: RUN, steps: {} as Record<string, unknown> };
const steps = receipt.steps as Record<string, unknown>;

function writeReceipt() {
  fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2));
}

async function readHealth() {
  const response = await fetch(`${APP_ORIGIN}/api/health`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000) });
  const body: any = await response.json();
  return { ok: response.ok && body?.status === 'ok', sha: normaliseSha(body?.commitSha) };
}

/** "+$1,234.50" / "−$14,363" / "-$33" -> cents. */
function moneyCents(text: string): number {
  const t = String(text).replace(/\s/g, '');
  if (t.includes('€')) throw new Error(`amount shown in euros (${t}); this suite needs Display EUR off`);
  const m = /([+\-−]?)\$([\d,]+(?:\.\d{1,2})?)/.exec(t);
  if (!m) throw new Error(`no dollar amount in "${text}"`);
  const value = Math.round(Number(m[2].replace(/,/g, '')) * 100);
  return m[1] === '-' || m[1] === '−' ? -value : value;
}

/** How Recent Activity prints a row's amount: "+$123.00", "-$33.00". */
function signedText(cents: number) {
  const body = '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cents < 0 ? '-' + body : cents > 0 ? '+' + body : body;
}

async function refreshSession(page: Page, ctx: Ctx) {
  const session = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}'); } catch { return {}; }
  });
  ctx.uid = session?.user?.id || null;
  ctx.token = session?.access_token || null;
  expect(ctx.uid, 'no signed-in service-account session').toBeTruthy();
}

/** A read as the signed-in user (RLS applies). */
async function rest(page: Page, ctx: Ctx, query: string): Promise<any[]> {
  await refreshSession(page, ctx);
  expect(ctx.supabase && ctx.apikey, 'the page made no Supabase request to learn its origin from').toBeTruthy();
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const response = await fetch(`${ctx.supabase}/rest/v1/${query}`, {
      headers: { apikey: ctx.apikey!, Authorization: `Bearer ${ctx.token}`, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
      signal: AbortSignal.timeout(30_000),
    });
    expect(response.ok, `read ${query.split('?')[0]} failed: ${response.status}`).toBe(true);
    const page_ = await response.json();
    out.push(...page_);
    if (page_.length < 1000) return out;
  }
}

const ledgerRows = (page: Page, ctx: Ctx) => rest(page, ctx,
  `bankroll_ledger?select=id,category,entry_date,gross_in,gross_out,net_result,notes,trip_id,user_id&user_id=eq.${ctx.uid}&is_revision=eq.false&order=id.asc`);

async function install(page: Page, ctx: Ctx) {
  await installRealtimeSessionGuard(page.context());
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bankroll_tutorial_seen_v1', '1');
      localStorage.setItem('bankroll_tutorial_seen_v1:prompt', '1');
    } catch {}
  });
  page.on('pageerror', (error) => ctx.pageErrors.push(String(error?.message || error).slice(0, 300)));
  // A confirm() (Trip entry delete) is accepted: the suite only reaches one for its own row.
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  await page.context().route('**/*', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    if (!ctx.supabase && /\.supabase\.co\/rest\/v1\//.test(url) && request.headers().apikey) {
      ctx.supabase = new URL(url).origin;
      ctx.apikey = request.headers().apikey;
    }
    const verdict: any = judgeRequest({ method: request.method(), url, headers: request.headers(), body: request.postData() }, ctx);
    const label = describeRequest(request.method(), url);
    if (verdict.kind === 'read' || verdict.kind === 'session') return route.continue();
    if (verdict.kind === 'shell') { ctx.shell++; return route.abort('blockedbyclient'); }
    if (verdict.kind === 'telemetry') { ctx.telemetry++; return route.abort('blockedbyclient'); }
    if (verdict.kind === 'lookup') {
      const rows = await rest(page, ctx, `${verdict.table}?select=id,${verdict.field}&id=eq.${verdict.id}`).catch(() => []);
      const parent = rows[0]?.[verdict.field];
      if (parent && (ctx.owned as any)[verdict.ownedBy].has(parent)) {
        (ctx.owned as any)[verdict.into].add(verdict.id);
        ctx.allowed.push(`${label} (owned via ${verdict.field})`);
        return route.continue();
      }
      ctx.refused.push(`${label}: ${verdict.table} row not under an owned ${verdict.ownedBy}`);
      return route.abort('blockedbyclient');
    }
    if (verdict.kind === 'allow') {
      ctx.allowed.push(`${label} (${verdict.reason})`);
      if (request.method() !== 'POST') return route.continue();
      // Learn the ids of rows the suite just inserted (return=representation).
      const response = await route.fetch();
      try {
        const body = await response.json();
        const table = new URL(url).pathname.split('/').pop();
        const key = table === 'bankroll_ledger' ? 'ledger' : table === 'bankroll_trips' ? 'trips' : table === 'staking_arrangements' ? 'arrangements' : null;
        if (key) for (const row of Array.isArray(body) ? body : [body]) if (row?.id && row.user_id === ctx.uid) (ctx.owned as any)[key].add(row.id);
      } catch {}
      return route.fulfill({ response });
    }
    ctx.refused.push(`${label}: ${verdict.reason}`);
    return route.abort('blockedbyclient');
  });
}

async function waitForSection(page: Page, title: string) {
  const main = page.locator('section.bankroll-main-content');
  await expect(main, `section did not resolve to "${title}"`).toHaveAttribute('aria-label', title, { timeout: 45_000 });
  await expect(page.locator('section.bankroll-main-content [aria-busy="true"]:visible')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function dashboard(page: Page) {
  await page.goto('/hub/bankroll-manager?view=dashboard', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForSection(page, 'Bankroll Manager');
}

async function tile(page: Page, title: string): Promise<number> {
  const card = page.locator('.sd-metric').filter({ hasText: title }).first();
  await expect(card).toBeVisible();
  await expect(card).not.toHaveText(new RegExp(`^${title}\\s*-$`), { timeout: 20_000 });
  const text = await card.innerText();
  return moneyCents(text.replace(title, ''));
}

async function pickFromDropdown(page: Page, current: RegExp, option: string) {
  const trigger = page.locator('.bankroll-filters-row button').filter({ hasText: current }).first();
  await trigger.click();
  await page.locator('.bankroll-dropdown-menu').getByRole('button', { name: option, exact: true }).click();
  await expect(page.locator('.bankroll-dropdown-menu')).toHaveCount(0);
}

/** All Time, Line Chart: the trend's peak, low and drawn line. */
async function readTrend(page: Page) {
  await dashboard(page);
  await pickFromDropdown(page, /^(Line Chart|Bar Chart|Donut Chart|Stacked Bar|Histogram|Heatmap)/, 'Line Chart');
  await pickFromDropdown(page, /^(Last 7 Days|Last 30 Days|Last 90 Days|This Year|All Time)/, 'All Time');
  const region = page.getByRole('region', { name: 'Bankroll Trend' });
  await expect(region).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await expect(region).toContainText('Cumulative Net · All Time');
  const curve = region.locator('path.recharts-area-curve');
  await expect(curve.first(), 'the line chart drew no curve').toBeAttached({ timeout: 20_000 });
  const d = (await curve.first().getAttribute('d')) || '';
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const ys: number[] = [];
  for (let i = 1; i < nums.length; i += 2) ys.push(nums[i]);
  const measure = async (label: string) => moneyCents(await region.locator('dl div').filter({ hasText: label }).locator('dd').innerText());
  return { points: ys.length, maxY: Math.max(...ys), minY: Math.min(...ys), peak: await measure('Peak Net'), low: await measure('Lowest Net') };
}

async function logCashSession(page: Page, { date, buyIn, cashOut, notes }: { date: string; buyIn: number; cashOut: number; notes: string }) {
  await page.goto('/hub/bankroll-manager?view=log-session', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const dialog = page.getByRole('dialog').filter({ hasText: /Log Session|Set Your Starting Bankroll/ }).first();
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await expect(dialog, 'the starting-bankroll step blocked Log Entry').not.toContainText('Set Your Starting Bankroll');
  await dialog.getByRole('button', { name: 'Cash Games' }).click();
  await dialog.getByLabel('Buy-In ($)').fill(String(buyIn));
  await dialog.getByLabel('Cash-Out ($)').fill(String(cashOut));
  await dialog.getByLabel('Date', { exact: true }).fill(date);
  await dialog.getByLabel('Session Notes').fill(notes);
  await dialog.getByRole('button', { name: 'Log Entry', exact: true }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Log Cash Games' }), 'Log Entry did not save').toHaveCount(0, { timeout: 30_000 });
}

async function adjust(page: Page, kind: 'Deposit' | 'Withdraw', amount: number, note: string) {
  await page.goto('/hub/bankroll-manager?view=adjust-bankroll', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const dialog = page.locator('dialog[open]').filter({ hasText: 'Amount (USD)' });
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  await dialog.getByRole('button', { name: kind, exact: true }).click();
  await dialog.getByLabel('Amount (USD)').fill(String(amount));
  await dialog.getByLabel('Note (Optional)').fill(note);
  await dialog.getByRole('button', { name: kind === 'Deposit' ? 'Add To Bankroll' : 'Withdraw From Bankroll' }).click();
  await expect(page.locator('dialog[open]').filter({ hasText: 'Amount (USD)' })).toHaveCount(0, { timeout: 30_000 });
}

/** Delete one Recent Activity row through its action menu. */
async function deleteRow(page: Page, amountText: string) {
  await dashboard(page);
  const actions = page.getByRole('button', { name: 'Entry Actions' });
  const row = page.locator('div').filter({ hasText: amountText }).filter({ has: actions }).last();
  await expect(row, `no Recent Activity row reads ${amountText}`).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'Entry Actions' }).click();
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await row.getByRole('button', { name: 'Confirm Delete' }).click();
  await expect(page.getByText('Entry Deleted').first()).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: 'serial' });

test('bankroll write paths on the published site, as the service account', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  expect(EXPECTED_SHA, 'BANKROLL_LIVE_EXPECTED_SHA must be the full deployed commit SHA').not.toBeNull();
  const before = await readHealth();
  expect(before.ok).toBe(true);
  expect(before.sha, 'production is not serving the pinned deployment').toBe(EXPECTED_SHA);

  const ctx: Ctx = {
    uid: null, token: null, apikey: null, supabase: null,
    owned: { ledger: new Set(), trips: new Set(), arrangements: new Set(), stakingSessions: new Set() },
    allowStartingBankroll: false, allowDeactivateAll: false,
    refused: [], allowed: [], shell: 0, telemetry: 0, pageErrors: [],
  };
  await install(page, ctx);
  const noRefusals = (where: string) => expect(ctx.refused, `a write outside the suite's own rows was attempted (${where})`).toEqual([]);

  try {
    await dashboard(page);
    await refreshSession(page, ctx);
    const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });

    // ---- a. the fixture -------------------------------------------------
    await test.step('a. ensure the fixture', async () => {
      let rows = await ledgerRows(page, ctx);
      // A test row left by an interrupted earlier run is this suite's own
      // (marker and user id): remove it through the app first, so no total
      // below is read with it still counted.
      const leftovers = rows.filter((r) => isTestRow(r) && r.user_id === ctx.uid);
      steps.leftoverTestRows = leftovers.map((r) => `${r.category} ${r.entry_date}`);
      for (const r of leftovers) {
        ctx.owned.ledger.add(r.id);
        await deleteRow(page, signedText(Math.round(Number(r.gross_out) * 100) - Math.round(Number(r.gross_in) * 100)));
      }
      const leftoverTrips = await rest(page, ctx, `bankroll_trips?select=id,name,status&user_id=eq.${ctx.uid}&status=eq.active`);
      for (const t of leftoverTrips.filter((t: any) => String(t.name || '').includes(TEST_MARKER))) {
        ctx.owned.trips.add(t.id);
        await page.goto('/hub/bankroll-manager?view=trips', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await waitForSection(page, 'Trip Tracker');
        await page.getByRole('button', { name: 'Delete Trip' }).click();
        await page.getByRole('button', { name: 'Yes, Delete' }).click();
        await expect(page.getByText('LIVE TRIP')).toHaveCount(0, { timeout: 30_000 });
      }
      rows = await ledgerRows(page, ctx);
      expect(rows.filter(isTestRow), 'test rows from an earlier run could not be removed').toEqual([]);
      expect(fixtureMismatches(rows), 'a fixture row differs from its definition').toEqual([]);
      const segments = await rest(page, ctx, `bankroll_segments?select=segment_type,initial_deposit&user_id=eq.${ctx.uid}`);
      const hasStart = segments.some((s: any) => s.segment_type !== 'life' && Number(s.initial_deposit) > 0);
      steps.startingBankroll = hasStart ? 'already set (left as it is)' : `set to $${FIXTURE_STARTING_BANKROLL}`;
      if (!hasStart) {
        ctx.allowStartingBankroll = true;
        await page.goto('/hub/bankroll-manager?view=log-session', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        const modal = page.getByRole('dialog').filter({ hasText: 'Set Your Starting Bankroll' });
        await expect(modal).toBeVisible({ timeout: 45_000 });
        await modal.locator('input[type="number"]').fill(String(FIXTURE_STARTING_BANKROLL));
        await modal.locator('button[type="submit"]').click();
        await expect(modal).toHaveCount(0, { timeout: 30_000 });
        ctx.allowStartingBankroll = false;
      }
      const missing = missingFixtureSessions(rows);
      steps.fixtureLogged = missing.map((s) => s.n);
      for (const s of missing) {
        await logCashSession(page, { date: s.date, buyIn: s.buyIn, cashOut: s.cashOut, notes: fixtureNote(s.n) });
      }
      rows = await ledgerRows(page, ctx);
      expect(missingFixtureSessions(rows), 'fixture sessions still missing after logging').toEqual([]);
      expect(fixtureMismatches(rows)).toEqual([]);
      noRefusals('fixture');
    });

    // ---- b. the trend ---------------------------------------------------
    const rows = await ledgerRows(page, ctx);
    const foreign = rows.filter((r) => !isFixtureRow(r) && !isTestRow(r) && r.category !== 'deposit' && r.category !== 'withdrawal');
    const expectedTrend = buildTrend(rows, '2000-01-01', today);
    const expected = foreign.length ? { peak: expectedTrend.high, low: expectedTrend.low } : { peak: FIXTURE_PEAK_CENTS, low: FIXTURE_LOW_CENTS };
    steps.foreignResultRows = foreign.length;
    await test.step('b. All Time trend rises and falls; Peak and Lowest Net', async () => {
      const trend = await readTrend(page);
      steps.trend = trend;
      expect(trend.points, 'the line has no more than two points').toBeGreaterThan(2);
      expect(trend.maxY, 'the line is flat').not.toBe(trend.minY);
      expect(trend.peak, 'Peak Net').toBe(expected.peak);
      expect(trend.low, 'Lowest Net').toBe(expected.low);
      if (!foreign.length) {
        expect(trend.peak).toBe(2921700);
        expect(trend.low).toBe(-1436300);
      }
    });

    // ---- c. write paths -------------------------------------------------
    const baseBalance = await (async () => { await dashboard(page); return tile(page, 'Bankroll Balance'); })();
    const baseNet = await tile(page, 'Net Results');
    steps.baseline = { balance: baseBalance, net: baseNet };
    const SESSION = { buyIn: 100, cashOut: 223, net: 12300, text: '+$123.00' };

    await test.step('c1. Log Entry (cash session)', async () => {
      await logCashSession(page, { date: today, buyIn: SESSION.buyIn, cashOut: SESSION.cashOut, notes: `${TEST_MARKER} ${RUN} log entry` });
      await dashboard(page);
      const balance = await tile(page, 'Bankroll Balance');
      const net = await tile(page, 'Net Results');
      steps.logEntry = { balance, net };
      expect(balance - baseBalance, 'Bankroll Balance after Log Entry').toBe(SESSION.net);
      expect(net - baseNet, 'Net Results after Log Entry').toBe(SESSION.net);
      const mine = (await ledgerRows(page, ctx)).filter(isTestRow);
      expect(mine.length).toBe(1);
      for (const r of mine) ctx.owned.ledger.add(r.id);
      noRefusals('log entry');
    });

    await test.step('c2. staking: create a deal, link and unlink the session, delete the deal', async () => {
      const deals = await rest(page, ctx, `staking_arrangements?select=id,is_active,backer_name&user_id=eq.${ctx.uid}`);
      const foreignActive = deals.filter((d: any) => d.is_active && !String(d.backer_name || '').includes(TEST_MARKER));
      expect(foreignActive.length, 'an active staking deal that is not the suite\'s exists; creating one would end it').toBe(0);
      ctx.allowDeactivateAll = true;
      const backer = `${TEST_MARKER} ${RUN} backer`;
      await page.goto('/hub/bankroll-manager?view=staking', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitForSection(page, 'Staking Tracker');
      await page.getByRole('button', { name: /New Staking Deal|^\+ New Deal$/ }).first().click();
      await page.getByPlaceholder('Enter Backer Name...').fill(backer);
      await page.getByPlaceholder('Optional notes...').fill(`${TEST_MARKER} ${RUN} deal`);
      await page.getByRole('button', { name: 'Create Deal' }).click();
      await expect(page.getByText(backer).first()).toBeVisible({ timeout: 30_000 });
      ctx.allowDeactivateAll = false;
      expect(ctx.owned.arrangements.size, 'the new deal id was not seen').toBe(1);
      const dealId = [...ctx.owned.arrangements][0];
      const link = page.getByRole('button', { name: /^Link The .* Session To This Deal$/ });
      await expect(link.first(), 'the test session is not offered for linking').toBeVisible({ timeout: 30_000 });
      expect(await link.count(), 'only the suite\'s own session may be linkable').toBe(1);
      await link.first().click();
      await expect(page.getByRole('button', { name: /^Remove The .* Session From This Deal$/ })).toBeVisible({ timeout: 30_000 });
      const linked = await rest(page, ctx, `staking_sessions?select=id,ledger_entry_id,gross_result&arrangement_id=eq.${dealId}`);
      steps.stakingLinked = linked.map((s: any) => ({ gross: s.gross_result }));
      expect(linked.length).toBe(1);
      expect(Math.round(Number(linked[0].gross_result) * 100), 'the linked session carries its result').toBe(SESSION.net);
      for (const s of linked) ctx.owned.stakingSessions.add(s.id);
      await page.getByRole('button', { name: /^Remove The .* Session From This Deal$/ }).click();
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(link.first()).toBeVisible({ timeout: 30_000 });
      expect((await rest(page, ctx, `staking_sessions?select=id&arrangement_id=eq.${dealId}`)).length, 'unlink left a staking session').toBe(0);
      await page.getByRole('button', { name: /End Deal/ }).click();
      await page.getByRole('button', { name: 'Yes, End' }).click();
      await page.getByRole('button', { name: `Delete The Deal With ${backer}` }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByText(backer)).toHaveCount(0, { timeout: 30_000 });
      expect((await rest(page, ctx, `staking_arrangements?select=id&id=eq.${dealId}`)).length, 'the deal was not deleted').toBe(0);
      noRefusals('staking');
    });

    await test.step('c3. delete the logged entry', async () => {
      await deleteRow(page, SESSION.text);
      await dashboard(page);
      expect(await tile(page, 'Bankroll Balance'), 'Bankroll Balance after delete').toBe(baseBalance);
      expect(await tile(page, 'Net Results'), 'Net Results after delete').toBe(baseNet);
      expect((await ledgerRows(page, ctx)).filter(isTestRow)).toEqual([]);
      noRefusals('delete entry');
    });

    await test.step('c4. Adjust Bankroll: deposit then withdrawal, each removed', async () => {
      await adjust(page, 'Deposit', 77, `${TEST_MARKER} ${RUN} deposit`);
      await dashboard(page);
      const afterDeposit = await tile(page, 'Bankroll Balance');
      expect(afterDeposit - baseBalance, 'deposit moves the balance by its amount').toBe(7700);
      expect(await tile(page, 'Net Results'), 'a deposit is not a result').toBe(baseNet);
      await adjust(page, 'Withdraw', 33, `${TEST_MARKER} ${RUN} withdrawal`);
      await dashboard(page);
      const afterWithdrawal = await tile(page, 'Bankroll Balance');
      expect(afterWithdrawal - afterDeposit, 'withdrawal moves the balance by its amount').toBe(-3300);
      steps.adjust = { afterDeposit, afterWithdrawal };
      for (const r of (await ledgerRows(page, ctx)).filter(isTestRow)) ctx.owned.ledger.add(r.id);
      await deleteRow(page, '+$77.00');
      await deleteRow(page, '-$33.00');
      await dashboard(page);
      expect(await tile(page, 'Bankroll Balance'), 'balance after removing both adjustments').toBe(baseBalance);
      expect((await ledgerRows(page, ctx)).filter(isTestRow)).toEqual([]);
      noRefusals('adjust bankroll');
    });

    await test.step('c5. start and complete a trip, then remove it', async () => {
      const active = await rest(page, ctx, `bankroll_trips?select=id,name&user_id=eq.${ctx.uid}&status=eq.active`);
      expect(active.length, 'the account already has an active trip').toBe(0);
      const name = `${TEST_MARKER} ${RUN} trip`;
      await page.goto('/hub/bankroll-manager?view=trips', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitForSection(page, 'Trip Tracker');
      await page.getByRole('button', { name: /Start A New Trip/ }).first().click();
      await page.getByPlaceholder('e.g. Vegas Feb 2026').fill(name);
      await page.getByPlaceholder('Any Notes...').fill(`${TEST_MARKER} ${RUN} trip`);
      await page.getByRole('button', { name: 'Start Trip' }).click();
      await expect(page.getByText('LIVE TRIP')).toBeVisible({ timeout: 30_000 });
      expect(ctx.owned.trips.size, 'the new trip id was not seen').toBe(1);
      await page.getByRole('button', { name: /Complete Trip/ }).click();
      await page.getByRole('button', { name: 'Yes, Complete' }).click();
      const card = page.getByRole('button', { name: `View Report For ${name}` });
      await expect(card).toBeVisible({ timeout: 30_000 });
      steps.trip = { card: (await card.innerText()).replace(/\s+/g, ' ').slice(0, 120) };
      await expect(card, 'an empty trip totals $0 and 0 sessions').toContainText('$0');
      await expect(card).toContainText('0 Sessions');
      // Remove it: the only delete the app offers is on an active trip, so reopen first.
      await card.click();
      await page.getByRole('button', { name: 'Reopen Trip' }).click();
      await expect(page.getByText('LIVE TRIP')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Delete Trip' }).click();
      await page.getByRole('button', { name: 'Yes, Delete' }).click();
      await expect(page.getByText('LIVE TRIP')).toHaveCount(0, { timeout: 30_000 });
      const tripId = [...ctx.owned.trips][0];
      const left = await rest(page, ctx, `bankroll_trips?select=status&id=eq.${tripId}`);
      expect(left.map((t: any) => t.status), 'the trip is deleted (the app keeps a deleted row)').toEqual(['deleted']);
      noRefusals('trip');
    });

    // ---- the account is back where it started ---------------------------
    await test.step('final: totals and trend unchanged, no test rows left', async () => {
      await dashboard(page);
      expect(await tile(page, 'Bankroll Balance')).toBe(baseBalance);
      expect(await tile(page, 'Net Results')).toBe(baseNet);
      const trend = await readTrend(page);
      expect(trend.peak).toBe(expected.peak);
      expect(trend.low).toBe(expected.low);
      expect((await ledgerRows(page, ctx)).filter(isTestRow)).toEqual([]);
      steps.final = { balance: baseBalance, peak: trend.peak, low: trend.low };
    });

    expect(ctx.pageErrors, 'uncaught page errors').toEqual([]);
    noRefusals('end');
    receipt.passed = true;
  } finally {
    receipt.refused = ctx.refused;
    receipt.allowedWrites = ctx.allowed;
    receipt.blockedShell = ctx.shell;
    receipt.blockedTelemetry = ctx.telemetry;
    receipt.pageErrors = ctx.pageErrors;
    writeReceipt();
  }
  const after = await readHealth();
  expect(after.sha, 'production changed deployment while the suite ran').toBe(EXPECTED_SHA);
});
