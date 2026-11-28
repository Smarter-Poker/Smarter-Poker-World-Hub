// Import Sessions (2026-11-28): read a CSV or a pasted spreadsheet table,
// map its columns onto ledger fields, and turn each row into exactly the
// ledger entry the Log Session form would have saved for it, or a reason why
// not.
//
// Everything here is pure so node:test exercises the same code the sheet
// runs. The sheet (src/components/bankroll/SessionImportSheet.jsx) reads the
// file, asks the player what this module cannot know (which column is which,
// whether 03/04 is March 4 or April 3), and saves through
// createLedgerEntries in bankrollSelectors.ts.
//
// Presets, and where their formats come from:
// - Generic spreadsheet: any table with a header row. Headers are matched by
//   name (Date, Buy-In, Cash-Out, Net, Venue ...), which also reads this
//   app's own ledger CSV export back in.
// - Poker Bankroll Tracker (PBT): the import/export layout documented at
//   https://pokerbankrolltracker.net/faq/ - first row exactly
//   "—PBT Bankroll Export—", then a header row of id, starttime, endtime,
//   breakminutes, ..., variant, game, limit, location, type, buyin, cashout,
//   netprofit, ..., rebuycosts, addoncosts, ..., smallblind, bigblind, ...,
//   currency, exchangerate, ..., mttname, ..., sessionnote, notes, ...
//   starttime/endtime are "YYYY-MM-DD HH:MM:SS" (24 hour); variant is one of
//   Cash Game, Tournament, Casino Games, Jackpot/Bonus, Costs,
//   Deposit/Payout; buyin excludes rebuys and add-ons; cashout is the total.
// Other trackers (Poker Analytics, Poker Income, Poler) were looked up and
// their export headers are not published, so no preset guesses at them; the
// generic mapping reads them once the player picks the columns.
//
// Amounts are US dollars. A value written with another currency's symbol or
// code is refused rather than read as dollars.

import { ledgerDay } from './apiGuard.mjs';
import { entryCents, sessionEndStamp } from './ledgerMath.mjs';

export const IMPORT_FIELDS = Object.freeze([
  { id: 'date', label: 'Date' },
  { id: 'start', label: 'Start Time' },
  { id: 'end', label: 'End Time' },
  { id: 'hours', label: 'Hours Played' },
  { id: 'category', label: 'Category' },
  { id: 'stakes', label: 'Stakes' },
  { id: 'game', label: 'Game' },
  { id: 'tournament', label: 'Tournament Name' },
  { id: 'venue', label: 'Venue' },
  { id: 'buy_in', label: 'Buy-In (USD)' },
  { id: 'cash_out', label: 'Cash-Out (USD)' },
  { id: 'net', label: 'Net Result (USD)' },
  { id: 'notes', label: 'Notes' },
]);

export const IMPORT_CATEGORIES = Object.freeze([
  { id: 'poker_cash', label: 'Cash Game' },
  { id: 'poker_mtt', label: 'Tournament' },
  { id: 'casino_table', label: 'Table Games' },
  { id: 'slots', label: 'Slots' },
  { id: 'sports', label: 'Sports Betting' },
  { id: 'expense', label: 'Expense' },
]);

export const PRESETS = Object.freeze([
  { id: 'generic', label: 'Generic Spreadsheet' },
  { id: 'pbt', label: 'Poker Bankroll Tracker (PBT)' },
]);

// The Log Session form's expense types (LogEntryModal.jsx EXPENSE_TYPES).
const EXPENSE_TYPES = ['flight', 'hotel', 'airbnb', 'gas', 'rental_car', 'rideshare', 'meals', 'tips', 'tournament_fee', 'series_fee', 'other'];

/** The most rows one import takes. Larger files are refused up front, not cut off. */
export const MAX_IMPORT_ROWS = 20000;

// ------------------------------------------------------------------ reading

