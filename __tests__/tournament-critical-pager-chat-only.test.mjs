import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const original = readFileSync(new URL('../pages/api/cron/critical-pager.js', import.meta.url), 'utf8');
function load(pending, { auth = true, scanError = null } = {}) {
  const calls = [];
  const sb = { async rpc(name, args) { calls.push([name, args]); return name === 'fn_sp_critical_scan' ? { data: { pending, new: pending.length }, error: scanError } : { data: {} }; } };
  const context = { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'isolated' } }, createClient: () => sb, validateCronAuth: () => auth, withCronHealth: (_, handler) => handler, adminRecipients: async () => [{ email: 'test@example.invalid' }], sendEmail: async () => { calls.push(['email']); return { ok: true }; }, sendSms: async () => { calls.push(['sms']); return { ok: true }; }, esc: String, Date, JSON };
  const source = original.replace(/^import .*;\n/gm, '').replace('export const config', 'const config').replace('export default withCronHealth', 'globalThis.handler = withCronHealth');
  vm.runInNewContext(source, context);
  return { calls, async run() { const res = { status(n) { this.code = n; return this; }, json(value) { this.body = value; return this; } }; await context.handler({}, res); return res; } };
}
test('tournament failures retain chat destination with no SMS/email or fabricated delivery marks, including repeats', async () => {
  for (const page of [{ id: 1, rule: 'stuck_tournament' }, { id: 2, rule: 'future_tournament_rule', detail: { tournament_id: 'tournament' } }]) {
    const h = load([{ ...page, need_email: true, need_sms: true }]);
    for (let i = 0; i < 2; i++) { const r = await h.run(); assert.equal(r.code, 200); assert.equal(r.body.sent[0].destination, 'codex'); assert.equal(r.body.sent[0].emailed, false); assert.equal(r.body.sent[0].texted, false); }
    assert.deepEqual(h.calls.map(x => x[0]), ['fn_sp_critical_scan', 'fn_sp_critical_scan']);
  }
});
test('unrelated critical delivery retains existing sender and receipt behavior', async () => {
  const h = load([{ id: 3, rule: 'payment_problem', title: 'isolated', need_email: true, need_sms: true }]);
  assert.equal((await h.run()).code, 200);
  assert.deepEqual(h.calls.map(x => x[0]), ['fn_sp_critical_scan', 'email', 'sms', 'fn_sp_critical_mark']);
});
test('unauthorized calls and failed durable scans never claim chat delivery', async () => {
  const denied = load([], { auth: false }); assert.equal((await denied.run()).code, 401); assert.equal(denied.calls.length, 0);
  const failed = load([{ id: 4, rule: 'stuck_tournament' }], { scanError: { message: 'isolated failure' } }); assert.equal((await failed.run()).code, 500); assert.deepEqual(failed.calls.map(x => x[0]), ['fn_sp_critical_scan']);
});

test('the required operational inbox check executes this regression', () => {
  const workflow = readFileSync(new URL('../.github/workflows/build-safety-gate.yml', import.meta.url), 'utf8');
  assert.match(workflow, /run: node --test __tests__\/tournament-critical-pager-chat-only\.test\.mjs/);
});
