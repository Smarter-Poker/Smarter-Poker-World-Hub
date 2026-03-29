const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deploy() {
  const sql = `
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tournament_reminders BOOLEAN DEFAULT true,
    social_mentions BOOLEAN DEFAULT true,
    friend_activity BOOLEAN DEFAULT false,
    venue_alerts BOOLEAN DEFAULT true,
    daily_challenges BOOLEAN DEFAULT true,
    messenger BOOLEAN DEFAULT true,
    diamond_rewards BOOLEAN DEFAULT true,
    club_updates BOOLEAN DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.user_notification_preferences;
    DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.user_notification_preferences;
    DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.user_notification_preferences;
END $$;

CREATE POLICY "Users can view own notification preferences" 
ON public.user_notification_preferences FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences" 
ON public.user_notification_preferences FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences" 
ON public.user_notification_preferences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP trigger IF EXISTS handle_updated_at ON public.user_notification_preferences;
create trigger handle_updated_at before update on public.user_notification_preferences
for each row execute procedure moddatetime (updated_at);
  `;

  console.log('Deploying schema to Supabase...');
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

  if (error) {
    if (error.message && error.message.includes('Could not find the function')) {
      // Sometimes it's called exec_sql with 'sql' parameter, or sometimes direct DB call
      console.log('Fall back to direct Supabase query if exec_sql fails:', error.message);
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ sql })
      });
      if (!res.ok) {
        console.error('REST fallback failed:', await res.text());
      } else {
        console.log('REST fallback succeeded!');
      }
    } else {
        console.error('Error executing SQL:', error);
    }
  } else {
    console.log('Success:', data);
  }
}

deploy();