/**
 * Split delimited text into rows of cells. Handles a UTF-8 BOM, CRLF / LF /
 * CR line ends, quoted fields with commas, doubled quotes and line breaks
 * inside quotes. The delimiter is a tab for a table pasted from a
 * spreadsheet, otherwise whichever of comma or semicolon the header row uses.
 * Rows with no text at all are dropped.
 */
export function parseDelimited(input, delimiter = null) {
  let text = String(input ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const sep = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell.trim() === '') { cell = ''; quoted = true; i++; continue; }
    if (ch === sep) { endCell(); i++; continue; }
    if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += ch; i++;
  }
  if (cell !== '' || row.length) endRow();
  return { rows, delimiter: sep };
}

/** Tab, comma or semicolon, judged from the first line outside quotes. */
export function detectDelimiter(text) {
  let quoted = false;
  const counts = { '\t': 0, ',': 0, ';': 0 };
  for (const ch of String(text)) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (ch === '\n' || ch === '\r') {
      if (counts['\t'] + counts[','] + counts[';'] > 0) break;
      continue;
    }
    if (ch in counts) counts[ch]++;
  }
  if (counts['\t'] > 0) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
}

const PBT_MARKER = /^[—–-]+\s*PBT Bankroll Export\s*[—–-]+$/i;

/** Lower-case letters and digits only: "Buy-In ($)" and "buyin" are the same header. */
export const headerKey = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The table in a file: preset, header row, data rows and each row's line in
 * the spreadsheet (for "Row 14: ..." messages). A PBT file is recognised by
 * its first-row marker or its header names and rewritten into the generic
 * columns, so one mapping step serves both.
 */
export function readTable(text, { preset = null } = {}) {
  const { rows } = parseDelimited(text);
  let offset = 1;
  let body = rows;
  let detected = 'generic';
  if (body.length && body[0].length && PBT_MARKER.test(String(body[0][0]).trim()) && body[0].slice(1).every((c) => !c.trim())) {
    body = body.slice(1);
    offset = 2;
    detected = 'pbt';
  }
  if (!body.length) return { preset: preset || detected, headers: [], records: [], lines: [] };
  const headers = body[0].map((h) => String(h).trim());
  const keys = headers.map(headerKey);
  if (detected === 'generic' && ['starttime', 'variant', 'buyin', 'cashout'].every((k) => keys.includes(k))) detected = 'pbt';
  // Our own CSV export ends with a blank line and a Summary block: not sessions.
  let records = body.slice(1);
  const summaryAt = records.findIndex((r) => String(r[0]).trim() === 'Summary' && r.slice(1).every((c) => !String(c).trim()));
  if (summaryAt >= 0) records = records.slice(0, summaryAt);
  const lines = records.map((_, i) => i + offset + 1);
  const width = headers.length;
  records = records.map((r) => (r.length >= width ? r : r.concat(Array(width - r.length).fill(''))));
  const chosen = preset || detected;
  if (chosen === 'pbt') return { preset: 'pbt', lines, ...pbtToGeneric(headers, records) };
  return { preset: 'generic', headers, records, lines };
}

/** PBT rows as generic columns: buy-in = buyin + rebuycosts + addoncosts, stakes from the blinds. */
function pbtToGeneric(headers, records) {
  const at = Object.fromEntries(headers.map((h, i) => [headerKey(h), i]));
  const get = (r, k) => (at[k] === undefined ? '' : String(r[at[k]] ?? '').trim());
  const out = ['Date', 'Start Time', 'End Time', 'Category', 'Stakes', 'Game', 'Tournament Name', 'Venue', 'Buy-In', 'Cash-Out', 'Notes', 'Currency'];
  const rows = records.map((r) => {
    const parts = [get(r, 'buyin'), get(r, 'rebuycosts'), get(r, 'addoncosts')];
    let buyIn = get(r, 'buyin');
    const read = parts.map(parseMoney);
    if (read.every((m) => !m.error)) {
      const total = read.reduce((s, m) => s + (m.cents || 0), 0);
      buyIn = read.every((m) => m.empty) ? '' : (total / 100).toFixed(2);
    } else {
      buyIn = parts[read.findIndex((m) => m.error)];
    }
    const sb = get(r, 'smallblind');
    const bb = get(r, 'bigblind');
    const game = [get(r, 'limit'), get(r, 'game')].filter(Boolean).join(' ');
    const notes = [get(r, 'sessionnote'), get(r, 'notes')].filter(Boolean).join(' | ');
    const start = get(r, 'starttime');
    return [start, start, get(r, 'endtime'), get(r, 'variant'), sb && bb ? `${sb}/${bb}` : '', game,
      get(r, 'mttname'), get(r, 'location'), buyIn, get(r, 'cashout'), notes, get(r, 'currency')];
  });
  return { headers: out, records: rows };
}

