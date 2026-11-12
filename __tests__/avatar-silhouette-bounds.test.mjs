import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { subjectBounds, normalizedAvatar } from '../scripts/normalize-avatar-silhouettes.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts/data/avatar-complete-silhouettes.json'))
);

test('reviewed avatar art keeps its complete silhouette inside every delivered canvas', async () => {
  for (const slug of manifest.slugs) {
    const split = slug.indexOf('_');
    const variants = [
      {
        file: `public/avatars/${slug.slice(0, split)}/${slug.slice(split + 1)}.webp`,
        width: 1024,
        height: 1024,
        margin: 57,
      },
      { file: `public/avatars/table/${slug}@2x.webp`, width: 250, height: 340, margin: 10 },
      { file: `public/avatars/table/${slug}.webp`, width: 125, height: 170, margin: 5 },
    ];
    for (const v of variants) {
      const file = path.join(root, v.file);
      const meta = await sharp(file).metadata();
      assert.equal(meta.width, v.width, v.file);
      assert.equal(meta.height, v.height, v.file);
      assert.equal(meta.hasAlpha, true, v.file + ' must be transparent');
      const b = await subjectBounds(file);
      assert.ok(
        b.left >= v.margin - 1 && b.top >= v.margin - 1,
        v.file + ' touches the top/left canvas edge'
      );
      assert.ok(
        b.left + b.width <= v.width - v.margin + 1,
        v.file + ' touches the right canvas edge'
      );
      assert.ok(
        b.top + b.height <= v.height - v.margin + 1,
        v.file + ' touches the bottom canvas edge'
      );
      assert.ok(b.height >= v.height * 0.45, v.file + ' is too small in its canvas');
      const raw = await sharp(file).ensureAlpha().raw().toBuffer();
      const y = b.top + b.height - 1;
      let bottomInk = 0,
        run = 0;
      for (let x = b.left; x < b.left + b.width; x++) {
        run = raw[(y * v.width + x) * 4 + 3] > 8 ? run + 1 : 0;
        bottomInk = Math.max(bottomInk, run);
      }
      assert.ok(bottomInk < b.width * 0.6, v.file + ' ends in a broad horizontal crop line');
    }
  }
});

test('normalization preserves wide accessories and a common bottom baseline', async () => {
  const input = await sharp({
    create: { width: 600, height: 400, channels: 4, background: '#00000000' },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="600" height="400"><ellipse cx="300" cy="200" rx="290" ry="190" fill="red"/></svg>'
        ),
      },
    ])
    .png()
    .toBuffer();
  const normalized = await normalizedAvatar(input, {
    width: 250,
    height: 340,
    margin: 10,
    maxSubjectHeight: 303,
  });
  const bytes = await normalized.png().toBuffer();
  const b = await subjectBounds(bytes);
  assert.ok(b.left >= 9 && b.left + b.width <= 241, 'wide accessories must fit');
  assert.ok(Math.abs(b.top + b.height - 330) <= 1, 'common bottom baseline');
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  for (let x = 0; x < info.width; x++) {
    assert.equal(data[x * 4 + 3], 0);
    assert.equal(data[((info.height - 1) * info.width + x) * 4 + 3], 0);
  }
});

test('custom avatars preserve their complete 455px subject and immutable bytes', async () => {
  const custom = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/data/custom-complete-silhouettes.json'))
  );
  assert.equal(custom.files.length, 21);
  for (const entry of custom.files) {
    const file = path.join(root, 'public', entry.file);
    const bytes = fs.readFileSync(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.height, 512);
    assert.equal(meta.hasAlpha, true);
    const b = await subjectBounds(bytes);
    assert.ok(
      b.left >= 5 && b.top >= 5 && b.left + b.width <= 507 && b.top + b.height <= 507,
      entry.file
    );
    assert.ok(Math.abs(b.height - 455) <= 1, entry.file + ' uses the archived subject height');
  }
});

test('the published artwork revision seals every delivered preset and custom variant', () => {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'public/avatars/art-revision.json')));
  assert.equal(receipt.assets.length, 321);
  assert.equal(createHash('sha256').update(JSON.stringify(receipt.assets)).digest('hex').slice(0, 20), receipt.revision);
  for (const entry of receipt.assets) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, 'public', entry.file))).digest('hex'), entry.sha256, entry.file);
  }
  assert.ok(fs.readFileSync(path.join(root, 'src/data/AVATAR_LIBRARY.js'), 'utf8').includes(receipt.revision));
});

test('Twin2983 and Farmboy13 use the requested transparent artwork at the existing custom-avatar baseline', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/player-avatar-assignments-20261111.json')));
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
