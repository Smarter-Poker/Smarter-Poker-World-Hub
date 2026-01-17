# 🚀 AVATAR ENGINE - QUICK SETUP (2 STEPS)

## Current Status:
- ✅ Environment variables configured
- ✅ 75 avatar images ready (25 FREE, 50 VIP)
- ✅ OpenAI API key working
- ❌ Database tables missing
- ❌ Storage bucket missing

---

## STEP 1: Deploy Database (3 minutes)

### Option A: Supabase Dashboard (Recommended)
1. Open [https://supabase.com](https://supabase.com)
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy and paste the entire contents of:
   `/database/migrations/avatar_system.sql`
6. Click **Run**
7. Wait for "Success. No rows returned"

### Option B: Command Line
```bash
# If you have Supabase CLI installed
supabase db push
```

---

## STEP 2: Create Storage Bucket (2 minutes)

1. Open Supabase Dashboard
2. Go to **Storage** (left sidebar)
3. Click **New Bucket**
4. Fill in:
   - **Name**: `custom-avatars`
   - **Public**: ✅ **CHECK THIS BOX** (must be public!)
   - **File size limit**: `10485760` (10MB)
   - **Allowed MIME types**: `image/png,image/jpeg`
5. Click **Create Bucket**

6. Set Storage Policies:
   - Click on the `custom-avatars` bucket
   - Go to **Policies** tab
   - Click **New Policy**
   
   **Policy 1: Users upload own avatars**
   ```sql
   CREATE POLICY "Users upload own avatars"
   ON storage.objects FOR INSERT
   TO authenticated
   WITH CHECK (
     bucket_id = 'custom-avatars' 
     AND auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

   **Policy 2: Public read access**
   ```sql
   CREATE POLICY "Public read"
   ON storage.objects FOR SELECT
   TO public
   USING (bucket_id = 'custom-avatars');
   ```

---

## STEP 3: Verify Setup

Run the verification script:
```bash
node scripts/setup-avatar-system.js
```

You should see:
- ✅ All environment variables present
- ✅ user_avatars table exists
- ✅ avatar_unlocks table exists  
- ✅ custom_avatar_gallery table exists
- ✅ custom-avatars bucket exists
- ✅ FREE avatars: 25 images
- ✅ VIP avatars: 50 images
- ✅ OpenAI API key is valid

---

## STEP 4: Test!

Navigate to: **http://localhost:3000/hub/avatars**

### Test Text Generation:
1. Click "Custom AI Generator" tab
2. Enter: "Fierce dragon warrior with golden armor"
3. Click "Generate Avatar"
4. Wait ~10 seconds
5. Avatar should appear!

### Test Photo Generation:
1. Click "Custom AI Generator" tab
2. Upload a photo (JPG/PNG)
3. Optional: Add text prompt
4. Click "Generate Avatar"
5. Wait ~15 seconds
6. Avatar should appear with your likeness!

---

## Troubleshooting

### "Failed to fetch" error:
- ✅ Check OPENAI_API_KEY is set
- ✅ Check database tables exist
- ✅ Check storage bucket exists
- ✅ Check browser console for specific error

### "Table does not exist":
- Run Step 1 again (database migration)

### "Bucket does not exist":
- Run Step 2 again (create storage bucket)

### Generation takes too long:
- Normal: 10-15 seconds for DALL-E 3
- Check OpenAI API dashboard for usage

---

## 🎉 DONE!

Once Steps 1-2 are complete, the Avatar Engine is **FULLY OPERATIONAL**!

- ✅ 75 preset avatars
- ✅ AI text-to-image generation (DALL-E 3)
- ✅ AI photo-to-image generation (Vision + DALL-E)
- ✅ Supabase storage for custom avatars
- ✅ Full database persistence

**Total setup time: 5 minutes**