// ------------------------------------------------------------------ mapping

const SYNONYMS = {
  date: ['date', 'day', 'sessiondate', 'entrydate', 'startdate', 'played', 'playedon', 'datum'],
  start: ['starttime', 'start', 'timein', 'began', 'begin', 'started', 'from', 'sessionstart'],
  end: ['endtime', 'end', 'timeout', 'ended', 'finish', 'finished', 'stop', 'to', 'sessionend'],
  hours: ['hours', 'hoursplayed', 'duration', 'hrs', 'length', 'timeplayed', 'playinghours'],
  category: ['category', 'sessiontype', 'type', 'variant', 'kind', 'cashortournament'],
  stakes: ['stakes', 'stake', 'blinds', 'limitstakes', 'level'],
  game: ['gametype', 'game', 'gamename', 'format'],
  tournament: ['tournament', 'tournamentname', 'mttname', 'event', 'eventname'],
  venue: ['venue', 'location', 'casino', 'cardroom', 'room', 'site', 'pokerroom'],
  buy_in: ['buyin', 'buyins', 'totalbuyin', 'investment', 'amountin', 'cost', 'in'],
  cash_out: ['cashout', 'cashouts', 'amountout', 'collected', 'payout', 'out'],
  net: ['netpl', 'net', 'netresult', 'netprofit', 'profit', 'profitloss', 'pl', 'result', 'winloss', 'won'],
  notes: ['notes', 'note', 'comments', 'comment', 'memo', 'description', 'sessionnote'],
};

/** { field: columnIndex } from header names; each column is used once, first synonym wins. */
export function guessMapping(headers) {
  const keys = (headers || []).map(headerKey);
  const used = new Set();
  const mapping = {};
  for (const field of IMPORT_FIELDS) {
    for (const word of SYNONYMS[field.id]) {
      const index = keys.findIndex((k, i) => k === word && !used.has(i));
      if (index >= 0) { mapping[field.id] = index; used.add(index); break; }
    }
  }
  return mapping;
}

// ------------------------------------------------------------------ values

const FOREIGN_MONEY = /[€£¥₹₩]|\b(eur|gbp|cad|aud|jpy|chf|inr|mxn|nzd)\b|\bc\$|\ba\$/i;

/**
 * A US dollar amount in cents. "$1,234.50", "1234.5", "-$20", "($20.00)",
 * "20 USD", "US$20" all read; "€20", "12,50" and "abc" are refused.
 * Returns { cents } , { empty: true } or { error }.
 */
