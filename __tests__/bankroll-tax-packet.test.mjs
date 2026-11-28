// Tax Packet (2026-11-28): the figures (taxMath rules, W-2Gs from the Vault,
// mileage at the IRS rate on each date, all USD) and the route's front door
// (method, token, validation, rate limit, Pro gate), run with mock req/res.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as apiGuard from '../src/lib/bankroll/apiGuard.mjs';
import * as ledgerReport from '../src/lib/bankroll/ledgerReport.mjs';
import * as taxPacket from '../src/lib/bankroll/taxPacket.mjs';

const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const { buildTaxPacket, renderTaxPacketPdf, NOT_TAX_ADVICE } = taxPacket;

const ROWS = [
  { id: '1', entry_date: '2026-01-05', category: 'poker_cash', gross_in: 500, gross_out: 1500, bankroll_locations: { name: 'Aria' } },
  { id: '2', entry_date: '2026-02-05', category: 'poker_mtt', gross_in: 1000, gross_out: 0, tournament_name: 'Daily' },
  { id: '3', entry_date: '2026-07-05', category: 'slots', gross_in: 300, gross_out: 100 },
  { id: '4', entry_date: '2026-03-01', category: 'expense', gross_in: 120, gross_out: 0, expense_type: 'hotel' },
  { id: '5', entry_date: '2026-03-02', category: 'expense', gross_in: 30.1, gross_out: 0, expense_type: 'hotel' },
  { id: '6', entry_date: '2026-03-03', category: 'expense', gross_in: 15, gross_out: 0, expense_type: null },
  { id: '7', entry_date: '2026-04-01', category: 'deposit', gross_in: 0, gross_out: 5000 },
  { id: '8', entry_date: '2025-12-31', category: 'poker_cash', gross_in: 0, gross_out: 9999 },
  { id: '9', entry_date: '2026-05-01', category: 'poker_cash', gross_in: 0, gross_out: 9999, is_revision: true },
];
const W2G = [
  { tax_year: 2026, upload_date: '2026-07-06', form_type: 'slots', source_description: 'Aria Slots', gross_amount: '2400', federal_withheld: '576', state_withheld: null, withholding_amount: '576', file_url: 'https://x.supabase.co/storage/v1/object/public/user-media/u/bankroll/w.jpg' },
  { tax_year: 2025, upload_date: '2025-07-06', form_type: 'poker', gross_amount: '9000' },
];
const GIGS = [
  { start_date: '2026-06-30', venue_name: 'Wynn', mileage: 100 },
  { start_date: '2026-07-01', venue_name: 'Wynn', mileage: 100 },
  { start_date: '2026-08-01', venue_name: 'Bellagio', mileage: 0 },
  { start_date: '2025-08-01', venue_name: 'Old', mileage: 50 },
];

test('the cover uses the 2026 rules: 90% of losses, never more than winnings', () => {
  const p = buildTaxPacket({ rows: ROWS, w2gForms: W2G, gigs: GIGS, year: 2026 });
  assert.equal(p.currency, 'USD');
  assert.equal(p.cover.sessions, 3, 'deposits, expenses, other years and revisions are not sessions');
  assert.equal(p.cover.winnings, 1000);
  assert.equal(p.cover.losses, 1200);
  assert.equal(p.cover.lossDeductionRate, 0.9);
  assert.equal(p.cover.deductibleLosses, 1000, '90% of 1,200 is 1,080, capped at 1,000 of winnings');
  assert.equal(p.cover.net, -200);
  assert.equal(p.cover.taxableGamblingIncome, 0);
  assert.equal(p.cover.thresholds.slots, 2000);
  assert.equal(p.sessions.length, 3);
  assert.deepEqual(p.sessions[0], { date: '2026-01-05', venue: 'Aria', type: 'Cash Game', buyIn: 500, cashOut: 1500, net: 1000 });

  const small = buildTaxPacket({ rows: [
    { entry_date: '2026-01-01', category: 'poker_cash', gross_in: 0, gross_out: 5000 },
    { entry_date: '2026-01-02', category: 'poker_cash', gross_in: 1000, gross_out: 0 },
  ], year: 2026 });
  assert.equal(small.cover.deductibleLosses, 900);
  assert.equal(buildTaxPacket({ rows: [{ entry_date: '2025-01-02', category: 'poker_cash', gross_in: 1000, gross_out: 0 }, { entry_date: '2025-01-01', category: 'poker_cash', gross_in: 0, gross_out: 5000 }], year: 2025 }).cover.deductibleLosses, 1000, 'before 2026 all losses count');
});

