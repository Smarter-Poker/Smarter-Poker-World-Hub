# 🐴 HORSE CONTENT LAWS
## Autonomous Content Generation System

> **THESE LAWS ARE ABSOLUTE. NO EXCEPTIONS.**

---

## 📋 CORE LAWS

### LAW 1: NO AI-GENERATED IMAGES
- ❌ NEVER post AI-generated poker imagery
- ❌ NEVER post DALL-E/Midjourney/Stable Diffusion images
- ❌ NEVER post fake casino chips, tables, or cards
- ✅ ONLY real video clips from actual poker streams
- ✅ ONLY real news articles from legitimate sources

### LAW 2: CONTENT SOURCES (WHITELIST ONLY)
**Video Clips:**
- Hustler Casino Live (HCL)
- The Lodge Poker Club
- Live at the Bike (LATB)
- PokerGO
- WSOP official streams
- WPT official streams
- Only clips **2+ years old** for copyright safety

**News Articles:**
- CardPlayer.com
- PokerNews.com
- Poker.org
- PokerListings.com
- WSOP.com official news

### LAW 3: NO DUPLICATE CONTENT
- 48-hour cooldown on reposting the same video clip
- Session tracking prevents duplicates within same cron run
- Horses coordinate via database to avoid conflicts
- With 1000s of available clips, duplicates NEVER happen

### LAW 4: HORSE COORDINATION
- Horses check `social_posts` table before posting
- Each horse marks clips as used immediately upon selection
- `usedClipsThisSession` Set prevents same-run duplicates
- `getRecentlyPostedClipIds()` checks 48-hour history

### LAW 5: AUTONOMOUS OPERATION
- Horses run via Vercel cron jobs (no manual intervention)
- `horses-clips.js` - Video clip posting
- `horses-news.js` - News article reposting
- All content decisions made by the horse autonomously

---

## 🔒 ENFORCEMENT MECHANISMS

### Pre-Post Validation
```javascript
// Before any clip is posted:
1. Check if clip URL exists in recent posts (48hr)
2. Check if clip ID is in usedClipsThisSession
3. If either true → SKIP and try another clip
4. Only post if clip passes both checks
```

### Post-Post Verification
```javascript
// After posting:
1. Mark clip as used in database
2. Add to usedClipsThisSession Set
3. Log the posting for audit trail
```

### Violation Detection
- `ContentModerationAgent.js` scans for violations
- Looks for: AI-generated images, fake chips, WYNN logos
- Auto-purges violating posts if found

---

## 📊 CRON CONFIGURATION

### horses-clips.js
- **Trigger**: Every 2-4 hours via Vercel cron
- **Horses per run**: 3
- **Content type**: 100% video clips
- **Duplicate check**: 48-hour cooldown + session tracking

### horses-news.js
- **Trigger**: Every 4-6 hours via Vercel cron
- **Horses per run**: 2
- **Content type**: 100% real news articles
- **Duplicate check**: 4-hour cooldown on same article

---

## ✅ VERIFICATION CHECKLIST

Before deployment, verify:

- [ ] `horses-post.js` is DELETED (no AI images)
- [ ] `horses-clips.js` has duplicate prevention
- [ ] `horses-news.js` only uses whitelisted sources
- [ ] ClipLibrary has 2+ year age requirement
- [ ] All horses have profile pictures
- [ ] RLS policies allow horse operations
- [ ] Vercel cron jobs are configured
- [ ] OPENAI_API_KEY is set (for captions only)
- [ ] SUPABASE keys are set

---

## 🚨 EMERGENCY PROCEDURES

### If duplicate clips appear:
1. Check `usedClipsThisSession` is being populated
2. Verify `getRecentlyPostedClipIds()` query works
3. Check database connectivity
4. Purge duplicates with purge script

### If AI images appear:
1. IMMEDIATELY check if `horses-post.js` exists
2. If exists → DELETE IT
3. Run `purge-violating-posts.js`
4. Investigate how it was re-created

### If news duplicates appear:
1. Check `isArticleRecentlyShared()` function
2. Extend cooldown period if needed
3. Add article URL deduplication

---

## 📁 FILE STRUCTURE

```
pages/api/cron/
├── horses-clips.js     ✅ Video clips (100%)
├── horses-news.js      ✅ News articles
├── horses-post.js      ❌ DELETED (was AI images)
└── horses-test.js      🧪 Testing only

src/content-engine/pipeline/
├── VideoClipper.js     ✅ Video processing
├── ClipLibrary.js      ✅ Clip database (2+ years old)
├── post-video-clip.js  🧪 Manual testing
├── post-news.js        🧪 Manual testing
└── generate-horse-avatars.js  🎨 Avatar generation
```

---

**Last Updated**: 2026-01-14
**Enforced By**: Autonomous Horse System
