import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildFreerollsIcs } from '../src/lib/poker-near-me/calendarExport.mjs';
import freerollsCalendarHandler from '../pages/api/calendar/freerolls.ics.js';

test('buildFreerollsIcs creates valid RFC 5545 iCalendar feed with all 5 daily Free Buy events', () => {
  const ics = buildFreerollsIcs();
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'Must start with BEGIN:VCALENDAR');
  assert.ok(ics.endsWith('\r\nEND:VCALENDAR'), 'Must end with END:VCALENDAR');
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /PRODID:-\/\/Smarter Software\/\/Smarter\.Poker Freerolls\/\/EN/);
  assert.match(ics, /X-WR-CALNAME:Smarter\.Poker Daily Freerolls/);
  assert.match(ics, /BEGIN:VTIMEZONE/);
  assert.match(ics, /TZID:America\/Chicago/);

  // Check all 5 freeroll events
  for (const name of ['Midnight', 'Morning', 'Midday', 'Afternoon', 'Prime Time']) {
    assert.match(ics, new RegExp(`SUMMARY:${name} Free Buy \\(NLH\\)`));
  }
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 10, '5 live events plus 5 cancellations of retired UIDs');
  assert.equal((ics.match(/STATUS:CONFIRMED/g) || []).length, 5);
  assert.equal((ics.match(/STATUS:CANCELLED/g) || []).length, 5);
  const cancelled = ics.split('BEGIN:VEVENT').find(event => event.includes('UID:freeroll-sunday-diamond-championship@smarter.poker'));
  assert.match(cancelled, /STATUS:CANCELLED/);
  assert.match(cancelled, /SEQUENCE:2/);
  assert.match(ics, /250 Chips Guaranteed/);
  assert.match(ics, /500 Chips Guaranteed/);
  assert.doesNotMatch(ics, /Diamond Championship|2,000/);
  assert.match(ics, /Funded Diamond games are not open for play yet\./);

  // Check RRULE recursion patterns
  assert.match(ics, /RRULE:FREQ=DAILY/);

  // Check URL grounding
  assert.match(ics, /URL:https:\/\/smarter\.poker\/freerolls/);
});

test('pages/api/calendar/freerolls.ics handler serves calendar feed with correct HTTP headers', async () => {
  let statusCode = null;
  const headers = {};
  let responseData = null;

  const req = { method: 'GET' };
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    send(body) {
      responseData = body;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  await freerollsCalendarHandler(req, res);

  assert.equal(statusCode, 200);
  assert.equal(headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="smarter-poker-freerolls.ics"');
  assert.ok(headers['Cache-Control'].includes('s-maxage=86400'));
  assert.ok(typeof responseData === 'string');
  assert.ok(responseData.includes('BEGIN:VCALENDAR'));
  assert.ok(responseData.includes('Morning Free Buy (NLH)'));
  assert.ok(responseData.includes('STATUS:CANCELLED'));
  assert.ok(responseData.includes('Funded Diamond games are not open for play yet.'));
});

test('pages/api/calendar/freerolls.ics handler rejects non-GET methods with 405', async () => {
  let statusCode = null;
  const headers = {};
  let jsonBody = null;

  const req = { method: 'POST' };
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonBody = data;
      return this;
    },
  };

  await freerollsCalendarHandler(req, res);

  assert.equal(statusCode, 405);
  assert.equal(headers['Allow'], 'GET');
  assert.equal(jsonBody.error, 'Method not allowed');
});

test('next.config.js includes clean rewrites for /freerolls.ics and /hub/freerolls.ics', () => {
  const configText = fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8');

  assert.ok(
    configText.includes("source: '/freerolls.ics'") &&
    configText.includes("destination: '/api/calendar/freerolls.ics'"),
    'Rewrite for /freerolls.ics must exist in next.config.js'
  );

  assert.ok(
    configText.includes("source: '/hub/freerolls.ics'") &&
    configText.includes("destination: '/api/calendar/freerolls.ics'"),
    'Rewrite for /hub/freerolls.ics must exist in next.config.js'
  );
});

test('pages/api/og/tool-card.js handles freerolls and compare tools with distinct social branding', () => {
  const code = fs.readFileSync(path.join(process.cwd(), 'pages/api/og/tool-card.js'), 'utf8');

  assert.match(code, /import\s+\{\s*ImageResponse\s*\}\s+from\s+['"]@vercel\/og['"]/);
  assert.match(code, /runtime:\s*['"]edge['"]/);
  assert.match(code, /tool === ['"]freerolls['"]/);
  assert.match(code, /tool === ['"]compare['"]/);
  assert.match(code, /Five Free Poker Tournaments Every Day/);
  assert.match(code, /Free Poker Software & Platform Alternatives/);
  assert.match(code, /FIVE FREE DAILY FREEROLLS/);
  assert.match(code, /SOFTWARE COMPARISON/);
  assert.match(code, /ZERO DEPOSIT REQUIRED/);
  assert.match(code, /100% FREE ALTERNATIVES/);
  assert.match(code, /Smarter\.Poker\/Freerolls/);
  assert.match(code, /Smarter\.Poker\/Compare/);
});
