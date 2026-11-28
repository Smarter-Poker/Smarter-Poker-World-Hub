// Your Bankroll Data (2026-11-28): download everything the player owns in
// the Bankroll Manager, delete all of it, and undo an Import Sessions run.
//
// Every read and delete goes through the player's own browser session, so
// row security limits it to the player's rows; nothing here can reach the
// account, the wallet, Club Arena or another player. The Supabase client is
// passed in, so node:test runs the same code against a fake.
//
// A failed read is an error, never an empty table (rowsOf / allRowsOf in
// leakMath.mjs): an export that silently left out the ledger would be worse
// than none, and a delete report must not call a table "cleared" because it
// could not be read.

import { allRowsOf, rowsOf } from './leakMath.mjs';
import { buildCsv } from './ledgerReport.mjs';
import { importTag } from './sessionImport.mjs';

/** What the export contains and what Delete All removes, in the player's words. */
export const DATA_SOURCES = Object.freeze([
  { key: 'ledger', table: 'bankroll_ledger', label: 'Sessions, Expenses, Deposits And Withdrawals' },
  { key: 'trips', table: 'bankroll_trips', label: 'Trips And Series' },
  { key: 'segments', table: 'bankroll_segments', label: 'Starting Bankroll And Balances' },
  { key: 'staking_deals', table: 'staking_arrangements', label: 'Staking Deals' },
  { key: 'staking_sessions', table: 'staking_sessions', label: 'Staking Sessions', byDeal: true },
  { key: 'goals', table: 'bankroll_goals', label: 'Goals' },
  { key: 'rules', table: 'bankroll_rules', label: 'Bankroll Rules' },
  { key: 'rule_violations', table: 'bankroll_rule_violations', label: 'Rule Violations' },
  { key: 'alerts', table: 'bankroll_alerts', label: 'Bankroll Alerts' },
  { key: 'player_notes', table: 'player_notes', label: 'Player Notes' },
  { key: 'venues', table: 'bankroll_locations', label: 'Saved Venues' },
  { key: 'venue_memory', table: 'bankroll_assistant_memory', label: 'Venue Memory' },
  { key: 'venue_visits', table: 'geofence_visits', label: 'Venue Arrival Alerts' },
  { key: 'toke_gigs', table: 'toke_gigs', label: 'Toke Gigs' },
  { key: 'toke_gig_days', table: 'toke_gig_days', label: 'Toke Gig Days' },
  { key: 'toke_downs', table: 'toke_downs', label: 'Toke Downs' },
  { key: 'toke_expenses', table: 'toke_expenses', label: 'Toke Expenses' },
  { key: 'receipts', table: 'bankroll_receipts', label: 'Scanned Receipts' },
  { key: 'w2g_forms', table: 'w2g_forms', label: 'W-2G Vault' },
  { key: 'dealer_documents', table: 'dealer_documents', label: 'Dealer Documents' },
  { key: 'dealer_calendar', table: 'dealer_calendar_events', label: 'Dealer Calendar' },
]);

const BY_KEY = Object.fromEntries(DATA_SOURCES.map((s) => [s.key, s]));
const ID_BATCH = 100;

/**
 * Every row of every source, a page at a time (past PostgREST's 1,000-row
 * cap). Staking sessions have no user_id; they are read by the player's own
 * deal ids. Throws on the first failed read, naming the source.
 */
export async function readBankrollData(supabase, userId, { onProgress } = {}) {
  if (!userId) throw new Error('Sign In Required');
  const data = {};
  let done = 0;
  for (const source of DATA_SOURCES) {
    if (source.byDeal) {
      const ids = (data.staking_deals || []).map((d) => d.id);
      const rows = [];
      for (let i = 0; i < ids.length; i += ID_BATCH) {
        const chunk = ids.slice(i, i + ID_BATCH);
        rows.push(...await allRowsOf(() => supabase.from(source.table).select('*').in('arrangement_id', chunk).order('id', { ascending: true }), source.label));
      }
      data[source.key] = rows;
    } else {
      data[source.key] = await allRowsOf(() => supabase.from(source.table).select('*').eq('user_id', userId).order('id', { ascending: true }), source.label);
    }
    done++;
    if (onProgress) onProgress(done, DATA_SOURCES.length, source.label);
  }
  return data;
}

/** Every image or document URL the data points at, with where it came from. */
export function bankrollFileUrls(data) {
  const out = [];
  const add = (source, id, url) => {
    if (typeof url === 'string' && url.trim()) out.push({ source, id, url: url.trim() });
  };
  for (const row of data.ledger || []) {
    const media = Array.isArray(row.media_urls) ? row.media_urls : [];
    for (const url of media) add('ledger', row.id, typeof url === 'string' ? url : url && url.url);
  }
  for (const row of data.receipts || []) add('receipts', row.id, row.image_url);
  for (const row of data.w2g_forms || []) add('w2g_forms', row.id, row.file_url);
  for (const row of data.dealer_documents || []) add('dealer_documents', row.id, row.file_url);
  for (const row of data.toke_expenses || []) add('toke_expenses', row.id, row.receipt_url);
  for (const row of data.player_notes || []) add('player_notes', row.id, row.photo_url);
  return out;
}

