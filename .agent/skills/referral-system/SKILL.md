---
name: Referral System
description: Invite friends, referral tracking, and reward distribution
---

# Referral System Skill

## Overview
Allow users to invite friends and earn rewards for successful referrals.

## Referral Rewards
| Action | Referrer Gets | Referee Gets |
|--------|---------------|--------------|
| Sign up | 100 💎 | 50 💎 |
| First purchase | 10% of purchase | - |
| VIP subscription | 500 💎 | 100 💎 bonus |

## Database Schema
```sql
CREATE TABLE referral_codes (
  code TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  uses_count INTEGER DEFAULT 0,
  max_uses INTEGER, -- NULL = unlimited
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id),
  referee_id UUID REFERENCES auth.users(id) UNIQUE,
  referral_code TEXT REFERENCES referral_codes(code),
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'rewarded'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID REFERENCES referrals(id),
  user_id UUID REFERENCES auth.users(id),
  reward_type TEXT, -- 'diamonds', 'vip_days'
  amount INTEGER,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Generate Referral Code
```javascript
async function generateReferralCode(userId) {
  // Check if user already has a code
  const { data: existing } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .single();
  
  if (existing) return existing.code;
  
  // Generate unique code
  const code = `REF_${userId.slice(0, 8).toUpperCase()}`;
  
  await supabase.from('referral_codes').insert({
    code,
    user_id: userId
  });
  
  return code;
}
```

## Apply Referral Code
```javascript
async function applyReferralCode(newUserId, code) {
  // Validate code
  const { data: referralCode } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('code', code)
    .single();
  
  if (!referralCode) throw new Error('Invalid referral code');
  if (referralCode.user_id === newUserId) throw new Error('Cannot refer yourself');
  
  // Check max uses
  if (referralCode.max_uses && referralCode.uses_count >= referralCode.max_uses) {
    throw new Error('Referral code expired');
  }
  
  // Create referral
  await supabase.from('referrals').insert({
    referrer_id: referralCode.user_id,
    referee_id: newUserId,
    referral_code: code
  });
  
  // Update uses count
  await supabase.from('referral_codes')
    .update({ uses_count: referralCode.uses_count + 1 })
    .eq('code', code);
  
  // Award referee bonus
  await supabase.rpc('award_diamonds', {
    p_user_id: newUserId,
    p_amount: 50,
    p_source: 'referral_bonus'
  });
}
```

## Complete Referral
```javascript
async function completeReferral(refereeId, trigger = 'signup') {
  const { data: referral } = await supabase
    .from('referrals')
    .select('*')
    .eq('referee_id', refereeId)
    .eq('status', 'pending')
    .single();
  
  if (!referral) return;
  
  // Update referral status
  await supabase.from('referrals')
    .update({ status: 'completed', completed_at: new Date() })
    .eq('id', referral.id);
  
  // Award referrer
  await supabase.rpc('award_diamonds', {
    p_user_id: referral.referrer_id,
    p_amount: 100,
    p_source: `referral_reward:${refereeId}`
  });
  
  // Log reward
  await supabase.from('referral_rewards').insert({
    referral_id: referral.id,
    user_id: referral.referrer_id,
    reward_type: 'diamonds',
    amount: 100,
    reason: trigger
  });
  
  // Notify referrer
  await createNotification(
    referral.referrer_id,
    'REFERRAL_SUCCESS',
    'Referral Complete!',
    'Your friend joined and you earned 100 diamonds!'
  );
}
```

## Referral Stats
```javascript
async function getReferralStats(userId) {
  const { data: referrals } = await supabase
    .from('referrals')
    .select('status')
    .eq('referrer_id', userId);
  
  const { data: rewards } = await supabase
    .from('referral_rewards')
    .select('amount')
    .eq('user_id', userId);
  
  return {
    totalReferrals: referrals.length,
    completedReferrals: referrals.filter(r => r.status === 'completed').length,
    totalEarned: rewards.reduce((sum, r) => sum + r.amount, 0)
  };
}
```

## Components
- `ReferralCard.jsx` - Share referral code
- `InviteFriends.jsx` - Social share buttons
- `ReferralHistory.jsx` - List of referrals
- `ReferralRewards.jsx` - Earnings display
