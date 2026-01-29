---
name: Null-Safe Database Patterns
description: MANDATORY patterns for all Supabase FK joins to prevent cascading failures. Read this before writing ANY database query code.
---

# 🛡️ Null-Safe Database Patterns

> **CRITICAL**: This skill exists because ONE new user joining broke the ENTIRE messenger for ALL users on Jan 25, 2026. The fixes took hours. Follow these patterns to prevent this from ever happening again.

## The Problem

When Supabase FK joins fail (RLS blocks, timing issues, incomplete profiles), they return `null`. If your code doesn't handle `null`, it can **break features for EVERYONE**, not just the affected user.

### Example of What Happened

```javascript
// This innocent-looking code broke the entire messenger:
.select('*, profiles:user_id (username, avatar_url)')

// Then this filter silently removed ALL conversations:
.filter(c => c.otherUser)  // otherUser was null for ONE user
```

**Result**: No users could see their conversations.

---

## Mandatory Patterns

### 1. Always Use Fallback Profiles

```javascript
// Import the utility
import { safeProfile, getDisplayName } from '@/utils/profileFallback';

// ALWAYS handle null profiles
const profile = safeProfile(data.profiles);
// OR inline:
const profile = data.profiles || { display_name: 'Unknown', avatar_url: null };
```

### 2. Never Filter Without Null Check

```javascript
// ❌ WRONG - silently removes data
items.filter(item => item.profiles)

// ✅ CORRECT - keeps item with fallback
items.map(item => ({
    ...item,
    profiles: item.profiles || { display_name: 'Unknown', avatar_url: null }
}))
```

### 3. Log When Fallbacks Are Used

```javascript
if (!data.profiles) {
    console.warn('[ComponentName] FK join failed for user:', data.user_id);
}
```

---

## Protected Files (Already Fixed)

These files have been hardened with defensive patterns:

| File | Protection |
|------|------------|
| `pages/hub/messenger.js` | Fallback profile fetch |
| `services/MessagingService.js` | 3 null-safe methods |
| `src/services/UnifiedSocialService.js` | 2 null-safe methods |
| `pages/hub/social-media.js` | Author fallbacks |
| `pages/api/club-commander/home-games/*` | All profile FK joins protected |

---

## Utility Files

### `/src/utils/profileFallback.js`

Provides:
- `DEFAULT_PROFILE` - Safe fallback object
- `safeProfile(profile)` - Returns profile or default
- `getDisplayName(profile)` - Never returns undefined
- `enrichWithSafeProfiles(items)` - Batch processing

---

## Auth Trigger Protection

The auth trigger in `supabase/migrations/20260125_harden_auth_trigger.sql`:
- Guarantees ALL required fields on signup
- Auto-generates unique usernames
- Never fails auth (logs errors, returns NEW)
- Has backfill function for existing incomplete profiles

---

## Checklist For Any New Database Code

Before merging ANY code that queries profiles via FK join:

- [ ] Does the query have `profiles:*` in the select?
- [ ] Is there a fallback for null profile?
- [ ] Does any `.filter()` check for null?
- [ ] Is there logging when fallback is used?
- [ ] Does the UI display "Unknown User" instead of crashing?

---

## Quick Reference

```javascript
// SAFE PATTERN
const items = (data || []).map(item => ({
    ...item,
    profiles: item.profiles || { 
        id: item.user_id, 
        display_name: 'Unknown User', 
        avatar_url: null 
    }
}));
```