test('expenses by type in cents; W-2Gs of the year only, with image links', () => {
  const p = buildTaxPacket({ rows: ROWS, w2gForms: W2G, gigs: GIGS, year: 2026 });
  assert.deepEqual(p.expenses, [{ type: 'hotel', label: 'Hotel', amount: 150.1 }, { type: 'other', label: 'Other', amount: 15 }]);
  assert.equal(p.cover.expenses, 165.1);
  assert.equal(p.w2g.length, 1);
  assert.equal(p.w2g[0].gross, 2400);
  assert.equal(p.w2g[0].stateWithheld, null, 'a missing figure stays missing');
  assert.match(p.w2g[0].fileUrl, /^https:/);
  assert.equal(p.cover.w2gWithheld, 576);
});

test('mileage is valued at the IRS rate on each date: 72.5 cents to June 30, 76 cents from July 1', () => {
  const p = buildTaxPacket({ rows: [], gigs: GIGS, year: 2026 });
  assert.deepEqual(p.mileage.map((m) => [m.date, m.rate, m.amount]), [['2026-06-30', 0.725, 72.5], ['2026-07-01', 0.76, 76]]);
  assert.equal(p.cover.miles, 200);
  assert.equal(p.cover.mileageDeduction, 148.5);
});

function loadJsPdf() {
  for (const base of [import.meta.url, 'file:///tmp/rh-io/']) {
    try {
      const r = createRequire(base);
      return { jsPDF: r('jspdf').jsPDF, autoTable: r('jspdf-autotable').default, require: r };
    } catch { /* try the next place */ }
  }
  return null;
}

test('the PDF renders every section and says it is not tax advice on every page', (t) => {
  const lib = loadJsPdf();
  if (!lib) return t.skip('jspdf is not installed here; CI runs this');
  const rows = [...ROWS];
  for (let i = 0; i < 1200; i++) rows.push({ id: 'm' + i, entry_date: '2026-09-01', category: 'poker_cash', gross_in: 100, gross_out: i % 2 ? 300 : 0 });
  const packet = buildTaxPacket({ rows, w2gForms: W2G, gigs: GIGS, year: 2026 });
  const pdf = Buffer.from(renderTaxPacketPdf(lib.jsPDF, lib.autoTable, packet, '2026-11-28'));
  const text = pdf.toString('latin1');
  assert.equal(text.slice(0, 5), '%PDF-');
  for (const s of ['Gambling Tax Packet - 2026', 'All amounts are US dollars', 'W-2G Forms Filed In The Vault', 'Expenses By Type', 'Mileage By Date', 'Session Log \\(1203\\)', '90% Of Losses', '$0.725/mi', '$0.76/mi']) {
    assert.ok(text.includes(s), s);
  }
  const pages = (text.match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pages > 5, 'a 1,203-session log runs over many pages');
  assert.equal((text.match(/Not tax advice\./g) || []).length, pages, 'the note is on every page');
  assert.ok(text.includes('/URI (https://x.supabase.co/storage/v1/object/public/user-media/u/bankroll/w.jpg)'), 'the W-2G image is a link');
  assert.match(NOT_TAX_ADVICE, /tax professional/);
});

test('tax packet input: strict year, PDF only', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  assert.deepEqual(apiGuard.taxPacketRequest({ year: '2026', today: '2026-06-01' }, now), { year: 2026, today: '2026-06-01' });
  assert.equal(apiGuard.taxPacketRequest({ year: '2026x' }, now).error, 'Invalid tax year');
  assert.equal(apiGuard.taxPacketRequest({ year: ['2026', '2025'] }, now).error, 'Invalid tax year');
  assert.equal(apiGuard.taxPacketRequest({ format: 'json' }, now).error, 'Format must be pdf');
  assert.equal(apiGuard.taxPacketRequest({ today: '2027-01-01' }, now).year, 2027);
});

// ------------------------------------------------------------------ the route, run with mock req/res

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const TOKEN = 'Bearer ' + 'x'.repeat(40);

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    send(b) { this.body = b; this.headersSent = true; return this; },
  };
}

function fakeDb(answer) {
  const log = [];
  return {
    log,
    from(table) {
      const calls = [];
      log.push({ table, calls });
      const builder = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (resolve, reject) => Promise.resolve(answer(table, calls)).then(resolve, reject);
          return (...args) => { calls.push([prop, ...args]); return builder; };
        },
      });
      return builder;
    },
  };
}

function compile(path) {
  let babel;
  try { babel = require('@babel/core'); } catch { babel = null; }
  const sources = [];
  if (babel) {
    try { sources.push({ babel, presets: [require.resolve('next/babel')] }); } catch { /* not here */ }
  }
  try {
    const r = createRequire('file:///tmp/rh-io/');
    sources.push({ babel: r('@babel/core'), presets: [[r.resolve('@babel/preset-env'), { targets: { node: 'current' }, modules: 'commonjs' }]] });
  } catch { /* not here */ }
  if (!sources.length) return null;
  const { babel: b, presets } = sources[0];
  const code = b.transformSync(read(path), { filename: 'tax-packet.js', babelrc: false, configFile: false, presets }).code;
  // A preset that keeps `import()` as is would leave it unrunnable in a vm
  // context; hand it the same module table as require().
  return code.replace(/\bimport\((['"][^'"]+['"])\)/g, 'Promise.resolve(require($1))');
}

