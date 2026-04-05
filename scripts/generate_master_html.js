const fs = require('fs');
const path = require('path');

const venuesPath = path.join(__dirname, '../data/all-venues.json');
const venuesData = JSON.parse(fs.readFileSync(venuesPath, 'utf8'));
const venues = venuesData.venues;

const totalVenues = venues.length;

let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Master Venue Logo Audit</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#0a0e1a;color:#e2e8f0;padding:20px}
header{text-align:center;margin-bottom:25px}
h1{color:#38bdf8;font-size:28px;margin-bottom:8px}
.sub{color:#94a3b8;font-size:14px;margin-bottom:12px; max-width: 600px; margin-left: auto; margin-right: auto;}
.stats{color:#64748b;font-size:14px;display:flex;gap:15px;justify-content:center;margin-bottom:20px; background: #1e293b; padding: 10px; border-radius: 8px; width: fit-content; margin-left: auto; margin-right: auto; border: 1px solid #334155;}
.stats b{color:#22d3ee}
.grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:12px}
.c{background:#1e293b;padding:12px;border-radius:8px;border:1px solid #334155;text-align:center;border-top:3px solid #22c55e;position:relative; transition: transform 0.1s;}
.c:hover{transform: scale(1.05); z-index: 10;}
.c.bad{border-left-color:#ef4444;opacity:.7}
.n{position:absolute;top:4px;left:8px;font-size:10px;color:#475569;font-weight:bold}
.w{width:120px;height:120px;margin:0 auto 10px;background:#111827;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid #374151}
.w img{max-width:100%;max-height:100%;object-fit:contain}
.no{color:#ef4444;font-size:10px;font-weight:bold}
.nm{font-size:13px;font-weight:600;margin-bottom:3px;line-height:1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
.loc{font-size:11px;color:#94a3b8;margin-bottom:2px}
.id{font-size:10px;color:#475569;font-family:monospace;margin-bottom:4px}
.g{display:inline-block;font-size:9px;padding:2px 6px;border-radius:4px;background:#14532d;color:#4ade80;font-weight:bold}
</style></head><body>
<header>
<h1>Smarter.Poker — Master Venue Logo Audit</h1>
<div class="sub">This is the final, comprehensive overview of all currently active venues in the registry. 
Every venue is listed below with its mapped CDN-hosted high fidelity logo. Scroll through to spot any remaining aberrations or sizing issues before locking the registry.</div>
<div class="stats">
  <div>Total Venues: <b>${totalVenues}</b></div>
  <div>Last Updated: <b>${venuesData.updated_at ? new Date(venuesData.updated_at).toLocaleString() : 'N/A'}</b></div>
</div>
</header>
<div class="grid">`;

let num = 1;
for (const v of venues) {
  html += `
<div class="c " data-id="${v.id}">
  <div class="n">#${num}</div>
  <div class="w"><img src="${v.logo_url}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=no>ERR</div>'"/></div>
  <div class="nm" title="${v.name}">${v.name}</div>
  <div class="loc">${v.city || 'Unknown'}, ${v.state || 'XX'}</div>
  <div class="id">ID: ${v.id}</div>
  <span class="g">cdn_link</span>
</div>`;
  num++;
}

html += `\n</div></body></html>`;

const outputPath = path.join(__dirname, '../public/master-review.html');
fs.writeFileSync(outputPath, html);
console.log("Created public/master-review.html rendering " + totalVenues + " venues.");
