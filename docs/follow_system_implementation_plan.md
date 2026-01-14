# 📱 Follow System Implementation Plan
## Facebook-Style Follow + Friend Request with Auto-Follow on Decline

---

## 🎯 Overview

Implement a **Follow** system alongside the existing **Friend Request** system, where:

1. **Users can Follow OR Friend Request** - Two distinct relationship types
2. **Declined friend requests automatically create a Follow relationship** - The requester becomes a follower of the decliner
3. **Following is one-way** - You can follow someone without them following you back
4. **Friends is two-way** - Mutual connection with full access

---

## 📊 Relationship Hierarchy (Like Facebook)

| Relationship | Content Visibility | Can Message | Mutual |
|--------------|-------------------|-------------|--------|
| **Stranger** | Public posts only | Request first | ❌ |
| **Follower** | Public + Follower-only posts | Can message | ❌ (one-way) |
| **Friend** | All posts (Public + Friends-only) | Full messaging | ✅ (mutual) |

---

## 🗃️ Database Changes

### Recommended: Separate `follows` Table

Create a dedicated table for follows (cleaner separation):

```sql
-- Migration: 20260114_follows_table.sql

CREATE TABLE IF NOT EXISTS public.follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'direct', -- 'direct' or 'declined_friend_request'
    UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);

-- RLS Policies
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view follows" ON public.follows
    FOR SELECT USING (true); -- Follows are public

CREATE POLICY "Users can create follows" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete own follows" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);

GRANT ALL ON public.follows TO authenticated;
```

**Why Separate Table:**
- Cleaner data model
- Easier to query followers vs friends
- No risk of breaking existing friendship logic
- Follows are simpler (no pending state)

---

## 🔄 Friend Request Decline → Auto-Follow Logic

When a user declines a friend request:

```javascript
const handleDeclineRequest = async (request) => {
    // 1. Update friendship status to 'declined' (or delete it)
    await supabase
        .from('friendships')
        .delete()
        .eq('id', request.id);
    
    // 2. Automatically create a follow relationship
    // The REQUESTER now FOLLOWS the DECLINER
    await supabase
        .from('follows')
        .upsert({
            follower_id: request.user_id,      // Person who sent the request
            following_id: user.id,             // Person who declined
            source: 'declined_friend_request'
        }, { onConflict: 'follower_id,following_id' });
    
    // 3. Optionally notify the requester
    // "Your friend request was declined, but you are now following [User]"
};
```

---

## 🎨 UI Components to Create/Modify

### 1. **Follow Button Component (New)**
```jsx
function FollowButton({ userId, isFollowing, onFollow, onUnfollow }) {
    return isFollowing ? (
        <button onClick={onUnfollow} className="following-btn">
            ✓ Following
        </button>
    ) : (
        <button onClick={onFollow} className="follow-btn">
            + Follow
        </button>
    );
}
```

### 2. **FriendCard Enhancement**
Show Follow button alongside Friend button:

```jsx
// For non-friends, show both Follow and Add Friend buttons
{!isFriend && (
    <>
        <FollowButton 
            isFollowing={isFollowing} 
            onFollow={() => onFollow(user.id)}
            onUnfollow={() => onUnfollow(user.id)}
        />
        {!isPending && (
            <button onClick={() => onAddFriend(user.id)}>
                + Add Friend
            </button>
        )}
    </>
)}
```

### 3. **Friends Page New Sections**
Add tabs or sections:
- **Friends** (mutual connections)
- **Following** (people you follow)
- **Followers** (people who follow you)

---

## 📝 Implementation Tasks

### Phase 1: Database (Est: 15 min)
- [ ] Create migration file `supabase/migrations/20260114_follows_table.sql`
- [ ] Apply migration to production Supabase
- [ ] Test basic insert/select queries

### Phase 2: Backend Logic (Est: 30 min)
- [ ] Add `handleFollow()` and `handleUnfollow()` functions
- [ ] Update `handleIgnoreRequest()` to auto-create follow
- [ ] Fetch follows data in `fetchData()` 
- [ ] Add `followingIds` and `followerIds` state

### Phase 3: UI Updates (Est: 45 min)
- [ ] Create `FollowButton` component
- [ ] Update `FriendCard` to show Follow option
- [ ] Add "Following" and "Followers" sections
- [ ] Style the new buttons

### Phase 4: Notifications (Est: 15 min)
- [ ] Add notification when someone follows you
- [ ] Add notification when friend request creates auto-follow
- [ ] Update notification display

### Phase 5: Testing (Est: 20 min)
- [ ] Test follow/unfollow flow
- [ ] Test friend request decline → auto-follow
- [ ] Test UI state updates
- [ ] Verify notifications work

---

## 🔔 Notification Flow

| Action | Recipient | Message |
|--------|-----------|---------|
| User A follows User B | User B | "User A started following you" |
| User B declines User A's friend request | User A | "You're now following User B" |
| User B accepts User A's friend request | User A | "User B accepted your friend request!" |

---

## 📁 Files to Modify

| File | Changes |
|------|---------|
| `supabase/migrations/20260114_follows_table.sql` | **NEW** - Create follows table |
| `pages/hub/friends.js` | Add follow logic, Following/Followers sections |
| `pages/hub/social-media.js` | Add follow button to user cards in feed |
| `pages/hub/notifications.js` | Add follow notification type |

---

## ✅ User Flow Summary

1. **User A** views **User B**'s profile or card
2. **User A** can click **"Follow"** (instant, one-way) OR **"Add Friend"** (request)
3. If **"Add Friend"** is clicked:
   - **User B** sees the request
   - **User B** can **Accept** (mutual friendship) or **Decline**
   - If **Declined**: **User A** automatically becomes a **Follower** of **User B**
4. **User A** can still see **User B**'s public and follower-visible content

---

## 🚀 Ready to Implement?

Please review and confirm:
1. ✅ **Proceed with implementation** as outlined?
2. ⚙️ **Modify the approach** (e.g., different table structure)?
3. ➕ **Adjust scope** (add/remove features)?
