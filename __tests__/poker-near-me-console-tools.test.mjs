import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const COMPONENTS = Object.freeze([
  'SeasonalCalendar.jsx',
  'RoadTripPlanner.jsx',
  'SocialLayer.jsx',
  'TournamentAlerts.jsx',
  'NearMeNowFeed.jsx',
  'TripCostCalculator.jsx',
  'PeakActivityHeatmap.jsx',
]);

const sources = Object.fromEntries(
  COMPONENTS.map((name) => [name, read(`src/components/poker-near-me/${name}`)]),
);

test('all secondary discovery tools use the reusable painted panel and icon system', () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.match(source, /PokerNearMePanelShell/, `${name} must use the painted panel shell`);
    assert.match(source, /PokerNearMeConsoleIcon/, `${name} must use painted icon holders`);
    assert.match(source, /className="[^"]*pnm-console-tool/, `${name} must opt into the shared tools layer`);
    assert.doesNotMatch(source, /<svg\b/i, `${name} cannot draw generic vector controls`);
    assert.doesNotMatch(source, /<style\b/i, `${name} cannot carry a private CSS-built visual system`);
    assert.doesNotMatch(source, /(?:linear|radial|conic)-gradient\(/i, `${name} cannot fake painted materials`);
  }
});

test('the only remaining JSX colors are live calendar, identity and heatmap data marks', () => {
  for (const name of ['RoadTripPlanner.jsx', 'TournamentAlerts.jsx', 'NearMeNowFeed.jsx', 'TripCostCalculator.jsx']) {
    assert.doesNotMatch(sources[name], /style=\{\{/, `${name} must not draw fixed surfaces inline`);
  }

  const calendarStyles = [...sources['SeasonalCalendar.jsx'].matchAll(/style=\{\{([^}]*)\}\}/g)].map((match) => match[1]);
  assert.equal(calendarStyles.length, 4);
  for (const style of calendarStyles) {
    assert.match(style, /colors?\.bg/, 'calendar inline color must come from event-category data');
    assert.doesNotMatch(style, /border|shadow|radius/i);
  }

  const socialStyles = [...sources['SocialLayer.jsx'].matchAll(/style=\{\{([^}]*)\}\}/g)].map((match) => match[1]);
  assert.deepEqual(socialStyles, [' background: stringToColor(name) '], 'social inline color is avatar identity data only');

  const heatmapStyles = [...sources['PeakActivityHeatmap.jsx'].matchAll(/style=\{\{([^}]*)\}\}/g)].map((match) => match[1]);
  assert.equal(heatmapStyles.length, 2);
  for (const style of heatmapStyles) assert.match(style, /^ backgroundColor: intensityColor\(/);
});

