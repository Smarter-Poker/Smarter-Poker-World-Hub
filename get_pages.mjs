import fs from 'fs';
const envFile = fs.readFileSync('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local', 'utf8');
let url = '', key = '';
for (const line of envFile.split('\n')) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].replace(/['"]/g, '').trim();
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=')[1].replace(/['"]/g, '').trim();
}
async function run() {
  const res = await fetch(`${url}/rest/v1/social_pages?select=id,name,page_type,owner_id,linked_venue_id`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  const myPages = data.filter(p => p.owner_id === '47965354-0e56-43ef-931c-ddaab82af765');
  console.log('My Pages:', myPages);
}
run();
