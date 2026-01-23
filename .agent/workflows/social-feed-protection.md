---
description: MANDATORY verification after ANY changes to social feed, RLS policies, or auth systems
---
# 🛡️ Social Feed Protection Protocol

**THIS IS MANDATORY** - The social feed has broken 4+ times due to unverified changes.

## When This Applies

You MUST run verification if you modify:
- `pages/hub/social-media.js`
- `pages/hub/reels.js`
- Any Supabase RLS policies on `social_posts` or `reels`
- `src/lib/authUtils.js`
- `src/lib/supabase.js`
- Any JWT/session handling code

## Verification Checklist

Before pushing ANY changes that touch the above files:

// turbo-all
### 1. Build Verification
```bash
npm run build
```
Must complete without errors.

### 2. Posting Test
1. Navigate to https://smarter.poker/hub/social-media
2. Log in if needed
3. Type a test message and click Post
4. **VERIFY**: Post appears in feed with "Just now" timestamp
5. **VERIFY**: No "Unable to post" error

### 3. Link Preview Test
1. Paste a URL (e.g., https://www.pokernews.com/news/)
2. Wait for preview to load
3. **VERIFY**: Preview shows image (full width, no black bars)
4. **VERIFY**: Click preview opens internal popup (NOT new tab)

### 4. Reels Test
1. Navigate to /hub/reels
2. Click on a video
3. **VERIFY**: Opens in fullscreen black-background viewer
4. **VERIFY**: Video plays

### 5. RLS Policy Check (if you touched Supabase)
Run in Supabase SQL Editor:
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'social_posts';
```

Expected policies:
| policyname | cmd |
|------------|-----|
| Authenticated users can post | INSERT |
| Anyone can view posts | SELECT |
| Users can update own posts | UPDATE |
| Users can delete own posts | DELETE |

## If Something Breaks

1. **Posting broken?** Re-run `/supabase/migrations/20260123_social_posts_rls.sql`
2. **Feed empty?** Check JWT - have user log out and back in
3. **Link previews broken?** Check `/api/link-preview` endpoint

## Critical Code Sections

DO NOT MODIFY without understanding consequences:

1. **LinkPreviewCard** (lines 300-420 in social-media.js)
   - Uses `useExternalLink` for internal popups
   - Image uses `aspectRatio: '16/9'` and `objectFit: 'cover'`

2. **handlePost function** 
   - Sets `author_id` from authenticated user
   - Inserts to `social_posts` table

3. **RLS INSERT Policy**
   - MUST be `WITH CHECK (true)` for authenticated
   - NOT `WITH CHECK (auth.uid() = author_id)` - that breaks inserts!