/**
 * Whether a public storage URL is a file the Bankroll Manager stored for this
 * player, and so may be removed with their data: user-media under
 * `<uid>/bankroll/`, or the player's own folder in the older `images` bucket
 * and in `player-photos`. Anything else (an avatar, another player's photo,
 * an outside link) is left alone.
 */
export function ownedBankrollFile(url, userId) {
  if (!userId) return false;
  let path = '';
  try { path = new URL(String(url)).pathname; } catch { return false; }
  const m = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(path);
  if (!m) return false;
  let object;
  try { object = decodeURIComponent(m[2]); } catch { return false; }
  if (object.includes('..')) return false;
  if (m[1] === 'user-media') return object.startsWith(`${userId}/bankroll/`);
  if (m[1] === 'images' || m[1] === 'player-photos') return object.startsWith(`${userId}/`);
  return false;
}

const cellValue = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v;
};

/**
 * One CSV per table: every column any row has, in first-seen order. Cells go
 * through ledgerReport's csvCell, which neutralises spreadsheet formulas.
 */
export function tableCsv(rows) {
  const columns = [];
  const seen = new Set();
  for (const row of rows || []) for (const k of Object.keys(row || {})) if (!seen.has(k)) { seen.add(k); columns.push(k); }
  if (!columns.length) return '';
  return buildCsv([columns, ...rows.map((row) => columns.map((c) => cellValue(row[c])))]);
}

/** The files of a download: one JSON with everything, a CSV per table, the file list and a README. */
export function exportFiles(data, { exportedAt, day } = {}) {
  const files = [];
  const counts = Object.fromEntries(DATA_SOURCES.map((s) => [s.key, (data[s.key] || []).length]));
  files.push({
    name: 'bankroll-data.json',
    content: JSON.stringify({ exportedAt, currency: 'USD', note: 'All amounts are US dollars.', counts, ...data }, null, 2),
  });
  const trips = data.trips || [];
  const csvs = {
    ...Object.fromEntries(DATA_SOURCES.filter((s) => s.key !== 'trips').map((s) => [s.key, data[s.key] || []])),
    trips: trips.filter((t) => t.trip_type !== 'series'),
    series: trips.filter((t) => t.trip_type === 'series'),
  };
  for (const [key, rows] of Object.entries(csvs)) {
    if (rows.length) files.push({ name: `csv/${key}.csv`, content: tableCsv(rows) });
  }
  const urls = bankrollFileUrls(data);
  if (urls.length) files.push({ name: 'csv/files.csv', content: buildCsv([['Source', 'Row Id', 'URL'], ...urls.map((u) => [u.source, u.id, u.url])]) });
  files.push({
    name: 'README.txt',
    content: [
      'Smarter.Poker Bankroll Manager data export',
      `Exported: ${exportedAt || ''}${day ? ` (your day ${day})` : ''}`,
      'All amounts are US dollars (USD).',
      '',
      'bankroll-data.json holds every table. csv/ holds one spreadsheet per table.',
      'csv/files.csv lists the receipt, W-2G, document and photo links.',
      '',
      ...DATA_SOURCES.map((s) => `${s.label}: ${counts[s.key]}`),
    ].join('\r\n'),
  });
  return files;
}

// ------------------------------------------------------------------ zip

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A ZIP of the files, stored without compression (no library needed; the
 * download is text and small next to a photo). `now` sets the entry times.
 */
export function buildZip(files, now = new Date()) {
  const enc = new TextEncoder();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const body = typeof file.content === 'string' ? enc.encode(file.content) : file.content;
    const crc = crc32(body);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, body.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, body);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, body.length, true);
    dir.setUint32(24, body.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const centralSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
}

// ------------------------------------------------------------------ delete

/**
 * The order Delete All Bankroll Data runs in. Rows that other rows point at
 * go last: rule violations before the ledger and rules, staking sessions
 * before their deals, revisions before the entries they revise, the ledger
 * before trips and venues, alerts and venue memory before venues. Toke downs,
 * expenses and days go before their gigs.
 */
export const DELETE_ORDER = Object.freeze([
  'rule_violations', 'staking_sessions', 'staking_deals', 'receipts', 'w2g_forms',
  'ledger_revisions', 'ledger',
  'toke_downs', 'toke_expenses', 'toke_gig_days', 'toke_gigs',
  'dealer_documents', 'dealer_calendar',
  'alerts', 'venue_memory', 'venue_visits',
  'trips', 'goals', 'rules', 'player_notes', 'venues', 'segments',
]);

