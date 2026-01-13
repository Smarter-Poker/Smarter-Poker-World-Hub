# SNGINE FULL FEATURE RECONSTRUCTION BLUEPRINT
## For Smarter.Poker Social Hub

Generated: 2026-01-13

---

## FEATURE MODULES CATALOG (48 Total)

### CORE SOCIAL (Priority 1)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Posts | posts.php | 127KB | 🟢 In Progress | Feed, Create, Like, Share, Delete |
| Publisher | publisher.php | 41KB | 🟢 In Progress | Post creation form, media upload |
| Comments | comments.php | 36KB | 🟡 Partial | Nested comments, reactions, mentions |
| Chat | chat.php | 51KB | 🟢 In Progress | Conversations, Messages, Typing, Seen |

### MEDIA (Priority 1)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Photos | photos.php | 47KB | 🔴 Needed | Albums, Photo posts, Gallery, Reactions |
| Videos | videos.php | 5KB | 🔴 Needed | Video posts, Thumbnails, Player |
| Stories | stories.php | 6KB | 🔴 Needed | 24hr expiring stories, Photo/Video |
| Reels | reels.php | 5KB | 🔴 Needed | TikTok-style vertical videos |

### SOCIAL FEATURES (Priority 2)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Groups | groups.php | 27KB | 🔴 Needed | Create, Join, Admin, Posts |
| Pages | pages.php | 24KB | 🔴 Needed | Business pages, Follow |
| Events | events.php | 31KB | 🔴 Needed | Create events, RSVP, Calendar |
| Forums | forums.php | 30KB | 🔴 Needed | Topics, Threads, Replies |

### ENGAGEMENT (Priority 2)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Notifications | notifications.php | 87KB | 🔴 Needed | Real-time alerts, Push |
| Mentions | mentions.php | 2KB | 🔴 Needed | @username tagging |
| Hashtags | hashtags.php | 3KB | 🔴 Needed | #tag linking, Trending |
| Emojis/Stickers | emojies-stickers.php | 2KB | 🔴 Needed | Reaction packs |

### MONETIZATION (Priority 3)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Wallet | wallet.php | 33KB | 🔴 Needed | Balance, Deposits, Withdrawals |
| Payments | payments.php | 9KB | 🔴 Needed | Payment gateway integration |
| Monetization | monetization.php | 29KB | 🔴 Needed | Creator payouts, Tips |
| Ads | ads.php | 32KB | 🔴 Needed | Promoted posts, Campaigns |
| Packages | packages.php | 11KB | 🔴 Needed | Subscription tiers |
| Points | points.php | 8KB | 🔴 Needed | Gamification points |
| Gifts | gifts.php | 4KB | 🔴 Needed | Virtual gifts |
| Merits | merits.php | 12KB | 🔴 Needed | Badges, Achievements |

### COMMERCE (Priority 3)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Marketplace | marketplace.php | 23KB | 🔴 Needed | Buy/Sell products |
| Jobs | jobs.php | 4KB | 🔴 Needed | Job postings |
| Offers | (offers.php) | 8KB | 🔴 Needed | Deals, Coupons |
| Funding | funding.php | 3KB | 🔴 Needed | Crowdfunding |

### MEDIA ADVANCED (Priority 3)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Livestream | livestream.php | 19KB | 🔴 Needed | Live video streaming |
| Movies | movies.php | 4KB | 🔴 Needed | Movie/Series listings |
| Games | games.php | 4KB | 🔴 Needed | Browser games integration |
| Blogs | blogs.php | 18KB | 🔴 Needed | Long-form articles |
| Courses | courses.php | 3KB | 🔴 Needed | Educational content |

### COMMUNICATION (Priority 2)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Calls | calls.php | 13KB | 🔴 Needed | Voice/Video calls (WebRTC) |
| Support | support.php | 18KB | 🔴 Needed | Help tickets |

### DISCOVERY (Priority 2)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Search | search.php | 17KB | 🟡 Partial | Global search, Filters |
| Categories | categories.php | 5KB | 🔴 Needed | Content categorization |

### ADMINISTRATION (Priority 3)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| Reports | reports.php | 3KB | 🔴 Needed | Content moderation |
| Reviews | reviews.php | 22KB | 🔴 Needed | Ratings & Reviews |
| Invitations | invitations.php | 8KB | 🔴 Needed | Referral system |
| Affiliates | affiliates.php | 8KB | 🔴 Needed | Partner program |

