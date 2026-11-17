import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const parent=process.env.MESSENGER_UI_ROOT||process.env.RUNNER_TEMP;
assert(parent,'Task-owned external or hosted runner scratch required');
if(process.platform==='darwin') assert.notEqual(statSync(parent).dev,statSync('/').dev,'External disk required');
const scratch=mkdtempSync(path.join(parent,'messenger-ui-'));let browser,server;
try {
 await build({entryPoints:[path.join(root,'__tests__/fixtures/messenger-accounting-ui.jsx')],outfile:path.join(scratch,'fixture.js'),bundle:true,format:'iife',loader:{'.js':'jsx'},plugins:[{name:'isolated-transport',setup(b){
  b.onResolve({filter:/lib\/authUtils$/},()=>({path:'auth-fixture',namespace:'fixture'}));b.onResolve({filter:/^next\/head$/},()=>({path:'head-fixture',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='head-fixture'?'export default function Head(){return null;}':"export const getAccessToken=()=> 'synthetic-local-fixture'; export async function authedFetch(url,options){const response=await window.testRequest(url,JSON.parse(options.body));return {ok:response.status<400,status:response.status,json:async()=>response.body};}"}));
 }}]});
 server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?readFileSync(path.join(scratch,'fixture.js')):'<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#18191b;color:white;font-family:system-ui"><div id="root"></div><script src="/fixture.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const executablePath=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync)||puppeteer.executablePath();
 browser=await puppeteer.launch({executablePath,headless:true,userDataDir:path.join(scratch,'profile'),args:process.platform==='linux'?['--no-sandbox']:[]});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const week='2026-11-16T08:00:00Z';let paid=0,records=[],failOnce=false,deleted=false,bulk=false;
 const doc={scope:'agent',club_name:'Fixture Club',message_id:'statement-1',conversation_id:'conversation-1',period_end:week,payload:{period_start:'2026-11-09T08:00:00Z',period_end:week,agent_user_id:'fixture',totals:{poker_net:10,fees:100,player_rakeback:5,agent_net:45},people:[]}};
 await page.exposeFunction('testRequest',async(url,body)=>{
  if(url.endsWith('/statements'))return {status:200,body:{success:true,documents:deleted?[]:[doc]}};
  if(url.endsWith('/delete-message')){assert.equal(body.deleteType,'for_me');deleted=true;return {status:200,body:{success:true}};}
  if(body.action==='record'){
   for(const item of body.payments){const previous=records.find(r=>r.operation_id===item.operation_id);if(!previous){paid+=item.amount;records.push(item);}}
   if(failOnce){failOnce=false;return {status:503,body:{success:false,error:'Connection lost after recording; retry same payment'}};}
   return {status:200,body:{success:true}};
  }
  return {status:200,body:{success:true,weeks:[week],invoices:(bulk?[0,1]:[0]).map(n=>({id:n?'33333333-3333-4333-8333-333333333333':'22222222-2222-4222-8222-222222222222',kind:'credit',number:'TEST-'+n,recipient:'Downline agent '+n,direction:'Payment to receive',remaining:100-paid/(bulk?2:1),paid:paid/(bulk?2:1),owed:100,status:paid===(bulk?200:100)?'paid':paid?'partial':'unpaid',receipts:[]}))}};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button,summary')].some(e=>e.textContent.trim()===t&&!e.disabled),{},text);await page.evaluate(t=>[...document.querySelectorAll('button,summary')].findLast(e=>e.textContent.trim()===t&&!e.disabled).click(),text);};
 await page.setViewport({width:375,height:812});await page.evaluate(()=>window.showFixture('payments'));await click('Weekly payment tracking');await click('Record payment');
 await page.$eval('[aria-label="Payment amount"]',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'40');e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.type('[aria-label="Payment reference"]','receipt-1');await click('Confirm payment');await page.waitForFunction(()=>document.body.textContent.includes('Partially paid'));
 assert.equal(paid,40);await click('Record payment');await page.type('[aria-label="Payment reference"]','receipt-2');failOnce=true;await click('Confirm payment');await page.waitForFunction(()=>document.body.textContent.includes('Retry same payment'));
 assert.equal(paid,100);await click('Retry same payment');await page.waitForFunction(()=>!document.body.textContent.includes('Retry same payment')&&document.body.textContent.includes('Remaining 0.00'));
 assert.equal(records.length,2,'Unknown outcome retry must use the same operation');assert.equal(paid,100);
 bulk=true;paid=0;records=[];await page.evaluate(()=>window.showFixture('payments',1));await click('Weekly payment tracking');await click('Mark all agents paid (2)');await page.type('[aria-label="Payment reference"]','bulk-receipt');await click('Confirm payment');await page.waitForFunction(()=>document.body.textContent.includes('Remaining 0.00')&&!document.body.textContent.includes('Confirm payment'));assert.equal(records.length,2);assert.equal(paid,200);
 await page.evaluate(()=>window.showFixture('statements'));await click('Delete for me');await click('Delete for me');await page.waitForFunction(()=>document.body.textContent.includes('No saved statements'));
 await page.evaluate(()=>window.showFixture('statements',1));await page.waitForFunction(()=>document.body.textContent.includes('No saved statements'));
 await page.evaluate(()=>window.showFixture('large'));await page.waitForFunction(()=>document.body.textContent.includes('511,435.72'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=375),'Large club totals overflow mobile statement');assert(await page.$$eval('dd',items=>items.every(e=>e.scrollWidth<=e.clientWidth)), 'Large figures must fit their own value cells');
 await page.evaluate(()=>window.showFixture('designs'));await page.waitForFunction(()=>document.querySelectorAll('[data-document-design]').length===3);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=375),'Mobile statements overflow');
 if(process.env.MESSENGER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.MESSENGER_UI_EVIDENCE,'statement-options-mobile.png'),fullPage:true});
 await page.setViewport({width:1440,height:1000});
 if(process.env.MESSENGER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.MESSENGER_UI_EVIDENCE,'statement-options-desktop.png'),fullPage:true});
 await click('Invoices');assert.equal(await page.$$eval('[data-document-design]',items=>items.length),3);
 if(process.env.MESSENGER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.MESSENGER_UI_EVIDENCE,'invoice-options-desktop.png'),fullPage:true});
 await page.setViewport({width:375,height:812});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=375),'Mobile invoices overflow');
 if(process.env.MESSENGER_UI_EVIDENCE)await page.screenshot({path:path.join(process.env.MESSENGER_UI_EVIDENCE,'invoice-options-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Real browser components passed: partial payment, unknown-outcome retry, saved deletion/reopen, all six mobile/desktop designs.');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));rmSync(scratch,{recursive:true,force:true});}