export function parseMoney(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return { empty: true };
  if (FOREIGN_MONEY.test(text)) return { error: 'Amounts Must Be In US Dollars' };
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1).trim(); }
  text = text.replace(/\bUSD\b|US\$|\$/gi, '').replace(/\s+/g, '');
  if (/^[-−]/.test(text)) { negative = !negative; text = text.slice(1); }
  if (/^\(.*\)$/.test(text)) { negative = !negative; text = text.slice(1, -1); }
  if (/^\+/.test(text)) text = text.slice(1);
  if (!/^(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(text) || text === '' || text === '.') return { error: 'Unreadable Amount' };
  const value = Number(text.replace(/,/g, ''));
  if (!Number.isFinite(value)) return { error: 'Unreadable Amount' };
  const cents = Math.round(value * 100);
  return { cents: negative && cents !== 0 ? -cents : cents };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (word) => {
  const i = MONTHS.indexOf(String(word).slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : null;
};
const pad = (n) => String(n).padStart(2, '0');
const fullYear = (y) => (String(y).length === 2 ? 2000 + Number(y) : Number(y));

/** The date part of a cell, before any order is decided. */
function dateParts(raw) {
  const text = String(raw ?? '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?=$|[T\s,])/.exec(text);
  if (m) return { kind: 'ymd', y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?=$|[T\s,])/.exec(text);
  if (m) return { kind: 'pair', a: Number(m[1]), b: Number(m[2]), y: fullYear(m[3]) };
  m = /^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?=$|[T\s,])/.exec(text);
  if (m && monthOf(m[1])) return { kind: 'ymd', y: Number(m[3]), m: monthOf(m[1]), d: Number(m[2]) };
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})(?=$|[T\s,])/.exec(text);
  if (m && monthOf(m[2])) return { kind: 'ymd', y: Number(m[3]), m: monthOf(m[2]), d: Number(m[1]) };
  return null;
}

/**
 * Whether slash dates in a column are month-first or day-first:
 * 'mdy', 'dmy', 'ambiguous' (every value reads both ways, so the player is
 * asked), 'conflict' (some values only read one way and some only the other)
 * or 'none' (no slash dates, or none where the order matters).
 */
export function detectDateOrder(values) {
  let mdy = false;
  let dmy = false;
  let open = false;
  for (const value of values || []) {
    const p = dateParts(value);
    if (!p || p.kind !== 'pair') continue;
    if (p.a > 12 && p.b <= 12) dmy = true;
    else if (p.b > 12 && p.a <= 12) mdy = true;
    else if (p.a !== p.b && p.a <= 12 && p.b <= 12) open = true;
  }
  if (mdy && dmy) return 'conflict';
  if (mdy) return 'mdy';
  if (dmy) return 'dmy';
  return open ? 'ambiguous' : 'none';
}

/** 'YYYY-MM-DD' for a cell, or { error }. `order` decides 03/04/2026. */
export function parseDay(raw, order = null) {
  const text = String(raw ?? '').trim();
  if (!text) return { error: 'Missing Date' };
  const p = dateParts(text);
  if (!p) return { error: 'Unreadable Date' };
  let y = p.y, m = p.m, d = p.d;
  if (p.kind === 'pair') {
    if (p.a !== p.b && p.a <= 12 && p.b <= 12 && order !== 'mdy' && order !== 'dmy') {
      return { error: 'Choose Whether Dates Are Month-First Or Day-First' };
    }
    const dayFirst = order === 'dmy' || (p.a > 12 && order !== 'mdy');
    m = dayFirst ? p.b : p.a;
    d = dayFirst ? p.a : p.b;
  }
  const day = ledgerDay(`${y}-${pad(m)}-${pad(d)}`);
  return day ? { day } : { error: 'Unreadable Date' };
}

/**
 * A clock time 'HH:MM' from "9:30 PM", "21:30", "2130", "9pm" or a full
 * timestamp ("2026-11-20 21:30:00", "2026-11-20T21:30:00+00:00", which is
 * the wall clock the ledger stores and its own export writes).
 * Returns { clock }, { empty: true } or { error }.
 */
