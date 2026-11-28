// Import Sessions (2026-11-28): the CSV / pasted-table reader, the column
// mapping, and the rule that each row becomes exactly the entry the Log
// Session form would save, or a stated reason why not.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntry, detectDateOrder, detectDelimiter, duplicateKey, guessMapping, importDay, importIdOf,
  importTag, newImportId, parseCategory, parseClock, parseDay, parseDelimited, parseHours, parseMoney,
  planImport, readTable, withLocationIds,
} from '../src/lib/bankroll/sessionImport.mjs';

const TODAY = '2026-11-28';

test('quoted fields, commas in names, doubled quotes and line breaks inside quotes', () => {
  const { rows } = parseDelimited('Date,Venue,Notes\n2026-01-02,"Bellagio, Las Vegas","He said ""all in""\nthen folded"\n');
  assert.deepEqual(rows, [
    ['Date', 'Venue', 'Notes'],
    ['2026-01-02', 'Bellagio, Las Vegas', 'He said "all in"\nthen folded'],
  ]);
});

test('CRLF, lone CR, a UTF-8 BOM and blank lines', () => {
  const { rows } = parseDelimited('﻿Date,Net\r\n2026-01-02,10\r\n\r\n2026-01-03,-5\r2026-01-04,7');
  assert.deepEqual(rows, [['Date', 'Net'], ['2026-01-02', '10'], ['2026-01-03', '-5'], ['2026-01-04', '7']]);
  assert.equal(readTable('﻿Date,Net\r\n2026-01-02,10').headers[0], 'Date', 'the BOM is not part of the first header');
});

test('a table pasted from a spreadsheet is tab separated; semicolons are detected', () => {
  assert.equal(detectDelimiter('Date\tVenue\tNet\n2026-01-01\tA, B\t5'), '\t');
  assert.equal(detectDelimiter('Date;Venue;Net\n'), ';');
  assert.equal(detectDelimiter('"a;b",c,d\n'), ',', 'a delimiter inside quotes does not count');
  const { rows } = parseDelimited('Date\tVenue\n2026-01-01\tAria, Las Vegas');
  assert.deepEqual(rows[1], ['2026-01-01', 'Aria, Las Vegas']);
});

test('money: currency symbols, thousands, parentheses negatives, and nothing that is not USD', () => {
  assert.deepEqual(parseMoney('$1,234.50'), { cents: 123450 });
  assert.deepEqual(parseMoney('1234.5'), { cents: 123450 });
  assert.deepEqual(parseMoney('-$20'), { cents: -2000 });
  assert.deepEqual(parseMoney('$-20'), { cents: -2000 });
  assert.deepEqual(parseMoney('($20.00)'), { cents: -2000 });
  assert.deepEqual(parseMoney('(1,000)'), { cents: -100000 });
  assert.deepEqual(parseMoney('20 USD'), { cents: 2000 });
  assert.deepEqual(parseMoney('US$20'), { cents: 2000 });
  assert.deepEqual(parseMoney('+15'), { cents: 1500 });
  assert.deepEqual(parseMoney(''), { empty: true });
  assert.deepEqual(parseMoney('0.1'), { cents: 10 });
  for (const bad of ['abc', '12,50', '1,23.4', '$', '1.2.3']) assert.equal(parseMoney(bad).error, 'Unreadable Amount', bad);
  for (const foreign of ['€20', '£15', '20 EUR', 'C$40']) assert.equal(parseMoney(foreign).error, 'Amounts Must Be In US Dollars', foreign);
});

