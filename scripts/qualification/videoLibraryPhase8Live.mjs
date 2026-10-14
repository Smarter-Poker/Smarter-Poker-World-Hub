// Explicit scoped live proof using the existing configured service identity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { isDedicatedProbeAccount } from '../../src/lib/probeIdentity.js';
import { qualifyVideoLibraryPhase8Owner } from './videoLibraryPhase8Owner.mjs';
import { runPhase8Upload } from './videoLibraryPhase8Upload.mjs';
import { runPhase8Tracking } from './videoLibraryPhase8Tracking.mjs';
const base = 'https://smarter.poker';
const scope = process.env.VIDEO_PHASE8_LIVE_SCOPE || 'all';
assert(['all','upload','tracking'].includes(scope), 'Choose An Explicit Scoped Live Proof');
const expected = process.env.VIDEO_PHASE8_EXPECTED_REVISION;
assert.match(expected || '', /^[0-9a-f]{40}$/);
const evidence = process.env.VIDEO_PHASE8_LIVE_EVIDENCE_DIR;
const workRoot = process.env.VIDEO_PHASE8_LIVE_WORK_ROOT;
assert(evidence && path.isAbsolute(evidence) && workRoot && path.isAbsolute(workRoot));
fs.mkdirSync(evidence, { recursive: true }); fs.mkdirSync(workRoot, { recursive: true });
const email = String(process.env.TEST_USER_EMAIL || '').trim();
assert(isDedicatedProbeAccount(email), 'Only configured dedicated verification identity is allowed');
assert(process.env.TEST_USER_PASSWORD && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Configured authentication and readback access required');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const report = { startedAt: new Date().toISOString(), expectedRevision: expected, scope, cases: [], mockedRequests: false, financialWrites: false, status: 'running' };
let browser, page, session, ownerId;
const pass = (name, data = {}) => report.cases.push({ name, status: 'passed', ...data });
const safe = value => {
 let text = String(value || '');
 for (const secret of [process.env.TEST_USER_PASSWORD,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,process.env.SUPABASE_SERVICE_ROLE_KEY,session?.access_token,session?.refresh_token]) if (secret) text = text.split(secret).join('[redacted]');
 return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted]').slice(0,5000);
};
async function readFinancialSnapshot(id) {
 const values = await Promise.all([
  admin.from('profiles').select('id,diamonds,diamond_balance').eq('id',id).maybeSingle(),
  admin.from('reward_claims').select('id,diamonds_awarded').eq('user_id',id).order('id'),
  admin.from('diamond_transactions').select('id,amount').eq('user_id',id).order('id'),
  admin.from('user_diamond_balance').select('user_id,balance,lifetime_earned').eq('user_id',id).maybeSingle(),
 ]);
 for (const value of values) assert(!value.error,'Authoritative financial snapshot must be readable');
 return values.map(value=>value.data);
}
try {
 const health = await (await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(20000)})).json();
 assert.equal(health.commitSha,expected); report.health=health; pass('Exact protected production identity');
 const login = await client.auth.signInWithPassword({email,password:process.env.TEST_USER_PASSWORD});
 assert(!login.error && login.data?.session,'Configured authentication must succeed'); session=login.data.session;ownerId=login.data.user.id;
 const identity=await client.auth.getUser(session.access_token);
 assert(!identity.error && identity.data.user.id===ownerId && identity.data.user.email.toLowerCase()===email.toLowerCase());
 const profile=await client.from('profiles').select('id,display_name,role,is_admin').eq('id',ownerId).maybeSingle();
 assert(!profile.error && profile.data);
 if (!email.toLowerCase().endsWith('@probe.smarter.poker')) assert(profile.data.display_name==='Smarter.Poker Official' && profile.data.role==='god');
 assert(profile.data.is_admin || ['god','admin','superadmin'].includes(profile.data.role),'Existing configured owner role required, never change roles for proof');
 report.ownerId=ownerId;pass('Verified dedicated existing owner identity');
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:375,height:844},serviceWorkers:'block'});
 await context.addInitScript(({authSession})=>localStorage.setItem('smarter-poker-auth',JSON.stringify(authSession)),{authSession:session});
 page=await context.newPage();
 if(scope==='all'){
 await qualifyVideoLibraryPhase8Owner({page,baseUrl:base,accessToken:session.access_token,report});pass('Actual owner metrics, refresh, authorization and native tools');
 await page.goto(`${base}/hub/video-library/owner`,{waitUntil:'domcontentloaded'});
 await page.getByRole('navigation',{name:'Owner Tools',exact:true}).waitFor();
 await page.evaluate(()=>window.scrollTo(0,0));
 const footer=page.getByRole('navigation',{name:/Video Library Footer/i});
 await footer.waitFor();
 await page.waitForFunction(()=>{const e=document.querySelector('[aria-label="Video Library Footer" i]');return e&&Math.abs(e.getBoundingClientRect().bottom-innerHeight)<=1;});
 assert.equal(await footer.evaluate(e=>getComputedStyle(e).position),'fixed');pass('Owner mobile fixed footer and native controls');
 }
 if(scope!=='upload') await runPhase8Tracking({page,client,admin,session,ownerId,email,base,report,evidence,readFinancialSnapshot});
 if(scope!=='tracking') await runPhase8Upload({page,client,admin,session,ownerId,email,base,workRoot,report,readFinancialSnapshot,rewardSafety:{verifiedNoAward:true,source:'Installed MCP readback: reward hash 7529dddd2e04426432a1fdc113086a6b; trigger hashes c06b9bc893b963718ccac1ffc6aeec91 and ea97f832f60b21eb2606f730f18324f6; legacy content floor 20; social_post_share absent and rechecked before write',observedAt:'2026-10-14T00:12:26.061017Z'}});
 await page.screenshot({path:path.join(evidence,'final-native-upload.png')});
 const finalHealth=await (await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(20000)})).json();assert.equal(finalHealth.commitSha,expected);report.finalHealth=finalHealth;
 report.status='passed';
} catch(error) { report.status='failed';report.error=safe(error?.stack || error); if(page) await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});process.exitCode=1;
} finally {
 await browser?.close();if(session) await client.auth.signOut({scope:'local'});report.finishedAt=new Date().toISOString();
 fs.writeFileSync(path.join(evidence,'phase8-live-authenticated.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.length,uploadFixtureRemoved:report.uploadFixtureRemoved,trackingFixtureRemoved:report.trackingFixtureRemoved,error:report.error}));
}
