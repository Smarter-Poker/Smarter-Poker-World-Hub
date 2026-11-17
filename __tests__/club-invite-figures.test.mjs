/**
 * Club invite figures name their scope (Dan 2026-11-17).
 *
 * The preview text, preview image and landing page print the two lines the
 * database words (fn_club_share_figures): measured members of this club, and
 * distinct players on the floor it plays on, naming that union or the club.
 * They never print raw counts with their own label, never print an
 * unavailable figure as zero, and never fold a configured addition in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inviteDescription, inviteFigureLines } from '../src/lib/clubInvite.js';

const page = readFileSync(new URL('../pages/i/[code].js', import.meta.url), 'utf8');
const og = readFileSync(new URL('../pages/api/og/club-invite.js', import.meta.url), 'utf8');

test('club members and union activity travel as two separately named lines', () => {
    const lines = inviteFigureLines({
        member_count: 152,
        players_playing: 314,
        members_line: '152 Members In KINGS CLUB',
        activity_line: '314 Playing Across Midway Union Now',
    });
    assert.deepEqual(lines, ['152 Members In KINGS CLUB', '314 Playing Across Midway Union Now']);
    assert.equal(
        inviteDescription(lines),
        '152 Members In KINGS CLUB. 314 Playing Across Midway Union Now. Create Your Free Smarter.Poker Account And Join The Club.'
    );
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
    assert.match(page, /const description = inviteDescription\(club\.figureLines\);/);
    assert.match(page, /club\.figureLines\.map\(/);
});