test('dates: ISO, month names, and day-first vs month-first decided by the column or by the player', () => {
  assert.deepEqual(parseDay('2026-03-04'), { day: '2026-03-04' });
  assert.deepEqual(parseDay('2026/3/4 21:30'), { day: '2026-03-04' });
  assert.deepEqual(parseDay('Mar 4, 2026'), { day: '2026-03-04' });
  assert.deepEqual(parseDay('4 March 2026'), { day: '2026-03-04' });
  assert.deepEqual(parseDay('Wed, Mar 4 2026'), { day: '2026-03-04' });
  assert.deepEqual(parseDay('13/04/2026'), { day: '2026-04-13' }, 'only one reading exists');
  assert.deepEqual(parseDay('04/13/2026'), { day: '2026-04-13' });
  assert.equal(parseDay('03/04/2026').error, 'Choose Whether Dates Are Month-First Or Day-First');
  assert.deepEqual(parseDay('03/04/2026', 'mdy'), { day: '2026-03-04' });
  assert.deepEqual(parseDay('03/04/2026', 'dmy'), { day: '2026-04-03' });
  assert.deepEqual(parseDay('05/05/26'), { day: '2026-05-05' }, 'same both ways; two-digit year');
  assert.equal(parseDay('02/30/2026', 'mdy').error, 'Unreadable Date');
  assert.equal(parseDay('').error, 'Missing Date');
  assert.equal(parseDay('yesterday').error, 'Unreadable Date');

  assert.equal(detectDateOrder(['01/02/2026', '13/02/2026']), 'dmy');
  assert.equal(detectDateOrder(['01/02/2026', '02/13/2026']), 'mdy');
  assert.equal(detectDateOrder(['01/02/2026', '03/04/2026']), 'ambiguous');
  assert.equal(detectDateOrder(['13/02/2026', '02/13/2026']), 'conflict');
  assert.equal(detectDateOrder(['2026-01-02', '05/05/2026']), 'none');
});

test('times and hours', () => {
  assert.deepEqual(parseClock('9:30 PM'), { clock: '21:30' });
  assert.deepEqual(parseClock('12:15am'), { clock: '00:15' });
  assert.deepEqual(parseClock('9pm'), { clock: '21:00' });
  assert.deepEqual(parseClock('21:30'), { clock: '21:30' });
  assert.deepEqual(parseClock('2130'), { clock: '21:30' });
  assert.deepEqual(parseClock('2026-11-20 18:30:00'), { clock: '18:30' }, 'PBT starttime');
  assert.deepEqual(parseClock('2026-11-20T20:00:00+00:00'), { clock: '20:00' }, 'this app\'s own export');
  for (const bad of ['25:00', '13:00 PM', '9:75', 'noon']) assert.ok(parseClock(bad).error, bad);
  assert.deepEqual(parseHours('4.5'), { hours: 4.5 });
  assert.deepEqual(parseHours('4:30'), { hours: 4.5 });
  assert.deepEqual(parseHours('4h 30m'), { hours: 4.5 });
  assert.deepEqual(parseHours('270 min'), { hours: 4.5 });
  assert.ok(parseHours('-2').error);
  assert.ok(parseHours('100').error);
});

test('categories: the app\'s names, tracker names, and no deposits', () => {
  assert.equal(parseCategory('Cash Game').category, 'poker_cash');
  assert.equal(parseCategory('Tournament').category, 'poker_mtt');
  assert.equal(parseCategory('SNG').category, 'poker_mtt');
  assert.equal(parseCategory('Casino Games').category, 'casino_table');
  assert.equal(parseCategory('Costs').category, 'expense');
  assert.equal(parseCategory('Sports Betting').category, 'sports');
  assert.equal(parseCategory('poker_mtt').category, 'poker_mtt');
  assert.match(parseCategory('Deposit/Payout').error, /Adjust Bankroll/);
  assert.equal(parseCategory('Jackpot/Bonus').error, 'Unknown Category');
});

test('headers map by name, including this app\'s own CSV export', () => {
  const headers = ['Date', 'Category', 'Buy-In', 'Cash-Out', 'Net P/L', 'Stakes', 'Game Type', 'Tournament', 'Start Time', 'End Time', 'Mood', 'Notes'];
  const m = guessMapping(headers);
  assert.deepEqual(m, { date: 0, start: 8, end: 9, category: 1, stakes: 5, game: 6, tournament: 7, buy_in: 2, cash_out: 3, net: 4, notes: 11 });
  const table = readTable([headers.join(','), '2026-11-20,Cash Game,200,350,150,1/2,NLH,,2026-11-20T20:00:00+00:00,2026-11-21T02:00:00+00:00,,ok', '', 'Summary', 'Entries,1'].join('\n'));
  assert.equal(table.records.length, 1, 'the summary block is not a session');
  const { entry } = buildEntry(table.records[0], m, { today: TODAY });
  assert.equal(entry.end_time, '2026-11-21T02:00:00', 'an overnight session ends the next morning');
});

