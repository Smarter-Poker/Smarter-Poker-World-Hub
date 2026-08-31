import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateWorldMenuActivation,
  getActiveWorldMenuHref,
  isModifiedNavigationEvent,
  parseWorldMenuHref,
} from '../src/lib/world-menu/navigationState.mjs';

test('navigation state selects one exact, query-aware command', () => {
  const items = [
    { href: '/hub/news' },
    { href: '/hub/news?tab=videos' },
    { href: '/hub/news?tab=reels' },
    { href: '/hub/news?filter=bookmarks' },
  ];

  assert.equal(getActiveWorldMenuHref('/hub/news', items), '/hub/news');
  assert.equal(getActiveWorldMenuHref('/hub/news?tab=videos', items), '/hub/news?tab=videos');
  assert.equal(
    getActiveWorldMenuHref('/hub/news?utm_source=app&filter=bookmarks', items),
    '/hub/news?filter=bookmarks'
  );
  assert.equal(getActiveWorldMenuHref('/hub/news?tab=unknown', items), '/hub/news');
});

test('navigation state supports one declared default and longest nested path', () => {
  const defaults = [
    { href: '/hub/bankroll-manager?view=dashboard', defaultForPath: true },
    { href: '/hub/bankroll-manager?view=reports' },
  ];
  assert.equal(
    getActiveWorldMenuHref('/hub/bankroll-manager', defaults),
    '/hub/bankroll-manager?view=dashboard'
  );

  const nested = [
    { href: '/hub/training' },
    { href: '/hub/training/progress' },
  ];
  assert.equal(
    getActiveWorldMenuHref('/hub/training/progress/session/42', nested),
    '/hub/training/progress'
  );
});

test('URL parsing normalizes trailing slashes without losing query state', () => {
  const parsed = parseWorldMenuHref('/hub/news///?tab=videos#top');
  assert.equal(parsed.pathname, '/hub/news');
  assert.equal(parsed.searchParams.get('tab'), 'videos');
});

test('rapid primary activation is single-flight and preserves modified clicks', () => {
  const first = evaluateWorldMenuActivation({ href: '/hub/training', now: 1_000 });
  assert.equal(first.allow, true);
  assert.equal(first.modified, false);

  const duplicate = evaluateWorldMenuActivation({
    href: '/hub/training/progress', lock: first.nextLock, now: 1_001,
  });
  assert.equal(duplicate.allow, false);
  assert.equal(duplicate.nextLock.href, '/hub/training');

  const afterWindow = evaluateWorldMenuActivation({
    href: '/hub/training/progress', lock: first.nextLock, now: 2_201,
  });
  assert.equal(afterWindow.allow, true);

  const modifiedEvent = { ctrlKey: true, button: 0 };
  assert.equal(isModifiedNavigationEvent(modifiedEvent), true);
  const modified = evaluateWorldMenuActivation({
    event: modifiedEvent, href: '/hub/training/progress', lock: first.nextLock, now: 1_001,
  });
  assert.equal(modified.allow, true);
  assert.equal(modified.modified, true);
  assert.equal(modified.nextLock, first.nextLock);
});
