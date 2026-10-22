// Dan, 2026-10-11: Club Commander, Personal Assistant, Training and Trivia
// cards are hidden on the World Hub for every account except his.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    OWNER_ONLY_HUB_CARD_IDS,
    getOwnerOnlyHiddenCardIds,
} from '../src/config/ownerOnlyHubCards.js';

const DAN_IDS = ['47965354-0e56-43ef-931c-ddaab82af765', '3bb71bfe-f723-427c-aac7-a853ba04a014'];

test('the four cards are hidden from everyone else, signed out included', () => {
    assert.deepEqual([...OWNER_ONLY_HUB_CARD_IDS].sort(),
        ['club-commander', 'personal-assistant', 'training', 'trivia']);
    for (const id of ['00000000-0000-0000-0000-000000000000', null, undefined, '']) {
        assert.deepEqual(getOwnerOnlyHiddenCardIds(id).sort(), [...OWNER_ONLY_HUB_CARD_IDS].sort());
    }
});

test('Dan still sees them on both of his accounts', () => {
    for (const id of DAN_IDS) assert.deepEqual(getOwnerOnlyHiddenCardIds(id), []);
});

test('carousel and customizer apply the rule without a quick-launch footer', () => {
    const hub = readFileSync(new URL('../src/world/WorldHub.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(hub, /getFooterCards|footerCards|<FooterCard/);
    assert.match(hub, /orbs\.filter\(o => !effectiveHiddenIds\.includes\(o\.id\)/);
    const panel = readFileSync(new URL('../src/world/components/CardCustomizerPanel.tsx', import.meta.url), 'utf8');
    assert.match(panel, /ownerOnlyHidden\.includes\(orb\.id\)\) return false/);
});
