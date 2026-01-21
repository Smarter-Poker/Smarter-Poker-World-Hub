---
name: Leaderboards & Achievements
description: Ranking systems, achievements, and competitive tracking
---

# Leaderboards & Achievements Skill

## Overview
Build competitive leaderboards, achievement systems, and progress tracking.

## Leaderboard Types
| Type | Metric | Reset |
|------|--------|-------|
| XP Leaders | Total XP | Never |
| Weekly XP | Weekly XP gain | Every Monday |
| Training Stars | Games mastered | Never |
| Tournament Points | Tournament finishes | Monthly |
| Win Rate | Hands won % | Never |
| Horse Stable | XP from horses followed | Never |

## Database Schema
```sql
CREATE TABLE leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  period TEXT, -- 'all_time', 'weekly', 'monthly'
  user_id UUID REFERENCES auth.users(id),
  score DECIMAL NOT NULL,
  rank INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  category TEXT, -- 'training', 'social', 'tournament', 'special'
  xp_reward INTEGER DEFAULT 0,
  diamond_reward INTEGER DEFAULT 0,
  rarity TEXT DEFAULT 'common' -- 'common', 'rare', 'epic', 'legendary'
);

CREATE TABLE user_achievements (
  user_id UUID REFERENCES auth.users(id),
  achievement_id TEXT REFERENCES achievements(id),
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX idx_leaderboards_type_rank ON leaderboards(type, period, rank);
```

## Leaderboard Query
```javascript
async function getLeaderboard(type, period = 'all_time', limit = 100) {
  const { data } = await supabase
    .from('leaderboards')
    .select(`
      *,
      user:profiles!user_id(username, avatar_url, full_name)
    `)
    .eq('type', type)
    .eq('period', period)
    .order('rank', { ascending: true })
    .limit(limit);
  
  return data;
}

async function getUserRank(userId, type, period = 'all_time') {
  const { data } = await supabase
    .from('leaderboards')
    .select('rank, score')
    .eq('type', type)
    .eq('period', period)
    .eq('user_id', userId)
    .single();
  
  return data;
}
```

## Achievement Definitions
```javascript
const ACHIEVEMENTS = [
  // Training
  { id: 'first_game', name: 'First Steps', description: 'Complete your first training game', category: 'training', xp: 50 },
  { id: 'ten_games', name: 'Getting Started', description: 'Complete 10 training games', category: 'training', xp: 100 },
  { id: 'perfect_score', name: 'Perfect!', description: 'Get 100% on any game', category: 'training', xp: 200, rarity: 'rare' },
  { id: 'master_preflop', name: 'Preflop Master', description: 'Master all preflop charts', category: 'training', xp: 500, diamonds: 100, rarity: 'epic' },
  
  // Social
  { id: 'first_post', name: 'Voice Heard', description: 'Create your first post', category: 'social', xp: 25 },
  { id: 'hundred_likes', name: 'Popular', description: 'Receive 100 likes', category: 'social', xp: 200, rarity: 'rare' },
  { id: 'influencer', name: 'Influencer', description: 'Get 1000 followers', category: 'social', xp: 500, diamonds: 250, rarity: 'legendary' },
  
  // Tournament
  { id: 'first_cash', name: 'In the Money', description: 'Cash in a tournament', category: 'tournament', xp: 100 },
  { id: 'first_win', name: 'Champion', description: 'Win a tournament', category: 'tournament', xp: 500, diamonds: 100, rarity: 'epic' },
  
  // Special
  { id: 'early_adopter', name: 'Early Adopter', description: 'Join during beta', category: 'special', xp: 1000, diamonds: 500, rarity: 'legendary' }
];
```

## Unlock Achievement
```javascript
async function unlockAchievement(userId, achievementId) {
  // Check if already unlocked
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId)
    .eq('achievement_id', achievementId)
    .single();
  
  if (existing) return null;
  
  // Get achievement details
  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  
  // Unlock
  await supabase.from('user_achievements').insert({
    user_id: userId,
    achievement_id: achievementId
  });
  
  // Award rewards
  if (achievement.xp) {
    await supabase.rpc('award_xp', { p_user_id: userId, p_amount: achievement.xp, p_source: `achievement:${achievementId}` });
  }
  if (achievement.diamonds) {
    await supabase.rpc('award_diamonds', { p_user_id: userId, p_amount: achievement.diamonds, p_source: `achievement:${achievementId}` });
  }
  
  // Notify
  await createNotification(userId, 'ACHIEVEMENT', `Achievement Unlocked: ${achievement.name}`, achievement.description);
  
  return achievement;
}
```

## Components
- `LeaderboardPage.jsx` - Full leaderboard view
- `LeaderboardCard.jsx` - Compact leaderboard widget
- `RankBadge.jsx` - Position display (1st, 2nd, etc.)
- `AchievementGrid.jsx` - All achievements
- `AchievementCard.jsx` - Single achievement
- `UnlockAnimation.jsx` - Achievement pop-up
- `ProgressTracker.jsx` - Achievement progress bars
