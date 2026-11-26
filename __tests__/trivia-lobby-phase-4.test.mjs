import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TRIVIA_MIDDLE_MODES } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const LOBBY = readFileSync(join(ROOT, 'src/components/trivia/TriviaLobby.jsx'), 'utf8');
const HUB_CSS = readFileSync(join(ROOT, 'src/styles/trivia/TriviaHub.module.css'), 'utf8');
const FRAME_CARD = readFileSync(join(ROOT, 'src/components/trivia/console/TriviaFrameCard.jsx'), 'utf8');
const FRAME_CARD_CSS = readFileSync(join(ROOT, 'src/components/trivia/console/TriviaFrameCard.module.css'), 'utf8');

test('phase five keeps all thirteen modes, artwork files, and the established route handoff', () => {
    assert.equal(TRIVIA_MIDDLE_MODES.length, 13);
    assert.ok(TRIVIA_MIDDLE_MODES.every(mode => mode.image.startsWith('/images/trivia/modes-console-v1/')));
    assert.match(LOBBY, /router\.push\(getModeRoute\(modeId\)\)/);
});

test('mobile cards stay stacked on #SMARTERDESIGN with zero broken raster images', () => {
    assert.match(LOBBY, /className=\{`sd-panel mode-card/);
    assert.doesNotMatch(LOBBY, /<img\b/);
    assert.match(FRAME_CARD_CSS, /\.card \{[\s\S]*?flex-direction: column;/);
    assert.match(FRAME_CARD_CSS, /\.art \{[^}]*object-fit: contain;/);
    assert.match(LOBBY, /@media \(max-width: 640px\)[\s\S]*?\.modes-grid \{[\s\S]*?grid-template-columns: 1fr;/);
});

test('mobile browsing retains the filter rail and has no hover-only interaction', () => {
    assert.match(LOBBY, /\.mode-filters \{/);
    assert.match(HUB_CSS, /overflow-x: clip;/);
    assert.doesNotMatch(HUB_CSS, /overflow-x: hidden;/);
    assert.match(LOBBY, /touch-action: manipulation/);
    assert.match(FRAME_CARD_CSS, /touch-action: manipulation/);
    assert.doesNotMatch(LOBBY, /:hover|whileHover|onMouseEnter/);
    assert.doesNotMatch(FRAME_CARD_CSS, /:hover/);
    assert.match(LOBBY, /\.mode-card__action:focus-visible/);
    assert.match(FRAME_CARD_CSS, /\.card:focus-visible/);
});

test('phase four preserves reduced-motion and adds high-contrast visual fallbacks', () => {
    assert.match(LOBBY, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(LOBBY, /@media \(prefers-contrast: more\)/);
});
