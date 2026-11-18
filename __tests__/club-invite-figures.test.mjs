/**
 * Club invite figures name their scope (Dan 2026-11-17).
 *
 * The preview text, preview image and landing page share the database wording,
 * including the separately disclosed Kings Club totals and measured union line.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inviteDescription, inviteFigureLines, inviteHeadline } from '../src/lib/clubInvite.js';

const page = readFileSync(new URL('../pages/i/[code].js', import.meta.url), 'utf8');
const og = readFileSync(new URL('../pages/api/og/club-invite.js', import.meta.url), 'utf8');

test('Kings Club totals carry their disclosures ahead of measured union activity', () => {
    const members = '1,652 KINGS CLUB Member Display Total (+1,500 Configured)';
    const active = '146 KINGS CLUB Active Display Total (+145 Configured)';
    const union = '314 Players Across Midway Union Now · Includes Horses';
    const lines = inviteFigureLines({
        member_count: 152,
        players_playing: 314,
        members_line: members,
        club_active_display_line: active,
        activity_line: union,
    });
    assert.deepEqual(lines, [members, active, union]);
    assert.equal(
        inviteDescription(lines),
        `${members}. ${active}. ${union}. Create Your Free Smarter.Poker Account And Join The Club.`
    );
});

test('the preview opens with the copied message headline and the Club ID', () => {
    assert.equal(inviteHeadline('KingFish', 'KINGS CLUB'), 'KingFish Invited You To Join KINGS CLUB On Smarter.Poker!');
    assert.equal(
        inviteDescription(['152 Members In KINGS CLUB', '314 Playing Across Midway Union Now'], 25450),
        'Club ID: 25450. 152 Members In KINGS CLUB. 314 Playing Across Midway Union Now. Create Your Free Smarter.Poker Account And Join The Club.'
    );
    assert.match(page, /const headline = inviteHeadline\(inviter\.alias, club\.name\);/);
    assert.match(page, /inviteDescription\(club\.figureLines, club\.clubNumber\)/);
    assert.match(page, /Club ID: \{club\.clubNumber\}/);
    assert.match(og, /`Club ID: \$\{clubNumber\}`/);
});

test("the union's own row keeps its across-the-union member line", () => {
    assert.deepEqual(inviteFigureLines({ members_line: '3,154 Members Across Midway Union', activity_line: '306 Playing Across Midway Union Now' }), [
        '3,154 Members Across Midway Union',
        '306 Playing Across Midway Union Now',
    ]);
});

test('a club with no union keeps its club-scoped line', () => {
    assert.deepEqual(inviteFigureLines({ members_line: '9 Members In Solo Room', activity_line: '2 Playing In Solo Room Now' }), [
        '9 Members In Solo Room',
        '2 Playing In Solo Room Now',
    ]);
});

test('an unavailable figure is left out, never printed as zero or replaced by a raw count', () => {
    const lines = inviteFigureLines({ member_count: 152, players_playing: null, members_line: '152 Members In KINGS CLUB', activity_line: null });
    assert.deepEqual(lines, ['152 Members In KINGS CLUB']);
    assert.doesNotMatch(inviteDescription(lines), /Playing|\b0\b/);
    // Raw counts without the database's wording are not printed.
    assert.deepEqual(inviteFigureLines({ member_count: 152, players_playing: 314 }), []);
    assert.equal(inviteDescription([]), 'Create Your Free Smarter.Poker Account And Join The Club.');
    assert.deepEqual(inviteFigureLines(null), []);
});

test('preview text, preview image and landing page all print the same lines', () => {
    for (const [name, src] of [['landing page', page], ['preview image', og]]) {
        assert.match(src, /inviteFigureLines\(/, `${name} reads the shared lines`);
        assert.doesNotMatch(src, /Playing Now`/, `${name} prints no self-labelled raw count`);
        assert.doesNotMatch(src, /member_count|players_playing/, `${name} reads no raw count`);
    }
    assert.match(page, /club\.figureLines\.map\(/);
});

test('the preview image prints each figure line whole, so the Horse disclosure is never cut off', () => {
    assert.doesNotMatch(og, /line\.slice\(/);
    assert.match(og, /\{line\}/);
});
