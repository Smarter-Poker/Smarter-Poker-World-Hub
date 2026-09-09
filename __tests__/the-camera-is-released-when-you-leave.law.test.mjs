/**
 * THE CAMERA IS RELEASED WHEN YOU LEAVE (2026-09-08, BINDING)
 *
 * The shared MediaStream is cached at module scope on purpose: stopping tracks
 * and re-acquiring them inside one page session is what makes iOS re-engage its
 * permission UI, and "ask me every single time" was the original bug report.
 *
 * The cost of that cache is that SOMETHING has to release it. Until this law,
 * nothing did. GoLiveModal's teardown declined to stop the stream and pointed at
 * a "page-level layout" handler that did not exist; a repo-wide search for
 * releaseMediaStream({force:true}) returned exactly one caller, the black-frame
 * watchdog inside the modal itself. So the camera and mic survived modal close,
 * every client-side navigation, and logout - until a full page reload.
 *
 * This law pins the two boundaries where release is correct, and deliberately
 * does NOT ask for release on modal unmount, because that is the iOS bug.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  isStreamingSurface,
  releaseMediaStreamOnLeave,
  releaseMediaStreamOnLogout,
  STREAMING_SURFACES,
} from '../src/lib/mediaStreamSingleton.js';

const ROOT = process.cwd();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('the streaming surfaces are the ones that actually mount the camera UI', () => {
  assert.ok(STREAMING_SURFACES.length > 0, 'no streaming surfaces declared');
  // Every route that renders GoLiveModal must be covered, or leaving it will
  // not release. This is the check that catches a new streaming page.
  const hosts = ['pages/hub/social-media/index.js', 'pages/hub/social-pages/[pageId].js'];
  for (const h of hosts) {
    if (!/GoLiveModal/.test(read(h))) continue;
    const route = '/' + h.replace(/^pages\//, '').replace(/\/index\.js$/, '').replace(/\.js$/, '');
    const covered = STREAMING_SURFACES.some((s) => route === s || route.startsWith(s + '/'));
    assert.ok(covered, `${h} mounts GoLiveModal but ${route} is not a declared streaming surface`);
  }
});

test('isStreamingSurface matches surfaces and their children, and nothing else', () => {
  assert.equal(isStreamingSurface('/hub/social-media'), true);
  assert.equal(isStreamingSurface('/hub/social-media?compose=1'), true, 'query must not defeat it');
  assert.equal(isStreamingSurface('/hub/social-pages/abc-123'), true, 'children count');
  assert.equal(isStreamingSurface('/hub/lives'), true);
  assert.equal(isStreamingSurface('/hub/friends'), false);
  assert.equal(isStreamingSurface('/hub/messenger'), false);
  assert.equal(isStreamingSurface('/'), false);
  assert.equal(isStreamingSurface(undefined), false);
  // A prefix that merely starts with the same characters is NOT a child.
  assert.equal(isStreamingSurface('/hub/social-media-archive'), false);
});

test('leaving a streaming surface releases; moving between them does not', () => {
  assert.equal(
    releaseMediaStreamOnLeave('/hub/social-media', '/hub/friends'),
    true,
    'navigating off the streaming surface must release the camera'
  );
  assert.equal(
    releaseMediaStreamOnLeave('/hub/social-media', '/hub/social-pages/abc'),
    false,
    'moving between two streaming surfaces must NOT release - that is the iOS re-prompt bug'
  );
  assert.equal(
    releaseMediaStreamOnLeave('/hub/friends', '/hub/messenger'),
    false,
    'never held the camera, nothing to release'
  );
  assert.equal(releaseMediaStreamOnLogout(), true, 'logout always releases');
});

test('_app releases on routeChangeStart, and the logout path releases too', () => {
  const app = read('pages/_app.js');
  assert.match(app, /releaseMediaStreamOnLeave/,
    '_app.js no longer releases the camera on navigation - the stream will outlive the page again');
  assert.match(app, /router\.events\.on\('routeChangeStart',\s*handleMediaRelease\)/,
    'the release must be bound to routeChangeStart');
  assert.match(app, /router\.events\.off\('routeChangeStart',\s*handleMediaRelease\)/,
    'the release handler must be unbound on cleanup, or it stacks on every remount');

  const menu = read('src/components/ui/HamburgerMenu.jsx');
  assert.match(menu, /releaseMediaStreamOnLogout\(\)/,
    'sign-out no longer releases the camera');
  const idx = menu.indexOf('releaseMediaStreamOnLogout()');
  const signOut = menu.indexOf('supabase.auth.signOut()');
  assert.ok(idx > -1 && signOut > -1 && idx < signOut,
    'the release must run BEFORE signOut, so a failing signOut still frees the camera');
});

test('the modal still does NOT release on unmount (that is the iOS bug)', () => {
  // Mask comments first: prose ABOUT releaseMediaStream({force:true}) is not a
  // call to it, and the first version of this law counted the doc comment.
  const modal = read('src/components/social/GoLiveModal.jsx')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  // One legitimate force-release remains: the black-frame watchdog.
  const forced = (modal.match(/releaseMediaStream\(\{\s*force:\s*true\s*\}\)/g) || []).length;
  assert.ok(
    forced <= 1,
    `GoLiveModal force-releases ${forced} times. More than the watchdog means the modal ` +
      'is releasing on close, which re-engages the iOS permission prompt on re-entry.'
  );
});
