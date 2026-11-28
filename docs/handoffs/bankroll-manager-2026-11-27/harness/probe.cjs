const { chromium } = require('playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const p=await b.newPage({viewport:{width:375,height:900}});
await p.goto('file:///tmp/rh/i2.html');await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('section')].slice(0,3).map(s=>{const cs=getComputedStyle(s);return {cls:s.className,h:s.getBoundingClientRect().height,minH:cs.minHeight,ch:[...s.children].map(c=>[c.tagName,c.className,Math.round(c.getBoundingClientRect().height),getComputedStyle(c).minHeight,getComputedStyle(c).height])}}))),null,1);await b.close();})();
