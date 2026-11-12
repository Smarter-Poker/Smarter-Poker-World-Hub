'use strict';
// Local-only static server for one render job (binds 127.0.0.1, free port).
//   /scene.html      -> render/scene.html
//   /three/...       -> <worktree>/node_modules/three/...
//   /brand/...       -> <worktree>/public/...
//   /fonts/...       -> render/fonts/...
//   /spec.json       -> <jobDir>/spec.json
//   /avatars/...     -> <jobDir>/avatars/...
const http = require('http');
const fs = require('fs');
const path = require('path');

const RENDER_DIR = __dirname;
const ROOT = path.resolve(RENDER_DIR, '..', '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF') return 'image/webp';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return 'application/octet-stream';
}

function resolveRoots(jobDir) {
  const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
  return [
    ['/three/', real(path.join(ROOT, 'node_modules', 'three'))],
    ['/brand/', real(path.join(ROOT, 'public'))],
    ['/fonts/', path.join(RENDER_DIR, 'fonts')],
    ['/avatars/', path.join(jobDir, 'avatars')],
  ];
}

function start(jobDir) {
  const roots = resolveRoots(jobDir);
  const fixed = { '/scene.html': path.join(RENDER_DIR, 'scene.html'), '/spec.json': path.join(jobDir, 'spec.json') };
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let u;
      try { u = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
      let file = fixed[u];
      if (!file) {
        const hit = roots.find(([p]) => u.startsWith(p));
        if (!hit) { res.writeHead(404); return res.end(); }
        const [pre, dir] = hit;
        file = path.resolve(dir, '.' + path.sep + u.slice(pre.length));
        if (file !== dir && !file.startsWith(dir + path.sep)) { res.writeHead(403); return res.end(); }
      }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || sniff(buf), 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { start, ROOT, RENDER_DIR };
