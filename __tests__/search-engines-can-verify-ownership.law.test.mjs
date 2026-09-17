/**
 * SEARCH ENGINES CAN VERIFY OWNERSHIP (AEO phase 1, 2026-09-17).
 *
 * Google Search Console and Bing Webmaster Tools verify smarter.poker by
 * reading a meta tag from the home page (and, for Google, a file at the
 * root). The tokens are public by design. Losing either one silently
 * un-verifies the property and its reports; this pins them.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the document head carries the Google and Bing ownership tags', () => {
  const doc = read('pages/_document.js');
  assert.match(doc, /<meta name="google-site-verification" content="uPsE17EgFSxEEZwMy8_v87NvDJVLqnGdL4c5z2B3roE" \/>/);
  assert.match(doc, /<meta name="msvalidate\.01" content="6A4ECB27751F6F74E131B598604D6175" \/>/);
});

test('the Google verification file is at the root with the content Google issued', () => {
  assert.equal(read('public/google4a08a61d13d67e09.html'), 'google-site-verification: google4a08a61d13d67e09.html');
});
