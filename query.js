const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
if (!urlMatch || !keyMatch) {
  console.log("No env");
  process.exit(1);
}
const url = urlMatch[1];
const key = keyMatch[1];

fetch(`${url}/rest/v1/video_transcode_jobs?select=status`, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
}).then(r => r.json()).then(data => {
  const stats = data.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    acc.total = (acc.total || 0) + 1;
    return acc;
  }, {});
  console.log(stats);
}).catch(console.error);
