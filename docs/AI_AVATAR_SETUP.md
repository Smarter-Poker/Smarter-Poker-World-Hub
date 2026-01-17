# 🎨 AI AVATAR GENERATION SETUP GUIDE

## Overview
The Avatar Engine now includes **real AI-powered avatar generation** using Replicate's API. Users can:
- Generate avatars from **text descriptions** (FLUX model)
- Upload **photos** for likeness-based avatars (InstantID model)
- Combine both for best results

---

## 1. Get Replicate API Key

### Step 1: Sign Up for Replicate
1. Go to [https://replicate.com](https://replicate.com)
2. Create a free account
3. Navigate to **Account Settings** → **API Tokens**
4. Copy your API token

### Step 2: Add to Environment Variables
```bash
# Add to .env.local
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxx
```

---

## 2. Setup Supabase Storage

### Step 1: Create Storage Bucket
1. Open Supabase Dashboard
2. Go to **Storage**
3. Click **New Bucket**
   - Name: `custom-avatars`
   - Public: ✅ **Yes** (for avatar display)
   - File size limit: `10MB`
   - Allowed MIME types: `image/png, image/jpeg`

### Step 2: Set Storage Policies
```sql
-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'custom-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'custom-avatars');
```

---

## 3. AI Models Used

### **FLUX Schnell** (Text-to-Image)
- **Model:** `black-forest-labs/flux-schnell`
- **Use Case:** Generate avatars from text descriptions
- **Speed:** Fast (~5 seconds)
- **Quality:** Excellent for 3D Pixar-style avatars
- **Cost:** ~$0.003 per generation

### **InstantID** (Photo-to-Image)
- **Model:** `zsxkib/instant-id`
- **Use Case:** Create avatars preserving facial likeness
- **Speed:** Medium (~15 seconds)
- **Quality:** High-fidelity facial preservation
- **Cost:** ~$0.01 per generation

---

## 4. Cost Estimation

### FREE Users (1 custom avatar):
- **Text-based:** $0.003
- **Photo-based:** $0.01
- **Total per user:** $0.003 - $0.01

### VIP Users (Unlimited):
- Average usage: ~5 avatars per month
- **Estimated cost:** $0.015 - $0.05 per user/month

### Scale (1000 users):
- FREE tier: ~$3-10/month
- VIP tier (20%): ~$3-10/month
- **Total:** ~$6-20/month for 1000 users

---

## 5. API Endpoints

### **POST /api/avatar/generate-from-text**
Generate avatar from text description.

**Request:**
```json
{
  "prompt": "Fierce dragon warrior with golden armor, 3D Pixar style"
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "https://replicate.delivery/pbxt/xxx.png"
}
```

### **POST /api/avatar/generate-from-photo**
Generate avatar from uploaded photo (likeness).

**Request:**
```json
{
  "photoBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "prompt": "Transform into 3D Pixar-style poker avatar"
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "https://replicate.delivery/pbxt/xxx.png"
}
```

---

## 6. Testing

### Test Text Generation:
```bash
curl -X POST http://localhost:3000/api/avatar/generate-from-text \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Cyberpunk hacker with neon visor, 3D Pixar style, white background"}'
```

### Test Photo Generation:
```bash
# Upload a photo via the UI at:
http://localhost:3000/hub/avatars → Custom AI Generator tab
```

---

## 7. Production Deployment

### Environment Variables (Vercel):
```bash
REPLICATE_API_TOKEN=r8_xxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
```

### Vercel Deployment:
```bash
vercel env add REPLICATE_API_TOKEN production
vercel --prod
```

---

## 8. Usage Flow

### **User Experience:**
1. Navigate to `/hub/avatars`
2. Click **"Custom AI Generator"** tab
3. **Option A:** Upload photo → AI creates likeness-based avatar
4. **Option B:** Enter text description → AI creates character
5. **Option C:** Both → AI combines photo likeness with text style
6. Click **"Generate Avatar"**
7. Wait 5-15 seconds
8. Avatar saved to Supabase Storage
9. Set as active avatar automatically

---

## 9. Error Handling

### Common Issues:

**"API generation failed"**
- Check REPLICATE_API_TOKEN is set
- Verify Replicate account has credits
- Check API endpoint logs

**"Image must be smaller than 10MB"**
- User uploaded too large file
- UI validates this automatically

**"FREE users can only create 1 custom avatar"**
- Limit enforced in database
- Encourage VIP upgrade

---

## 10. Monitoring

### Track Usage:
```sql
-- Count custom avatars generated
SELECT COUNT(*) as total_custom_avatars
FROM custom_avatar_gallery
WHERE is_deleted = false;

-- By tier
SELECT 
  CASE WHEN LENGTH(prompt) > 0 THEN 'text' ELSE 'photo' END as type,
  COUNT(*) as count
FROM custom_avatar_gallery
GROUP BY type;
```

### Replicate Dashboard:
- View generation history
- Monitor costs
- Check API usage

---

## ✅ Complete Setup Checklist

- [ ] Replicate account created
- [ ] API token added to `.env.local`
- [ ] Supabase storage bucket `custom-avatars` created
- [ ] Storage policies applied
- [ ] `npm install replicate` completed
- [ ] API endpoints working (`/api/avatar/generate-from-text`)
- [ ] Test generation with sample prompt
- [ ] Production environment variables set

---

**The AI Avatar Generation system is now FULLY FUNCTIONAL!** 🚀