export function parseClock(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { empty: true };
  let m = /(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([AaPp])\.?\s*[Mm]?\.?(?=$|[\s+Z-])/.exec(text)
    || /(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?/.exec(text);
  let h, min, period = null;
  if (m) {
    h = Number(m[1]); min = Number(m[2]); period = m[3] ? m[3].toUpperCase() : null;
  } else if ((m = /^(\d{1,2})\s*([AaPp])\.?\s*[Mm]\.?$/.exec(text))) {
    h = Number(m[1]); min = 0; period = m[2].toUpperCase();
  } else if ((m = /^(\d{2})(\d{2})$/.exec(text))) {
    h = Number(m[1]); min = Number(m[2]);
  } else {
    return { error: 'Unreadable Time' };
  }
  if (min > 59) return { error: 'Unreadable Time' };
  if (period) {
    if (h < 1 || h > 12) return { error: 'Unreadable Time' };
    if (period === 'A' && h === 12) h = 0;
    else if (period === 'P' && h !== 12) h += 12;
  } else if (h > 23) {
    return { error: 'Unreadable Time' };
  }
  return { clock: `${pad(h)}:${pad(min)}` };
}

/** Hours played from "4.5", "4:30", "4h 30m", "270 min". Returns { hours }, { empty } or { error }. */
export function parseHours(raw) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return { empty: true };
  let hours = null;
  let m;
  if ((m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)?$/.exec(text))) hours = Number(m[1]);
  else if ((m = /^(\d+):(\d{2})$/.exec(text)) && Number(m[2]) < 60) hours = Number(m[1]) + Number(m[2]) / 60;
  else if ((m = /^(?:(\d+)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/.exec(text)) && (m[1] || m[2])) {
    hours = Number(m[1] || 0) + Number(m[2] || 0) / 60;
  }
  if (hours === null || !Number.isFinite(hours)) return { error: 'Unreadable Hours' };
  if (hours <= 0 || hours > 72) return { error: 'Hours Must Be Between 0 And 72' };
  return { hours: Math.round(hours * 100) / 100 };
}

/** A ledger category for a cell, or { error }. Deposits and withdrawals are not sessions. */
export function parseCategory(raw) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return { empty: true };
  if (IMPORT_CATEGORIES.some((c) => c.id === text)) return { category: text };
  if (/deposit|withdraw|payout|cashier|transfer/.test(text)) return { error: 'Deposits And Withdrawals Are Not Imported. Use Adjust Bankroll.' };
  if (/tourn|\bmtt\b|\bsng\b|sit\s*(n|&|and|-)?\s*go|freeroll|satellite/.test(text)) return { category: 'poker_mtt' };
  if (/\bcash\b|ring/.test(text)) return { category: 'poker_cash' };
  if (/slot/.test(text)) return { category: 'slots' };
  if (/sport|\bbet/.test(text)) return { category: 'sports' };
  if (/table game|casino game|blackjack|roulette|craps|baccarat/.test(text)) return { category: 'casino_table' };
  if (/expense|cost|\bfee/.test(text)) return { category: 'expense' };
  return { error: 'Unknown Category' };
}

// ------------------------------------------------------------------ rows

const IMPORT_ID = /^imp-\d{8}-[a-z0-9]{6}$/;

/** A new import id: imp-YYYYMMDD-xxxxxx (the player's day). */
export function newImportId(day, random = Math.random) {
  const stamp = String(day || '').replace(/-/g, '');
  let tail = '';
  while (tail.length < 6) tail += Math.floor(random() * 36).toString(36);
  const id = `imp-${/^\d{8}$/.test(stamp) ? stamp : '00000000'}-${tail.slice(0, 6)}`;
  return id;
}

/**
 * The external_ref every row of one import carries: csv:<importId>:<row>.
 * bankroll_ledger keeps external_ref unique per player, so the same row of
 * the same import can never be saved twice, and Undo Last Import finds
 * exactly that import's rows by the prefix.
 */
export function importRefPrefix(importId) {
  if (!IMPORT_ID.test(String(importId))) throw new Error('Bad import id');
  return `csv:${importId}:`;
}

export function importRef(importId, line) {
  if (!Number.isInteger(line) || line < 1) throw new Error('Bad row number');
  return `${importRefPrefix(importId)}${line}`;
}

/** The import id an external_ref belongs to, or null. */
export function importIdOfRef(ref) {
  const m = /^csv:(imp-\d{8}-[a-z0-9]{6}):\d+$/.exec(String(ref || ''));
  return m ? m[1] : null;
}

