import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function walkTrainingSource(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  let out = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(walkTrainingSource(rel));
    else if (/\.(js|jsx|ts|tsx)$/.test(rel)) out.push(rel);
  }
  return out;
}

test('click-anywhere-on-image and card surface opens the game across all Training card/entry/modal surfaces', () => {
  // 1. Lobby game card (main lobby + all category pages + grid & list views)
  const gameCard = read('src/components/training/lobby/TrainingGameCard.jsx');
  assert.match(gameCard, /handleCardClick/, 'TrainingGameCard must wire whole-card click handler');
  assert.match(gameCard, /onClick=\{handleCardClick\}/, 'TrainingGameCard article must launch on click outside nested buttons');
  assert.match(gameCard, /className=\{styles\.cardArtButton\}[\s\S]*?onStart\(game\)/, 'TrainingGameCard image button must launch game');

  // 2. Preview / Configure sheet artwork click
  const previewSheet = read('src/components/training/lobby/TrainingGamePreviewSheet.jsx');
  assert.match(previewSheet, /className=\{styles\.previewArtButton\}/, 'TrainingGamePreviewSheet must wrap preview artwork in clickable button');
  assert.match(previewSheet, /data-preview-art-launch=\{game\.id\}/, 'TrainingGamePreviewSheet image button must expose launch attribute');
  assert.match(previewSheet, /onClick=\{handleStart\}[\s\S]*?<TrainingGameArt/, 'TrainingGamePreviewSheet artwork click must call handleStart');

  // 3. Dedicated Training game entry sub-pages (shared by 18 routes)
  const gameEntry = read('src/components/training/TrainingGameEntry.jsx');
  assert.match(gameEntry, /<Link[\s\S]*?href=\{gameHref\}[\s\S]*?data-entry-art-launch=\{gameId\}[\s\S]*?<TrainingGameArt/, 'TrainingGameEntry artwork must be wrapped in Link to gameHref');
  assert.match(gameEntry, /className="entry-card" onClick=\{handleCardClick\}/, 'TrainingGameEntry card surface must navigate on click');

  // 4. Category hero artwork banner click
  const categoryPage = read('pages/hub/training/category/[categoryId].js');
  assert.match(categoryPage, /data-category-hero-launch=/, 'Category hero banner must be clickable to launch featured drill');
  assert.match(categoryPage, /sp-category-hero[\s\S]*?playGame\(featuredGame\)/, 'Category hero click must launch featuredGame');

  // 5. SessionSetupModal artwork click
  const setupModal = read('src/components/training/SessionSetupModal.jsx');
  assert.match(setupModal, /<button[\s\S]*?data-setup-art-launch=\{gameId\}[\s\S]*?onClick=\{handleStart\}[\s\S]*?<TrainingGameArt/, 'SessionSetupModal artwork must be clickable to start session');

  // 6. LevelSelector (/hub/training/play/[gameId]) campaign hero art + unlocked level cards
  const levelSelector = read('src/components/training/LevelSelector.tsx');
  assert.match(levelSelector, /<button[\s\S]*?data-level-art-launch=\{gameId\}[\s\S]*?handlePlayLevel/, 'LevelSelector hero artwork must be clickable to launch active level');
  assert.match(levelSelector, /handleCardClick[\s\S]*?onPlay\(level\)/, 'LevelSelector unlocked level cards must launch on card click');

  // 7. Coach mode hero artwork banner click
  const coachMode = read('pages/hub/training/coach-mode.js');
  assert.match(coachMode, /data-coach-hero-launch=/, 'Coach Mode hero banner must be clickable to start recommended lesson');
});

