const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const httpFetch = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, { timeout: 12000 }, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('TIMEOUT')); });
});

async function getAllVenueIds() {
  const vids = new Map();
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data } = await sb
      .from('venue_daily_tournaments')
      .select('venue_id, venue_name')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    data.forEach(r => { if (r.venue_id) vids.set(r.venue_id, r.venue_name || String(r.venue_id)); });
    if (data.length < 1000) break;
  }
  return vids;
}

async function main() {
  const vids = await getAllVenueIds();
  const entries = [...vids.entries()];
  console.log('Total distinct venues in DB: ' + entries.length);

  let pass = 0, failZero = [], failHttp = [], caseIssues = [];

  for (let i = 0; i < entries.length; i++) {
    const [vid, name] = entries[i];
    try {
      const r = await httpFetch('https://smarter.poker/api/poker/daily-tournaments?venue_id=' + vid + '&day=all');
      if (r.status !== 200) {
        failHttp.push({ id: vid, name, status: r.status });
        continue;
      }
      const json = JSON.parse(r.body);
      const count = (json.tournaments || []).length;
      if (count === 0) {
        failZero.push({ id: vid, name });
      } else {
        pass++;
        const days = [...new Set((json.tournaments || []).map(t => t.day_of_week || ''))];
        const badDays = days.filter(d => {
          if (!d || d === 'Daily') return false;
          return d !== d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
        });
        if (badDays.length) caseIssues.push({ id: vid, name, badDays });
      }
    } catch(e) {
      failHttp.push({ id: vid, name, err: e.message });
    }
    if ((i+1) % 50 === 0) console.log('  ' + (i+1) + '/' + entries.length + ' tested...');
    await new Promise(r => setTimeout(r, 80));
  }

  console.log('\n========== FINAL RESULTS ==========');
  console.log('PASS  (API returned tournaments):  ' + pass + '/' + entries.length + ' (' + Math.round(pass/entries.length*100) + '%)');
  console.log('ZERO  (API returned 0 results):    ' + failZero.length);
  console.log('ERROR (HTTP error):                ' + failHttp.length);
  console.log('Day case issues detected:          ' + caseIssues.length);

  if (failZero.length) {
    console.log('\n--- ZERO-RESULT (DB has records but API returned empty): ---');
    failZero.forEach(v => console.log('  ZERO [' + v.id + '] ' + v.name));
  }
  if (failHttp.length) {
    console.log('\n--- HTTP ERRORS: ---');
    failHttp.forEach(v => console.log('  ERR  [' + v.id + '] ' + v.name + ' | ' + (v.status || v.err)));
  }
  if (caseIssues.length) {
    console.log('\n--- day_of_week CASE ISSUES: ---');
    caseIssues.slice(0, 20).forEach(v => console.log('  CASE [' + v.id + '] ' + v.name + ' | ' + v.badDays.join(', ')));
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
