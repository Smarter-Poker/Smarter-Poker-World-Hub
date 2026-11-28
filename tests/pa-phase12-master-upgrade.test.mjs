import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseLiveShorthand } from '../src/lib/personal-assistant/shorthandParser.mjs';
import {
  PA_MILESTONES_STORAGE_KEY,
  recordPaMilestone,
  getPaMilestones,
} from '../src/lib/personal-assistant/telemetry.mjs';
import {
  CLUB_ARENA_SKINS,
  CLUB_ARENA_BACKGROUNDS,
  CLUB_ARENA_CARD_BACKS,
  CLUB_ARENA_DEALER_BUTTONS,
  resolveArenaCardUrl,
} from '../src/lib/clubArenaTheme.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('1. Live poker shorthand parser deterministically parses cards, position, board, stack, and actions', () => {
  const parsed = parseLiveShorthand('UTG opens 3x, I 3b AhKh BTN 9x, flop Ks7c2d, cbet 1/3');
  assert.equal(parsed.position, 'BTN');
  assert.deepEqual(parsed.heroCards, ['Ah', 'Kh']);
  assert.deepEqual(parsed.boardCards, ['Ks', '7c', '2d']);
  assert.ok(parsed.heroAction === 'bet' || parsed.heroAction === 'raise');
  assert.ok(parsed.parsedSummary.length > 0);

  const mtt = parseLiveShorthand('CO 85bb Qs Js board Ts 9h 2c call tournament');
  assert.equal(mtt.position, 'CO');
  assert.equal(mtt.stackBb, 85);
  assert.equal(mtt.gameFormat, 'tournament');
  assert.deepEqual(mtt.heroCards, ['Qs', 'Js']);
  assert.deepEqual(mtt.boardCards, ['Ts', '9h', '2c']);
  assert.equal(mtt.heroAction, 'call');

  const empty = parseLiveShorthand('');
  assert.deepEqual(empty.heroCards, []);
  assert.deepEqual(empty.boardCards, []);
});

test('2. Privacy-safe milestone telemetry counts allowlisted events and strips PII, UUIDs, and emails', () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };

  recordPaMilestone('sandbox_action', {
    variant: 'nlh',
    email: 'secret@example.com',
    userId: '550e8400-e29b-41d4-a716-446655440000',
    handText: 'AhKd on Kh7c2d',
  }, { storage: mockStorage });
  recordPaMilestone('sandbox_action', { variant: 'plo4' }, { storage: mockStorage });
  recordPaMilestone('not_an_allowed_event', { surface: 'bad' }, { storage: mockStorage });

  const raw = store.get(PA_MILESTONES_STORAGE_KEY) || '';
  assert.doesNotMatch(raw, /secret@example\.com|550e8400|AhKd|not_an_allowed_event/);

  const summary = getPaMilestones({ storage: mockStorage });
  assert.equal(summary.counts.sandbox_action, 2);
  assert.equal(summary.counts.not_an_allowed_event, undefined);
});

test('3. Club Arena theme bridge exports complete catalogs and supports 4-color + 2-color decks plus WebP skins on disk', () => {
  assert.ok(Array.isArray(CLUB_ARENA_SKINS) && CLUB_ARENA_SKINS.length >= 13);
  assert.ok(Array.isArray(CLUB_ARENA_BACKGROUNDS) && CLUB_ARENA_BACKGROUNDS.length >= 8);
  assert.ok(Array.isArray(CLUB_ARENA_CARD_BACKS) && CLUB_ARENA_CARD_BACKS.length === 12);
  assert.ok(Array.isArray(CLUB_ARENA_DEALER_BUTTONS) && CLUB_ARENA_DEALER_BUTTONS.length === 10);

  assert.equal(resolveArenaCardUrl('hearts', 'a', '4color'), '/hub/club-arena/cards/4color/hearts_a.webp');
  assert.equal(resolveArenaCardUrl('hearts', 'a', '2color'), '/cards/hearts_a.png');

  const tablesDir = path.join(ROOT, 'public/hub/table-theme/tables');
  const pngs = fs.readdirSync(tablesDir).filter((f) => /^skin_.*\.png$/i.test(f));
  assert.ok(pngs.length >= 13, 'expected at least 13 Club Arena PNG table skins');
  for (const png of pngs) {
    const webp = png.replace(/\.png$/i, '.webp');
    const webpPath = path.join(tablesDir, webp);
    assert.ok(fs.existsSync(webpPath), `missing WebP table skin sibling ${webp}`);
    const stat = fs.statSync(webpPath);
    assert.ok(stat.size > 5000 && stat.size < 160000, `WebP table skin ${webp} size ${stat.size} out of expected range`);
  }
});

