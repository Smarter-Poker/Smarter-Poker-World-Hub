const https = require('https');

const url = new URL('https://nscdmxldtyszyvcxxwgr.supabase.co/rest/v1/agg_team?select=*&limit=2');

const options = {
  headers: {
    'apikey': process.env.NEXT_PUBLIC_MLB_SUPABASE_ANON_KEY || 'missing',
    'Authorization': 'Bearer ' + (process.env.NEXT_PUBLIC_MLB_SUPABASE_ANON_KEY || 'missing')
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', data));
}).on('error', err => console.log('Error:', err));
