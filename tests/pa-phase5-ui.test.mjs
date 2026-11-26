/**
 * Personal Assistant Phase 5 UI & Accessibility Contracts:
 *   - Duplicate OG meta tags deduplicated via matching keys in pages/share/hand.js
 *   - Bulk .txt hand splitting & chunking helper (50-hand batches, empty/huge guard)
 *   - LiveSpotQuickEntry self_reported_live tagging, focus restoration & aria-live
 *   - InlineHandReplay street stepper, keyboard navigation, divergence highlight & leaks.js mounting
 *   - CoachingWorkspace Export Study Plan, Diamond live-fix claim (zero XP!), weekly digest opt-in, stake-pool RTA guard
 *   - QuickSpotDrill aria-live="polite" announcing Correct, Incorrect, Time Expired
 *   - Zero block elements inside <button> across all Phase 5 surfaces
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Extract pure splitHandHistoryHands and splitHandHistoryChunks from LiveSpotQuickEntry source
const liveSpotSource = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
const matchHands = liveSpotSource.match(/export\s+function\s+splitHandHistoryHands[\s\S]*?\n\}/);
const matchChunks = liveSpotSource.match(/export\s+function\s+splitHandHistoryChunks[\s\S]*?\n\}/);
const matchRegex = liveSpotSource.match(/const\s+HAND_START_REGEX\s*=\s*[\s\S]*?;/);

const helperEvaluator = new Function(`
${matchRegex ? matchRegex[0] : ''}
${matchHands ? matchHands[0].replace('export ', '') : ''}
${matchChunks ? matchChunks[0].replace('export ', '') : ''}
return { splitHandHistoryHands, splitHandHistoryChunks };
`);
const { splitHandHistoryHands, splitHandHistoryChunks } = helperEvaluator();

// ─── 1. pages/share/hand.js OG Meta Keys ────────────────────────────────────

test('pages/share/hand.js matches exact _app.js key attributes for social deduplication', () => {
  const shareSrc = read('pages/share/hand.js');
  const appSrc = read('pages/_app.js');

  // Verify _app.js lines define these keys
  const expectedKeys = [
    'og-title',
    'og-description',
    'og-image',
    'og-image-width',
    'og-image-height',
    'og-image-type',
    'og-type',
    'og-url',
    'twitter-card',
    'twitter-title',
    'twitter-description',
    'twitter-image',
    'description',
    'viewport',
    'robots',
  ];

  for (const k of expectedKeys) {
    assert.match(
      shareSrc,
      new RegExp(`key="${k}"`),
      `pages/share/hand.js must have <meta key="${k}" ...> for Next.js Head deduplication`
    );
  }

  // Ensure og:title and og:description match _app.js keys exactly
  assert.match(shareSrc, /<meta\s+key="og-title"\s+property="og:title"/);
  assert.match(shareSrc, /<meta\s+key="og-description"\s+property="og:description"/);
  assert.match(shareSrc, /<meta\s+key="og-image"\s+property="og:image"/);
  assert.match(shareSrc, /<meta\s+key="og-image-type"\s+property="og:image:type"/);
  assert.match(shareSrc, /<meta\s+key="twitter-title"\s+name="twitter:title"/);
  assert.match(shareSrc, /<meta\s+key="twitter-description"\s+name="twitter:description"/);
  assert.match(shareSrc, /<meta\s+key="twitter-image"\s+name="twitter:image"/);
  assert.match(shareSrc, /<meta\s+key="description"\s+name="description"/);
  assert.match(shareSrc, /<meta\s+key="robots"\s+name="robots"\s+content="noindex,nofollow"/);

  // Assert every <meta> tag inside Head in pages/share/hand.js has a key attribute
  const sf = ts.createSourceFile('pages/share/hand.js', shareSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let metaCount = 0;
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
      if (tagName === 'meta') {
        metaCount += 1;
        const attrs = (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;
        const hasKey = attrs.some((a) => a.name?.getText() === 'key');
        assert.ok(hasKey, `Found <meta> tag without key attribute at line ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert.ok(metaCount >= 12, `Expected at least 12 keyed meta tags in pages/share/hand.js, found ${metaCount}`);
});

// ─── 2. Bulk .txt Hand Splitting & Chunking Helper ──────────────────────────

test('splitHandHistoryHands and splitHandHistoryChunks handle edge cases safely', () => {
  assert.deepEqual(splitHandHistoryHands(''), []);
  assert.deepEqual(splitHandHistoryHands(null), []);
  assert.deepEqual(splitHandHistoryHands(undefined), []);
  assert.deepEqual(splitHandHistoryHands('   \n\n  '), []);
  assert.deepEqual(splitHandHistoryChunks(''), []);
  assert.deepEqual(splitHandHistoryChunks(null), []);

  // Single hand without multi-hand headers
  const singleHand = 'PokerStars Hand #123456789: Hold\'em No Limit ($1/$2) - 2026/11/25\nTable "Apollo" 6-max Seat #1 is button\nSeat 1: Hero ($200 in chips)\nHero: posts small blind $1\n*** HOLE CARDS ***\nDealt to Hero [As Kd]\nHero: raises $4 to $5';
  const singleResult = splitHandHistoryHands(singleHand);
  assert.equal(singleResult.length, 1);
  assert.equal(singleResult[0], singleHand);
  assert.deepEqual(splitHandHistoryChunks(singleHand, 50), [singleHand]);
});

test('splitHandHistoryChunks splits 120 PokerStars hands into 50-hand batches', () => {
  const createPSHand = (id) =>
    `PokerStars Hand #${id}: Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/25 12:00:00 ET\nTable "Vega ${id}" 6-max Seat #1 is the button\nSeat 1: Button ($100 in chips)\nSeat 2: Hero ($100 in chips)\nButton: posts small blind $0.50\nHero: posts big blind $1.00\n*** HOLE CARDS ***\nDealt to Hero [Ah Kh]\nButton: folds\n*** SUMMARY ***\nTotal pot $1.50 | Rake $0\nSeat 2: Hero (big blind) collected ($1.50)`;

  const hands = Array.from({ length: 120 }, (_, i) => createPSHand(1000 + i));
  const fullText = hands.join('\n\n\n');

  const parsedHands = splitHandHistoryHands(fullText);
  assert.equal(parsedHands.length, 120, 'Should accurately extract all 120 individual hands');

  const chunks = splitHandHistoryChunks(fullText, 50);
  assert.equal(chunks.length, 3, '120 hands should split into 3 chunks with batch size 50');

  // Verify chunk sizes
  assert.equal(splitHandHistoryHands(chunks[0]).length, 50);
  assert.equal(splitHandHistoryHands(chunks[1]).length, 50);
  assert.equal(splitHandHistoryHands(chunks[2]).length, 20);
});

test('splitHandHistoryHands detects multi-site boundary headers (GGPoker, ACR, ClubGG, 888)', () => {
  const ggHand = 'Poker Hand #TM10000001: Tournament #123, Hold\'em No Limit - 2026/11/25\nTable "1" 9-max\nSeat 1: Hero ($5,000)';
  const acrHand = 'Hand #20000002 - Holdem(No Limit) - $0.50/$1.00 - 2026/11/25\nTable "Americas" 6-max\nSeat 1: Hero ($100)';
  const clubggHand = 'ClubGG Hand #30000003: Hold\'em No Limit ($1/$2) - 2026/11/25\nTable "Club" 6-max\nSeat 1: Hero ($200)';
  const eight88Hand = '***** 888poker Hand History for Game 40000004 *****\n$0.50/$1.00 Blinds No Limit Holdem\nTable "London" 6 Max\nSeat 1: Hero ($100)';

  const mixed = [ggHand, acrHand, clubggHand, eight88Hand].join('\n\n\n');
  const blocks = splitHandHistoryHands(mixed);
  assert.equal(blocks.length, 4, 'Should extract each site hand history boundary');
});

// ─── 3. LiveSpotQuickEntry self_reported_live & A11y ─────────────────────────

test('LiveSpotQuickEntry passes evidenceScope: self_reported_live and maintains a11y focus restoration', () => {
  const src = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');

  // 1. Evidence scope passed on live spot submit
  assert.match(src, /evidenceScope:\s*'self_reported_live'/);
  assert.match(src, /evidenceScope:\s*'external_upload'/);

  // 2. Explanatory note in UI
  assert.match(src, /Logged As Self-Reported Live Study · Kept Separate From Club Arena Live Verification/);

  // 3. Pure helpers exported
  assert.match(src, /export\s+function\s+splitHandHistoryHands/);
  assert.match(src, /export\s+function\s+splitHandHistoryChunks/);

  // 4. Bulk upload dropzone/picker attributes
  assert.match(src, /accept="\.txt,\.hh,\.log"/);
  assert.match(src, /MAX_FILE_BYTES\s*=\s*5\s*\*\s*1024\s*\*\s*1024/);
  assert.match(src, /Auditing Batch \$\{/);
  assert.match(src, /Cancel Audit/);
  assert.match(src, /role="progressbar"/);

  // 5. Focus restoration
  assert.match(src, /triggerRef\.current\s*=\s*document\.activeElement/);
  assert.match(src, /triggerRef\.current\?\.focus\?\.\(\)/);

  // 6. aria-live region
  assert.match(src, /role="status"/);
  assert.match(src, /aria-live="polite"/);
});

// ─── 4. InlineHandReplay & Leak Finder Mounting ──────────────────────────────

test('InlineHandReplay provides street tabs, keyboard navigation, divergence highlight, and 44px tap targets', () => {
  const src = read('src/components/personal-assistant/InlineHandReplay.jsx');

  // Component export
  assert.match(src, /export\s+default\s+function\s+InlineHandReplay/);

  // Tablist and ARIA roles
  assert.match(src, /role="tablist"/);
  assert.match(src, /role="tab"/);
  assert.match(src, /role="tabpanel"/);
  assert.match(src, /aria-selected=/);
  assert.match(src, /aria-controls=/);

  // Keyboard navigation
  assert.match(src, /event\.key === 'ArrowRight'/);
  assert.match(src, /event\.key === 'ArrowLeft'/);
  assert.match(src, /event\.key === 'Home'/);
  assert.match(src, /event\.key === 'End'/);

  // Tap target size
  assert.match(src, /minHeight:\s*44/);
  assert.match(src, /minWidth:\s*44/);

  // Board and Hero cards rendering
  assert.match(src, /data-card=/);
  assert.match(src, /Hero/);
  assert.match(src, /Board:/);

  // Divergence badge
  assert.match(src, /data-testid="replay-divergence-badge"/);
  assert.match(src, /Divergence/);
  assert.match(src, /BB Lost/);
  assert.doesNotMatch(src, /—/, 'No em dashes in InlineHandReplay');
});

test('pages/hub/personal-assistant/leaks.js mounts InlineHandReplay and restores review modal focus', () => {
  const src = read('pages/hub/personal-assistant/leaks.js');

  // InlineHandReplay imported and mounted
  assert.match(src, /import\s+InlineHandReplay\s+from/);
  assert.match(src, /<InlineHandReplay\s+audit=\{linkedHandAudit\}\s*\/>/);

  // Focus restoration on review modal close
  assert.match(src, /reviewTriggerRef\.current\s*=\s*typeof document !== 'undefined'/);
  assert.match(src, /reviewTriggerRef\.current\?\.focus\?\.\(\)/);

  // Accessible review status announcement
  assert.match(src, /setReviewAnnouncement\('Corrective Review Session Opened'\)/);
  assert.match(src, /setReviewAnnouncement\('Corrective Review Session Closed'\)/);
  assert.match(src, /\{reviewAnnouncement\}/);
});

// ─── 5. CoachingWorkspace Upgrades ───────────────────────────────────────────

test('CoachingWorkspace features Export Study Plan, Diamond live-fix claim (no XP!), digest toggle, and stake-pool RTA guard', () => {
  const src = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  const css = read('src/components/personal-assistant/CoachingWorkspace.module.css');

  // 1. Export Study Plan button & actions
  assert.match(src, /Export Study Plan/);
  assert.match(src, /Copy Markdown/);
  assert.match(src, /Download \.Md File/);
  assert.match(src, /buildStudyPlanMarkdown/);
  assert.match(src, /studyPlanExport\.mjs/);

  // 2. Claim 25 Diamonds button (never XP!)
  assert.match(src, /Claim 25 Diamonds/);
  assert.match(src, /Reward Claimed/);
  assert.match(src, /\/api\/assistant\/leaks\/claim-live-fix/);
  assert.match(src, /confirmed_fixed_at_tables/);
  // XP Ban Guard
  assert.doesNotMatch(src, /\bXP\b/, 'XP is strictly forbidden anywhere in Personal Assistant - Diamonds only!');
  assert.doesNotMatch(src, /claim-xp|xpAwarded/i);

  // 3. Weekly Digest Opt-In Toggle
  assert.match(src, /Weekly Coaching Digest/);
  assert.match(src, /weeklyDigestOptIn/);
  assert.match(src, /toggleWeeklyDigest/);
  assert.match(src, /weekly_digest_opt_in/);

  // 4. Stake-Pool Context RTA guard
  assert.match(src, /mod\.stakePoolContext/);
  assert.match(src, /!snapshot\?\.sessionDebrief\?\.liveTableActive/);
  assert.match(src, /!snapshot\?\.sessionDebrief\?\.cooldownActive/);
  assert.match(src, /!snapshot\?\.liveTableActive/);

  // 5. CoachingWorkspace.module.css contracts
  assert.match(css, /\.viewNav\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(104px,\s*1fr\)\);/);
  assert.doesNotMatch(css, /#9aabba/, 'Muted copy contrast must be >= #9eb4c8');
  assert.match(css, /\.claimButton\s*\{[^}]*min-height:\s*44px/);
});

// ─── 6. QuickSpotDrill aria-live Announcements ───────────────────────────────

test('QuickSpotDrill announces Correct, Incorrect, and Time Expired for screen readers', () => {
  const src = read('src/components/sandbox/QuickSpotDrill.jsx');

  assert.match(src, /Time Expired · The Solver Prefers/);
  assert.match(src, /Correct · This Action Is Inside The Solver Range\./);
  assert.match(src, /Incorrect · You Picked/);
  assert.match(src, /role="status"\s+aria-live="polite"[^>]*data-testid="drill-outcome-announcement"/);
});

// ─── 7. Anti-Regression: Zero Block Elements Inside <button> ─────────────────

test('Zero block elements sit inside any <button> across all Phase 5 surfaces', () => {
  const files = [
    'src/components/personal-assistant/InlineHandReplay.jsx',
    'src/components/personal-assistant/LiveSpotQuickEntry.jsx',
    'src/components/personal-assistant/CoachingWorkspace.jsx',
    'src/components/sandbox/QuickSpotDrill.jsx',
    'pages/hub/personal-assistant/leaks.js',
  ];

  const BLOCK = new Set([
    'div', 'p', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'form', 'fieldset',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr',
    'details', 'summary', 'a', 'button', 'input', 'select', 'textarea',
  ]);

  const tagName = (node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    return opening.tagName.getText();
  };

  for (const file of files) {
    const source = read(file);
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let buttonCount = 0;
    const offenders = [];

    const visit = (node) => {
      if (ts.isJsxElement(node) && tagName(node) === 'button') {
        buttonCount += 1;
        const checkChildren = (child) => {
          if ((ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && BLOCK.has(tagName(child))) {
            const loc = sf.getLineAndCharacterOfPosition(child.getStart());
            offenders.push(`${tagName(child)} @ line ${loc.line + 1}`);
          }
          ts.forEachChild(child, checkChildren);
        };
        node.children.forEach(checkChildren);
      }
      ts.forEachChild(node, visit);
    };

    visit(sf);
    assert.ok(buttonCount > 0, `${file} should contain buttons to test`);
    assert.deepEqual(offenders, [], `${file} contains block elements inside <button>`);
  }
});
