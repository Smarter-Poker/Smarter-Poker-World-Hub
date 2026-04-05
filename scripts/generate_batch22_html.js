const fs = require('fs');

const venuesData = JSON.parse(fs.readFileSync('data/all-venues.json', 'utf8'));
const venues = venuesData.venues;

// Batch 22 is 525-550 (venues #526-550 based on new array length after removal)
const startIndex = 525;
const endIndex = Math.min(550, venues.length);
const batch = venues.slice(startIndex, endIndex);

let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Batch 22 — Venues #${startIndex + 1}-${endIndex}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#0a0e1a;color:#e2e8f0;padding:20px}
header{text-align:center;margin-bottom:25px}
h1{color:#38bdf8;font-size:24px;margin-bottom:8px}
.sub{color:#94a3b8;font-size:13px;margin-bottom:12px}
.stats{color:#64748b;font-size:13px;display:flex;gap:15px;justify-content:center;margin-bottom:20px}
.stats b{color:#22d3ee}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.c{background:#1e293b;padding:12px;border-radius:8px;border:1px solid #334155;text-align:center;border-left:3px solid #22c55e;position:relative}
.c.bad{border-left-color:#ef4444;opacity:.7}
.n{position:absolute;top:4px;left:8px;font-size:10px;color:#475569;font-weight:bold}
.w{width:100px;height:100px;margin:0 auto 8px;background:#111827;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #374151}
.w img{max-width:100%;max-height:100%;object-fit:contain}
.no{color:#ef4444;font-size:10px;font-weight:bold}
.nm{font-size:12px;font-weight:600;margin-bottom:3px;line-height:1.2}
.loc{font-size:10px;color:#94a3b8;margin-bottom:2px}
.id{font-size:9px;color:#475569;font-family:monospace;margin-bottom:4px}
.g{display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;background:#14532d;color:#4ade80;font-weight:bold}
.r{display:inline-block;font-size:8px;padding:1px 5px;border-radius:3px;background:#3f1219;color:#f87171;font-weight:bold}
</style></head><body>
<header>
<h1>Batch 22 — Venues #${startIndex + 1}-${endIndex}</h1>
<div class="sub">Review these logos. Screenshot any that are WRONG and I will fix them.</div>
<div class="stats"><div><b>${endIndex - startIndex}</b> total mapped</div></div>
</header>
<div class="grid">`;

let num = startIndex + 1;
for (const v of batch) {
  html += `
<div class="c " data-n="${num}">
  <div class="n">#${num}</div>
  <div class="w"><img src="${v.logo_url}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=no>ERR</div>'"/></div>
  <div class="nm">${v.name}</div>
  <div class="loc">${v.city || 'Unknown'}, ${v.state || 'XX'}</div>
  <div class="id">ID: ${v.id}</div>
  <span class="g">cdn_link</span>
</div>`;
  num++;
}

html += `\n</div></body></html>`;

fs.writeFileSync('public/batch22-review.html', html);
console.log("Created public/batch22-review.html");
