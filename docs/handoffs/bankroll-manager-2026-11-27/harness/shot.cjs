const { chromium } = require('playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for (const tf of (process.argv[2]||'All Time').split(',')) {
const p=await b.newPage({viewport:{width:375,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>m.type()==='error'&&errs.push(m.text()));
await p.goto('file:///tmp/rh/i.html?tf='+encodeURIComponent(tf));await p.waitForTimeout(1500);
const info=await p.evaluate(()=>[...document.querySelectorAll('#root > div')].map(d=>({id:d.id,h:Math.round(d.getBoundingClientRect().height),text:d.innerText.split('\n').slice(0,6).join(' | ').slice(0,160),svg:!!d.querySelector('svg.recharts-surface'),w:d.scrollWidth})));
console.log(tf, JSON.stringify(info,null,0), errs.slice(0,5));
await p.screenshot({path:'/tmp/rh/'+tf.replace(/ /g,'_')+'.png',fullPage:true});await p.close();}
await b.close();})();
