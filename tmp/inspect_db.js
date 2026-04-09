require('dotenv').config({ path: '.agent/skills/credentials/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
  const { data: series, error: sErr } = await supabase.from('poker_series').select('*').limit(1);
  if (sErr) console.error('Series Error:', sErr);
  else console.log('poker_series columns:', Object.keys(series[0] || {}));

  const { data: events, error: eErr } = await supabase.from('poker_events').select('*').limit(1);
  if (eErr) console.error('Events Error:', eErr);
  else console.log('poker_events columns:', Object.keys(events[0] || {}));
}

inspect();
