import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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
  assert.match(worldCss, /body\.world-training dialog::backdrop/, 'training.css must style Training dialog backdrops');

  // Category page adopts TrainingLobby brushed-chrome controls
  const categoryPage = read('pages/hub/training/category/[categoryId].js');
  assert.match(categoryPage, /lobbyStyles\.chromeButton/, 'Category page controls must adopt #SMARTERDESIGN brushed-chrome buttons');
  assert.match(categoryPage, /lobbyStyles\.searchWell/, 'Category page search must adopt #SMARTERDESIGN search well');

  // All Training popups/modals/drawers/toasts adopt #SMARTERDESIGN and contain zero legacy #1a1a2e / FB_DARK / forbidden gold-purple chrome
  const upgradedPopups = [
    'src/components/training/CardSelectorModal.jsx',
    'src/components/training/LevelCompleteModal.jsx',
    'src/components/training/TrainingSettingsMenu.jsx',
    'src/components/training/TrainingSignInPrompt.jsx',
    'src/components/training/TrainingQuestionReport.jsx',
    'src/components/training/AchievementToast.jsx',
    'src/components/training/LeakFixerIntercept.jsx',
    'src/components/training/TrainerConfigModal.jsx',
  ];
  for (const rel of upgradedPopups) {
    const src = read(rel);
    assert.doesNotMatch(src, /#1a1a2e|#18191A|#7c3aed|#fbbf24|#f59e0b|#FFD700/i, `${rel} must not contain legacy flat/gold/purple styling`);
  }
  assert.match(read('src/components/training/CardSelectorModal.jsx'), /role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(read('src/components/training/LevelCompleteModal.jsx'), /role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(read('src/components/training/TrainingSettingsMenu.jsx'), /role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(read('src/components/training/LeakFixerIntercept.jsx'), /role="dialog"[\s\S]*?aria-modal="true"/);
});
