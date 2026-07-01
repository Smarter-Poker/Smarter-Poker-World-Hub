const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const mlbDb = createClient(process.env.MLB_SUPABASE_URL || 'https://nscdmxldtyszyvcxxwgr.supabase.co', process.env.MLB_SUPABASE_SERVICE_KEY);

function chicagoYmd(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function utcDayRange(ymd) {
  const start = new Date(`${ymd}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function slateYmdFromTs(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function fetchAllRows(build, pageSize = 1000, maxRows = 20000) {
  let all = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) { console.error('fetchError', error); throw error; }
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

(async () => {
    const today = chicagoYmd(new Date());
    const { startIso: todayStart, endIso: todayEnd } = utcDayRange(today);
    let slateDate = today;

    console.log('today', today, 'todayStart', todayStart, 'todayEnd', todayEnd);

    const { data: todayCheck, error: todayErr } = await mlbDb
      .from('pred_props')
      .select('as_of_ts')
      .gte('as_of_ts', todayStart)
      .lt('as_of_ts', todayEnd)
      .or('best_price.not.is.null,best_price_under.not.is.null')
      .limit(1);
    
    console.log('todayCheck', todayCheck);

    if (!todayCheck || todayCheck.length === 0) {
      const { data: latestRowRaw, error: latestErr } = await mlbDb
        .from('pred_props')
        .select('as_of_ts')
        .lt('as_of_ts', todayEnd)
        .or('best_price.not.is.null,best_price_under.not.is.null')
        .order('as_of_ts', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('latestRowRaw', latestRowRaw, latestErr);
      if (latestRowRaw?.as_of_ts) {
        slateDate = slateYmdFromTs(latestRowRaw.as_of_ts);
      }
    }
    console.log('slateDate resolved to:', slateDate);

    const { startIso, endIso } = utcDayRange(slateDate);
    console.log('Fetching props between', startIso, endIso);

    const rawProps = await fetchAllRows(() => mlbDb
      .from('pred_props')
      .select('game_pk, as_of_ts, player_id, prop, line, proj_mean, prob_over, blended_over, market_novig_over, best_lines, best_price, best_book, best_price_under, best_book_under, best_lines_under, rec, kelly_pct, result, pnl')
      .gte('as_of_ts', startIso)
      .lt('as_of_ts', endIso)
      .not('prop', 'is', null)
      .or('best_price.not.is.null,best_price_under.not.is.null')
      .order('kelly_pct', { ascending: false, nullsFirst: false })
    ).catch(err => {
      console.error('[API/MLB/Props] pred_props error:', err);
      return null;
    });

    console.log('rawProps length', rawProps?.length);
    if (rawProps?.length > 0) {
       console.log('First prop:', rawProps[0]);
    }
})();
