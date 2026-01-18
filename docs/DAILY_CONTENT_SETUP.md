# Daily AI Content System — Manual Setup Instructions

## Quick Setup (5 minutes)

The system account and daily content generator are ready to deploy. Follow these steps:

---

## Step 1: Create System Account in Database

Open the **Supabase Dashboard** → **SQL Editor** and run this SQL:

```sql
-- Create the Smarter.Poker system account
INSERT INTO profiles (
    id,
    username,
    full_name,
    email,
    xp_total,
    diamonds,
    skill_tier,
    email_verified,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    'smarter.poker',
    'Smarter.Poker',
    'system@smarter.poker',
    999999,
    0,
    'System',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    updated_at = NOW();

-- Verify system account was created
SELECT id, username, full_name, xp_total 
FROM profiles 
WHERE id = '00000000-0000-0000-0000-000000000001';
```

You should see output showing the system account with username `smarter.poker`.

---

## Step 2: Update RLS Policy for System Posting

Still in the **SQL Editor**, run this to allow service-role posting:

```sql
-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can create their own posts" ON social_posts;

-- Create new policy that allows system account posting
CREATE POLICY "Users can create their own posts"
    ON social_posts
    FOR INSERT
    WITH CHECK (
        -- Normal users can only create posts as themselves
        author_id = auth.uid()
        OR
        -- Service role can create posts for the system account
        (
            auth.jwt() ->> 'role' = 'service_role'
            AND author_id = '00000000-0000-0000-0000-000000000001'::UUID
        )
    );

-- Verify policy exists
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'social_posts' 
AND policyname = 'Users can create their own posts';
```

---

## Step 3: Test System Account Posting

From your terminal in the `hub-vanguard` directory, run:

```bash
node scripts/test-system-post.js
```

This will:
- ✅ Verify the system account exists
- ✅ Create a "Welcome to Daily Strategy" test post
- ✅ Confirm the post appears in the social feed

Expected output:
```
🎉 ALL TESTS PASSED!
✅ System account exists and is configured correctly
✅ System can create posts via service role
✅ Posts appear in the social feed for all users
```

---

## Step 4: Publish Daily Content

Once testing passes, generate today's content:

```bash
node scripts/daily-content-generator.js
```

This will publish a poker strategy tip to the social feed as the Smarter.Poker system account.

---

## Step 5: Verify in UI

1. Navigate to `https://smarter.poker/hub/social-media`
2. You should see posts from "Smarter.Poker" in the feed
3. Verify the posts display correctly with system account attribution

---

## Automated Daily Posting (Future)

To automate daily content, add a cron job or Vercel cron:

### Option A: Vercel Cron (Recommended)

Create `pages/api/cron/daily-content.js`:

```javascript
import { publishDailyContent } from '../../../scripts/daily-content-generator.js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const post = await publishDailyContent();
    res.status(200).json({ success: true, post });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
```

Then add to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/daily-content",
    "schedule": "0 12 * * *"
  }]
}
```

This will run daily at 12:00 PM UTC.

---

## Troubleshooting

### "Invalid API key" error

Make sure `.env.local` contains:
```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get the service role key from:
**Supabase Dashboard** → **Settings** → **API** → **service_role key (secret)**

### Posts not appearing in feed

1. Check system account exists: `SELECT * FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001'`
2. Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'social_posts'`
3. Verify post was created: `SELECT * FROM social_posts WHERE author_id = '00000000-0000-0000-0000-000000000001'`

### System account shows as "Anonymous"

The `fn_get_social_feed` function joins with `profiles` table. Verify:
1. System account exists in profiles
2. The feed function is using the correct join

---

## Files Created

- ✅ `supabase/migrations/20260117_system_account_setup.sql` - Database migration
- ✅ `scripts/setup-system-account.js` - Automated setup script
- ✅ `scripts/daily-content-generator.js` - Content generation engine
- ✅ `scripts/test-system-post.js` - Verification script

All files are ready to use!
