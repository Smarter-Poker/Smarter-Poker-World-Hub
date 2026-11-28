// The Bankroll Manager gates logging and its tools behind bankroll_pro (VIP or
// a 25-diamond 24-hour pass): pages/hub/bankroll-manager.js handleLogClick and
// handleSidebarClick call guardAction(). While that is true, nothing we publish
// about the Bankroll Manager may call it 100% free, zero paywalls or unlimited.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const FALSE_FREE = /100%\s*free|zero paywalls|free forever|unlimited receipt scans|unlimited session logging/i;

test('the Bankroll Manager still gates logging and its tools', () => {
  const page = read('pages/hub/bankroll-manager.js');
  assert.match(page, /useFeatureGate\('bankroll_pro'\)/);
  assert.match(page, /const handleLogClick[\s\S]{0,400}guardAction\(\)/);
});

test('the page FAQ states what is free and what needs VIP or a day pass', () => {
  const page = read('pages/hub/bankroll-manager.js');
  const faq = page.slice(page.indexOf("question: 'Is the Smarter.Poker Bankroll Manager free to use?'"));
  const answer = faq.slice(0, 400);
  assert.doesNotMatch(answer, FALSE_FREE);
  assert.match(answer, /VIP/);
  assert.match(answer, /25 diamonds/);
});

test('the Bankroll AI-corpus copy makes no false free claim', async () => {
  const { renderBankrollTrackerMarkdown } = await import('../src/lib/seo/markdownIngestion.mjs');
  const md = renderBankrollTrackerMarkdown();
  assert.doesNotMatch(md, FALSE_FREE);
  assert.match(md, /25 Diamonds/);
});

test('the tax-advisor outreach email makes no false free claim about the ledger', () => {
  const src = read('src/lib/seo/outreachEngine.mjs');
  const at = src.indexOf('Schedule C Session Ledger');
  assert.ok(at > -1);
  assert.doesNotMatch(src.slice(at - 300, at + 300), FALSE_FREE);
});

test('rule alerts carry cents so they follow Display EUR', async () => {
  const { evaluateRuleViolations } = await import('../src/lib/bankroll/ruleViolations.mjs');
  const { formatCentsCurrency } = await import('../src/lib/bankroll/currencyUtils.js');
  const [v] = evaluateRuleViolations({
    entry: { id: 'e1', category: 'poker_cash', entry_date: '2026-11-28', gross_in: 600, gross_out: 0, net_result: -600 },
    rules: [{ rule_type: 'stop_loss_session', value: 500, is_active: true }],
    dayEntries: [], monthEntries: [], bankrollCents: 1000000,
  }) || [];
  assert.ok(v, 'a session loss past the limit is a violation');
  assert.equal(v.limitCents, 50000);
  assert.equal(v.actualCents, -60000);
  assert.match(formatCentsCurrency(v.limitCents, true), /\u20ac/);
  assert.doesNotMatch(formatCentsCurrency(v.limitCents, true), /\$/);
  const src = read('src/lib/bankroll/ruleViolations.mjs');
  assert.equal((src.match(/limitCents, actualCents/g) || []).length, 4, 'every money rule carries cents');
});
