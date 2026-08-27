import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const LOBBY = readFileSync(join(ROOT, 'src/components/trivia/TriviaLobby.jsx'), 'utf8');
const HUB_CSS = readFileSync(join(ROOT, 'src/styles/trivia/TriviaHub.module.css'), 'utf8');
const CARD_DEFINITIONS = LOBBY.slice(
    LOBBY.indexOf('const MODE_CARDS = ['),
    LOBBY.indexOf('const MODE_FILTERS = ['),
);

test('phase five keeps all thirteen modes, artwork files, and the established route handoff', () => {
    assert.equal((CARD_DEFINITIONS.match(/\n\s*id: '/g) || []).length, 13);
    assert.equal((CARD_DEFINITIONS.match(/image: '\/images\/trivia\/modes-v2\//g) || []).length, 13);
    assert.match(LOBBY, /router\.push\(getModeRoute\(modeId\)\)/);
});

test('mobile cards stay stacked with artwork before descriptions at a denser 4:3 ratio', () => {
    const cardStart = LOBBY.indexOf('<button\n                                key={mode.id}');
    const cardMarkup = LOBBY.slice(cardStart, LOBBY.indexOf('</button>', cardStart));

    assert.ok(cardMarkup.indexOf('mode-image-card__art') < cardMarkup.indexOf('mode-image-card__body'));
    assert.match(LOBBY, /\.mode-image-card__art \{[\s\S]*?aspect-ratio: 4 \/ 3;/);
    assert.match(LOBBY, /@media \(max-width: 700px\)[\s\S]*?\.mode-image-card \{[\s\S]*?flex-direction: column;/);
    assert.match(LOBBY, /@media \(max-width: 700px\)[\s\S]*?\.mode-image-card__art \{[\s\S]*?aspect-ratio: 4 \/ 3;/);
});

test('mobile browsing retains the filter rail and removes touch-only hover drift', () => {
    assert.match(LOBBY, /@media \(max-width: 700px\)[\s\S]*?\.mode-filters \{[\s\S]*?position: sticky;[\s\S]*?env\(safe-area-inset-top/);
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
