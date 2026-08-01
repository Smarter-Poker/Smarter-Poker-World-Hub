#!/usr/bin/env node
/**
 * DEEP AUDIT: venue_daily_tournaments
 * Pulls ALL records and identifies:
 * 1. Impossible times (before 8 AM or midnight artifacts)
 * 2. Garbage buy-ins (not divisible by 5, or obviously wrong scraped numbers)
 * 3. Garbage tournament names (HTML artifact strings)
 */

const { createClient } = require('../node_modules/@supabase/supabase-js');
const fs = require('fs');

const url = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

// Parse time string to minutes (returns -1 if unparseable)
function parseToMinutes(t) {
  if (!t) return -1;
  t = t.trim();
  // Strip seconds
  let m = t.match(/^(\d{1,2}):(\d{2}):\d{2}\s*([AP]M)?$/i);
  if (m) { let h=+m[1],min=+m[2],p=(m[3]||'').toUpperCase(); if(p==='PM'&&h!==12)h+=12; if(p==='AM'&&h===12)h=0; return h*60+min; }
  m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (m) { let h=+m[1],min=+m[2],p=(m[3]||'').toUpperCase(); if(p==='PM'&&h!==12)h+=12; if(p==='AM'&&h===12)h=0; return h*60+min; }
  m = t.match(/^(\d{1,2})\s*([AP]M)$/i);
  if (m) { let h=+m[1],p=m[2].toUpperCase(); if(p==='PM'&&h!==12)h+=12; if(p==='AM'&&h===12)h=0; return h*60; }
  return -1;
}

// Real poker buy-ins are almost always divisible by 5
// and in the range $20-$50000
// Exceptions: some venues use $11, $22, $33, $44, $55, $66, $77, $88, $99 (sat structures)
// But $29, $28, $87 are clearly wrong
function isValidBuyin(b) {
  if (!b || b < 15 || b > 50000) return false;
  // Divisible by 5 = standard
  if (b % 5 === 0) return true;
  // Divisible by 11 = common satellite structure ($11, $22, $33...)
  if (b % 11 === 0) return true;
  // Some common non-round: $165, $115, $215 etc (rarely other)
  // Allow if within 1 of a multiple of 5 (e.g. $101, $199 etc are borderline)
  // STRICT: anything not divisible by 5 or 11 is suspicious
  return false;
}

// Garbage tournament name patterns (HTML artifacts)
const GARBAGE_NAME_PATTERNS = [
  /^@context$/i,
  /^@type$/i,
  /^viewport$/i,
  /^pdf_action$/i,
  /^fc-head/i,
  /^rh-flat/i,
  /^og:/i,
  /^http/i,    // URL accidentally scraped as name
  /^null$/i,
  /^undefined$/i,
  /^\s*$/,
  /^[0-9]+$/,  // pure number
  /schema\.org/i,
  /^cookie/i,
];

function isGarbageName(name) {
  if (!name) return false;
  return GARBAGE_NAME_PATTERNS.some(p => p.test(name.trim()));
}

