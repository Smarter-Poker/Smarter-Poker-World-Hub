/**
 * GSC & AEO SERIES 4 PHASE 2: HREFLANG INTERNATIONAL TARGETING & CANONICAL NORMALIZATION
 *
 * Verifies:
 *   1. normalizeCanonicalUrl() strips ephemeral query parameters (?sort=, ?filter=, ?tab=, ?page=)
 *      and hash fragments (#...) and trailing slashes while preserving https://smarter.poker/ root.
 *   2. SEOHead emits <link rel="alternate" hrefLang="en-US" href={fullCanonical} />
 *      and <link rel="alternate" hrefLang="x-default" href={fullCanonical} />
 *      for indexable pages with a canonical URL.
 *   3. SEOHead omits hreflang links when noindex={true}.
 *   4. SEOHead emits Googlebot responsive image & snippet directives:
 *      "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('SEOHead defines normalizeCanonicalUrl that strips query strings, hashes, and trailing slashes', () => {
  const seoCode = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.match(seoCode, /export function normalizeCanonicalUrl\(canonicalTarget\)/);
  assert.match(seoCode, /\.split\('#'\)\[0\]\.split\('\?'\)\[0\]/);
  assert.match(seoCode, /\.replace\(\/\\\/\+\$\/, ''\)/);
});

test('SEOHead emits hreflang="en-US" and hreflang="x-default" alternate links on indexable canonical pages', () => {
  const seoCode = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.match(
    seoCode,
    /<link key="hreflang-en-us" rel="alternate" hrefLang="en-US" href=\{fullCanonical\} \/>/,
    'SEOHead must render hrefLang="en-US" alternate link',
  );
  assert.match(
    seoCode,
    /<link key="hreflang-x-default" rel="alternate" hrefLang="x-default" href=\{fullCanonical\} \/>/,
    'SEOHead must render hrefLang="x-default" alternate link',
  );
  assert.match(
    seoCode,
    /\{fullCanonical && !noindex && \(/,
    'SEOHead must gate hreflang links on fullCanonical && !noindex',
  );
});

test('SEOHead emits max-image-preview:large, max-snippet:-1, max-video-preview:-1 for Google Discover', () => {
  const seoCode = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  assert.match(
    seoCode,
    /<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" \/>/,
  );
});