async function deleteStep(supabase, userId, key, data) {
  if (key === 'staking_sessions') {
    const ids = (data.staking_deals || []).map((d) => d.id);
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const { error } = await supabase.from('staking_sessions').delete().in('arrangement_id', ids.slice(i, i + ID_BATCH));
      if (error) throw error;
    }
    return;
  }
  const table = key === 'ledger_revisions' ? 'bankroll_ledger' : BY_KEY[key].table;
  let query = supabase.from(table).delete().eq('user_id', userId);
  if (key === 'ledger_revisions') query = query.not('original_entry_id', 'is', null);
  const { error } = await query;
  if (error) throw error;
}

/** Rows of a source still there after the delete, read again rather than assumed. */
async function remainingRows(supabase, userId, key, data) {
  if (key === 'staking_sessions') {
    const ids = (data.staking_deals || []).map((d) => d.id);
    let n = 0;
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      n += rowsOf(await supabase.from('staking_sessions').select('id').in('arrangement_id', ids.slice(i, i + ID_BATCH)), BY_KEY[key].label).length;
    }
    return n;
  }
  const result = await supabase.from(BY_KEY[key].table).select('id', { count: 'exact', head: true }).eq('user_id', userId);
  rowsOf(result, BY_KEY[key].label);
  return Number(result.count) || 0;
}

/**
 * Delete everything `readBankrollData` returned, in DELETE_ORDER, through the
 * player's own session. Files first, then rows. A step that fails is reported
 * and the rest still run, then every source is counted again so the report
 * says what is really left, not what was hoped. Never throws for a single
 * step; the report carries every failure.
 *
 * `removeFile(url)` resolves true when the object was removed.
 */
export async function deleteBankrollData(supabase, userId, data, { removeFile, onProgress } = {}) {
  if (!userId) throw new Error('Sign In Required');
  const report = { files: { removed: 0, failed: 0, kept: 0 }, sources: [], ok: true };
  const urls = [...new Set(bankrollFileUrls(data).map((u) => u.url))];
  const total = urls.length + DELETE_ORDER.length + DATA_SOURCES.length;
  let done = 0;
  const tick = (label) => { done++; if (onProgress) onProgress(done, total, label); };

  for (const url of urls) {
    if (!ownedBankrollFile(url, userId) || !removeFile) report.files.kept++;
    else if (await removeFile(url)) report.files.removed++;
    else report.files.failed++;
    tick('Removing Images');
  }

  const stepErrors = {};
  for (const key of DELETE_ORDER) {
    try {
      await deleteStep(supabase, userId, key, data);
    } catch (error) {
      const at = key === 'ledger_revisions' ? 'ledger' : key;
      stepErrors[at] = stepErrors[at] || String(error?.message || error);
    }
    tick(key === 'ledger_revisions' ? BY_KEY.ledger.label : BY_KEY[key].label);
  }

  for (const source of DATA_SOURCES) {
    const before = (data[source.key] || []).length;
    let left = null;
    let error = stepErrors[source.key] || null;
    try {
      left = await remainingRows(supabase, userId, source.key, data);
    } catch (readError) {
      error = error || String(readError?.message || readError);
    }
    if (left === null || left > 0) report.ok = false;
    if (left > 0 && !error) error = 'Your Session Could Not Delete These Rows';
    report.sources.push({ key: source.key, label: source.label, before, left, deleted: left === null ? null : Math.max(0, before - left), error });
    tick(source.label);
  }
  if (report.files.failed) report.ok = false;
  return report;
}

// ------------------------------------------------------------------ undo import

/** The newest import's id and when it ran, or null when the ledger holds no import. */
export async function findLastImport(supabase, userId) {
  const rows = rowsOf(await supabase
    .from('bankroll_ledger')
    .select('id, notes, created_at')
    .eq('user_id', userId)
    .like('notes', '[Import imp-%')
    .order('created_at', { ascending: false })
    .limit(1), 'ledger');
  const m = rows[0] && /^\[Import (imp-\d{8}-[a-z0-9]{6})\]/.exec(String(rows[0].notes || ''));
  return m ? { id: m[1], createdAt: rows[0].created_at } : null;
}

/** Every ledger row one import wrote (paged), identified by its tag. */
export async function importedRows(supabase, userId, importId) {
  const tag = importTag(importId);
  return allRowsOf(() => supabase
    .from('bankroll_ledger')
    .select('id, category')
    .eq('user_id', userId)
    .like('notes', `${tag}%`)
    .order('id', { ascending: true }), 'ledger');
}

/**
 * Delete rows one by one through `deleteOne(id)` (the page passes
 * deleteLedgerEntry), a few at a time. Returns { deleted, failed }.
 */
export async function deleteEach(ids, deleteOne, { concurrency = 4, onProgress } = {}) {
  let next = 0;
  let deleted = 0;
  const failed = [];
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try { await deleteOne(id); deleted++; } catch (error) { failed.push({ id, error: String(error?.message || error) }); }
      if (onProgress) onProgress(deleted + failed.length, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return { deleted, failed };
}
