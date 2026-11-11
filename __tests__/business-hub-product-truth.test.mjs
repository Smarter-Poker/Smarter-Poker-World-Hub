import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeMcpTool } from '../src/lib/mcp/mcpServer.mjs';
import { renderFreerollsMarkdown } from '../src/lib/seo/markdownIngestion.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const surfaces = ['pages/freerolls.js', 'pages/api/ai/freerolls.js', 'src/lib/mcp/mcpServer.mjs', 'src/lib/seo/markdownIngestion.mjs', 'public/llms.txt', 'public/llms-full.txt'];

test('Diamond Arena public copy distinguishes membership from funded-game availability', () => {
  assert.match(read('pages/terms.js'), /Not Yet Open To Players/);
  for (const file of surfaces) {
    const source = read(file);
    assert.match(source, /Funded Diamond games are not open for play yet\./i, `${file} must state the current launch limitation`);
    assert.doesNotMatch(source, /Weekly Diamond Arena Championship|Diamond Arena games run inside/, `${file} must not advertise unlaunched games`);
  }
  assert.doesNotMatch(read('pages/api/seo/series-calendar.js'), /Weekly Diamond Arena Championship/);
});

test('public schedule API returns no available Diamond Arena event for any tier', async () => {
  const source = read('pages/api/ai/freerolls.js')
    .replace(/^import .*;$/m, '')
    .replace('export default async function handler', 'async function handler');
  const handler = new Function('SITE_ORIGIN', `${source}; return handler;`)('https://smarter.poker');
  for (const tier of ['all', 'open', 'diamond']) {
    let body;
    const res = { setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(data) { body = data; return this; } };
    await handler({ method: 'GET', query: { tier } }, res);
    assert.equal(body.schedule.length, tier === 'diamond' ? 0 : 4);
    assert.equal(body.diamond_arena.available, false);
    assert.match(body.diamond_arena.status, /not open for play yet/i);
    assert.ok(body.schedule.every((event) => event.tier === 'open'));
  }
});

test('subscribed calendars cancel the old Diamond event without cancelling daily slots', () => {
  const source = read('pages/api/seo/series-calendar.js')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/export default /g, '').replace(/export /g, '');
  const build = new Function(`${source}; return buildSeriesCalendarIcs;`)();
  const { ics } = build('freerolls');
  const events = ics.split('BEGIN:VEVENT').slice(1);
  assert.equal(events.length, 5);
  const cancellation = events.find((event) => event.includes('UID:freeroll-sunday-diamond-1700@smarter.poker'));
  assert.match(cancellation, /STATUS:CANCELLED/);
  assert.match(cancellation, /SEQUENCE:2/);
  assert.match(cancellation, /not open for play yet/i);
  for (const event of events.filter((event) => event !== cancellation)) assert.match(event, /STATUS:CONFIRMED/);
});

test('MCP diamond-tier requests and generated Markdown preserve the closed status', async () => {
  const result = await executeMcpTool('get_freeroll_schedule', { tier: 'diamond' });
  const data = JSON.parse(result.content[0].text);
  assert.deepEqual(data.schedule, []);
  assert.equal(data.diamond_arena.available, false);
  assert.match(data.diamond_arena.status, /not open for play yet/i);
  const markdown = renderFreerollsMarkdown();
  assert.match(markdown, /Funded Diamond games are not open for play yet\./);
  assert.doesNotMatch(markdown, /Weekly Diamond Arena Championship/);
});

test('homepage and About product catalogue distinguish closed Diamond games and link the shared guide', () => {
  const source = read('src/components/landing/LandingProductSummary.js');
  const catalogue = (name) => {
    const literal = source.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\n\\]);`))?.[1];
    assert.ok(literal, `${name} must remain an explicit catalogue`);
    return new Function(`return (${literal});`)();
  };
  const freerolls = catalogue('LANDING_PRODUCTS').find((product) => product.id === 'freerolls');
  assert.match(freerolls.summary, /Funded Diamond Games Are Not Open For Play Yet/);
  assert.doesNotMatch(freerolls.summary, /Diamond Freerolls Every/);
  const guide = catalogue('LANDING_GUIDES').find((entry) => entry.href === '/hub/help');
  assert.equal(guide.name, 'Help & Getting Started');
  assert.match(guide.summary, /English Or Spanish/);
  assert.match(read('pages/about.js'), /LANDING_PRODUCTS\.map/);
});