test('global #SMARTERDESIGN brushed-chrome hardware enhancement applies across Training pages, buttons, cards, and popups', () => {
  const worldCss = read('src/styles/worlds/training.css');
  assert.match(worldCss, /--sd-training-chrome:/, 'training.css must define global #SMARTERDESIGN brushed-chrome rim token');
  assert.match(worldCss, /--sd-training-face:/, 'training.css must define global #SMARTERDESIGN dark metallic face token');
  assert.match(worldCss, /--sd-training-blue:/, 'training.css must define global #SMARTERDESIGN cobalt active/primary token');
  assert.match(worldCss, /--sd-training-panel:/, 'training.css must define global #SMARTERDESIGN ink-navy panel token');
  assert.match(worldCss, /body\.world-training :where\(dialog, \.sp-training-modal-surface/, 'training.css must apply global #SMARTERDESIGN styling to all Training dialogs and popups');
  assert.match(worldCss, /body\.world-training \.sp-training-drawer-surface/, 'training.css must style left-anchored Training drawers without rounding the viewport-pinned edge');
  assert.match(worldCss, /body\.world-training dialog::backdrop/, 'training.css must style Training dialog backdrops');

  // Category page adopts TrainingLobby brushed-chrome controls
  const categoryPage = read('pages/hub/training/category/[categoryId].js');
  assert.match(categoryPage, /lobbyStyles\.chromeButton/, 'Category page controls must adopt #SMARTERDESIGN brushed-chrome buttons');
  assert.match(categoryPage, /lobbyStyles\.searchWell/, 'Category page search must adopt #SMARTERDESIGN search well');

  // All Training popups/modals/drawers/toasts adopt #SMARTERDESIGN and contain zero legacy flat/gold/purple chrome
  const upgradedPopups = [
    'src/components/training/CardSelectorModal.jsx',
    'src/components/training/LevelCompleteModal.jsx',
    'src/components/training/TrainingSettingsMenu.jsx',
    'src/components/training/TrainingSignInPrompt.jsx',
    'src/components/training/TrainingQuestionReport.jsx',
    'src/components/training/AchievementToast.jsx',
    'src/components/training/LeakFixerIntercept.jsx',
    'src/components/training/TrainerConfigModal.jsx',
    'src/components/training/GhostReplayEngine.jsx',
    'src/components/training/SessionShareCard.jsx',
  ];
  for (const rel of upgradedPopups) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /#1a1a2e|#18191A|#1e1b4b|#7c3aed|#8b5cf6|#a855f7|#fbbf24|#f59e0b|#FFD700|#d4a020|#8b6914/i,
      `${rel} must not contain legacy flat, gold, amber, or purple styling`,
    );
  }
  for (const dialogRel of [
    'src/components/training/CardSelectorModal.jsx',
    'src/components/training/LevelCompleteModal.jsx',
    'src/components/training/TrainingSettingsMenu.jsx',
    'src/components/training/LeakFixerIntercept.jsx',
    'src/components/training/GhostReplayEngine.jsx',
    'src/components/training/SessionShareCard.jsx',
  ]) {
    const src = read(dialogRel);
    assert.match(src, /role="dialog"[\s\S]*?aria-modal="true"/, `${dialogRel} must expose role="dialog" and aria-modal="true"`);
  }
});

