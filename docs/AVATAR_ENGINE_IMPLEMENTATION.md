# 🎨 AVATAR ENGINE - COMPLETE IMPLEMENTATION GUIDE

## ✅ Phase 1: Infrastructure (COMPLETE)

### Database Schema
**Location:** `/database/migrations/avatar_system.sql`

**Tables Created:**
- `user_avatars` - Active avatar selection (preset or custom)
- `avatar_unlocks` - Track which VIP avatars are unlocked
- `custom_avatar_gallery` - User's custom avatar collection

**Functions:**
- `set_active_avatar()` - Atomically set user's active avatar
- `unlock_free_avatars()` - Auto-unlock 25 FREE avatars for new users

**Security:**
- Full Row Level Security (RLS) enabled
- User-scoped policies

---

## ✅ Phase 2: Service Layer (COMPLETE)

**Location:** `/src/services/avatar-service.js`

**Core Functions:**
- `getUserAvatar(userId)` - Get current active avatar
- `setPresetAvatar(userId, avatarId)` - Select from library
- `generateCustomAvatar(userId, prompt, isVip)` - AI generation
- `getAvailableAvatars(userId, tierFilter)` - Get unlocked avatars
- `unlockAvatar(userId, avatarId, method)` - Unlock VIP avatar
- `getCustomAvatarGallery(userId)` - User's custom collection
- `initializeFreeAvatars(userId)` - Auto-unlock for new users

---

## ✅ Phase 3: React Context (COMPLETE)

**Location:** `/src/contexts/AvatarContext.jsx`

**Provides:**
```javascript
const { avatar, loading, selectPresetAvatar, createCustomAvatar, refreshAvatar } = useAvatar();
```

**Usage:**
- Wrap app with `<AvatarProvider>`
- Access user's avatar anywhere with `useAvatar()` hook

---

## ✅ Phase 4: UI Components (COMPLETE)

### 1. Avatar Gallery
**Location:** `/src/components/avatars/AvatarGallery.jsx`

**Features:**
- Filter by tier (FREE/VIP)
- Filter by category
- Visual lock/unlock status
- Click to select
- Shows current active avatar

### 2. Custom Avatar Builder
**Location:** `/src/components/avatars/CustomAvatarBuilder.jsx`

**Features:**
- Text prompt input
- Example prompts
- FREE/VIP limits (1 vs unlimited)
- AI generation (placeholder for actual API)
- Live preview

### 3. Avatar Selector Modal
**Location:** `/src/components/avatars/AvatarSelectorModal.jsx`

**Features:**
- Tabbed interface (Library | Custom)
- Full-screen modal
- Close button
- Responsive design

---

## 📋 TODO: Integration Points

### STEP 8: Deploy Database Schema
```bash
# Run in Supabase SQL Editor:
# Copy contents of /database/migrations/avatar_system.sql
# Execute to create tables, functions, and policies
```

### STEP 9: Wrap App with Avatar Provider
```javascript
// In _app.js or main app entry point
import { AvatarProvider } from '../contexts/AvatarContext';

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AvatarProvider>
        <Component {...pageProps} />
      </AvatarProvider>
    </AuthProvider>
  );
}
```

### STEP 10: Integrate in Profile Page
```javascript
// In /pages/hub/profile.js
import { useState } from 'react';
import { useAvatar } from '../../contexts/AvatarContext';
import AvatarSelectorModal from '../../components/avatars/AvatarSelectorModal';

export default function ProfilePage() {
  const { avatar } = useAvatar();
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  return (
    <div>
      {/* Avatar Display */}
      <img src={avatar?.imageUrl} alt="Avatar" onClick={() => setShowAvatarModal(true)} />
      
      {/* Selection Modal */}
      <AvatarSelectorModal 
        isOpen={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        isVip={userIsVip}
      />
    </div>
  );
}
```

### STEP 11: Display Avatar in Poker Tables
```javascript
// In Training, Diamond Arena, Club Arena
import { useAvatar } from '../../contexts/AvatarContext';

function PokerTable() {
  const { avatar } = useAvatar();

  return (
    <div className="poker-table">
      <div className="player-seat">
        <img src={avatar?.imageUrl} className="player-avatar" />
      </div>
    </div>
  );
}
```

### STEP 12: Use in Social Media
```javascript
// In /pages/hub/social-media.js
import { useAvatar } from '../../contexts/AvatarContext';

function SocialMediaFeed() {
  const { avatar } = useAvatar();

  return (
    <div className="profile-header">
      <img src={avatar?.imageUrl} className="profile-picture" />
    </div>
  );
}
```

---

## 🔧 Configuration Needed

### 1. AI Image Generation API
**File:** `/src/services/avatar-service.js` (line ~85)

Replace placeholder with actual API call:
```javascript
// Current (placeholder):
const imageUrl = `/avatars/custom/${userId}_${Date.now()}.png`;

// Replace with:
const response = await fetch('YOUR_AI_API_ENDPOINT', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: prompt,
    style: 'pixar_3d',
    size: '512x512'
  })
});
const { imageUrl } = await response.json();
```

### 2. Image Storage
Set up Supabase Storage bucket for custom avatars:
```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Set storage policies
CREATE POLICY "Users can upload their own avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

---

## 🎯 Next Actions

1. **Deploy Database:** Run `avatar_system.sql` in Supabase
2. **Organize Generated Images:** Move 75 generated avatars to `/public/avatars/`
3. **Update AVATAR_LIBRARY.js:** Point to correct image paths
4. **Add AvatarProvider to App:** Wrap in `_app.js`
5. **Integrate in Profile Page:** Add avatar selection UI
6. **Integrate in All Orbs:** Display avatar in poker tables, social feed, etc.
7. **Configure AI API:** Connect real image generation service
8. **Setup Image Storage:** Configure Supabase Storage bucket

---

## 📊 Feature Status

| Feature | Status |
|---------|--------|
| Database Schema | ✅ Complete |
| Service Layer | ✅ Complete |
| React Context | ✅ Complete |
| Avatar Gallery UI | ✅ Complete |
| Custom Builder UI | ✅ Complete |
| Selector Modal | ✅ Complete |
| Database Deployment | ⏳ Pending |
| Image Organization | ⏳ Pending |
| App Integration | ⏳ Pending |
| AI API Connection | ⏳ Pending |

---

## 🚀 Ready to Deploy!

All avatar system components are built. Follow the integration steps above to activate!
