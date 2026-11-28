import { chromium } from '/home/claude/smarter-poker-world-hub/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:393,height:900}});
for (const path of process.argv.slice(2)) {
await p.goto('http://localhost:3000'+path, { waitUntil:'networkidle', timeout:600000 }); await p.waitForTimeout(2500);
const r = await p.evaluate(() => { const out={}; for (const el of document.querySelectorAll('body *')) { if (!el.childNodes.length || ![...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())) continue; const f=getComputedStyle(el).fontFamily; if (/orbitron/i.test(f) || !/(sans|rajdhani|narrow|inter|roboto|system|monospace|mono|condensed)/i.test(f)) { const k=f.slice(0,60)+' | '+el.tagName+'.'+String(el.className).slice(0,60); out[k]=(out[k]||0)+1; } } return out; });
console.log(path, JSON.stringify(r,null,1));
}
await b.close();