async function fetchAll() {
  const BATCH = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('venue_daily_tournaments')
      .select('id, venue_name, day_of_week, start_time, buy_in, tournament_name, source_url, is_active, data_quality')
      .eq('is_active', true)
      .eq('data_quality', 'scraped_verified')
      .order('id')
      .range(offset, offset + BATCH - 1);
    if (error) { console.error('Error:', error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    console.log(`  Fetched ${all.length} so far...`);
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return all;
}

async function main() {
  console.log('Fetching ALL active scraped_verified records...');
  const all = await fetchAll();
  console.log(`Total records: ${all.length}`);

  const badTime = [];
  const badBuyin = [];
  const badName = [];
  const allBadIds = new Set();

  // Audit each record
  for (const r of all) {
    const mins = parseToMinutes(r.start_time);
    const timeOk = mins === -1 || (mins >= 8*60 && mins <= 23*60); // 8AM to midnight
    
    // Bad time: < 8AM (when parsed), or some specific early-AM explicit strings
    const isExplicitEarlyAM = /^(0?[0-7]:[0-5][0-9]\s*(AM)?|[1-7]\s*AM|0?[0-7]:[0-5][0-9])$/i.test((r.start_time||'').trim());
    
    if (!timeOk || (mins !== -1 && mins < 8*60)) {
      badTime.push({ id: r.id, venue: r.venue_name, time: r.start_time, buy_in: r.buy_in, mins });
      allBadIds.add(r.id);
    }
    
    if (!isValidBuyin(r.buy_in)) {
      badBuyin.push({ id: r.id, venue: r.venue_name, time: r.start_time, buy_in: r.buy_in, name: r.tournament_name });
      allBadIds.add(r.id);
    }
    
    if (isGarbageName(r.tournament_name)) {
      badName.push({ id: r.id, venue: r.venue_name, time: r.start_time, buy_in: r.buy_in, name: r.tournament_name });
      allBadIds.add(r.id);
    }
  }

  console.log('\n=== AUDIT RESULTS ===');
  console.log(`Bad times (<8AM): ${badTime.length}`);
  console.log(`Bad buy-ins (not div by 5 or 11): ${badBuyin.length}`);
  console.log(`Garbage names: ${badName.length}`);
  console.log(`Total unique bad records: ${allBadIds.size}`);

  // Show bad times
  console.log('\n--- BAD TIMES ---');
  badTime.forEach(r => console.log(`  ${r.time} | ${r.venue} | $${r.buy_in} | mins=${r.mins}`));
  
  // Show bad buy-ins
  console.log('\n--- BAD BUY-INS (sample) ---');
  // Group by buy-in amount
  const byBuyin = {};
  badBuyin.forEach(r => { if (!byBuyin[r.buy_in]) byBuyin[r.buy_in] = []; byBuyin[r.buy_in].push(r); });
  Object.entries(byBuyin).sort((a,b)=>+a[0]-+b[0]).forEach(([b,recs]) => {
    console.log(`  $${b} x${recs.length}: ${recs.slice(0,2).map(r=>r.venue).join(', ')}`);
  });

  // Show garbage name examples
  console.log('\n--- GARBAGE NAMES (sample) ---');
  badName.slice(0, 20).forEach(r => console.log(`  "${r.name}" | ${r.venue} | $${r.buy_in}`));

  // Generate the IDs to deactivate
  const idsToDeactivate = [...allBadIds];
  console.log(`\nTotal to deactivate: ${idsToDeactivate.length}`);
  
  // Save full bad records to file
  const report = { 
    total: all.length, 
    badTime, badBuyin, badName, 
    allBadIds: idsToDeactivate,
    summary: {
      badTimeCount: badTime.length,
      badBuyinCount: badBuyin.length,
      badNameCount: badName.length,
      totalBadCount: idsToDeactivate.length
    }
  };
  fs.writeFileSync('/tmp/tournament_audit.json', JSON.stringify(report, null, 2));
  console.log('\nFull report saved to /tmp/tournament_audit.json');
  
  // Generate SQL to deactivate all bad records
  if (idsToDeactivate.length > 0) {
    const sql = `-- Deactivate ${idsToDeactivate.length} garbage records identified by deep audit\n` +
      `-- Bad times: ${badTime.length}, Bad buy-ins: ${badBuyin.length}, Garbage names: ${badName.length}\n` +
      `UPDATE venue_daily_tournaments\nSET is_active = false\nWHERE id IN (\n  '${idsToDeactivate.join("',\n  '")}'\n);`;
    fs.writeFileSync('/tmp/deactivate_bad_tournaments.sql', sql);
    console.log('SQL saved to /tmp/deactivate_bad_tournaments.sql');
  }
}

main().catch(console.error);
