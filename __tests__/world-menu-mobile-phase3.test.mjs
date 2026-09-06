import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

const hamburger = read('src/components/ui/HamburgerMenu.jsx');
const geeves = read('src/components/ui/GeevesMenuWidget.jsx');
const reportBug = read('src/components/ui/ReportBugWidget.jsx');
const hubPageShell = read('src/components/ui/HubPageShell.jsx');
const universalHeader = read('src/components/ui/UniversalHeader.js');
const commandDock = read('src/components/ui/WorldCommandDock.jsx');
const documentSource = read('pages/_document.js');
const hamburgerRegistry = read('src/config/hamburgerMenus.js');
const footerRegistry = JSON.parse(read('src/config/world-footer-navigation.json'));
const mobileBudget = JSON.parse(read('scripts/ci/mobile-budget.json'));

test('mobile budgets cover exactly the thirteen non-Social World roots', () => {
  const expectedRoots = [
    '/hub/bankroll-manager',
    '/hub/diamond-arena',
    '/hub/marketplace',
    '/hub/my-clubs',
    '/hub/news',
    '/hub/personal-assistant',
    '/hub/poker-near-me',
    '/hub/poker-tools',
    '/hub/preflop-charts',
    '/hub/toke-tracker',
    '/hub/training',
    '/hub/trivia',
    '/hub/video-library',
  ];

  assert.deepEqual(Object.keys(mobileBudget.routes).sort(), expectedRoots.sort());
  assert.equal(mobileBudget.routes['/hub/social-media'], undefined);
});

test('drawer-only widgets remain client-only dynamic imports', () => {
  for (const component of ['InviteFriendsModal', 'GeevesMenuWidget', 'ReportBugWidget']) {
    assert.match(
      hamburger,
      new RegExp(`const ${component} = dynamic\\(\\(\\) => import\\('\\./${component}'\\), \\{ ssr: false \\}\\);`),
    );
    assert.doesNotMatch(hamburger, new RegExp(`^import ${component} from`, 'm'));
  }
});

test('swipe-to-close excludes interactive controls and always clears cancelled gestures', () => {
  for (const selector of [
    '[data-hscroll]',
    'a',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[contenteditable="true"]',
  ]) {
    assert.ok(hamburger.includes(selector), `missing swipe exclusion: ${selector}`);
  }
  assert.match(hamburger, /const handleTouchCancel = \(\) => \{\s*touchStartRef\.current = null;\s*\};/);
  assert.match(hamburger, /onTouchCancel=\{handleTouchCancel\}/);
});

