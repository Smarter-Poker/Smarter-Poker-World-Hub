# 🚨 PROTECTED FILES REGISTRY 🚨

## STOP! READ THIS BEFORE MODIFYING ANY SOCIAL MEDIA CODE

This file lists ALL protected components in the Social Hub.
**Agents MUST follow the `/social-feed-protection` workflow before making ANY changes.**

---

## PROTECTED: Main Social Hub Page
**File:** `pages/hub/social-media.js` (2600+ lines)
**Contains:** Posts, likes, comments, shares, notifications, stories, reels, live streams

| Feature | Lines (approx) | DO NOT BREAK |
|---------|---------------|--------------|
| Article Reader | 1186-1200, 1417, 2509 | articleReader state, onOpenArticle prop |
| Stories Bar | 2330 | StoriesBar component |
| Reels Carousel | 2510 | ReelsFeedCarousel |
| Live Streaming | 2360-2400 | GoLiveModal, LiveStreamCard |
| PostCard | 1072-1300 | All post types render correctly |
| Likes | PostCard internal | Like button, count display |
| Comments | PostCard internal | Comment fetching, display |
| Notifications | 1520-1600 | NotificationDropdown |
| Share Modal | 1300-1400 | ShareModal component |

---

## PROTECTED: User Profiles & Authentication
**Files:**
- `pages/hub/user/[username].js` - Public profile pages
- `pages/hub/profile.js` - User's own profile
- `src/lib/authUtils.js` - Authentication helpers
- `src/lib/supabaseClient.js` - Database connection

**DO NOT MODIFY:** getAuthUser, session handling, profile fetching

---

## PROTECTED: Posts System
**Files:**
- `pages/hub/social-media.js` - Post creation, display
- `pages/api/social-posts.js` - Post API
- `src/components/social/CreatePostModal.jsx` - Post creation

**DO NOT MODIFY:** Post types, media handling, content display

---

## PROTECTED: Photos & Videos
**Files:**
- `pages/hub/social-media.js` - Media in posts
- `pages/hub/user/[username].js` - Photos/Videos tabs
- `src/components/social/MediaGallery.jsx` - Gallery display

**DO NOT MODIFY:** Media URL handling, gallery rendering

---

## PROTECTED: News/Articles
**Skill:** `.agent/skills/in-app-article-reader/SKILL.md`
**Test:** `node scripts/test-article-reader.js`

**Files:**
- `pages/api/proxy.js` - Server-side proxy
- `src/components/social/ArticleCard.jsx` - Preview cards
- `src/components/social/ArticleReaderModal.jsx` - In-app reader
- `pages/api/link-preview.js` - OpenGraph fetching

**DO NOT MODIFY:** Proxy URL rewriting, iframe src, onClick handlers

---

## PROTECTED: Likes System
**Location:** Inside `pages/hub/social-media.js`

**DO NOT MODIFY:** 
- Like button click handlers
- Like count display
- Like API calls

---

## PROTECTED: Comments System
**Location:** Inside `pages/hub/social-media.js`

**DO NOT MODIFY:**
- Comment fetching
- Comment display
- Reply functionality
- Comment count

---

## PROTECTED: Notifications
**Files:**
- `pages/hub/social-media.js` - Notification dropdown
- `pages/hub/notifications.js` - Full notifications page
- `pages/api/notifications.js` - Notifications API

**DO NOT MODIFY:** Notification fetching, display, click handlers, profile navigation

---

## PROTECTED: Messages/Messenger
**Files:**
- `pages/hub/messenger.js` - Messenger page
- `src/components/social/ChatWindow.jsx` - Chat UI
- `pages/api/messages.js` - Messages API

**DO NOT MODIFY:** Message sending, receiving, display

---

## PROTECTED: Stories
**Files:**
- `src/components/social/Stories.jsx` - Stories bar
- `src/components/social/StoryViewer.jsx` - Story viewer
- `pages/api/stories.js` - Stories API

**DO NOT MODIFY:** Story display, navigation, uploads

---

## PROTECTED: Reels
**Files:**
- `src/components/social/ReelsFeedCarousel.jsx` - Feed carousel
- `pages/hub/reels.js` - Full reels page

**DO NOT MODIFY:** Video playback, navigation, autoplay

---

## PROTECTED: Live Streaming
**Files:**
- `src/components/social/GoLiveModal.jsx` - Go live UI
- `src/components/social/LiveStreamCard.jsx` - Stream display
- `src/components/social/LiveStreamViewer.jsx` - Viewer
- `src/services/LiveStreamService.js` - Stream logic

**DO NOT MODIFY:** Stream start/stop, viewer connections

---

## How to Check Before Modifying

1. **Search this file** for the file you want to modify
2. **If listed**, read the skill file first
3. **Run tests** before making changes
4. **Run tests again** after making changes
5. **If tests fail**, REVERT your changes

---

## This Feature Set Has Been Rebuilt Multiple Times

Every time someone modifies social media code without understanding:
- Article thumbnails break
- Stories don't display
- Likes stop working
- Comments don't load
- Notifications fail
- Posts don't render

**PROTECT THIS CODE. FOLLOW THE WORKFLOW.**

---

## Last Updated
- 2026-01-24: Expanded to cover ALL social media features
