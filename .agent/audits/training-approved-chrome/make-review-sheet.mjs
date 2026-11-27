// Review-only contact sheet: resizes and places existing art without retouching it.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [name, ...ids] = process.argv.slice(2);
if (!name || !ids.length || ids.length > 6) throw new Error('Expected sheet name and one to six game IDs');
const panels = [];
for (const [i, id] of ids.entries()) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid game ID');
  const x = (i % 2) * 360;
  const y = Math.floor(i / 2) * 230;
  const input = await sharp(`public/images/training/approved-chrome/640/${id}.webp`)
    .resize({ width: 360, height: 203, fit: 'contain' }).png().toBuffer();
  const label = Buffer.from(`<svg width="360" height="27"><rect width="360" height="27" fill="#142234"/><text x="12" y="19" fill="#fff" font-size="16" font-family="Arial">${id}</text></svg>`);
  panels.push({ input, left: x, top: y }, { input: label, left: x, top: y + 203 });
}
const destination = path.resolve('.agent/audits/training-approved-chrome/review');
fs.mkdirSync(destination, { recursive: true });
const output = path.join(destination, `${name}.png`);
await sharp({ create: { width: 720, height: Math.ceil(ids.length / 2) * 230, channels: 3, background: '#000' } })
  .composite(panels).png().toFile(output);
console.log(output);
