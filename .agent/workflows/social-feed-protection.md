---
description: MANDATORY workflow before modifying ANY social media files. Prevents breaking working features.
---

# 🚨 SOCIAL FEED PROTECTION WORKFLOW 🚨

## THIS IS MANDATORY BEFORE MODIFYING ANY SOCIAL MEDIA CODE

**You MUST follow this workflow before touching ANY of these features:**
- Users / Profiles
- Posts (text, photo, video, article, link)
- Photos / Videos / Media
- News / Articles
- Likes
- Comments
- Notifications
- Messages / Messenger
- Stories
- Reels
- Live Streaming
- Display / Rendering of anything in the social hub

---

## STEP 1: Read the Protected Files Registry
// turbo
```bash
cat .agent/PROTECTED_FILES.md
```

**If the file you want to modify is listed, you MUST proceed with extreme caution.**

---

## STEP 2: Understand What You're Modifying

Before making ANY change, understand:
1. What feature does this code power?
2. What other features depend on it?
3. What props/state does it use?
4. What APIs does it call?

---

## STEP 3: Run Tests BEFORE Making Changes
// turbo
```bash
# Article reader test
node scripts/test-article-reader.js
```
// turbo
```bash
# Start dev server if not running
npm run dev
```

---

## STEP 4: Make Your Changes CAREFULLY

Ask yourself:
- Am I removing any imports? **DON'T!**
- Am I removing any state variables? **DON'T!**
- Am I changing any props? **Document why!**
- Am I changing any API calls? **Test thoroughly!**

---

## STEP 5: Run Tests AFTER Making Changes
// turbo
```bash
node scripts/test-article-reader.js
```

---

## STEP 6: Test Manually in Browser

Check ALL of these work:
- [ ] Posts display correctly
- [ ] Images/videos load
- [ ] Likes work
- [ ] Comments work
- [ ] Article cards show thumbnails
- [ ] Clicking articles opens in-app modal
- [ ] Stories bar displays
- [ ] Notifications work
- [ ] Profile links work

---

## IF ANYTHING BREAKS

1. **STOP IMMEDIATELY**
2. **REVERT YOUR CHANGES** - `git checkout -- <file>`
3. **Read the skill files:**
   - `.agent/skills/in-app-article-reader/SKILL.md`
   - `.agent/skills/social-community/SKILL.md`
4. **Understand what you broke**
5. **Try again more carefully**

---

## COMMON THINGS THAT BREAK SOCIAL MEDIA

### Article Reader
| What Breaks | Symptom | Cause |
|-------------|---------|-------|
| No thumbnails | Link icon instead of image | Removed ArticleCard |
| Opens new tab | Leaves smarter.poker | Removed onOpenArticle |
| Blank modal | Nothing displays | Changed iframe src |

### Posts
| What Breaks | Symptom | Cause |
|-------------|---------|-------|
| No posts | Empty feed | Changed fetch query |
| Wrong display | Media missing | Broke PostCard |
| No interactions | Likes/comments fail | Removed handlers |

### Stories
| What Breaks | Symptom | Cause |
|-------------|---------|-------|
| No stories | Bar empty | Changed stories fetch |
| Can't view | Click does nothing | Broke viewer |

### Notifications
| What Breaks | Symptom | Cause |
|-------------|---------|-------|
| No notifications | Dropdown empty | Changed fetch |
| Can't click | Links broken | Changed navigation |

---

## FILES THAT MUST NEVER BE CASUALLY MODIFIED

These files are CRITICAL. Small changes have BIG consequences:

```
pages/hub/social-media.js      # 2600+ lines, ALL social features
pages/api/proxy.js             # Article reader backbone
pages/hub/user/[username].js   # Profile pages
src/lib/authUtils.js           # Auth everywhere depends on this
src/lib/supabaseClient.js      # Database connection
```

---

## REMEMBER

This codebase has been rebuilt MULTIPLE TIMES because of careless modifications.

**Every hour spent understanding the code saves 10 hours of debugging.**

**FOLLOW THIS WORKFLOW. PROTECT THE CODE.**
