const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://nscdmxldtyszyvcxxwgr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zY2RteGxkdHlzenl2Y3h4d2dyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTU2MTE5MywiZXhwIjoyMDk3MTM3MTkzfQ.fu9rj-XG3DvjUVO-SteDCnaEbZlS9uxCX5aIOdRMsOI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('secure_vault').select('*');
  console.log(error ? error : data);
}
run();
