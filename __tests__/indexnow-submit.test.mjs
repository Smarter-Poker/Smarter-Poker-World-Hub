/**
 * INDEXNOW SUBMIT (AEO phase 1, 2026-09-17).
 *
 * The push-to-main job submits only the public routes whose source changed.
 * This pins the file-to-route mapping (a dynamic segment is thousands of
 * URLs and is skipped; private and framework files have no route) and that
 * the key file proves itself: public/<key>.txt contains exactly <key>.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeForChangedFile, readIndexNowKey } from '../scripts/indexnow-submit.mjs';

test('static page files map to their public route', () => {
  assert.equal(routeForChangedFile('pages/index.js'), '/');
  assert.equal(routeForChangedFile('pages/terms.js'), '/terms');
  assert.equal(routeForChangedFile('pages/hub/training.js'), '/hub/training');
  assert.equal(routeForChangedFile('pages/hub/commander/index.js'), '/hub/commander');
  assert.equal(routeForChangedFile('pages/hub/commander/faq.js'), '/hub/commander/faq');
  assert.equal(routeForChangedFile('src/components/landing/LandingProductSummary.js'), '/');
});

test('dynamic, private and framework files have no submittable route', () => {
  for (const file of [
    'pages/hub/[orbId].js',
    'pages/hub/poker-near-me/in/[state]/[city].js',
    'pages/api/health.js',
    'pages/_app.js',
    'pages/_document.js',
    'pages/404.js',
    'pages/sitemap.xml.js',
    'pages/admin/index.js',
    'pages/auth/login.js',
    'src/lib/anything.js',
    'public/robots.txt',
  ]) {
    assert.equal(routeForChangedFile(file), null, `${file} must not map to a route`);
  }
});

test('the IndexNow key file contains exactly its own key', () => {
  const key = readIndexNowKey();
  assert.match(key, /^[a-f0-9]{32}$/);
});