/** The day an import id was made ('YYYY-MM-DD'). */
export function importDay(importId) {
  const m = /^imp-(\d{4})(\d{2})(\d{2})-/.exec(String(importId || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const venueKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The duplicate test: same day, category, venue and net. `entry` is a
 * ledger-shaped row; `venueName` its venue's name.
 */
export function duplicateKey(entry, venueName) {
  return [entry.entry_date, entry.category, venueKey(venueName), entryCents(entry)].join('|');
}

const clip = (text, n) => {
  const t = String(text ?? '').trim();
  return t.length > n ? t.slice(0, n) : t;
};

const addMinutes = (clock, hours) => {
  const [h, m] = clock.split(':').map(Number);
  const total = (h * 60 + m + Math.round(hours * 60)) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

/**
 * One data row as the ledger entry the Log Session form would save, using
 * the same rules: a real date not in the future, amounts of $0 or more, valid
 * times, an expense with an amount, and any session other than a tournament
 * with a buy-in or a cash-out. Returns { entry, venue, errors, warnings }.
 */
export function buildEntry(record, mapping, { order = null, defaultCategory = 'poker_cash', today } = {}) {
  const cell = (field) => (mapping[field] === undefined || mapping[field] === null ? '' : String(record[mapping[field]] ?? '').trim());
  const errors = [];
  const warnings = [];
  const extras = [];

  // Date. A start-time column that carries the day (PBT) also gives the date.
  const dateCell = cell('date') || (dateParts(cell('start')) ? cell('start') : '');
  const date = parseDay(dateCell, order);
  if (date.error) errors.push(date.error === 'Missing Date' ? 'Missing Date' : `${date.error}: "${clip(dateCell, 30)}"`);
  else if (today && date.day > today) errors.push('The Date Cannot Be In The Future');

  // Category.
  let category = defaultCategory;
  const cat = parseCategory(cell('category'));
  if (cat.error) errors.push(cat.error === 'Unknown Category' ? `Unknown Category: "${clip(cell('category'), 30)}"` : cat.error);
  else if (cat.category) category = cat.category;

  // Money.
  const money = {};
  for (const [field, label] of [['buy_in', 'Buy-In'], ['cash_out', 'Cash-Out'], ['net', 'Net Result']]) {
    const read = parseMoney(cell(field));
    if (read.error) errors.push(read.error === 'Unreadable Amount' ? `Unreadable ${label}: "${clip(cell(field), 30)}"` : read.error);
    else if (!read.empty) money[field] = read.cents;
  }
  if ((money.buy_in ?? 0) < 0 || (money.cash_out ?? 0) < 0) errors.push('Amounts Must Be $0 Or More');

  let grossIn = money.buy_in ?? null;
  let grossOut = money.cash_out ?? null;
  const net = money.net ?? null;
  if (grossIn !== null && grossOut !== null) {
    if (net !== null && net !== grossOut - grossIn) errors.push('The Net Result Does Not Equal Cash-Out Less Buy-In');
  } else if (grossIn !== null && net !== null) {
    grossOut = grossIn + net;
    if (grossOut < 0) errors.push('The Loss Is Larger Than The Buy-In');
  } else if (grossOut !== null && net !== null) {
    grossIn = grossOut - net;
    if (grossIn < 0) errors.push('The Win Is Larger Than The Cash-Out');
  } else if (net !== null) {
    grossIn = net < 0 ? -net : 0;
    grossOut = net > 0 ? net : 0;
  }
  grossIn = grossIn ?? 0;
  grossOut = grossOut ?? 0;

  if (errors.some((e) => /Amount|Buy-In|Cash-Out|Net Result|Loss Is|Win Is/.test(e))) {
    // One reason per bad amount is enough.
  } else if (category === 'expense') {
    // An expense is money out, however the sheet wrote it.
    const amount = grossIn > 0 ? grossIn : grossOut > 0 ? grossOut : 0;
    grossIn = amount;
    grossOut = 0;
    if (!(amount > 0)) errors.push('Enter The Expense Amount');
  } else if (category !== 'poker_mtt' && !(grossIn > 0) && !(grossOut > 0)) {
    errors.push('Enter A Buy-In Or A Cash-Out');
  }

  // Times.
  const start = parseClock(cell('start'));
  const end = parseClock(cell('end'));
  const hours = parseHours(cell('hours'));
  if (start.error) errors.push('Enter A Valid Start Time');
  if (end.error) errors.push('Enter A Valid End Time');
  if (hours.error) errors.push(hours.error);
  let startClock = start.clock || '';
  let endClock = end.clock || '';
  if (startClock && !endClock && hours.hours) endClock = addMinutes(startClock, hours.hours);
  if (!startClock && hours.hours) {
    extras.push(`Hours: ${hours.hours}`);
    warnings.push('Hours Kept In Notes: Hourly Stats Need A Start Time');
  }

  const venue = clip(cell('venue'), 120);
  const stakes = clip(cell('stakes'), 40) || null;
  const game = clip(cell('game'), 60) || null;
  const tournament = clip(cell('tournament'), 120) || null;

  if (errors.length || !date.day) return { entry: null, venue, errors, warnings };

  const day = date.day;
  const entry = {
    category,
    entry_date: day,
    start_time: startClock ? `${day}T${startClock}:00` : null,
    end_time: endClock ? sessionEndStamp(day, startClock, endClock) : null,
    gross_in: grossIn / 100,
    gross_out: grossOut / 100,
  };
  if (category === 'poker_cash') {
    entry.stakes = stakes;
    entry.game_type = game;
  } else if (category === 'poker_mtt') {
    entry.tournament_name = tournament || game;
    if (tournament && game) entry.game_type = game;
    if (stakes) extras.push(`Stakes: ${stakes}`);
  } else if (category === 'casino_table') {
    entry.casino_game = game;
  } else if (category === 'slots') {
    entry.slot_machine = game;
  } else if (category === 'sports') {
    entry.sport = game;
    const n = grossOut - grossIn;
    entry.bet_result = n > 0 ? 'win' : n < 0 ? 'loss' : 'push';
  } else if (category === 'expense') {
    const type = String(game || '').toLowerCase().replace(/[\s-]+/g, '_');
    entry.expense_type = EXPENSE_TYPES.includes(type) ? type : null;
    if (game && !entry.expense_type) extras.push(`Type: ${game}`);
  }
  if (category !== 'poker_mtt' && category !== 'poker_cash' && stakes) extras.push(`Stakes: ${stakes}`);

  const note = clip(cell('notes'), 1900);
  const body = [note, ...extras].filter(Boolean).join('\n');
  entry.notes = body || null;
  return { entry, venue, errors, warnings };
}

/**
 * Every row of a table checked and keyed. `existingKeys` is a Set of
 * duplicateKey() values for the player's current ledger. Duplicates are
 * skipped unless `keepDuplicates`.
 */
export function planImport(table, mapping, options = {}, existingKeys = new Set()) {
  const { keepDuplicates = false } = options;
  const rows = (table.records || []).map((record, i) => {
    const built = buildEntry(record, mapping, options);
    const line = table.lines ? table.lines[i] : i + 2;
    if (built.entry && options.importId) built.entry.external_ref = importRef(options.importId, line);
    const duplicate = built.entry ? existingKeys.has(duplicateKey(built.entry, built.venue)) : false;
    return { line, ...built, duplicate };
  });
  const toImport = rows.filter((r) => r.entry && (keepDuplicates || !r.duplicate));
  return {
    rows,
    toImport,
    rejected: rows.filter((r) => !r.entry),
    duplicates: rows.filter((r) => r.entry && r.duplicate),
    venues: [...new Map(toImport.filter((r) => r.venue).map((r) => [venueKey(r.venue), r.venue])).values()],
  };
}

/** The import's entries with each venue name replaced by its location id. */
export function withLocationIds(rows, locationIdByName) {
  return rows.map((r) => ({ ...r.entry, location_id: r.venue ? locationIdByName.get(venueKey(r.venue)) || null : null }));
}

export { venueKey };