### SYSTEM (Priority 4)
| Module | PHP File | Lines | Status | Description |
|--------|----------|-------|--------|-------------|
| System | system.php | 11KB | 🔴 Needed | Config, Settings |
| Tools | tools.php | 23KB | 🔴 Needed | Utilities |
| Logger | logger.php | 3KB | 🔴 Needed | Activity logs |
| Realtime | realtime.php | 1KB | 🔴 Needed | WebSocket config |
| Widgets | widgets.php | 1KB | 🔴 Needed | Sidebar widgets |
| Developers | developers.php | 15KB | 🔴 Needed | API for developers |
| Custom Fields | custom-fields.php | 9KB | 🔴 Needed | Dynamic form fields |
| Announcements | announcements.php | 1KB | 🔴 Needed | System messages |

---

## MESSAGING APP FEATURES (Flutter)

| Screen | File | Status | Description |
|--------|------|--------|-------------|
| Splash | splash_screen.dart | 🔴 Needed | App loading |
| Sign In | sign_in_screen.dart | 🔴 Needed | Login UI |
| Sign Up | sign_up_screen.dart | 🔴 Needed | Registration |
| Main | main_screen.dart | 🔴 Needed | Bottom nav |
| Chats | chats_screen.dart | 🟢 In Progress | Conversation list |
| Conversation | conversation_screen.dart | 🟢 In Progress | Chat messages |
| Contacts | contacts_screen.dart | 🟢 In Progress | Friends list |
| Search | search_screen.dart | 🟡 Partial | User search |
| Settings | settings_screen.dart | 🔴 Needed | App preferences |
| Calls | calls_screen.dart | 🔴 Needed | Call history |

### CHAT FEATURES
- ✅ Text messages
- ✅ Read receipts (seen status)
- ✅ Typing indicators
- 🔴 Photo messages
- 🔴 Video messages
- 🔴 Voice notes
- 🔴 Message reactions
- 🔴 Message deletion
- 🔴 Group chats
- 🔴 Audio calls
- 🔴 Video calls

---

## DATABASE TABLES REQUIRED

### Core Social
- `social_posts`
- `social_comments`
- `social_interactions` (likes, reactions)
- `social_shares`

### Media
- `social_photos`
- `social_videos`
- `social_stories`
- `social_stories_media`
- `social_reels`
- `social_albums`

### Messaging
- `social_conversations`
- `social_conversation_participants`
- `social_messages`
- `social_message_reads`
- `social_message_reactions`

### Groups/Events
- `social_groups`
- `social_group_members`
- `social_events`
- `social_event_members`

### Discovery
- `social_hashtags`
- `social_mentions`
- `social_notifications`

---

## IMPLEMENTATION APPROACH

### Phase 1: Core Foundation ✅
1. Feed (posts.php) → Done
2. Chat (chat.php) → Done
3. Basic Search → Done

### Phase 2: Full Media Support (CURRENT)
1. Photo uploads with Supabase Storage
2. Video uploads with Supabase Storage
3. Stories (24hr expiring)
4. Reels player

### Phase 3: Rich Social
1. Groups (create, join, posts)
2. Events
3. Notifications
4. Mentions + Hashtags

### Phase 4: Engagement
1. Multiple reactions (love, haha, wow, sad, angry)
2. Rich comments (nested, reactions)
3. Voice notes in chat
4. Video/Audio calls

### Phase 5: Monetization
1. Wallet integration
2. Tips/Gifts
3. Premium subscriptions

---

## TECHNICAL NOTES

### File Upload Strategy
- Use Supabase Storage for all media
- Bucket: `social-media`
- Path: `{type}/{user_id}/{timestamp}_{filename}`

### Real-time Strategy
- Supabase Realtime for:
  - New posts in feed
  - New messages in chat
  - Typing indicators
  - Online status

### API Endpoints Needed
- `/api/social/upload` - Media upload
- `/api/social/stories` - CRUD stories
- `/api/social/reels` - CRUD reels
- `/api/social/groups` - CRUD groups
- `/api/social/notifications` - Get notifications
