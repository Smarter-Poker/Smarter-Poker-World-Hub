/** Authoring-only normalization for the reviewed, complete transparent avatar artwork. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function subjectBounds(input, threshold = 8) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > threshold) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left) throw new Error('Avatar has no visible subject');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export async function normalizedAvatar(input, { width, height, margin, maxSubjectHeight }) {
  const bounds = await subjectBounds(input);
  const scale = Math.min((width - margin * 2) / bounds.width, maxSubjectHeight / bounds.height);
  const subjectWidth = Math.max(1, Math.round(bounds.width * scale));
  const subjectHeight = Math.max(1, Math.round(bounds.height * scale));
  const subject = await sharp(input)
    .extract(bounds)
    .resize(subjectWidth, subjectHeight)
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite([
    {
      input: subject,
      left: Math.floor((width - subjectWidth) / 2),
      top: height - margin - subjectHeight,
    },
  ]);
}

if (
  process.argv[1] &&
  import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href
) {
  const source = process.argv[2];
  if (!source)
    throw new Error(
      'Usage: node scripts/normalize-avatar-silhouettes.mjs REVIEWED_SOURCE_DIRECTORY [slug ...]'
    );
  const slugs = process.argv.slice(3);
  if (!slugs.length) throw new Error('Explicit reviewed avatar slugs are required');
  for (const slug of slugs) {
    if (!/^(free|vip)_[a-z0-9_]+$/.test(slug)) throw new Error('Invalid library slug: ' + slug);
    const input = path.join(source, slug + '.png');
    await fs.access(input);
    const [tier, ...parts] = slug.split('_');
    const variants = [
      {
        file: `public/avatars/${tier}/${parts.join('_')}.webp`,
        width: 1024,
        height: 1024,
        margin: 57,
        maxSubjectHeight: 910,
      },
      {
        file: `public/avatars/table/${slug}@2x.webp`,
        width: 250,
        height: 340,
        margin: 10,
        maxSubjectHeight: 303,
      },
      {
        file: `public/avatars/table/${slug}.webp`,
        width: 125,
        height: 170,
        margin: 5,
        maxSubjectHeight: 151,
      },
    ];
    for (const variant of variants) {
      const normalized = await normalizedAvatar(input, variant);
      await normalized
        .webp({ quality: variant.width === 1024 ? 80 : 88, alphaQuality: 100, effort: 6 })
        .toFile(variant.file);
    }
    console.log(slug);
  }
}