test('open drawer isolates obscured branches and restores their prior accessibility state', () => {
  assert.match(hamburger, /const changes = new Map\(\)/);
  assert.match(hamburger, /const isolateBranches = \(\) =>/);
  assert.match(hamburger, /new MutationObserver\(isolateBranches\)/);
  assert.match(hamburger, /branchObserver\.observe\(document\.body, \{ childList: true, subtree: true \}\)/);
  assert.match(hamburger, /branchObserver\.disconnect\(\)/);
  assert.match(hamburger, /sibling\.setAttribute\('inert', ''\)/);
  assert.match(hamburger, /sibling\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(hamburger, /inert: sibling\.hasAttribute\('inert'\)/);
  assert.match(hamburger, /ariaHidden: sibling\.getAttribute\('aria-hidden'\)/);
  assert.match(hamburger, /if \(!inert\) element\.removeAttribute\('inert'\)/);
  assert.match(hamburger, /if \(ariaHidden === null\) element\.removeAttribute\('aria-hidden'\)/);
  assert.match(hamburger, /else element\.setAttribute\('aria-hidden', ariaHidden\)/);
  assert.match(hamburger, /sibling\.matches\?\.\('\[data-world-command-child-overlay="true"\]'\)/);
  assert.match(hamburger, /sibling\.matches\?\.\('\[data-world-command-child-dialog="true"\]'\)/);
  assert.match(hamburger, /e\.target\?\.closest\?\.\('\[data-world-command-child-dialog="true"\]'\)/);
  assert.match(hamburger, /aria-hidden=\{childDialogOpen \? 'true' : undefined\}/);
  assert.match(hamburger, /inert=\{childDialogOpen \? '' : undefined\}/);
  assert.match(hamburger, /<ReportBugWidget onOpenChange=\{setChildDialogOpen\} \/>/);
});

test('adaptive mobile drawer keeps search, safe areas, and descriptions readable', () => {
  assert.match(hamburger, /\.sp-drawer\[data-responsive-composition='adaptive'\] \.sp-command-utility-rail \{\s*top: env\(safe-area-inset-top, 0px\);/);
  assert.match(hamburger, /\.sp-drawer\[data-responsive-composition='adaptive'\] \.sp-command-search \{\s*top: calc\(64px \+ env\(safe-area-inset-top, 0px\)\) !important;/);
  assert.match(hamburger, /@media \(max-height: 480px\) and \(orientation: landscape\)[\s\S]*?top: calc\(56px \+ env\(safe-area-inset-top, 0px\)\) !important;/);
  assert.match(hamburger, /padding-right: env\(safe-area-inset-right, 0px\)/);
  assert.match(hamburger, /padding-bottom: calc\(24px \+ env\(safe-area-inset-bottom, 0px\)\) !important/);
  assert.match(hamburger, /padding-left: env\(safe-area-inset-left, 0px\)/);
  assert.match(
    hamburger,
    /\.sp-menu-description,\s*\.sp-drawer\[data-responsive-composition='adaptive'\] \.sp-grid-description \{\s*font-size: 12px !important;/,
  );
});

test('Geeves exposes its disclosure state and mobile-sized controls with reduced-motion scrolling', () => {
  assert.match(geeves, /const panelId = useId\(\)/);
  assert.match(geeves, /aria-expanded=\{isExpanded\}/);
  assert.match(geeves, /aria-controls=\{panelId\}/);
  assert.match(geeves, /id=\{panelId\}/);
  assert.match(geeves, /aria-hidden=\{!isExpanded\}/);
  assert.match(geeves, /hidden=\{!isExpanded\}/);
  assert.match(geeves, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(geeves, /scrollIntoView\(\{ behavior: reduceMotion \? 'auto' : 'smooth' \}\)/);
  assert.ok((geeves.match(/minHeight: 44/g) || []).length >= 2);
  assert.match(geeves, /fontSize: 16/);
  assert.match(geeves, /aria-label="Send Message To Geeves"/);
});

test('Report Bug is a portalled, focus-contained mobile dialog', () => {
  assert.match(reportBug, /import \{ createPortal \} from 'react-dom'/);
  assert.match(reportBug, /open && portalReady && createPortal\(/);
  assert.match(reportBug, /\), document\.body\)\}/);
  assert.match(reportBug, /role="dialog"/);
  assert.match(reportBug, /aria-modal="true"/);
  assert.match(reportBug, /data-world-command-child-dialog="true"/);
  assert.match(reportBug, /data-world-command-child-overlay="true"/);
  assert.match(reportBug, /onOpenChange\?\.\(open\)/);
  assert.match(reportBug, /if \(event\.key === 'Escape'\)[\s\S]*?handleClose\(\)/);
  assert.match(reportBug, /dialogRef\.current\.querySelectorAll\(FOCUSABLE\)/);
  assert.match(reportBug, /const previousFocus = document\.activeElement/);
  assert.match(reportBug, /const target = triggerRef\.current\?\.isConnected \? triggerRef\.current : previousFocus/);
  assert.match(reportBug, /closeRef\.current\?\.focus\(\)/);
  assert.ok((reportBug.match(/minHeight: 44/g) || []).length >= 6);
  assert.ok((reportBug.match(/fontSize: 16/g) || []).length >= 2);
  assert.match(reportBug, /padding: 'max\(16px, env\(safe-area-inset-top, 0px\)\)[^']*safe-area-inset-bottom/);
  assert.match(reportBug, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;[\s\S]*?transition: none !important;/);
});

test('HubPageShell clips horizontal overflow without creating a sticky-breaking vertical container', () => {
  assert.match(hubPageShell, /overflowX: 'clip'/);
  assert.match(hubPageShell, /overflowY: 'visible'/);
  assert.ok((hubPageShell.match(/overflow-x: hidden; overflow-x: clip;/g) || []).length >= 2);
});

test('Poker Near Me Events uses the canonical series route in both registries', () => {
  assert.match(
    hamburgerRegistry,
    /createMenuItem\.navigation\('Events', '\/hub\/poker-near-me\/series'\)/,
  );
  assert.doesNotMatch(hamburgerRegistry, /\/hub\/poker-near-me\/events/);

  const serializedFooterRegistry = JSON.stringify(footerRegistry);
  assert.match(serializedFooterRegistry, /"href":"\/hub\/poker-near-me\/series","label":"Events"/);
  assert.doesNotMatch(serializedFooterRegistry, /\/hub\/poker-near-me\/events/);
});

test('fallback-to-approved ownership handoff preserves an in-flight menu tap', () => {
  assert.match(universalHeader, /sp:open-approved-world-menu/);
  assert.match(universalHeader, /if \(onMenuClick && !ownsCanonicalMenu\) onMenuClick\(\)/);
  assert.match(commandDock, /const isOpenRef = useRef\(false\)/);
  assert.match(commandDock, /if \(isOpenRef\.current\)[\s\S]*?sp:open-approved-world-menu/);
  assert.match(
    commandDock,
    /if \(isOpenRef\.current && approvedTriggers\.length > 0\)[\s\S]*?setHasHeaderTrigger\(true\)/,
  );
  assert.match(commandDock, /window\.setInterval\(transferIfApprovedOwnerExists, 50\)/);
  assert.match(commandDock, /trigger\.getAttribute\('aria-expanded'\) === 'true' \|\| isTriggerUsable\(trigger\)/);
  assert.match(commandDock, /data-menu-symbol="hamburger"/);
});

test('font hydration visibility failsafe covers the nested World page wrapper', () => {
  assert.match(
    documentSource,
    /#__next > div > div:not\(\[class\]\)\[style\*="visibility:hidden"\]/,
  );
  assert.match(
    documentSource,
    /#__next > div > div:not\(\[class\]\)\[style\*="visibility: hidden"\]/,
  );
});
