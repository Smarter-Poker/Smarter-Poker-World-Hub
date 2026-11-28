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

  // 1. Mid-word wrapping guard (fixes "Upcomi ng", "Preflo p", "Monot one", "Beg inn er", "Confide nt", "20B b")
  const btnLayoutMatch = worldCss.match(
    /body\.world-training \.sp-training-page-stage :where\(button, \[role='button'\], \[role='tab'\], \.sd-button\):not\([^{]+\)\s*\{[^}]*\}/,
  );
  assert.ok(btnLayoutMatch, 'training.css button layout rule must exist');
  assert.doesNotMatch(
    btnLayoutMatch[0],
    /overflow-wrap:\s*(?:anywhere|break-word)/,
    'Training button rule must use overflow-wrap: normal (never anywhere or break-word, which chop English words mid-syllable inside flex rows)',
  );
  assert.match(btnLayoutMatch[0], /overflow-wrap:\s*normal/);
  assert.match(btnLayoutMatch[0], /word-break:\s*normal/);

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

  const leakFixer = read('src/components/training/LeakFixerIntercept.jsx');
  assert.match(leakFixer, /Escape/, 'LeakFixerIntercept must dismiss on Escape');

  const setupModal = read('src/components/training/SessionSetupModal.jsx');
  assert.match(setupModal, /className="sp-card-lg sp-setup-console"/, 'SessionSetupModal dialog card must retain sp-setup-console (styled by training.css modal rule)');
  assert.match(worldCss, /body\.world-training :where\(dialog, \.sp-training-modal-surface, \.sp-setup-console, \.sp-trainer-config-modal\)/, 'training.css must apply brushed-chrome modal frame to sp-setup-console and sp-trainer-config-modal');

  const trainerConfig = read('src/components/training/TrainerConfigModal.jsx');
  assert.match(trainerConfig, /sp-trainer-config-modal/, 'TrainerConfigModal dialog card must retain sp-trainer-config-modal');

  // 5. Sub-page active-state ARIA + wrap + zero forbidden purple/amber colors
  const preflop = read('pages/hub/training/preflop-charts.js');
  assert.match(preflop, /aria-pressed=\{scenario === s\.value\}/, 'preflop-charts scenario buttons must expose aria-pressed');
  assert.match(preflop, /aria-pressed=\{position === pos\}/, 'preflop-charts position buttons must expose aria-pressed');
  assert.match(preflop, /aria-pressed=\{compareMode\}/, 'preflop-charts compare toggle must expose aria-pressed');
  assert.doesNotMatch(preflop, /#7c3aed|#a855f7|rgba\(124,58,237|rgba\(168,85,247|rgba\(251,191,36/i, 'preflop-charts must not contain banned purple/amber styling');

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
  assert.doesNotMatch(jarvis, /#fbbf24|rgba\(251,\s*191,\s*36|rgba\(139,\s*92,\s*246/i, 'jarvis.js must not use banned amber/gold/purple styling');

  const tournaments = read('pages/hub/training/tournaments.js');
  const playCss = read('src/styles/training/training-play.module.css');
  assert.ok(
    /whiteSpace:\s*'nowrap'/.test(tournaments) || (tournaments.includes('className={s.segmented}') && /\.segmented > \.button \{ white-space: nowrap; \}/.test(playCss)),
    'tournaments tabs must not split "Upcoming" mid-word',
  );
  assert.doesNotMatch(tournaments, /rgba\(251,\s*191,\s*36/i, 'tournaments.js offline banner must not use banned amber border');

  // 6. Deep Pass-2 hardened pages: active ARIA states, wrapping rows, centered icons, and zero banned purple across ALL 95 Training pages
  const solutions = read('pages/hub/training/solutions.js');
  assert.match(solutions, /aria-pressed=\{stackDepth === sd\}/, 'solutions.js stack buttons must expose aria-pressed');
  assert.match(solutions, /aria-pressed=\{boardTexture === tex\}/, 'solutions.js texture buttons must expose aria-pressed');
  assert.match(solutions, /whiteSpace:\s*'nowrap'/, 'solutions.js filter pills must not split mid-word');

  const studyGroupFinder = read('pages/hub/training/study-group-finder.js');
  assert.match(studyGroupFinder, /aria-pressed=\{filterFmt === f\}/, 'study-group-finder format buttons must expose aria-pressed');
  assert.match(studyGroupFinder, /aria-pressed=\{filterLevel === l\}/, 'study-group-finder level buttons must expose aria-pressed');
  assert.match(studyGroupFinder, /aria-pressed=\{sortBy === s\.k\}/, 'study-group-finder sort buttons must expose aria-pressed');
  // #SMARTERDESIGN study-tools module (2026-11-27): chip rows set nowrap in CSS.
  const studyCss = read('src/styles/training/study-tools.module.css');
  const studyChipsNoWrap = /\.page \.chips > :is\(a, button\) \{[^}]*white-space:\s*nowrap/.test(studyCss);
  assert.ok(/whiteSpace:\s*'nowrap'/.test(studyGroupFinder) || (studyGroupFinder.includes('className={st.chips}') && studyChipsNoWrap), 'study-group-finder level buttons must not split "Beginner"/"Intermediate"');

  const sessionNotes = read('pages/hub/training/session-notes.js');
  assert.match(sessionNotes, /aria-pressed=\{mood === m\.id\}/, 'session-notes mood buttons must expose aria-pressed');
  assert.match(sessionNotes, /aria-pressed=\{isActive\}/, 'session-notes tag buttons must expose aria-pressed');
  assert.match(sessionNotes, /aria-pressed=\{searchTerm === tag\}/, 'session-notes search tag buttons must expose aria-pressed');
  assert.ok(/flex:\s*'1 1 92px'/.test(sessionNotes) || (sessionNotes.includes('className={st.chips}') && studyChipsNoWrap), 'session-notes mood buttons must wrap cleanly instead of slicing "Confident"/"Frustrated"');

  const customSolve = read('pages/hub/training/custom-solve.js');
  assert.match(customSolve, /aria-pressed=\{heroPos === p\}/, 'custom-solve hero position buttons must expose aria-pressed');
  assert.match(customSolve, /aria-pressed=\{villainPos === p\}/, 'custom-solve villain position buttons must expose aria-pressed');
  assert.match(customSolve, /aria-pressed=\{stackDepth === sd\}/, 'custom-solve stack depth buttons must expose aria-pressed');

  const gtoNews = read('pages/hub/training/gto-news.js');
  const coachingCss = read('src/styles/training/sessions-coaching.module.css');
  assert.ok(
    /alignItems:\s*'center',\s*justifyContent:\s*'center',\s*width:\s*44,\s*height:\s*44/.test(gtoNews)
      || (gtoNews.includes('s.iconButton') && /\.iconButton \{[^}]*place-items:\s*center;[^}]*inline-size:\s*44px;[^}]*block-size:\s*44px/.test(coachingCss)),
    'gto-news bookmark star button must center its icon inside the 44px chrome target',
  );

  assert.match(read('pages/hub/training/drill-builder.js'), /aria-pressed=\{Boolean\(selected\)\}/, 'drill-builder Chip button must expose aria-pressed');
  assert.match(read('pages/hub/training/custom-rake.js'), /aria-pressed=\{preset\.id === r\.id\}/, 'custom-rake preset buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/focus-timer.js'), /aria-pressed=\{phase\.id === p\.id\}/, 'focus-timer phase buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/qre-explorer.js'), /aria-pressed=\{activePreset === p\.id\}/, 'qre-explorer preset buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/qre-explorer.js'), /aria-pressed=\{selectedSpot === key\}/, 'qre-explorer spot buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/rake-solutions.js'), /aria-pressed=\{activeRake\.id === rk\.id\}/, 'rake-solutions preset buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/rake-solutions.js'), /aria-pressed=\{selectedPosition === p\}/, 'rake-solutions position buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/short-deck-trainer.js'), /aria-pressed=\{mode === m\}/, 'short-deck-trainer mode buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/multiway-preflop.js'), /aria-pressed=\{selectedScenario === key\}/, 'multiway-preflop scenario buttons must expose aria-pressed');
  assert.match(read('pages/hub/training/multi-table.js'), /aria-pressed=\{isSelected\}/, 'multi-table drill buttons must expose aria-pressed');
  assert.match(read('src/components/training/GodModeArena.jsx'), /aria-selected=\{reviewTab === tab\.id\}/, 'GodModeArena review tabs must expose aria-selected');
  assert.doesNotMatch(read('src/components/training/PreflopChartStats.jsx'), /#7c3aed|#a855f7|#fbbf24|rgba\(251,191,36/i, 'PreflopChartStats must not use banned purple/amber colors');

  // Codebase-wide zero-purple, zero-pink AND zero-gold/amber guard across ALL 95 Training route files + ALL mounted Training components
  const allTrainingPages = ['pages/hub/training.js', ...walkTrainingSource('pages/hub/training')];
  const BANNED_UI_COLOR_RE = /#(?:7c3aed|8b5cf6|a855f7|a78bfa|c084fc|6d28d9|5b21b6|9333ea|1e1b4b|ec4899|f472b6|fbbf24|f59e0b|eab308|d97706|ca8a04|facc15|fde68a|ffd700|f2b84b|d4a020|8b6914)\b|rgba\(\s*(?:124\s*,\s*58\s*,\s*237|139\s*,\s*92\s*,\s*246|168\s*,\s*85\s*,\s*247|192\s*,\s*132\s*,\s*252|236\s*,\s*72\s*,\s*153|244\s*,\s*114\s*,\s*182|251\s*,\s*191\s*,\s*36|245\s*,\s*158\s*,\s*11|234\s*,\s*179\s*,\s*8|250\s*,\s*204\s*,\s*21|202\s*,\s*138\s*,\s*4|255\s*,\s*215\s*,\s*0)\b/i;
  const bannedColorHits = [];
  for (const rel of allTrainingPages) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (BANNED_UI_COLOR_RE.test(lines[i])) bannedColorHits.push(`${rel}:${i + 1}`);
    }
  }
  const mountedTrainingUiComponents = [
    'src/components/training/BlockerScorePanel.jsx',
    'src/components/training/GTOQuestionCard.jsx',
    'src/components/training/LeaderboardPanel.jsx',
    'src/components/training/PerformanceTrends.jsx',
    'src/components/training/GameBadge.jsx',
    'src/components/training/RangeGrid.jsx',
    'src/components/training/Card.tsx',
    'src/components/training/PreflopChartStats.jsx',
    'src/components/training/GodModeArena.jsx',
    'src/components/training/games/UniversalDynamicTable.jsx',
    'src/components/training/TrainingGameEntry.jsx',
    'src/components/training/TrainingImageHeader.jsx',
    'src/components/training/TrainingPageHead.jsx',
    'src/components/training/lobby/TrainingGameCard.jsx',
    'src/components/training/lobby/TrainingFiltersSheet.jsx',
    'src/components/training/lobby/TrainingGamePreviewSheet.jsx',
  ];
  for (const rel of mountedTrainingUiComponents) {
    const lines = read(rel).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      // Physical casino chip denominations on the poker felt are authentic chip colors, not UI chrome
      if (rel.endsWith('UniversalDynamicTable.jsx') && /--chip-(?:face|rim|edge-1)/.test(lines[i])) continue;
      if (BANNED_UI_COLOR_RE.test(lines[i])) bannedColorHits.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(
    bannedColorHits,
    [],
    `Banned purple/violet/pink/gold/amber UI accents found in Training pages or mounted components:\n${bannedColorHits.join('\n')}`,
  );

  // 7. Gameplay table wiring, instant 52-card picker prefetch, editorial gto-news headlines, and Playwright layout spec
  const udt = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.doesNotMatch(udt, /PokerSoundManagerModule\.soundManager/, 'UniversalDynamicTable must import PokerSoundManager cleanly without nonexistent soundManager named export');
  assert.match(udt, /aria-selected=\{activeMode === mode\.id\}/, 'UniversalDynamicTable mode bar tabs must expose aria-selected');
  assert.match(udt, /aria-pressed=\{showRangeGrid\}/, 'UniversalDynamicTable Range toggle must expose aria-pressed');
  assert.match(udt, /aria-pressed=\{isCurrentBookmarked\}/, 'UniversalDynamicTable Save bookmark button must expose aria-pressed');

  const arena = read('src/components/training/GodModeArena.jsx');
  assert.match(arena, /aria-pressed=\{difficulty === d\}/, 'GodModeArena difficulty buttons must expose aria-pressed');
  assert.match(arena, /aria-pressed=\{timerMode === t\.id\}/, 'GodModeArena timer buttons must expose aria-pressed');

  const playingCard = read('src/components/poker/PlayingCard.jsx');
  assert.match(playingCard, /export function preloadArenaDeckCards\(/, 'PlayingCard must export preloadArenaDeckCards for instant 52-card picker loading');
  assert.match(read('pages/hub/training/hand-lab.js'), /preloadArenaDeckCards\(\)/, 'hand-lab must preload 52-card arena deck assets');
  assert.match(read('pages/hub/training/hand-lab.js'), /<PlayingCard arena priority card=\{card\}/, 'hand-lab picker cards must render with priority eager loading');
  assert.match(read('pages/hub/training/equity-calculator.js'), /preloadArenaDeckCards\(\)/, 'equity-calculator must preload 52-card arena deck assets');
  assert.match(read('pages/hub/training/equity-calculator.js'), /<PlayingCard arena priority card=\{card\}/, 'equity-calculator picker cards must render with priority eager loading');

  assert.match(gtoNews, /data-training-raw-control="true"[\s\S]{0,120}aria-expanded=\{expanded === a\.id\}/, 'gto-news article headline must use data-training-raw-control="true" so it renders as clean editorial copy');

  const layoutSpec = read('e2e/030-training-smarterdesign-layout.spec.ts');
  assert.match(layoutSpec, /getClientRects\(\)/, 'Playwright layout spec must enforce per-word Range.getClientRects() anti-slicing check');
  assert.match(layoutSpec, /Select Hole Card 1/, 'Playwright layout spec must verify Hand Lab 52-card picker and Escape dismiss');

  // 8. Phase 3 hardening: Escape-key dialog dismissal, Hand Comparison 52-card Club Arena deck,
  //    PostgreSQL 22P02 -> 404 API resilience, study-groups try/catch, and lazy sheet code-splitting
  assert.match(read('pages/hub/training/equity-calculator.js'), /event\.key === 'Escape'[\s\S]{0,60}onClose\(\)/, 'equity-calculator CardGrid must dismiss on Escape');
  const handComp = read('pages/hub/training/hand-comparison.js');
  assert.match(handComp, /preloadArenaDeckCards\(\)/, 'hand-comparison must preload 52-card arena deck assets');
  assert.match(handComp, /<PlayingCard arena priority card=\{card\}/, 'hand-comparison picker cards must render authentic Club Arena cards with priority');
  assert.match(handComp, /data-training-raw-control="true"/, 'hand-comparison 52-card picker buttons must stay unframed');
  assert.match(handComp, /event\.key === 'Escape'[\s\S]{0,60}onClose\(\)/, 'hand-comparison CardPicker must dismiss on Escape');
  const tiltGuard = read('pages/hub/training/tilt-guard.js');
  assert.match(tiltGuard, /event\.key === 'Escape'[\s\S]{0,60}onClose\(\)/, 'tilt-guard BreathingExercise must dismiss on Escape');
  assert.match(tiltGuard, /role="dialog"[\s\S]{0,60}aria-labelledby="breathing-title"/, 'tilt-guard BreathingExercise must expose dialog semantics');

  assert.match(read('pages/api/training/tournaments.js'), /code === '22P02'[\s\S]{0,160}status\(404\)/, 'tournaments API must convert PostgreSQL 22P02 invalid UUID syntax to 404 instead of 503');
  assert.match(read('pages/api/training/get-sessions.js'), /detailErr\?\.code === '22P02'[\s\S]{0,100}status\(404\)/, 'get-sessions API must convert PostgreSQL 22P02 invalid UUID syntax to 404 instead of 503');
  const tournamentDetail = read('pages/hub/training/tournament/[id].js');
  assert.match(tournamentDetail, /isValidTournamentId = typeof id === 'string' && UUID_RE\.test\(id\)/, 'tournament detail page must validate UUID before fetching /api/training/tournaments');
  assert.match(tournamentDetail, /latestData\?\.success === false \? 0 : 15000/, 'tournament detail page must stop SWR polling when tournament lookup fails');
  for (const apiPath of [
    'pages/api/training/study-groups.js',
    'pages/api/training/study-groups/[groupId].js',
    'pages/api/training/study-groups/[groupId]/messages.js',
  ]) {
    const apiSrc = read(apiPath);
    assert.match(apiSrc, /export default async function handler\(req, res\) \{\s*try \{/, `${apiPath} must wrap handler in top-level try/catch`);
    assert.match(apiSrc, /catch \(err\)[\s\S]{0,160}status\(500\)/, `${apiPath} must return structured JSON 500 on unexpected errors`);
  }

  assert.match(read('pages/hub/training.js'), /dynamic\(\s*\(\) => import\('\.\.\/\.\.\/src\/components\/training\/lobby\/TrainingFiltersSheet'\)/, 'training lobby must dynamically import TrainingFiltersSheet');
  assert.match(read('pages/hub/training.js'), /dynamic\(\s*\(\) => import\('\.\.\/\.\.\/src\/components\/training\/lobby\/TrainingGamePreviewSheet'\)/, 'training lobby must dynamically import TrainingGamePreviewSheet');
  assert.match(read('pages/hub/training/category/[categoryId].js'), /dynamic\(\s*\(\) => import\('\.\.\/\.\.\/\.\.\/\.\.\/src\/components\/training\/lobby\/TrainingFiltersSheet'\)/, 'category page must dynamically import TrainingFiltersSheet');
  assert.match(read('pages/hub/training/multiway-preflop.js'), /dynamic\(\(\) => import\('\.\.\/\.\.\/\.\.\/src\/components\/ui\/BottomSheet'\)/, 'multiway-preflop must dynamically import BottomSheet');
  assert.match(read('pages/hub/training/short-deck-trainer.js'), /dynamic\(\(\) => import\('\.\.\/\.\.\/\.\.\/src\/components\/ui\/BottomSheet'\)/, 'short-deck-trainer must dynamically import BottomSheet');
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

  // drill-builder must check getSession() before EVERY getUser() call and guard missing env vars in getSupabase()
  const drillBuilder = read('pages/hub/training/drill-builder.js');
  assert.match(drillBuilder, /if\s*\(!url\s*\|\|\s*!key\)\s*return\s*null;/, 'drill-builder.js getSupabase() must return null cleanly when Supabase env vars are absent');
  const getUserCount = (drillBuilder.match(/\.auth\.getUser\(\)/g) || []).length;
  const getSessionCount = (drillBuilder.match(/\.auth\.getSession\(\)/g) || []).length;
  assert.ok(getUserCount >= 1 && getSessionCount >= getUserCount, 'drill-builder.js must guard every auth.getUser() call with auth.getSession()');
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

test('anti-regression 107-game 1:1 Poker Arena parity, #SMARTERDESIGN coverage, strict 2-font discipline, and uncluttered HUD', async () => {
  const { TRAINING_LIBRARY } = await import('../src/data/TRAINING_LIBRARY.js');
  const { GAME_CONFIGS } = await import('../src/config/gameConfigs.js');
  const routerSrc = read('src/components/training/GameUIRouter.jsx');

  assert.equal(TRAINING_LIBRARY.length, 107, 'Canonical TRAINING_LIBRARY must contain all 107 games');

  // 1. Every single one of the 107 games must be explicitly mapped in GAME_TYPE_MAP and match GAME_CONFIGS seat format
  const routingMismatches = [];
  for (const game of TRAINING_LIBRARY) {
    const cfg = GAME_CONFIGS[game.id];
    if (!cfg) {
      routingMismatches.push(`${game.id}: missing GAME_CONFIGS entry`);
      continue;
    }
    const m = routerSrc.match(new RegExp(`'${game.id}'\\s*:\\s*'(6max|mtt|spins|heads-up)'`));
    if (!m) {
      routingMismatches.push(`${game.id}: missing explicit GAME_TYPE_MAP entry in GameUIRouter.jsx`);
      continue;
    }
    const mappedType = m[1];
    const fmt = String(cfg.format || '').toLowerCase();
    if (fmt.includes('heads-up') && mappedType !== 'heads-up') routingMismatches.push(`${game.id}: expected heads-up, got ${mappedType}`);
    if (fmt.includes('3-max') && mappedType !== 'spins') routingMismatches.push(`${game.id}: expected spins (3-Max), got ${mappedType}`);
    if (fmt.includes('9-max') && mappedType !== 'mtt') routingMismatches.push(`${game.id}: expected mtt (9-Max), got ${mappedType}`);
    if (fmt.includes('6-max') && mappedType !== '6max') routingMismatches.push(`${game.id}: expected 6max, got ${mappedType}`);
  }
  assert.deepEqual(
    routingMismatches,
    [],
    `Found 107-game routing or seat-count mismatches:\n${routingMismatches.join('\n')}`,
  );

  // 2. All 20 Psychology games (psy-001..psy-020) share the 1:1 Club Arena Poker Table stage & #SMARTERDESIGN chrome
  const psyUi = read('src/components/training/games/PsychologyTiltControlUI.jsx');
  assert.match(psyUi, /className="smarterdesign"/, 'PsychologyTiltControlUI must opt into .smarterdesign');
  assert.match(psyUi, /data-club-arena-table-stage="true"/, 'PsychologyTiltControlUI must render the 1:1 Club Arena table stage');
  assert.match(psyUi, /<PlayingCard arena /, 'PsychologyTiltControlUI must render authentic Club Arena cards');
  assert.match(psyUi, /chrome-readout\.webp/, 'PsychologyTiltControlUI felt stage must use #SMARTERDESIGN steel chrome rim');

  // 3. Every file in the 107-game launch & gameplay pipeline must have #SMARTERDESIGN and ZERO Orbitron / Courier New / monospace fonts
  const gameplayPipeline = [
    'pages/hub/training/play/[gameId].js',
    'pages/hub/training/arena/[gameId].js',
    'src/components/training/LevelSelector.tsx',
    'src/components/training/GodModeArena.jsx',
    'src/components/training/games/UniversalDynamicTable.jsx',
    'src/components/training/games/PsychologyTiltControlUI.jsx',
    'src/components/training/GTOQuestionCard.jsx',
    'src/components/training/TrainingGameEntry.jsx',
  ];
  for (const rel of gameplayPipeline) {
    const src = read(rel);
    assert.match(
      src,
      /smarterdesign|sd-panel|sd-button/,
      `${rel} must include #SMARTERDESIGN framing`,
    );
    assert.doesNotMatch(
      src,
      /Orbitron|Courier New|fontFamily[^;\n]*monospace/i,
      `${rel} must not use legacy Orbitron, Courier New, or monospace font stacks`,
    );
  }

  // 4. UniversalDynamicTable must keep duplicate SETTINGS unit toggle and STAKES badge inside the !presetOnly study tools disclosure
  const udt = read('src/components/training/games/UniversalDynamicTable.jsx');
  const disclosureIdx = udt.indexOf('{!presetOnly && <details');
  const settingsToggleIdx = udt.indexOf('data-unit-toggle-entry="settings"');
  const stakesBadgeIdx = udt.indexOf('data-training-stakes-badge="true"');
  assert.ok(disclosureIdx > 0, 'UniversalDynamicTable must keep {!presetOnly && <details disclosure');
  assert.ok(settingsToggleIdx > disclosureIdx, 'Duplicate SETTINGS unit toggle must live inside {!presetOnly && <details, never beside toolbar BB toggle');
  assert.ok(stakesBadgeIdx > disclosureIdx, 'STAKES badge must live inside {!presetOnly && <details so default table HUD stays uncluttered');

  // 5. Hardening guards for every visual/layout/data defect found during the 107-game Chromium click-through:
  // (a) Never treat Number(null) === 0 as finite HUD stats (prevents literal "null/null/--" on Villain seats)
  assert.doesNotMatch(
    udt,
    /hasHudStats\s*=\s*Number\.isFinite\(Number\(vpipVal\)\)/,
    'UniversalDynamicTable must guard vpipVal/pfrVal against null/empty before Number() so "null/null/--" can never render',
  );
  assert.match(udt, /isFiniteMetric\(vpipVal\)\s*&&\s*isFiniteMetric\(pfrVal\)/);
  assert.match(udt, /isFiniteSeatMetric\(vpipVal\)\s*&&\s*isFiniteSeatMetric\(pfrVal\)/);

  // (b) Toolbar seat-count badge must read authoritative playerCount (not activeGameFormat === "9max" which mislabeled MTT as 6-Max)
  assert.match(
    udt,
    /playerCount === 9 \? '9-Max' : playerCount === 3 \? '3-Max' : playerCount === 2 \? 'Heads-Up' : '6-Max'/,
    'Toolbar seat-count badge must derive 9-Max/6-Max/3-Max/Heads-Up from authoritative playerCount',
  );

  // (c) Desktop & Mobile Club Arena poker tables must never be crushed into a narrow sliver by fixed 100dvh overflow:hidden
  assert.match(udt, /flex:\s*1 0 495px !important;/, 'Desktop .sp-club-gto-table-area must enforce spacious above-the-fold Club Arena height');
  assert.match(udt, /flex:\s*1 0 380px !important;/, 'Mobile .sp-club-gto-table-area must enforce full-width readable Club Arena height instead of crushing to 220px');
  assert.match(udt, /potOverlayRow:\s*\{[\s\S]{0,160}flexWrap:\s*'wrap'/, 'Pot/SPR overlay row must wrap cleanly inside 9-Max felt without touching UTG+1/HJ seats');
  assert.doesNotMatch(udt, /styles\.questionOfPill/, 'Duplicate floating Question X Of Y pill must not overlap hero hole cards');

  // (c2) mtt-018 Button Warfare must resolve as a 9-Max MTT preset (preserving PLO4 variant) so seat count matches GAME_CONFIGS
  const presetsSrc = read('src/lib/training/trainingPresets.mjs');
  assert.match(
    presetsSrc,
    /gameId === 'mtt-018'[\s\S]{0,160}format:\s*'mtt'/,
    'mtt-018 Button Warfare must resolve format: "mtt" (9-Max) rather than inheriting 6-Max cash format',
  );
  const arena = read('src/components/training/GodModeArena.jsx');
  assert.doesNotMatch(
    arena,
    /fullScreenContainer:\s*\{[\s\S]{0,180}height:\s*'100dvh'/,
    'GodModeArena fullScreenContainer must allow full-height desktop poker table without vertical clipping',
  );
  assert.match(arena, /className="sd-panel"/, 'GodModeArena error/auth fallback card must use #SMARTERDESIGN .sd-panel');

  // (d) LevelSelector must not crush the 2-column .sp-level-header grid to 600px, and training.css must unify fonts to #SMARTERDESIGN
  const levelSel = read('src/components/training/LevelSelector.tsx');
  assert.doesNotMatch(
    levelSel,
    /header:\s*\{[\s\S]{0,160}maxWidth:\s*600/,
    'LevelSelector header must not constrain maxWidth to 600px against the 2-column .sp-level-header grid',
  );
  const trainingCss = read('src/styles/worlds/training.css');
  assert.match(
    trainingCss,
    /body\.world-training\s*\{[\s\S]{0,200}font-family:\s*var\(--font-inter,\s*Inter\)/,
    'body.world-training must set #SMARTERDESIGN Inter font so browser never falls back to Times',
  );
  assert.doesNotMatch(
    trainingCss,
    /Orbitron|jetbrains-mono|Share Tech Mono|Courier New|monospace/i,
    'src/styles/worlds/training.css must contain zero legacy Orbitron/monospace font declarations',
  );

  // (e) GTOQuestionCard feedback overlay must have enough height so Next Question / Practice Again / Report buttons never clip
  const qCard = read('src/components/training/GTOQuestionCard.jsx');
  assert.match(qCard, /minHeight:\s*'540px'/, 'GTOQuestionCard container must reserve >= 540px so feedback action buttons never clip');
});

test('anti-regression Phase 5: entire Training world (all 94 routes + all components + all modals) enforces strict 2-font #SMARTERDESIGN discipline, Solutions empty state, and null-metric guards', () => {
  const walkFiles = (dir) => {
    const out = [];
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return out;
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkFiles(rel));
      else if (/\.(js|jsx|ts|tsx|css)$/.test(ent.name) && !ent.name.includes('.test.')) out.push(rel);
    }
    return out;
  };

  // 1. ZERO legacy Orbitron / Courier New / JetBrains Mono / Share Tech Mono / ui-monospace / monospace font declarations across the entire Training world
  const allTrainingFiles = [
    'pages/hub/training.js',
    ...walkFiles('pages/hub/training'),
    ...walkFiles('src/components/training'),
    ...walkFiles('src/styles/training'),
    'src/components/poker/QuizAnswer.jsx',
    'src/styles/worlds/training.css',
  ];
  const offenders = [];
  const legacyFontRe = /(?:fontFamily|font-family|font)\s*[:=]\s*[^\n;{}]*(?:Orbitron|--font-orbitron|Courier New|JetBrains|Share Tech|ui-monospace|\bmonospace\b)/i;
  for (const rel of allTrainingFiles) {
    const src = read(rel);
    if (legacyFontRe.test(src)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Training world files must not declare legacy Orbitron/monospace fonts: ${offenders.join(', ')}`,
  );

  // 2. All 4 shared Training modals wear #SMARTERDESIGN framing
  for (const modalRel of [
    'src/components/training/CardSelectorModal.jsx',
    'src/components/training/LevelCompleteModal.jsx',
    'src/components/training/SessionSetupModal.jsx',
    'src/components/training/TrainerConfigModal.jsx',
  ]) {
    assert.match(read(modalRel), /smarterdesign/, `${modalRel} must opt into .smarterdesign framing`);
  }

  // 3. /hub/training/solutions renders a #SMARTERDESIGN empty-state card instead of a blank right pane
  const solutionsSrc = read('pages/hub/training/solutions.js');
  assert.match(solutionsSrc, /data-solutions-empty-detail="true"/, 'solutions.js must render a guided empty-state panel when no spot is selected');

  // 4. tournament-prep.js and daily-goals.js guard against Number(null) === 0 coercion
  const tourneyPrep = read('pages/hub/training/tournament-prep.js');
  assert.match(tourneyPrep, /isPositiveMetric\(saved\.buyIn\)/, 'tournament-prep.js must reject null/empty saved numeric fields before Number()');
  const dailyGoals = read('pages/hub/training/daily-goals.js');
  assert.match(dailyGoals, /hasValidStreakDays/, 'daily-goals.js must reject null/empty streakDays before Number()');
});
