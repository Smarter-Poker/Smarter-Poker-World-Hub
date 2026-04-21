import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.production.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2].replace(/^"|"(.*?)$/g, '$1');
});

const url = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const key = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(url, key);

async function run() {
  const { count: authCount, error: authError } = await supabase.auth.admin.listUsers();
  console.log("Auth users:", authCount || (authError ? authError.message : authCount));

  const { count: profileCount, error: profileErr } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  console.log("Profiles count:", profileCount);

  // Let's get the first profile to see columns
  const { data } = await supabase.from('profiles').select('*').limit(1);
  if (data && data.length) console.log("Profile columns:", Object.keys(data[0]).join(', '));
}
run();
