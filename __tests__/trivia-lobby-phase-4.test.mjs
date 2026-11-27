import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TRIVIA_MIDDLE_MODES } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const LOBBY = readFileSync(join(ROOT, 'src/components/trivia/TriviaLobby.jsx'), 'utf8');
const LOBBY_CSS = readFileSync(join(ROOT, 'src/components/trivia/TriviaLobby.module.css'), 'utf8');
const HUB_CSS = readFileSync(join(ROOT, 'src/styles/trivia/TriviaHub.module.css'), 'utf8');
const FRAME_CARD_CSS = readFileSync(join(ROOT, 'src/components/trivia/console/TriviaFrameCard.module.css'), 'utf8');

test('canonical modes, legacy artwork files, and the established route handoff remain available', () => {
    assert.equal(TRIVIA_MIDDLE_MODES.length, 13);
    assert.ok(TRIVIA_MIDDLE_MODES.every(mode => mode.image.startsWith('/images/trivia/modes-console-v1/')));
    assert.match(LOBBY, /router\.push\(getModeRoute\(modeId\)\)/);
});

test('mobile cards use the approved two-column grid and preserve image proportions', () => {
    assert.match(LOBBY, /className=\{`mode-card /);
    assert.match(LOBBY, /<TriviaModeArt mode=\{mode\}/);
    assert.match(FRAME_CARD_CSS, /\.card \{[\s\S]*?flex-direction: column;/);
    assert.match(FRAME_CARD_CSS, /\.art \{[^}]*object-fit: contain;/);
    assert.match(LOBBY_CSS, /\.gameGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(LOBBY_CSS, /\.art img\s*\{[^}]*object-fit:\s*cover;/);
});

test('mobile browsing keeps labelled search, touch controls and visible keyboard focus without hover-only interactions', () => {
    assert.match(LOBBY, /type="search"/);
    assert.match(HUB_CSS, /overflow-x: clip;/);
    assert.doesNotMatch(HUB_CSS, /overflow-x: hidden;/);
    assert.match(LOBBY_CSS, /touch-action: manipulation/);
    assert.match(FRAME_CARD_CSS, /touch-action: manipulation/);
    assert.doesNotMatch(`${LOBBY}\n${LOBBY_CSS}`, /:hover|whileHover|onMouseEnter/);
    assert.doesNotMatch(FRAME_CARD_CSS, /:hover/);
    assert.match(LOBBY_CSS, /\.lobby button:focus-visible/);
    assert.match(FRAME_CARD_CSS, /\.card:focus-visible/);
});

test('phase four preserves reduced-motion and high-contrast visual fallbacks', () => {
    assert.match(LOBBY_CSS, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(LOBBY_CSS, /@media \(prefers-contrast: more\)/);
});
