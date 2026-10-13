import test from 'node:test';
import assert from 'node:assert/strict';
import { RECENT_SEARCH_KEY, cleanRecentSearch, normalizeRecentSearches, rememberSearch, readRecentSearches, writeRecentSearches } from '../src/lib/videoLibraryRecentSearches.mjs';

test('recent searches validate, deduplicate and bound local history', () => {
    assert.equal(cleanRecentSearch(null), '');
    assert.equal(cleanRecentSearch('  PLO\u0000  '), 'PLO');
    assert.equal(cleanRecentSearch('x'.repeat(100)).length, 80);
    assert.deepEqual(normalizeRecentSearches(['PLO', 'plo', null, ' ', 'NLH']), ['PLO', 'NLH']);
    assert.equal(normalizeRecentSearches(Array.from({ length: 15 }, (_, i) => String(i))).length, 8);
    assert.deepEqual(rememberSearch(['PLO', 'NLH'], 'nlh'), ['nlh', 'PLO']);
});

test('recent searches survive reload, clear storage and fail safely', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
    assert.equal(writeRecentSearches(storage, ['PLO']), true);
    assert.deepEqual(readRecentSearches(storage), ['PLO']);
    assert.equal(writeRecentSearches(storage, []), true);
    assert.equal(data.has(RECENT_SEARCH_KEY), false);
    data.set(RECENT_SEARCH_KEY, '{bad');
    assert.deepEqual(readRecentSearches(storage), []);
    data.set(RECENT_SEARCH_KEY, '{"bad":true}');
    assert.deepEqual(readRecentSearches(storage), []);
    const unavailable = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } };
    assert.deepEqual(readRecentSearches(unavailable), []);
    assert.equal(writeRecentSearches(unavailable, ['PLO']), false);
});
