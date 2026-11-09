// Dan, 2026-10-11 (Training unhidden 2026-11-09): Club Commander, Personal
// Assistant, and Trivia cards are hidden on the World Hub for every account
// except his; Training Games are visible to all accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    OWNER_ONLY_HUB_CARD_IDS,
    getOwnerOnlyHiddenCardIds,
} from '../src/config/ownerOnlyHubCards.js';

const DAN_IDS = ['47965354-0e56-43ef-931c-ddaab82af765', '3bb71bfe-f723-427c-aac7-a853ba04a014'];

test('the three remaining owner-only cards are hidden from everyone else while Training is public', () => {
    assert.deepEqual([...OWNER_ONLY_HUB_CARD_IDS].sort(),
        ['club-commander', 'personal-assistant', 'trivia']);
    assert.equal(OWNER_ONLY_HUB_CARD_IDS.includes('training'), false);
    for (const id of ['00000000-0000-0000-0000-000000000000', null, undefined, '']) {
        const hidden = getOwnerOnlyHiddenCardIds(id);
        assert.deepEqual([...hidden].sort(), [...OWNER_ONLY_HUB_CARD_IDS].sort());
        assert.equal(hidden.includes('training'), false, 'training card must be visible to all users');
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
    const search = readFileSync(new URL('../src/world/components/GlobalSearch.tsx', import.meta.url), 'utf8');
    assert.match(search, /getOwnerOnlyHiddenCardIds/);
    assert.match(search, /TRAINING_LIBRARY/);
    assert.doesNotMatch(search, /console\.log\('Selected:'/);
});
