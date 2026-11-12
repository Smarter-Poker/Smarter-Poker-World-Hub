import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { subjectBounds } from '../scripts/normalize-avatar-silhouettes.mjs';
const manifest = JSON.parse(fs.readFileSync('scripts/data/player-avatar-assignments-20261111.json'));
test('Twin2983 and Farmboy13 use the requested transparent artwork at the existing custom-avatar baseline', async () => {
  assert.deepEqual(manifest.assignments.map(x => x.username), ['Twin2983', 'Farmboy13']);
  assert.equal(new Set(manifest.assignments.map(x => x.profileId)).size, 2);
  for (const entry of manifest.assignments) {
    const bytes = fs.readFileSync('public/' + entry.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, 512); assert.equal(meta.height, 512); assert.equal(meta.hasAlpha, true);
    const b = await subjectBounds(bytes);
    assert.ok(Math.abs(b.height - 455) <= 1);
    assert.ok(b.left >= 5 && b.top >= 5 && b.left + b.width <= 507 && b.top + b.height <= 507);
    const {data, info} = await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for (const [x,y] of [[0,0],[511,0],[0,511],[511,511]]) assert.equal(data[(y*info.width+x)*4+3], 0);
    assert.ok(entry.file.includes(entry.sha256.slice(0,12)), 'immutable URL binds to supplied bytes');
  }
});
