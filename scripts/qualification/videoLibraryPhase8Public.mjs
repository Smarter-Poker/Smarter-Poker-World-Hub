// Finite unmocked public checks. Authenticated writes have a separate owner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, expect } from 'playwright/test';
import { watchPath } from '../../src/lib/videoLibraryWatch.mjs';
const base='https://smarter.poker', expected=process.env.VIDEO_PHASE8_EXPECTED_REVISION, evidence=process.env.VIDEO_PHASE8_PUBLIC_EVIDENCE_DIR;
assert.match(expected||'',/^[0-9a-f]{40}$/);assert(evidence&&path.isAbsolute(evidence));fs.mkdirSync(evidence,{recursive:true});
const health=await(await fetch(`${base}/api/health`)).json();assert.equal(health.commitSha,expected);
const catalog=await(await fetch(`${base}/api/video-library/catalog?limit=1`)).json();assert(catalog.success&&catalog.data?.[0]);
const report={health,expectedRevision:expected,mockedRequests:false,cases:[],status:'running'};
try {
 for(const [name,browserType,width,height,executablePath] of [['chrome-phone',chromium,375,844,process.env.VIDEO_LIBRARY_CHROMIUM_EXECUTABLE],['chrome-desktop',chromium,1440,900,process.env.VIDEO_LIBRARY_CHROMIUM_EXECUTABLE],['webkit-phone',webkit,393,852,process.env.VIDEO_LIBRARY_WEBKIT_EXECUTABLE]]){
  const browser=await browserType.launch(executablePath?{executablePath}:{});
  try {const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
   await page.goto(`${base}/hub/video-library`,{waitUntil:'domcontentloaded'});
   const owner=page.getByRole('link',{name:'Control Panel',exact:true}),upload=page.getByRole('link',{name:'Upload Poker Clip',exact:true});
   await owner.waitFor();await upload.waitFor();
   for(const link of [owner,upload]){const box=await link.boundingBox();assert(box&&box.height>=44);}
   await owner.click();await page.waitForURL(/\/video-library\/owner$/);
   await expect(page.getByRole('link',{name:'Sign In To Open The Control Panel',exact:true})).toHaveAttribute('href','/auth/login?redirect=%2Fhub%2Fvideo-library%2Fowner');
   assert.equal(await page.getByRole('navigation',{name:'Owner Tools',exact:true}).count(),0);
   assert.equal(await page.locator('[data-video-library-owner-panel] dl').count(),0);
   await page.evaluate(()=>window.scrollTo(0,0));
   const footer=page.getByRole('navigation',{name:/Video Library Footer/i});
   await expect.poll(()=>footer.evaluate(e=>Math.abs(e.getBoundingClientRect().bottom-innerHeight))).toBeLessThanOrEqual(1);
   assert.equal(await footer.evaluate(e=>getComputedStyle(e).position),'fixed');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
   await page.screenshot({path:path.join(evidence,`${name}-owner.png`)});
   await page.goto(`${base}${watchPath(catalog.data[0])}`,{waitUntil:'domcontentloaded'});
   await page.locator('[data-watch-tracking="anonymous"]').waitFor();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
   await page.goto(`${base}/hub/video-library`,{waitUntil:'domcontentloaded'});
   await page.getByRole('link',{name:'Upload Poker Clip',exact:true}).click();
   await expect(page).toHaveURL(url=>url.pathname==='/auth/login'&&url.searchParams.get('redirect')==='/hub/reels?category=poker&upload=1');
   report.cases.push({name,status:'passed',width,ownerDenied:true,uploadAuthReturn:true,anonymousWatchTracking:true});
  }finally{await browser.close();}
 }
 const finalHealth=await(await fetch(`${base}/api/health`)).json();assert.equal(finalHealth.commitSha,expected);report.finalHealth=finalHealth;report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(evidence,'phase8-public-live.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
