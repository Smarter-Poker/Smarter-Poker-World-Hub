import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('pages/_document.js embeds a valid Speculation Rules API block for moderate public route prefetching', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/_document.js'), 'utf8');
  assert.match(src, /type="speculationrules"/);
  assert.match(src, /eagerness:\s*'moderate'/);
  assert.match(src, /href_matches:\s*'\/tools\/\*'/);
  assert.match(src, /href_matches:\s*'\/learn\/\*'/);
  assert.match(src, /href_matches:\s*'\/glossary\/\*'/);
  assert.match(src, /href_matches:\s*'\/compare\/\*'/);
  assert.match(src, /href_matches:\s*'\/hub\/poker-near-me\/\*'/);
  assert.match(src, /not:\s*\{\s*href_matches:\s*'\/api\/\*'\s*\}/);
  assert.match(src, /not:\s*\{\s*href_matches:\s*'\/auth\/\*'\s*\}/);
});
