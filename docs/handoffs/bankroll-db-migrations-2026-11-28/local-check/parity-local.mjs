import { execFileSync } from 'node:child_process';
import { diffTotals, totalsFromRows } from '../../../../src/lib/bankroll/bankrollTotals.mjs';
const psql = (sql) => execFileSync('psql', ['-h','/tmp/pgw4','-p','55432','-U','postgres','-d','w4','-tAq','-v','ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1e8 }).trim();
const U = '33333333-3333-3333-3333-333333333333';
const L = ['aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000003'];
psql(`INSERT INTO auth.users VALUES ('${U}') ON CONFLICT DO NOTHING; INSERT INTO public.profiles(id) VALUES ('${U}') ON CONFLICT DO NOTHING`);
psql(`INSERT INTO public.bankroll_locations(id,user_id,name) VALUES ('${L[0]}','${U}','x'),('${L[1]}','${U}','y') ON CONFLICT DO NOTHING`);
psql(`INSERT INTO public.bankroll_segments(user_id,segment_type,initial_deposit) VALUES ('${U}','poker',250.55),('${U}','casino',10),('${U}','life',77)`);
let seed = 42; const r = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const cats = ['poker_cash','poker_mtt','casino_table','slots','sports','expense','deposit','withdrawal'];
const vals = [];
for (let i = 0; i < 3000; i++) {
  const d = `2025-${String(1+Math.floor(r()*12)).padStart(2,'0')}-${String(1+Math.floor(r()*28)).padStart(2,'0')}`;
  const t = r() > 0.25;
  const st = t ? `'${d}T${String(Math.floor(r()*24)).padStart(2,'0')}:${String(Math.floor(r()*60)).padStart(2,'0')}:07.123+00'` : 'null';
  const en = t ? (r() > 0.1 ? `'${d}T${String(Math.floor(r()*24)).padStart(2,'0')}:${String(Math.floor(r()*60)).padStart(2,'0')}:59.987+00'` : st) : 'null';
  const loc = r() > 0.6 ? `'${L[Math.floor(r()*2)]}'` : 'null';
  const gi = (r()*2000 - (r()>0.95?500:0)).toFixed(2), go = (r()*2500).toFixed(2);
  vals.push(`('${U}','${cats[Math.floor(r()*8)]}',${loc},'${d}',${st},${en},${gi},${go},false)`);
}
psql(`INSERT INTO public.bankroll_ledger(user_id,category,location_id,entry_date,start_time,end_time,gross_in,gross_out,is_revision) VALUES ${vals.join(',')}`);
const rows = JSON.parse(psql(`SELECT coalesce(json_agg(json_build_object('id',id,'category',category,'location_id',location_id,'entry_date',entry_date,'start_time',start_time,'end_time',end_time,'gross_in',gross_in,'gross_out',gross_out,'is_revision',is_revision)),'[]') FROM public.bankroll_ledger WHERE user_id='${U}'`));
const segments = JSON.parse(psql(`SELECT json_agg(json_build_object('segment_type',segment_type,'initial_deposit',initial_deposit)) FROM public.bankroll_segments WHERE user_id='${U}'`));
let bad = 0;
for (const w of [{}, {from:'2025-03-01',to:'2025-07-31'}, {locationId:L[0]}, {from:'2025-12-01', locationId:L[1]}, {from:'2030-01-01'}]) {
  const sql = JSON.parse(psql(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${U}',false); SELECT public.fn_bankroll_totals(${w.from?`'${w.from}'`:'null'},${w.to?`'${w.to}'`:'null'},${w.locationId?`'${w.locationId}'`:'null'})`).split('\n').pop());
  const d = diffTotals(sql, totalsFromRows({ ledgerRows: rows, segments, ...w }));
  console.log(JSON.stringify(w), d.length ? d : 'MATCH', 'sessions', sql.period.session_count);
  bad += d.length;
}
process.exit(bad ? 1 : 0);