function loadRoute({ db, access = true, limited = false, lib }) {
  const compiled = compile('pages/api/bankroll/tax-packet.js');
  if (!compiled) return null;
  const limits = [];
  const imports = {
    '../../../src/lib/serverAuth': { getServerUserWithFallback: async (req) => (req.headers.authorization === TOKEN ? { user: USER, error: null } : { user: null, error: 'Invalid Token' }) },
    '../../../src/lib/apiSupabase': { getServiceSupabase: () => db },
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: (_req, res, opts) => {
        limits.push(opts);
        if (limited) { res.status(429).json({ success: false, error: 'Too many requests' }); return false; }
        return true;
      },
    },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/gates/serverFeatureGate': { checkServerFeatureAccess: async () => ({ hasAccess: access }) },
    '../../../src/lib/bankroll/apiGuard.mjs': apiGuard,
    '../../../src/lib/bankroll/ledgerReport.mjs': ledgerReport,
    '../../../src/lib/bankroll/taxPacket.mjs': taxPacket,
    // ES module namespaces, as the bundler hands them to `await import()`.
    jspdf: { __esModule: true, jsPDF: lib ? lib.jsPDF : function () { throw new Error('no jspdf'); } },
    'jspdf-autotable': { __esModule: true, default: lib ? lib.autoTable : () => {} },
  };
  const exportsObj = {};
  runInNewContext(compiled, {
    exports: exportsObj, module: { exports: exportsObj },
    require: (p) => (Object.hasOwn(imports, p) ? imports[p] : require(p)),
    process: { env: {} }, console: { warn() {}, log() {}, debug() {} }, Buffer, URL, Date, Math, Promise,
  });
  const handler = exportsObj.default || exportsObj;
  handler.limits = limits;
  return handler;
}

const call = async (handler, req) => {
  const res = mockRes();
  await handler({ headers: {}, query: {}, ...req }, res);
  return res;
};

test('tax packet route: rate limit, GET only, token, valid year, Pro, then a PDF', async (t) => {
  const lib = loadJsPdf();
  const db = fakeDb((table) => {
    if (table === 'bankroll_ledger') return { data: ROWS, error: null };
    if (table === 'w2g_forms') return { data: W2G.slice(0, 1), error: null };
    if (table === 'toke_gigs') return { data: GIGS.slice(0, 2), error: null };
    return { data: [], error: null };
  });
  const handler = loadRoute({ db, lib });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');

  const post = await call(handler, { method: 'POST', headers: { authorization: TOKEN } });
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.allow, 'GET');
  assert.equal((await call(handler, { method: 'GET', query: { year: '2026' } })).statusCode, 401);
  assert.equal((await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { year: '20x6' } })).statusCode, 400);
  assert.equal(db.log.length, 0, 'nothing is read before the request is valid');
  assert.equal(handler.limits[0].scope, ':bankroll-tax-packet');

  const limited = loadRoute({ db, lib, limited: true });
  assert.equal((await call(limited, { method: 'GET', headers: { authorization: TOKEN } })).statusCode, 429);

  const denied = loadRoute({ db, lib, access: false });
  assert.equal((await call(denied, { method: 'GET', headers: { authorization: TOKEN }, query: { year: '2026' } })).statusCode, 403);

  if (!lib) return t.skip('jspdf is not installed here; CI runs the PDF half');
  const ok = await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { year: '2026', today: '2026-11-28' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.headers['content-type'], 'application/pdf');
  assert.equal(ok.headers['cache-control'], 'private, no-store');
  assert.match(ok.headers['content-disposition'], /tax_packet_2026\.pdf/);
  assert.equal(Buffer.from(ok.body).subarray(0, 5).toString(), '%PDF-');
  for (const q of db.log) {
    assert.deepEqual(q.calls.find((c) => c[0] === 'eq' && c[1] === 'user_id'), ['eq', 'user_id', USER.id], `${q.table}: identity from the JWT`);
    assert.ok(q.calls.some((c) => c[0] === 'range'), `${q.table}: paged`);
  }
  const ledger = db.log.find((q) => q.table === 'bankroll_ledger').calls;
  assert.ok(ledger.some((c) => c[0] === 'eq' && c[1] === 'is_revision' && c[2] === false));
  assert.ok(ledger.some((c) => c[0] === 'gte' && c[2] === '2026-01-01'));
});

test('tax packet route: a failed read is an error, not an empty year', async (t) => {
  const db = fakeDb((table) => (table === 'w2g_forms' ? { data: null, error: { message: 'permission denied for relation w2g_forms' } } : { data: [], error: null }));
  const handler = loadRoute({ db, lib: loadJsPdf() });
  if (!handler) return t.skip('@babel/core is not installed here; CI runs this');
  const res = await call(handler, { method: 'GET', headers: { authorization: TOKEN }, query: { year: '2026' } });
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /permission|relation/);
});
