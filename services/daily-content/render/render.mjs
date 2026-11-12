// Smarter.Poker Daily Content renderer (dc-render-1.0).
// renderSpec(spec, jobDir, opts) -> { video, stills, renderer_version }
// CLI: node render.mjs <spec.json> <jobDir>
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { start, ROOT } = require('./server.cjs');
export const RENDERER_VERSION = 'dc-render-1.0';
const W = 1080, H = 1920;

export function defaultChromiumPath() {
  if (process.env.DC_CHROMIUM) return process.env.DC_CHROMIUM;
  const base = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).filter(n => n.startsWith('chromium-')).sort().reverse()) {
    for (const plat of fs.readdirSync(path.join(base, d)).filter(n => n.startsWith('chrome-mac'))) {
      const apps = fs.readdirSync(path.join(base, d, plat)).filter(n => n.endsWith('.app'));
      for (const app of apps) {
        const macos = path.join(base, d, plat, app, 'Contents', 'MacOS');
        const exe = fs.existsSync(macos) && fs.readdirSync(macos)[0];
        if (exe) return path.join(macos, exe);
      }
    }
  }
  return undefined;
}

export function loadPlaywright() {
  return require(path.join(ROOT, 'node_modules', 'playwright'));
}

export const sha256File = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function sniffImage(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  if (buf.slice(0, 4).toString() === 'RIFF') return true;
  if (buf.slice(0, 3).toString() === 'GIF') return true;
  return false;
}

// Download every http(s) avatar into jobDir/avatars; failures fall back to the monogram.
async function localizeAvatars(spec, jobDir, timeoutMs = 10000) {
  const dir = path.join(jobDir, 'avatars');
  fs.mkdirSync(dir, { recursive: true });
  const entries = [];
  const walk = o => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      if (typeof o.avatar === 'string' && /^https?:\/\//i.test(o.avatar)) entries.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(spec);
  const report = [];
  for (const e of entries) {
    const url = e.avatar;
    const name = createHash('sha1').update(url).digest('hex').slice(0, 20) + '.img';
    const dest = path.join(dir, name);
    try {
      if (!fs.existsSync(dest)) {
        const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeoutMs);
        const r = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer));
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (!sniffImage(buf) || buf.length > 8 * 1024 * 1024) throw new Error('not an image');
        fs.writeFileSync(dest, buf);
      }
      e.avatar = '/avatars/' + name; report.push({ ok: true });
    } catch (err) {
      e.avatar = null; report.push({ ok: false, error: String(err.message || err) });
    }
  }
  return report;
}

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code + ': ' + err.slice(-800))));
    if (input) input(p.stdin);
  });
}

export async function openScene(jobDir, opts = {}) {
  const { chromium } = loadPlaywright();
  const srv = await start(jobDir);
  const browser = await chromium.launch({
    executablePath: opts.chromiumPath || defaultChromiumPath(),
    args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu-rasterization', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
  await page.goto(`http://127.0.0.1:${srv.port}/scene.html`);
  try {
    await page.waitForFunction('window.__ready === true', null, { timeout: 45000 });
  } catch (e) {
    await browser.close(); srv.server.close();
    throw new Error('scene did not become ready: ' + (errors.join(' | ') || e.message));
  }
  const meta = await page.evaluate(() => window.__meta);
  const close = async () => { await browser.close(); srv.server.close(); };
  return { page, meta, errors, close };
}

export async function renderSpec(specIn, jobDir, opts = {}) {
  const fps = opts.fps || 30;
  const spec = JSON.parse(JSON.stringify(specIn));
  fs.mkdirSync(jobDir, { recursive: true });
  const avatarReport = await localizeAvatars(spec, jobDir);
  fs.writeFileSync(path.join(jobDir, 'spec.json'), JSON.stringify(spec, null, 2));
  const started = Date.now();
  const { page, meta, errors, close } = await openScene(jobDir, opts);
  try {
    const frames = Math.round(meta.duration_s * fps);
    const videoPath = path.join(jobDir, 'video.mp4');
    await ffmpeg(['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', videoPath],
      async stdin => {
        for (let n = 0; n < frames; n++) {
          await page.evaluate(tt => window.setTime(tt), n / fps);
          const buf = await page.screenshot({ type: 'png' });
          if (!stdin.write(buf)) await new Promise(r => stdin.once('drain', r));
        }
        stdin.end();
      });
    // stills: final main frame (before any closing)
    const tFinal = Math.max(0, meta.main_end - 1 / fps);
    await page.evaluate(tt => window.setTime(tt), tFinal);
    const s916 = path.join(jobDir, 'still-9x16.png');
    await page.screenshot({ path: s916 });
    for (const t of opts.stills || []) {
      await page.evaluate(tt => window.setTime(tt), t);
      await page.screenshot({ path: path.join(jobDir, `still-${Number(t).toFixed(2)}.png`) });
    }
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    const s45 = path.join(jobDir, 'still-4x5.png');
    await ffmpeg(['-y', '-loglevel', 'error', '-i', s916, '-filter_complex',
      '[0]crop=1080:1350:0:285,boxblur=28:3,eq=brightness=-0.22:saturation=1.1[bg];[0]crop=1080:1500:0:40,scale=-2:1350:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:0',
      '-frames:v', '1', s45]);
    const stat = p => ({ path: p, sha256: sha256File(p), bytes: fs.statSync(p).size });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames:format=duration', '-of', 'json', videoPath]).toString());
    const vs = probe.streams[0];
    return {
      video: { ...stat(videoPath), width: vs.width, height: vs.height, frames: Number(vs.nb_read_frames), duration_s: Number(probe.format.duration) },
      stills: { still_9x16: { ...stat(s916), width: W, height: H, at_s: tFinal }, still_4x5: { ...stat(s45), width: 1080, height: 1350, at_s: tFinal } },
      renderer_version: RENDERER_VERSION,
      template: meta.template,
      avatars: avatarReport,
      render_ms: Date.now() - started,
    };
  } finally {
    await close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [specPath, jobDir] = process.argv.slice(2);
  if (!specPath || !jobDir) { console.error('usage: node render.mjs <spec.json> <jobDir>'); process.exit(2); }
  renderSpec(JSON.parse(fs.readFileSync(specPath, 'utf8')), path.resolve(jobDir))
    .then(r => { console.log(JSON.stringify(r, null, 2)); })
    .catch(e => { console.error('RENDER FAILED:', e.stack || e.message); process.exit(1); });
}