test('anti-regression: Training chrome CSS never clobbers active states, Phase 8 analysis buttons, header "?", raw card pickers, or mid-word button text', () => {
  const worldCss = read('src/styles/worlds/training.css');

  // 1. Mid-word wrapping guard (fixes "Upcomi ng", "Preflo p", "Theor y", "Train ing")
  const btnLayoutMatch = worldCss.match(
    /body\.world-training \.sp-training-page-stage :where\(button, \[role='button'\], \[role='tab'\], \.sd-button\):not\([^{]+\)\s*\{[^}]*\}/,
  );
  assert.ok(btnLayoutMatch, 'training.css button layout rule must exist');
  assert.doesNotMatch(
    btnLayoutMatch[0],
    /overflow-wrap:\s*anywhere/,
    'Training button rule must use overflow-wrap: break-word (never anywhere, which chops English words mid-syllable inside flex rows)',
  );
  assert.match(btnLayoutMatch[0], /overflow-wrap:\s*break-word/);

  // 2. Unselected dark chrome Rule 1 must exclude active states, header "?", and raw controls
  const rule1Match = worldCss.match(/\/\* 1\. Every Training button[\s\S]*?\/\* 2\. Primary/);
  assert.ok(rule1Match, 'Global chrome Rule 1 block must exist');
  for (const excluded of [
    '.sd-header-help',
    "[data-training-raw-control='true']",
    "[aria-pressed='true']",
    "[aria-selected='true']",
    "[aria-checked='true']",
    "[aria-current='page']",
    "[data-active='true']",
    "[data-selected='true']",
  ]) {
    assert.ok(
      rule1Match[0].includes(excluded),
      `Global chrome Rule 1 must exclude ${excluded} so selected/active/Phase-8/raw controls are never overwritten to unselected dark chrome`,
    );
  }

  // 3. Cobalt active Rule 2 must have higher specificity than Rule 1 and exclude .sd-header-help + raw controls
  const rule2Match = worldCss.match(/\/\* 2\. Primary[\s\S]*?\/\* 3\. Every Training sub-page/);
  assert.ok(rule2Match, 'Global chrome Rule 2 block must exist');
  assert.match(rule2Match[0], /\.sp-training-page-stage\.sp-training-page-stage/, 'Rule 2 must out-specify Rule 1');
  assert.ok(rule2Match[0].includes('.sd-header-help'), 'Rule 2 must exclude .sd-header-help');
  assert.ok(rule2Match[0].includes("[data-training-raw-control='true']"), 'Rule 2 must exclude [data-training-raw-control]');

  // 3b. Every global .sp-training-page-stage button rule in training.css must respect [data-training-raw-control='true']
  const legacyCornerRule = worldCss.match(
    /body\.world-training \.sp-training-page-stage :where\(button, \[role='button'\], \.sp-card, \.sp-card-sm, \.sp-card-lg\):not\([^)]+\)/,
  );
  assert.ok(legacyCornerRule, 'Legacy corner reset rule must exist');
  assert.ok(
    legacyCornerRule[0].includes("[data-training-raw-control='true']"),
    'Legacy corner reset rule must exclude [data-training-raw-control]',
  );
  const legacyBevelRule = worldCss.match(
    /body\.world-training \.sp-training-page-stage :where\(button, \[role='button'\]\):not\([^)]+\)/,
  );
  assert.ok(legacyBevelRule, 'Legacy bevel/min-height rule must exist');
  assert.ok(
    legacyBevelRule[0].includes("[data-training-raw-control='true']"),
    'Legacy bevel/min-height rule must exclude [data-training-raw-control]',
  );

  // 4. Backdrop, 52-card picker, and replay modal protections
  const settingsMenu = read('src/components/training/TrainingSettingsMenu.jsx');
  assert.match(
    settingsMenu,
    /<button[\s\S]*?data-training-raw-control="true"[\s\S]*?styles\.backdrop/,
    'TrainingSettingsMenu backdrop button must carry data-training-raw-control="true" so global button chrome never paints it opaque',
  );
  assert.match(settingsMenu, /aria-pressed=\{viewMode === 'standard'\}/, 'TrainingSettingsMenu Beginner toggle must expose aria-pressed');
  assert.match(settingsMenu, /aria-pressed=\{viewMode === 'pro'\}/, 'TrainingSettingsMenu Pro toggle must expose aria-pressed');
  assert.match(settingsMenu, /className="sp-training-drawer-surface"/, 'TrainingSettingsMenu drawer must use sp-training-drawer-surface');

  const cardSelector = read('src/components/training/CardSelectorModal.jsx');
  assert.match(cardSelector, /data-allow-small="true"/, 'CardSelectorModal 52-card grid must opt out of 44px chrome button inflation');
  assert.match(cardSelector, /data-training-raw-control="true"/, 'CardSelectorModal playing cards must opt out of chrome button background clobbering');
  assert.match(cardSelector, /Escape/, 'CardSelectorModal must dismiss on Escape');

  for (const pickerRel of [
    'pages/hub/training/hand-lab.js',
    'pages/hub/training/equity-calculator.js',
    'pages/hub/training/custom-solve.js',
  ]) {
    const pickerSrc = read(pickerRel);
    assert.match(
      pickerSrc,
      /data-training-raw-control="true"/,
      `${pickerRel} 52-card picker buttons must carry data-training-raw-control="true" so global button chrome does not double-frame playing cards`,
    );
  }

  const ghostReplay = read('src/components/training/GhostReplayEngine.jsx');
  assert.match(ghostReplay, /Escape/, 'GhostReplayEngine must dismiss on Escape');
  assert.doesNotMatch(ghostReplay, /\bautoPlay\b/, 'GhostReplayEngine must not contain dead autoPlay state');

  const shareCard = read('src/components/training/SessionShareCard.jsx');
  assert.match(shareCard, /Escape/, 'SessionShareCard must dismiss on Escape');

  // 5. Sub-page active-state ARIA + wrap + zero forbidden purple/amber colors
  const preflop = read('pages/hub/training/preflop-charts.js');
  assert.match(preflop, /aria-pressed=\{scenario === s\.value\}/, 'preflop-charts scenario buttons must expose aria-pressed');
  assert.match(preflop, /aria-pressed=\{position === pos\}/, 'preflop-charts position buttons must expose aria-pressed');
  assert.match(preflop, /aria-pressed=\{compareMode\}/, 'preflop-charts compare toggle must expose aria-pressed');
  assert.doesNotMatch(preflop, /#7c3aed|#a855f7|rgba\(124,58,237|rgba\(251,191,36/i, 'preflop-charts must not contain banned purple/amber styling');

  const flashcards = read('pages/hub/training/flashcards.js');
  assert.match(flashcards, /aria-pressed=\{catFilter === c\}/, 'flashcards category filters must expose aria-pressed');
  // #SMARTERDESIGN study-tools module (2026-11-27): the category chips wrap from .chips.
  const studyToolsCss = read('src/styles/training/study-tools.module.css');
  assert.ok(
    /flexWrap:\s*'wrap'/.test(flashcards) || (flashcards.includes('className={st.chips}') && /\.chips\s*\{[^}]*flex-wrap:\s*wrap/.test(studyToolsCss)),
    'flashcards category row must wrap cleanly on narrow phones',
  );

  const quizBuilder = read('pages/hub/training/quiz-builder.js');
  assert.match(quizBuilder, /aria-selected=\{tab === t\.id\}/, 'quiz-builder tabs must expose aria-selected');

  const jarvis = read('pages/hub/training/jarvis.js');
  assert.doesNotMatch(jarvis, /#fbbf24|rgba\(251,\s*191,\s*36/i, 'jarvis.js priority leak card must not use banned amber/gold styling');

  const tournaments = read('pages/hub/training/tournaments.js');
  const playCss = read('src/styles/training/training-play.module.css');
  assert.ok(
    /whiteSpace:\s*'nowrap'/.test(tournaments) || (tournaments.includes('className={s.segmented}') && /\.segmented > \.button \{ white-space: nowrap; \}/.test(playCss)),
    'tournaments tabs must not split "Upcoming" mid-word',
  );
  assert.doesNotMatch(tournaments, /rgba\(251,\s*191,\s*36/i, 'tournaments.js offline banner must not use banned amber border');
});

test('anti-regression: all Training GET /api/training/tool-records callers guard signed-out visitors against spurious 401 errors', () => {
  const routeFiles = ['pages/hub/training.js', ...walkTrainingSource('pages/hub/training')];
  const unguarded = [];

  for (const rel of routeFiles) {
    const src = read(rel);
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/authedFetch\(['"`]\/api\/training\/tool-records\?/.test(lines[i])) {
        // Check preceding 35 lines for an auth/token guard
        const windowText = lines.slice(Math.max(0, i - 35), i + 1).join('\n');
        const hasGuard = /if\s*\(\s*!(?:getAccessToken|getSessionToken|getAuthUser|token)\b/.test(windowText)
          || /getAccessToken\(\)\s*\)/.test(windowText);
        if (!hasGuard) {
          unguarded.push(`${rel}:${i + 1}`);
        }
      }
    }
  }
  assert.deepEqual(
    unguarded,
    [],
    `Found unguarded GET /api/training/tool-records calls that cause 401 errors for guests:\n${unguarded.join('\n')}`,
  );

  // drill-builder must check getSession() before getUser() so guests never see a false load error banner
  const drillBuilder = read('pages/hub/training/drill-builder.js');
  assert.match(
    drillBuilder,
    /auth\.getSession\(\)[\s\S]*?if\s*\(!sessionData\?\.session\?\.user\)\s*\{?\s*return;/,
    'drill-builder.js must guard signed-out visitors with getSession() before calling getUser()',
  );
});

test('anti-regression AST: zero nested interactive elements and zero unclickable <TrainingGameArt> across the entire Training codebase', () => {
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const files = [
    'pages/hub/training.js',
    ...walkTrainingSource('pages/hub/training'),
    ...walkTrainingSource('src/components/training'),
  ];

  const nestedInteractive = [];
  const unclickableArt = [];

  for (const rel of files) {
    const code = read(rel);
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    traverse(ast, {
      JSXElement(p) {
        const nameNode = p.node.openingElement.name;
        const tag = nameNode.type === 'JSXIdentifier'
          ? nameNode.name
          : nameNode.type === 'JSXMemberExpression'
            ? `${nameNode.object.name}.${nameNode.property.name}`
            : '';
        const isInteractive = tag === 'button' || tag === 'a' || tag === 'Link' || tag === 'motion.button' || tag === 'motion.a';
        if (isInteractive) {
          let cur = p.parentPath;
          while (cur) {
            if (cur.isJSXElement()) {
              const pName = cur.node.openingElement.name;
              const pTag = pName.type === 'JSXIdentifier'
                ? pName.name
                : pName.type === 'JSXMemberExpression'
                  ? `${pName.object.name}.${pName.property.name}`
                  : '';
              if (pTag === 'button' || pTag === 'a' || pTag === 'Link' || pTag === 'motion.button' || pTag === 'motion.a') {
                nestedInteractive.push(`${rel}:${p.node.loc?.start?.line} <${tag}> inside <${pTag}>`);
                break;
              }
            }
            cur = cur.parentPath;
          }
        }
        if (tag === 'TrainingGameArt') {
          let cur = p.parentPath;
          let clickable = false;
          while (cur) {
            if (cur.isJSXElement()) {
              const pName = cur.node.openingElement.name;
              const pTag = pName.type === 'JSXIdentifier'
                ? pName.name
                : pName.type === 'JSXMemberExpression'
                  ? `${pName.object.name}.${pName.property.name}`
                  : '';
              const hasOnClick = cur.node.openingElement.attributes.some(
                (a) => a.type === 'JSXAttribute' && a.name?.name === 'onClick',
              );
              if (pTag === 'button' || pTag === 'a' || pTag === 'Link' || pTag === 'motion.button' || hasOnClick) {
                clickable = true;
                break;
              }
            }
            cur = cur.parentPath;
          }
          if (!clickable) {
            unclickableArt.push(`${rel}:${p.node.loc?.start?.line} <TrainingGameArt> is not inside a clickable element`);
          }
        }
      },
    });
  }

  assert.deepEqual(nestedInteractive, [], `Nested interactive elements detected:\n${nestedInteractive.join('\n')}`);
  assert.deepEqual(unclickableArt, [], `Unclickable <TrainingGameArt> detected:\n${unclickableArt.join('\n')}`);
});