test('painted conversion preserves each tool data and interaction contract', () => {
  const calendar = sources['SeasonalCalendar.jsx'];
  assert.match(calendar, /aria-pressed=\{filterType === t\}/);
  assert.match(calendar, /role=\{hasEvents \? 'button' : undefined\}/);
  assert.match(calendar, /e\.key === 'Enter' \|\| e\.key === ' '/);
  assert.match(calendar, /className="sc-dot" style=\{\{ background: color\.bg \}\}/);

  const roadTrip = sources['RoadTripPlanner.jsx'];
  assert.match(roadTrip, /const calculateRoute = useCallback/);
  assert.match(roadTrip, /openMultiStopRoute\(routeResult\.stops\)/);
  assert.match(roadTrip, /<MapSurfaceFrame/);
  assert.match(roadTrip, /hidden=\{!mapExpanded\}/);
  assert.match(roadTrip, /localStorage\.setItem\('pnm_saved_trips'/);

  const social = sources['SocialLayer.jsx'];
  assert.match(social, /getFreshAccessToken\(\)/);
  assert.match(social, /fetch\('\/api\/friends\?action=list'/);
  assert.match(social, /fetch\(`\/api\/poker\/checkins\?user_id=/);
  assert.match(social, /useModalHistory\(!!inviteModal, closeInvite\)/);
  assert.match(social, /useScrimDismiss\(closeInvite\)/);
  assert.match(social, /role="dialog"/);
  assert.match(social, /aria-modal="true"/);
  assert.match(social, /navigator\.clipboard\.writeText/);

  const alerts = sources['TournamentAlerts.jsx'];
  assert.match(alerts, /fetch\('\/api\/poker\/tournament-alerts'/);
  assert.match(alerts, /Notification\.requestPermission/);
  assert.match(alerts, /aria-pressed=\{prefs\.enabled\}/);
  assert.match(alerts, /aria-expanded=\{showSetup\}/);

  const feed = sources['NearMeNowFeed.jsx'];
  for (const endpoint of ['live-games', 'checkins', 'daily-tournaments', 'promotions']) {
    assert.match(feed, new RegExp(`/api/poker/${endpoint}`), `Near Me Now keeps ${endpoint} wiring`);
  }
  assert.match(feed, /onNavigateVenue\(item\.venue\.id\)/);
  assert.match(feed, /onSwitchTab\('daily'\)/);
  assert.match(feed, /role="button"/);
  assert.match(feed, /onKeyDown=\{\(e\) =>/);

  const tripCost = sources['TripCostCalculator.jsx'];
  assert.match(tripCost, /haversineMiles\(/);
  assert.match(tripCost, /role="radiogroup"/);
  assert.match(tripCost, /aria-checked=\{!isPremium\}/);
  assert.match(tripCost, /disabled=\{!selectedVenue\}/);

  const heatmap = sources['PeakActivityHeatmap.jsx'];
  assert.match(heatmap, /fetch\(url, \{ signal: controller\.signal \}\)/);
  assert.match(heatmap, /eventBus\.on\(EventType\.DATA_MUTATED/);
  assert.match(heatmap, /role="grid"/);
  assert.match(heatmap, /role="gridcell"/);
  assert.match(heatmap, /data-allow-small-target="true"/);
  assert.match(heatmap, /event\.key === 'Enter' \|\| event\.key === ' '/);
});

test('the tools stylesheet uses complete painted controls without CSS-built chrome', () => {
  const css = read('src/styles/worlds/poker-near-me-console-tools.css');
  const consoleCss = read('src/styles/worlds/poker-near-me-console.css');

  assert.match(consoleCss, /panel-head\.png/);
  assert.match(consoleCss, /panel-mid\.png[^;]*repeat-y/);
  assert.match(consoleCss, /panel-foot\.png/);
  assert.match(css, /button-secondary\.png'\) center \/ contain no-repeat/);
  assert.match(css, /button-primary\.png/);
  assert.match(css, /search-well\.png'\) center \/ contain no-repeat/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(max-height: 500px\) and \(orientation: landscape\)/);
  assert.match(css, /\.peak-activity-heatmap \.pah-grid-row[\s\S]*?grid-template-columns: repeat\(24, minmax\(0, 1fr\)\)/);

  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(/i);
  assert.doesNotMatch(css, /:hover/i);
  assert.doesNotMatch(css, /(?:^|[;{]\s*)border(?:-radius)?\s*:/im);
  assert.doesNotMatch(css, /box-shadow\s*:/i);
  assert.doesNotMatch(css, /backdrop-filter\s*:/i);
});

test('global cascade wires the tools layer after the base painted console', () => {
  const app = read('pages/_app.js');
  const baseAt = app.indexOf("import '../src/styles/worlds/poker-near-me-console.css';");
  const toolsAt = app.indexOf("import '../src/styles/worlds/poker-near-me-console-tools.css';");
  assert.ok(baseAt >= 0, 'base painted console stylesheet must be global');
  assert.ok(toolsAt > baseAt, 'secondary tools layer must load after the base painted console');
});

test('required pre-deploy safety executes the existing PNM console contracts', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['pretest:pnm'], 'node --test __tests__/poker-near-me-console-tools.test.mjs');
  for (const file of ['poker-near-me-console-contract.test.mjs', 'poker-near-me-console-map.test.mjs']) {
    assert.ok(pkg.scripts['test:pnm'].split(/\s+/).includes(`__tests__/${file}`), `${file} must run from test:pnm`);
  }
  const workflow = read('.github/workflows/build-safety-gate.yml');
  const safety = workflow.split(/^  safety-checks:\s*$/m)[1]?.split(/^  [a-z][\w-]*:\s*$/m)[0];
  assert.ok(safety, 'existing required safety-checks job must exist');
  assert.match(safety, /name: Pre-Deploy Safety Checks/);
  assert.match(safety, /if: github\.event_name == 'pull_request'/);
  const step = safety.split('      - name: Poker Near Me Source And Console Contracts\n')[1]?.split(/^      - /m)[0];
  assert.ok(step, 'the required job must invoke PNM validation');
  assert.match(step, /^        run: npm run test:pnm\s*$/m);
  assert.doesNotMatch(step, /continue-on-error:|\bif:/);
});
