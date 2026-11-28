import { chromium } from '/home/claude/smarter-poker-world-hub/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:3000';
const uid = '00000000-0000-4000-8000-0000000000aa';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now()/1000) + 3600*6;
const jwt = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:uid,exp,role:'authenticated',aud:'authenticated',email:'fixture@example.test'})}.sig`;
const user = { id: uid, aud:'authenticated', role:'authenticated', email:'fixture@example.test', user_metadata:{ username:'FixturePlayer' }, app_metadata:{}, created_at:'2026-01-01T00:00:00Z' };
const session = { access_token: jwt, token_type:'bearer', expires_in: 21600, expires_at: exp, refresh_token:'fixture-refresh', user };
const now = Date.now();
const sessions = Array.from({length: 14}, (_, i) => ({ id: `s${i}`, game_mode: ['range','speed_drill','pressure_cooker','pattern_recognition'][i%4], level: 1 + (i%3), score: 55 + (i*3)%45, accuracy: 0.55 + ((i*3)%45)/100, time_taken: 40 + i*3, created_at: new Date(now - i*86400000).toISOString(), completed: true }));
const json = (route, body, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const [,, prefix='si'] = process.argv;
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 393, height: 900 } });
await ctx.addInitScript(([s]) => { try { localStorage.setItem('smarter-poker-auth', s);
  localStorage.setItem('memory_session_history', JSON.stringify([60,72,81,88,93,77,85].map((score,i)=>({score, level:1+(i%2), position:['UTG','MP','HJ'][i%3], timestamp: Date.now()-i*3600000})))); } catch {} }, [JSON.stringify(session)]);
await ctx.route('https://example.supabase.co/**', async (route) => {
  const u = route.request().url();
  if (u.includes('/auth/v1/user')) return json(route, user);
  if (u.includes('/auth/v1/token')) return json(route, session);
  if (u.includes('/rest/v1/memory_game_sessions')) return json(route, sessions);
  if (u.includes('/rest/v1/rpc/get_user_achievements')) return json(route, [{ key:'first_game', unlocked:true, unlocked_at:'2026-11-20T12:00:00Z' }, { key:'perfect_range', unlocked:true, unlocked_at:'2026-11-22T12:00:00Z' }, { key:'speed_60', unlocked:true, unlocked_at:'2026-11-25T12:00:00Z' }]);
  if (u.includes('/rest/v1/')) return json(route, []);
  return json(route, {});
});
let slowScenario = false;
await ctx.route(`${BASE}/api/**`, async (route) => {
  const u = route.request().url();
  if (u.includes('/api/user/get-header-stats')) return json(route, { success: true, profile: { id: uid, username:'FixturePlayer', diamonds: 1250, is_vip: true, xp: 4200, level: 12 } });
  if (u.includes('/api/vip/check-status')) return json(route, { isVip: true });
  if (u.includes('/api/gto/get-weak-spots')) return json(route, { success: true, weakSpots: [{ area: 'BTN Opens', errorCount: 6 }, { area: 'BB Defense', errorCount: 4 }] });
  if (u.includes('/api/gto/lobby-suggestions')) return json(route, { success: true, suggestions: [{ actionType:'daily_challenge', message:'', action:'' }, { actionType:'start_level', levelId: 2, message:'Level 2 Is Open: Position Pulse', action:'Start Level 2' }, { actionType:'adaptive_training', message:'Train Your BTN Opens Leak', action:'Smart Practice' }] });
  if (u.includes('/api/memory/dashboard')) return json(route, { success: true, stats: { rolling_30d_sessions: 14, rolling_accuracy_pct: 84, mastered_levels_count: 1, highest_unlocked_level: 2, per_level_mastery: [{ level: 1, attempts: 8, best_accuracy: 92 }, { level: 2, attempts: 3, best_accuracy: 71 }] } });
  if (u.includes('/api/gto/generate-scenario')) { await new Promise(r => setTimeout(r, 6000)); return json(route, { success:false, error:'fixture' }, 503); }
  return route.continue();
});
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERR', e.message.slice(0,160)));
const shotFull = async (name) => { await p.waitForTimeout(1500); await p.screenshot({ path: `${prefix}-${name}.png`, fullPage: true }); };
await p.goto(`${BASE}/hub/preflop-charts`, { waitUntil: 'networkidle', timeout: 600000 }); await p.waitForTimeout(4000);
console.log('signed-in signals:', await p.evaluate(()=>({smart: document.querySelector('.preflop-primary-cta')?.textContent, weak: document.querySelectorAll('.preflop-weak-row').length, sugg: document.querySelectorAll('.preflop-suggestion-row').length, grade: !!document.querySelector('.preflop-grade-chip'), recent: !!document.querySelector('.preflop-recent'), aiDisabled: document.querySelector('.preflop-tool-button')?.disabled})));
await shotFull('menu');
// AI overlay
const ai = p.locator('.preflop-tool-button', { hasText: /AI Mode|AI On/ });
if (!(await ai.isDisabled())) { await ai.click(); await p.waitForTimeout(500); await p.locator('.preflop-level-card-action').first().click(); await p.waitForTimeout(1500); await p.screenshot({ path: `${prefix}-ai-overlay.png` }); console.log('overlay visible:', await p.locator('.preflop-ai-overlay').count()); }
for (const s of ['stats','achievements']) { await p.goto(`${BASE}/hub/preflop-charts/${s}`, { waitUntil: 'networkidle', timeout: 600000 }); await p.waitForTimeout(3500); await shotFull(s); }
await b.close();
