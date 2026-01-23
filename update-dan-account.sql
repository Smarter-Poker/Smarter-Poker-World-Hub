-- =====================================================
-- UPDATE DAN BEKAVAC TEST ACCOUNT
-- Email: daniel@bekavactrading.com
-- XP Level 55 = 700,000 XP
-- Diamonds: 454,545
-- =====================================================

-- Step 1: Find user ID and update profiles
UPDATE profiles 
SET 
    xp_total = 700000,
    full_name = 'Dan Bekavac'
WHERE id IN (
    SELECT id FROM auth.users 
    WHERE email = 'daniel@bekavactrading.com'
);

-- Step 2: Upsert diamond balance
INSERT INTO user_diamond_balance (user_id, balance, lifetime_earned)
SELECT 
    id,
    454545,
    454545
FROM auth.users 
WHERE email = 'daniel@bekavactrading.com'
ON CONFLICT (user_id) 
DO UPDATE SET 
    balance = 454545,
    lifetime_earned = GREATEST(user_diamond_balance.lifetime_earned, 454545);

-- Step 3: Verify the update
SELECT 
    p.id,
    p.username,
    p.full_name,
    p.xp_total,
    CASE 
        WHEN p.xp_total >= 700000 THEN 55
        ELSE FLOOR(SQRT(p.xp_total / 100))::INTEGER
    END as xp_level,
    udb.balance as diamonds
FROM profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN user_diamond_balance udb ON udb.user_id = p.id
WHERE u.email = 'daniel@bekavactrading.com';
