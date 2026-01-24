---
description: MANDATORY workflow before modifying ANY social media files. Prevents breaking working features.
---

# 🚨 SOCIAL FEED PROTECTION WORKFLOW 🚨

**This workflow MUST be followed before modifying ANY file in the social media system.**

## STOP! Before You Edit

If you are about to modify ANY of these files or components, YOU MUST follow this workflow:

### Protected Files
- `pages/hub/social-media.js` - Main feed page (2600+ lines)
- `src/components/social/ArticleCard.jsx` - Article previews
- `src/components/social/ArticleReaderModal.jsx` - In-app article reader
- `src/components/social/Stories.jsx` - Stories bar
- `src/components/social/ReelsFeedCarousel.jsx` - Reels carousel
- `src/components/social/GoLiveModal.jsx` - Live streaming
- `src/components/social/LiveStreamCard.jsx` - Live stream display
- `pages/api/proxy.js` - Server-side proxy for articles
- `pages/api/link-preview.js` - OpenGraph metadata fetching

---

## MANDATORY STEPS

### Step 1: Read the Protected Files Registry
```bash
cat .agent/PROTECTED_FILES.md
```

### Step 2: Run Verification BEFORE Making Changes
// turbo
```bash
node scripts/test-article-reader.js
```

### Step 3: If modifying social-media.js, understand these critical sections:
- Lines 1-30: Imports (DO NOT remove any)
- ArticleReader state (articleReader, setArticleReader)
- PostCard component (onOpenArticle prop)
- ArticleCard integration (onClick handler)

### Step 4: Make your changes carefully

### Step 5: Run Verification AFTER Making Changes
// turbo
```bash
node scripts/test-article-reader.js
```

### Step 6: Test manually in browser
// turbo
```bash
open http://localhost:3000/hub/social-media
```

---

## IF TESTS FAIL AFTER YOUR CHANGES

1. **REVERT IMMEDIATELY** - Your changes broke something
2. Read the skill file: `.agent/skills/in-app-article-reader/SKILL.md`
3. Understand what you broke
4. Try again with more care

---

## Common Things That Break Social Media

### Article Reader Breaks
- Removing `ArticleCard` import
- Removing `ArticleReaderModal` import  
- Removing `articleReader` state
- Removing `onOpenArticle` prop from PostCard
- Changing the iframe src in ArticleReaderModal

### Stories Bar Breaks
- Removing `StoriesBar` import
- Changing stories fetch query
- Breaking story click handlers

### Feed Breaks
- Removing PostCard component
- Breaking infinite scroll
- Changing post fetching logic

---

## This Feature Has Been Rebuilt Multiple Times

Every time someone modifies social-media.js without understanding, these features break:
1. Article thumbnails show link icons instead of images
2. Articles open in new tabs instead of in-app
3. Stories don't display
4. Reels carousel breaks
5. Posts don't load

**PROTECT THIS CODE.**
