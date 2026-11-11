/**
 * The founder's LinkedIn profile is published in two places: the About page,
 * so existing players can connect (LinkedIn will not create the company page
 * until the founder's profile has connections), and the Organization
 * JSON-LD founder node, so search and AI systems tie the company to its
 * founder. Both read one constant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const seo = readFileSync('src/components/seo/SEOHead.js', 'utf8');
const about = readFileSync('pages/about.js', 'utf8');

test('Organization schema names the founder with his LinkedIn profile', () => {
  assert.match(seo, /linkedin: 'https:\/\/www\.linkedin\.com\/in\/daniel-bekavac-78060944a\/'/);
  assert.match(seo, /schemas\.organization\.founder = \{[\s\S]*?'@type': 'Person'[\s\S]*?sameAs: \[FOUNDER\.linkedin\]/);
  assert.match(seo, /schemas\.organization\.foundingDate = '2025-10';/);
});

test('About page links the founder profile from the shared constant', () => {
  assert.match(about, /import SEOHead, \{ schemas, FOUNDER \} from '\.\.\/src\/components\/seo\/SEOHead';/);
  assert.match(about, /<h2 style=\{styles\.h2\}>The Founder<\/h2>/);
  assert.match(about, /href=\{FOUNDER\.linkedin\}/);
  assert.doesNotMatch(about, /—|–/, 'no em or en dashes in product copy');
});
