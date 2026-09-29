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

test('mobile cards stay stacked with full artwork before descriptions', () => {
    const cardStart = LOBBY.indexOf('<TriviaFrameCard');
    const cardMarkup = LOBBY.slice(cardStart, LOBBY.indexOf('</TriviaFrameCard>', cardStart));

    assert.ok(cardStart > -1, 'Lobby must use the shared painted frame card');
    assert.match(cardMarkup, /image=\{mode\.image\}/);
    assert.match(cardMarkup, /frameLabel=\{mode\.name\}/);
    assert.ok(FRAME_CARD.indexOf('className={styles.visual}') < FRAME_CARD.indexOf('className={styles.copy}'));
    assert.match(FRAME_CARD_CSS, /\.card \{[\s\S]*?flex-direction: column;/);
    // Scoped to the .art block itself so a later rule cannot satisfy it.
    assert.match(FRAME_CARD_CSS, /\.art \{[^}]*object-fit: contain;/);
    assert.match(LOBBY, /@media \(max-width: 700px\)[\s\S]*?\.mode-image-card \{[\s\S]*?flex-direction: column;/);
});

test('mobile browsing retains the filter rail and has no hover-only interaction', () => {
    assert.match(LOBBY, /@media \(max-width: 700px\)[\s\S]*?\.mode-filters \{[\s\S]*?position: sticky;[\s\S]*?env\(safe-area-inset-top/);
    assert.match(HUB_CSS, /overflow-x: clip;/);
    assert.doesNotMatch(HUB_CSS, /overflow-x: hidden;/);
    assert.match(LOBBY, /touch-action: manipulation/);
    assert.match(FRAME_CARD_CSS, /touch-action: manipulation/);
    assert.doesNotMatch(LOBBY, /:hover|whileHover|onMouseEnter/);
    assert.doesNotMatch(FRAME_CARD_CSS, /:hover/);
    assert.match(LOBBY, /\.dm-hitbox:focus-visible/);
    assert.match(FRAME_CARD_CSS, /\.card:focus-visible/);
});

test('phase four preserves reduced-motion and adds high-contrast visual fallbacks', () => {
    assert.match(LOBBY, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(LOBBY, /@media \(prefers-contrast: more\)/);
});
