import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/content-engine/pipeline/VideoClipper.js', import.meta.url),
  'utf8',
);

test('native clipping is quarantined until durable rights grants exist', () => {
  assert.match(source, /NATIVE_CLIPPING_QUARANTINE_REASON = 'rights_registry_not_implemented'/);
  assert.match(
    source,
    /async getNativeClippingGate\(\) \{[\s\S]*?enabled: false[\s\S]*?NATIVE_CLIPPING_QUARANTINE_REASON/,
  );

  const uploadMethod = source.match(
    /async uploadAndCreateReel\(clipPath, metadata = \{\}\) \{[\s\S]*?\n    \}/,
  )?.[0] || '';

  assert.match(uploadMethod, /await this\.getNativeClippingGate\(\)/);
  assert.match(uploadMethod, /if \(!clippingGate\.enabled\)[\s\S]*?publicationSkipped: true/);
  assert.match(uploadMethod, /rightsStatus[\s\S]*?rights_clearance_required/);
  assert.match(uploadMethod, /const authorId = String\(metadata\.authorId \|\| ''\)\.trim\(\)/);
  assert.match(uploadMethod, /!AUTHOR_ID_RE\.test\(authorId\)[\s\S]*?author_id_required/);
  assert.match(uploadMethod, /const topic = String\(metadata\.topic \|\| ''\)[\s\S]*?POKER_TOPICS\.has\(topic\)[\s\S]*?poker_topic_required/);
  assert.doesNotMatch(uploadMethod, /metadata\.topic \|\| ['"]poker['"]/);
  assert.match(uploadMethod, /const storagePath = `\$\{CONFIG\.STORAGE_PATH\}\/\$\{authorId\}\/\$\{fileName\}`/);
  assert.match(uploadMethod, /author_id: authorId/);
  assert.doesNotMatch(uploadMethod, /reels\/clips/);
});
