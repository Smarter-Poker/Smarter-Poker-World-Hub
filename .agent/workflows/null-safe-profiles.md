---
description: Enforce null-safe profile patterns in all Supabase queries
---
# Null-Safe Profile Pattern Workflow

## MANDATORY for any code that queries profiles via FK join

### The Problem
FK joins like `profiles:user_id (...)` return `null` when:
- RLS blocks access
- Profile not fully created  
- New user signup timing issues

This breaks features for ALL users, not just the affected one.

### The Pattern

**NEVER do this:**
```javascript
// ❌ FRAGILE - will break if profiles is null
const username = data.profiles.username;
data.filter(item => item.profiles);
```

**ALWAYS do this:**
```javascript
// ✅ DEFENSIVE - handles null gracefully
import { safeProfile } from '@/utils/profileFallback';

const profile = safeProfile(data.profiles);
// OR inline:
const profile = data.profiles || { display_name: 'Unknown', avatar_url: null };
```

### Checklist for any Supabase query with profile FK join

- [ ] Does the query have `profiles:*` in the select?
- [ ] Is there a fallback for null profile?
- [ ] Does any `.filter()` silently remove items with null profiles?
- [ ] Is there console.warn logging when fallback is used?

### Files with existing protection
- `messenger.js` - ✅ Protected
- `MessagingService.js` - ✅ Protected
- `UnifiedSocialService.js` - ✅ Protected
- `social-media.js` - ✅ Has fallbacks
- `Commander APIs` - ✅ Protected

// turbo-all
