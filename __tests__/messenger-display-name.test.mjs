import test from 'node:test';
import assert from 'node:assert/strict';
import { messengerDisplayName, withMessengerDisplayName, MESSENGER_PROFILE_COLUMNS } from '../src/lib/messengerDisplayName.mjs';

test('owner rule: a player with no chosen name shows as Player #<number>, never Unknown', () => {
    assert.equal(messengerDisplayName({ id: 'a', display_name: null, username: '  ', player_number: '1117' }), 'Player #1117');
    assert.equal(messengerDisplayName({ id: 'a', player_number: 1250 }), 'Player #1250');
});

test('chosen names win in order: display name, username, alias', () => {
    assert.equal(messengerDisplayName({ display_name: 'Dan', username: 'kingfish', player_number: '1' }), 'Dan');
    assert.equal(messengerDisplayName({ username: 'kingfish', alias: 'KF', player_number: '1' }), 'kingfish');
    assert.equal(messengerDisplayName({ alias: 'KF', player_number: '1' }), 'KF');
});

test('the protected real name is never read or used', () => {
    assert.equal(MESSENGER_PROFILE_COLUMNS.includes('full_name'), false);
    assert.equal(messengerDisplayName({ full_name: 'Real Name', player_number: '7' }), 'Player #7');
});

test('a deleted account (no profile) has no name, so callers drop the row', () => {
    assert.equal(messengerDisplayName(null), null);
    assert.equal(withMessengerDisplayName(undefined), null);
});

test('display name is filled but the username used for profile links is untouched', () => {
    assert.deepEqual(withMessengerDisplayName({ id: 'x', username: null, player_number: '9' }), { id: 'x', username: null, player_number: '9', display_name: 'Player #9' });
});
