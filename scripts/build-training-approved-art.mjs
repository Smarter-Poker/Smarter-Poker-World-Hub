/** Build responsive encodings only; never draw or retouch generated artwork. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ART_ROOT = join(ROOT, 'public/images/training/approved-chrome');
const AUDIT_ROOT = join(ROOT, '.agent/audits/training-approved-chrome');
const spec = JSON.parse(readFileSync(join(AUDIT_ROOT, 'generation-spec.json'), 'utf8'));

const [id, sourcePath, generatedAt] = process.argv.slice(2);
const game = spec.games.find((entry) => entry.id === id);
if (!game || !sourcePath) throw new Error('Expected canonical game id and generated source path');
const source = resolve(sourcePath);
const original = readFileSync(source);
const originalMetadata = await sharp(original).metadata();
if (!originalMetadata.width || !originalMetadata.height) throw new Error('Generated image has no dimensions');
// Fit without stretching. Extra source pixels are cropped centrally by sharp,
// using the safe margins requested in the generation prompt.
const outputs = [];
for (const width of [640, 960, 1440]) {
  const height = Math.round(width * 9 / 16);
  const dir = width === 1440 ? ART_ROOT : join(ART_ROOT, String(width));
  mkdirSync(dir, { recursive: true });
  const pipeline = sharp(original).resize({ width, height, fit: 'cover', position: 'centre' });
  for (const format of ['webp', 'avif']) {
    const relativePath = width === 1440
      ? `/images/training/approved-chrome/${id}.${format}`
      : `/images/training/approved-chrome/${width}/${id}.${format}`;
    const buffer = format === 'webp'
      ? await pipeline.clone().webp({ quality: 82, effort: 5 }).toBuffer()
      : await pipeline.clone().avif({ quality: 62, effort: 4 }).toBuffer();
    const output = join(ROOT, 'public', relativePath);
    writeFileSync(output, buffer);
    outputs.push({ path: relativePath, format, width, height, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
  }
}
mkdirSync(join(AUDIT_ROOT, 'records'), { recursive: true });
const record = {
  id, name: game.name, category: game.category, version: spec.version,
  tool: spec.tool, generatedAt: generatedAt || new Date().toISOString(),
  prompt: game.prompt, subject: game.subject,
  camera: game.camera, composition: game.composition,
  source: { fileName: source.split('/').at(-1), width: originalMetadata.width, height: originalMetadata.height, bytes: original.length, sha256: createHash('sha256').update(original).digest('hex') },
  nativeCards: game.cards, placement: game.placement, outputs,
};
writeFileSync(join(AUDIT_ROOT, 'records', `${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ id, outputs: outputs.length, bytes: outputs.reduce((n, output) => n + output.bytes, 0), source: record.source.fileName }));
