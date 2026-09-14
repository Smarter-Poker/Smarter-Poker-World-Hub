import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TRIVIA_MIDDLE_MODES } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const LOBBY = readFileSync(join(ROOT, 'src/components/trivia/TriviaLobby.jsx'), 'utf8');
const HUB_CSS = readFileSync(join(ROOT, 'src/styles/trivia/TriviaHub.module.css'), 'utf8');

test('phase five keeps all thirteen modes, artwork files, and the established route handoff', () => {
    assert.equal(TRIVIA_MIDDLE_MODES.length, 13);
    assert.ok(TRIVIA_MIDDLE_MODES.every(mode => mode.image.startsWith('/images/trivia/modes-v2/')));
    assert.match(LOBBY, /router\.push\(getModeRoute\(modeId\)\)/);
});

test('mobile cards stay stacked with artwork before descriptions at a denser 4:3 ratio', () => {
    const cardStart = LOBBY.indexOf('<button\n                                key={mode.id}');
    const cardMarkup = LOBBY.slice(cardStart, LOBBY.indexOf('</button>', cardStart));

    assert.ok(cardMarkup.indexOf('mode-image-card__art') < cardMarkup.indexOf('mode-image-card__body'));
    assert.match(LOBBY, /\.mode-image-card__art \{[\s\S]*?aspect-ratio: 4 \/ 3;/);
    // PIN MOVED (mobile phase 7, 2026-09-14): the phone block is at 768px.
    assert.match(LOBBY, /@media \(max-width: 768px\)[\s\S]*?\.mode-image-card \{[\s\S]*?flex-direction: column;/);
    assert.match(LOBBY, /@media \(max-width: 768px\)[\s\S]*?\.mode-image-card__art \{[\s\S]*?aspect-ratio: 4 \/ 3;/);
});

test('mobile browsing keeps every filter on screen and removes touch-only hover drift', () => {
    // PIN MOVED (mobile phase 7, 2026-09-14). This used to pin the filter
    // RAIL: a sticky strip under the header that scrolled sideways (715px of
    // chips in 357px at 375). The always-displayed standard forbids the rail;
    // the filters are a wrapping grid, two columns on a phone, and a block two
    // rows tall is not pinned under the header.
    assert.match(LOBBY, /\.mode-filters \{[\s\S]*?display: grid;/);
    assert.match(LOBBY, /@media \(max-width: 768px\)[\s\S]*?\.mode-filters \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.doesNotMatch(LOBBY, /\.mode-filters \{[^}]*position: sticky/);
    assert.match(HUB_CSS, /overflow-x: clip;/);
    assert.doesNotMatch(HUB_CSS, /overflow-x: hidden;/);
    assert.match(LOBBY, /touch-action: manipulation/);
    assert.match(LOBBY, /@media \(hover: none\)/);
    assert.match(LOBBY, /\.dm-hitbox:focus-visible/);
});

test('phase four preserves reduced-motion and adds high-contrast visual fallbacks', () => {
    assert.match(LOBBY, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(LOBBY, /@media \(prefers-contrast: more\)/);
});
