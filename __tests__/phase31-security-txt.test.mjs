// Phase 31 (AEO Phase 13 of 16): RFC 9116 security.txt.
// The contact is the site's published support address; Expires must stay in
// the future and no more than a year out, so a stale file fails CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'public', '.well-known', 'security.txt');

test('security.txt carries the RFC 9116 required fields', () => {
  const txt = fs.readFileSync(FILE, 'utf8');
  const field = (name) => (txt.match(new RegExp(`^${name}: (.+)$`, 'm')) || [])[1];
  assert.equal(field('Contact'), 'mailto:support@smarter.poker');
  assert.equal(field('Canonical'), 'https://smarter.poker/.well-known/security.txt');
  const expires = Date.parse(field('Expires'));
  assert.ok(Number.isFinite(expires), 'Expires is an ISO date');
  assert.ok(expires > Date.now(), 'Expires is in the future; renew the file');
  assert.ok(expires - Date.now() <= 366 * 24 * 3600 * 1000, 'Expires is at most a year out (RFC 9116 recommendation)');
  assert.ok(fs.existsSync(path.join(process.cwd(), 'pages', 'terms.js')), 'the Policy URL is served');
});
