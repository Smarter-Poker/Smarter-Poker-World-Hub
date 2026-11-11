import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GUIDE_COPY, GUIDE_DESTINATIONS, businessHubKnowledge } from '../src/lib/businessHubGuide.mjs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('English and Spanish cover the same audiences, tools and official destinations', () => {
  assert.deepEqual(GUIDE_COPY.en.tools.map(row => row.slice(0, 2)), GUIDE_COPY.es.tools.map(row => row.slice(0, 2)));
  assert.deepEqual(GUIDE_COPY.en.sections.map(s => [s.id, s.faqs.map(f => f[2])]), GUIDE_COPY.es.sections.map(s => [s.id, s.faqs.map(f => f[2])]));
  for (const copy of Object.values(GUIDE_COPY)) {
    for (const [, dest] of copy.tools) assert.ok(GUIDE_DESTINATIONS[dest]);
    for (const section of copy.sections) for (const [, answer, dest] of section.faqs) {
      assert.ok(answer.length > 50);
      if (dest) assert.ok(GUIDE_DESTINATIONS[dest]);
    }
  }
  for (const href of Object.values(GUIDE_DESTINATIONS).filter(h => h.startsWith('/'))) {
    assert.ok(['.js', '.jsx', '.tsx', '/index.js'].some(suffix => existsSync(new URL(`pages${href}${suffix}`, root))) || href === '/hub/club-arena', href);
  }
});

test('exported guidance preserves launch, payment, safe-support and language boundaries', () => {
  const en = businessHubKnowledge('en');
  assert.match(en, /Funded Diamond Games Are Not Open/);
  assert.match(en, /Payment Does Not Increase Reward Chances/);
  assert.match(en, /Never Send Passwords, Verification Codes, Government ID Or Financial Credentials/);
  assert.match(en, /Club Approval/);
  assert.match(en, /Does Not Activate Commander/);
  assert.match(businessHubKnowledge('es'), /No Tienen Valor Monetario/);
  assert.match(businessHubKnowledge('es'), /Códigos De Verificación/);
  assert.equal(businessHubKnowledge('invalid'), en);
});

test('changed authoritative inputs require explicit content review', () => {
  const review = JSON.parse(read('docs/business-hub-guide-review.json'));
  for (const [path, expected] of Object.entries(review.inputs)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), expected,
      `${path} changed. Review guide/agent claims and changed-topic tests using docs/business-hub-guide.md before updating the reviewed hash.`);
  }
});

test('guide is wired into the public Help page and required checks', () => {
  assert.match(read('pages/hub/help.js'), /<BusinessHubGuide\s*\/>/);
  assert.match(read('pages/hub/help.js'), /href="\/privacy"/);
  for (const file of ['.husky/pre-push', '.github/workflows/build-safety-gate.yml']) {
    for (const testFile of ['business-hub-guide.test.mjs', 'business-hub-guide-activity.test.mjs', 'business-hub-product-truth.test.mjs']) assert.ok(read(file).includes(testFile), `${file}: ${testFile}`);
  }
});