test('a row becomes the entry the log form would save', () => {
  const m = { date: 0, start: 1, end: 2, category: 3, stakes: 4, venue: 5, buy_in: 6, cash_out: 7, notes: 8 };
  const { entry, venue, errors } = buildEntry(['11/20/2026', '9:00 PM', '3:00 AM', 'Cash', '1/3', 'Aria', '$300', '$1,050.25', 'good'], m, { today: TODAY, importId: 'imp-20261128-abc123', order: 'mdy' });
  assert.deepEqual(errors, []);
  assert.equal(venue, 'Aria');
  assert.deepEqual(entry, {
    category: 'poker_cash', entry_date: '2026-11-20', start_time: '2026-11-20T21:00:00', end_time: '2026-11-21T03:00:00',
    gross_in: 300, gross_out: 1050.25, stakes: '1/3', game_type: null, notes: '[Import imp-20261128-abc123] good',
  });
});

test('validation matches the log form and says why', () => {
  const m = { date: 0, buy_in: 1, cash_out: 2, start: 3, category: 4 };
  const why = (row) => buildEntry(row, m, { today: TODAY }).errors;
  assert.deepEqual(why(['2026-12-01', '100', '0', '', '']), ['The Date Cannot Be In The Future']);
  assert.deepEqual(why(['2026-11-01', '-100', '0', '', '']), ['Amounts Must Be $0 Or More']);
  assert.deepEqual(why(['2026-11-01', '100', '0', '25:00', '']), ['Enter A Valid Start Time']);
  assert.deepEqual(why(['2026-11-01', '', '', '', '']), ['Enter A Buy-In Or A Cash-Out']);
  assert.deepEqual(why(['2026-11-01', '', '', '', 'Tournament']), [], 'a freeroll is a tournament with no money');
  assert.deepEqual(why(['2026-11-01', '', '', '', 'Expense']), ['Enter The Expense Amount']);
  assert.deepEqual(why(['', '100', '0', '', '']), ['Missing Date']);
  assert.deepEqual(why(['2026-11-01', '€50', '0', '', '']), ['Amounts Must Be In US Dollars']);
  assert.match(why(['2026-11-01', '10', '0', '', 'Deposit'])[0], /Adjust Bankroll/);
});

test('net-only and buy-in plus net rows; a contradicting net is refused', () => {
  const net = { date: 0, net: 1 };
  assert.deepEqual(pick(buildEntry(['2026-11-01', '(250)'], net, { today: TODAY }).entry), { gross_in: 250, gross_out: 0 });
  assert.deepEqual(pick(buildEntry(['2026-11-01', '$400'], net, { today: TODAY }).entry), { gross_in: 0, gross_out: 400 });
  const bn = { date: 0, buy_in: 1, net: 2 };
  assert.deepEqual(pick(buildEntry(['2026-11-01', '200', '-50'], bn, { today: TODAY }).entry), { gross_in: 200, gross_out: 150 });
  assert.deepEqual(buildEntry(['2026-11-01', '200', '-250'], bn, { today: TODAY }).errors, ['The Loss Is Larger Than The Buy-In']);
  const all = { date: 0, buy_in: 1, cash_out: 2, net: 3 };
  assert.deepEqual(buildEntry(['2026-11-01', '200', '300', '50'], all, { today: TODAY }).errors, ['The Net Result Does Not Equal Cash-Out Less Buy-In']);
  // An expense is money out however it was written.
  const exp = buildEntry(['2026-11-01', '-80', 'Expense', 'Hotel'], { date: 0, net: 1, category: 2, game: 3 }, { today: TODAY }).entry;
  assert.deepEqual({ ...pick(exp), expense_type: exp.expense_type }, { gross_in: 80, gross_out: 0, expense_type: 'hotel' });
});

test('hours with a start fix the end; hours alone are kept in the notes, not invented as times', () => {
  const m = { date: 0, start: 1, hours: 2, buy_in: 3 };
  const a = buildEntry(['2026-11-01', '22:00', '4.5', '100'], m, { today: TODAY });
  assert.equal(a.entry.end_time, '2026-11-02T02:30:00');
  const b = buildEntry(['2026-11-01', '', '4.5', '100'], m, { today: TODAY });
  assert.equal(b.entry.start_time, null);
  assert.equal(b.entry.notes, 'Hours: 4.5');
  assert.equal(b.warnings.length, 1);
});

