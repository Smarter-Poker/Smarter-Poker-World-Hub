import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { TRIVIA_MIDDLE_MODES } from '../src/config/triviaModeRegistry.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const SKELETON = read('src/components/trivia/TriviaSkeleton.jsx');
const SKELETON_CSS = read('src/components/trivia/TriviaSkeleton.module.css');
const LOBBY = read('src/components/trivia/TriviaLobby.jsx');
const HUB_PAGE = read('pages/hub/trivia/index.js');
const HUB_CSS = read('src/styles/trivia/TriviaHub.module.css');

test('the trivia loading state uses scoped CSS instead of hydration-sensitive style text', () => {
    assert.match(SKELETON, /import styles from '\.\/TriviaSkeleton\.module\.css'/);
    assert.doesNotMatch(SKELETON, /<style>/);
    assert.doesNotMatch(SKELETON, /<style jsx/);
    assert.match(SKELETON, /className=\{styles\.container\}/);
    assert.match(SKELETON_CSS, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(SKELETON_CSS, /\.shimmerBlock::after/);
});

test('the trivia page shell also keeps CSS out of server-rendered style text', () => {
    assert.match(HUB_PAGE, /import styles from '\.\.\/\.\.\/\.\.\/src\/styles\/trivia\/TriviaHub\.module\.css'/);
    assert.doesNotMatch(HUB_PAGE, /<style>/);
    assert.doesNotMatch(HUB_PAGE, /<style jsx/);
    assert.match(HUB_PAGE, /className=\{styles\.page\}/);
    assert.match(HUB_CSS, /\.backgroundOverlay/);
});

test('mode filters support roving keyboard navigation and keep the active choice visible', () => {
    assert.match(LOBBY, /ref=\{filterRailRef\}/);
    assert.match(LOBBY, /filterButtonRefs\.current\[filterIndex\]/);
    assert.match(LOBBY, /case 'ArrowRight'/);
    assert.match(LOBBY, /case 'ArrowLeft'/);
    assert.match(LOBBY, /case 'Home'/);
    assert.match(LOBBY, /case 'End'/);
    assert.match(LOBBY, /tabIndex=\{activeFilter === filter\.id \? 0 : -1\}/);
    assert.match(LOBBY, /rail\.scrollTo\(/);
    assert.match(LOBBY, /prefers-reduced-motion: reduce/);
});

test('phase five keeps every game definition, artwork, and destination intact', () => {
    assert.equal(TRIVIA_MIDDLE_MODES.length, 13);
    assert.ok(TRIVIA_MIDDLE_MODES.every(mode => mode.image.startsWith('/images/trivia/modes-v2/')));
    assert.match(LOBBY, /router\.push\(getModeRoute\(modeId\)\)/);
});
