import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NjQ0NDMsImV4cCI6MjA4MjI0MDQ0M30.xxx'; // Need actual anon key if available or we can use service_role to create a JWT for a user

// Let's use the service_role key to act as a user, or actually, the error is an ambiguous column trigger which should trigger for service_role too, EXCEPT maybe it's related to the `select()` returned by `insert().select()`!
// Ah, `insert().select()` in `handlePost` does a SELECT after insert!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: profile } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  const authorId = profile.id;

  const { data: insertData, error: insertError } = await supabase
    .from('social_posts')
    .insert({
      author_id: authorId,
      content: 'test',
      content_type: 'video',
      media_urls: ['http://example.com/video.mp4'],
      visibility: 'public'
    })
    .select(); // <--- This select() might be what's causing "ambiguous column" trigger/error!
  
  console.log('insert result:', insertData, 'error:', insertError);
}
check();