test('Poker Bankroll Tracker export: marker row, buy-in with rebuys and add-ons, blinds as stakes', () => {
  const csv = [
    '—PBT Bankroll Export—',
    'id,starttime,endtime,breakminutes,playingminutes,variant,game,limit,location,type,buyin,cashout,netprofit,rebuycosts,addoncosts,smallblind,bigblind,currency,mttname,sessionnote',
    '1,2026-01-23 18:30:00,2026-01-23 23:00:00,0,270,Cash Game,Texas Holdem,No Limit,Bellagio,Casino,300,520,220,100,,1,3,USD,,"table, seat 4"',
    '2,2026-01-24 12:00:00,2026-01-24 18:00:00,0,360,Tournament,Texas Holdem,No Limit,Aria,Casino,250,0,-400,100,50,,,USD,Daily Deepstack,',
    '3,2026-01-25 12:00:00,2026-01-25 13:00:00,0,60,Deposit/Payout,,,Bank,Online,0,500,500,,,,,USD,,',
  ].join('\r\n');
  const table = readTable(csv);
  assert.equal(table.preset, 'pbt');
  assert.deepEqual(table.lines, [3, 4, 5], 'row numbers count the marker and header rows');
  const plan = planImport(table, guessMapping(table.headers), { today: TODAY, importId: 'imp-20261128-pbt000' });
  const [cash, mtt] = plan.toImport.map((r) => r.entry);
  assert.equal(cash.gross_in, 400, 'buyin excludes rebuys');
  assert.equal(cash.gross_out, 520);
  assert.equal(cash.stakes, '1/3');
  assert.equal(cash.game_type, 'No Limit Texas Holdem');
  assert.equal(cash.start_time, '2026-01-23T18:30:00');
  assert.equal(cash.notes, '[Import imp-20261128-pbt000] table, seat 4');
  assert.equal(mtt.category, 'poker_mtt');
  assert.equal(mtt.gross_in, 400);
  assert.equal(mtt.tournament_name, 'Daily Deepstack');
  assert.equal(plan.rejected.length, 1);
  assert.equal(plan.rejected[0].line, 5);
  assert.match(plan.rejected[0].errors[0], /Adjust Bankroll/);
  assert.deepEqual(plan.venues, ['Bellagio', 'Aria']);
});

test('duplicates against the ledger are skipped by default and kept on request', () => {
  const table = readTable('Date,Venue,Buy-In,Cash-Out\n2026-11-01,Aria,100,250\n2026-11-02,aria ,100,50\n');
  const m = guessMapping(table.headers);
  const existing = new Set([duplicateKey({ entry_date: '2026-11-01', category: 'poker_cash', gross_in: 200, gross_out: 350 }, 'ARIA')]);
  const plan = planImport(table, m, { today: TODAY }, existing);
  assert.equal(plan.duplicates.length, 1, 'same day, category, venue (any case) and net');
  assert.equal(plan.toImport.length, 1);
  assert.equal(planImport(table, m, { today: TODAY, keepDuplicates: true }, existing).toImport.length, 2);
  assert.deepEqual(plan.venues, ['aria'], 'one venue per name, however it was cased');
  const withIds = withLocationIds(plan.toImport, new Map([['aria', 'loc-1']]));
  assert.equal(withIds[0].location_id, 'loc-1');
});

test('the import tag: every row carries it, and it is read back exactly', () => {
  const id = newImportId('2026-11-28', () => 0.5);
  assert.match(id, /^imp-20261128-[a-z0-9]{6}$/);
  assert.equal(importTag(id), `[Import ${id}]`);
  assert.equal(importIdOf(`${importTag(id)} notes`), id);
  assert.equal(importIdOf('notes [Import imp-20261128-abcdef]'), null, 'only a leading tag counts');
  assert.equal(importDay(id), '2026-11-28');
  assert.throws(() => importTag('x%'), /Bad import id/, 'the tag is used in a LIKE filter, so it is strict');
});

test('more than 1,000 rows plan in one pass', () => {
  const lines = ['Date,Buy-In,Cash-Out'];
  for (let i = 0; i < 2500; i++) lines.push(`2026-0${(i % 9) + 1}-1${i % 10},${100 + i},${i % 3 ? 0 : 500}`);
  const plan = planImport(readTable(lines.join('\n')), { date: 0, buy_in: 1, cash_out: 2 }, { today: TODAY });
  assert.equal(plan.toImport.length, 2500);
  assert.equal(plan.rejected.length, 0);
});

function pick(e) { return { gross_in: e.gross_in, gross_out: e.gross_out }; }
