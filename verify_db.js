import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://kuklfnapbkmacvwxktbh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

async function verify() {
  // Check for ANY remaining bad bios
  const { data: badBios, error: e1 } = await supabase
    .from('content_authors')
    .select('name, alias, bio')
    .or('bio.ilike.%AI grinder%,bio.ilike.%horse persona%,bio.ilike.%smarter.poker%,bio.ilike.%Club Arena%')
    .limit(20);

  console.log('=== BAD BIOS REMAINING ===');
  console.log(`Found: ${badBios?.length || 0}`);
  if (badBios?.length > 0) {
    badBios.forEach(b => console.log(`  ❌ ${b.name} (@${b.alias}): ${b.bio?.substring(0, 80)}...`));
  }

  // Check for any old-pattern aliases (City+Name or underscore patterns)
  const { data: sample, error: e2 } = await supabase
    .from('content_authors')
    .select('name, alias, bio')
    .order('name')
    .limit(20);

  console.log('\n=== FIRST 20 AUTHORS (verify new aliases) ===');
  sample?.forEach(a => console.log(`  ${a.name}: @${a.alias} | "${a.bio?.substring(0, 60)}..."`));

  // Count total
  const { count } = await supabase
    .from('content_authors')
    .select('*', { count: 'exact', head: true });
  console.log(`\nTotal authors: ${count}`);
}

verify().catch(console.error);