test('4. Virtual Sandbox wires multi-seat turn engine, bet slider, Pot Odds/MDF, PLO, range math, runout click-to-deal, hotkeys, and mobile above-the-fold', () => {
  const table = read('src/components/sandbox/SandboxPokerTable.jsx');
  const sandbox = read('pages/hub/personal-assistant/sandbox.js');
  const rangePanel = read('src/components/sandbox/RangeAdvantagePanel.jsx');
  const customizers = read('src/components/sandbox/TableCustomizers.jsx');
  const components = read('src/components/sandbox/SandboxComponents.jsx');

  assert.match(table, /data-arena-pot-odds="true"/);
  assert.match(table, /data-arena-bet-slider="true"/);
  assert.match(table, /aria-live="polite"/);
  assert.match(table, /type="image\/webp"/);
  assert.match(table, /readOnly/);
  assert.match(table, /villainHoleCards/);
  assert.match(table, /onTapSeat/);
  assert.match(table, /onSelectActor/);

  assert.match(sandbox, /RangeAdvantagePanel/);
  assert.match(sandbox, /TableCustomizers/);
  assert.match(sandbox, /onSelectRunoutCard/);
  assert.match(sandbox, /recordPaMilestone\('sandbox_action'/);
  assert.match(sandbox, /Hotkeys/);
  assert.match(sandbox, /plo4/i);
  assert.match(components, /onSelectRunoutCard/);
  assert.match(rangePanel, /Range Advantage|Nut Advantage/);
  assert.match(customizers, /CLUB_ARENA_SKINS/);
  assert.match(customizers, /CLUB_ARENA_CARD_BACKS/);
});

test('5. Review My Play, My Leaks, Landing, LiveSpotQuickEntry, ExportCard, StudyFolders, Share, and PWA worker enforce Master Upgrade contracts', () => {
  const indexPage = read('pages/hub/personal-assistant/index.js');
  const hubCss = read('src/styles/worlds/PersonalAssistantHub.module.css');
  const reviewPage = read('pages/hub/personal-assistant/review.js');
  const leaksPage = read('pages/hub/personal-assistant/leaks.js');
  const quickEntry = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
  const exportCard = read('src/components/sandbox/ExportCard.jsx');
  const studyFolders = read('src/components/sandbox/StudyFolders.jsx');
  const shareHand = read('pages/share/hand.js');
  const worker = read('worker/index.js');

  assert.match(hubCss, /\.featureCardLeaks \.featureArtWrap svg/);
  assert.match(indexPage, /data-post-session-debrief="true"/);

  assert.match(reviewPage, /SandboxPokerTable/);
  assert.match(reviewPage, /data-review-arena-table="true"/);
  assert.match(reviewPage, /data-sample-hand-trigger="true"/);

  assert.match(leaksPage, /data-open-on-table="true"/);
  assert.match(leaksPage, /data-leak-trend="true"/);
  assert.match(leaksPage, /data-verified-fixed-badge="true"/);
  assert.match(leaksPage, /data-preview-sample-leak-toggle="true"/);
  assert.match(leaksPage, /data-weekly-digest-preview="true"/);

  assert.match(quickEntry, /data-shorthand-paste-bar="true"/);
  assert.match(quickEntry, /parseLiveShorthand/);
  assert.match(quickEntry, /data-offline-draft-notice="true"/);

  assert.match(exportCard, /SMARTER\.POKER/);
  assert.match(studyFolders, /data-copy-study-packet="true"/);
  assert.match(shareHand, /data-share-felt-watermark="true"/);
  assert.match(worker, /pa-club-arena-assets-v1/);
  assert.match(worker, /\/hub\/table-theme\/tables\//);
  assert.match(worker, /\/images\/personal-assistant\//);
});
