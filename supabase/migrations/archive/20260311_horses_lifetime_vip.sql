-- ═══════════════════════════════════════════════════════════════════════════
-- 🐴 GRANT LIFETIME VIP TO ALL HORSES
-- ═══════════════════════════════════════════════════════════════════════════
-- All 347 horses (content_authors with profile_id) should have:
--   is_vip = true
--   vip_tier = 'lifetime'
--   vip_expires_at = '2099-12-31T23:59:59Z' (effectively never expires)
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Grant lifetime VIP to all horse profiles
UPDATE profiles
SET
    is_vip = true,
    vip_tier = 'lifetime',
    vip_expires_at = '2099-12-31T23:59:59+00:00'
WHERE id IN (
    SELECT profile_id
    FROM content_authors
    WHERE profile_id IS NOT NULL
      AND is_active = true
);

-- Step 2: Verify the update
DO $$
DECLARE
    total_horses INT;
    vip_horses INT;
    non_vip_horses INT;
BEGIN
    SELECT COUNT(*) INTO total_horses
    FROM content_authors
    WHERE profile_id IS NOT NULL AND is_active = true;

    SELECT COUNT(*) INTO vip_horses
    FROM profiles p
    JOIN content_authors ca ON p.id = ca.profile_id
    WHERE ca.is_active = true
      AND p.is_vip = true
      AND p.vip_tier = 'lifetime';

    non_vip_horses := total_horses - vip_horses;

    RAISE NOTICE '══════════════════════════════════════════';
    RAISE NOTICE '🐴 HORSE LIFETIME VIP GRANT RESULTS';
    RAISE NOTICE '══════════════════════════════════════════';
    RAISE NOTICE 'Total active horses: %', total_horses;
    RAISE NOTICE 'Horses with lifetime VIP: %', vip_horses;
    RAISE NOTICE 'Horses WITHOUT VIP: %', non_vip_horses;
    RAISE NOTICE '══════════════════════════════════════════';

    IF non_vip_horses > 0 THEN
        RAISE WARNING '⚠️ % horses still missing VIP!', non_vip_horses;
    ELSE
        RAISE NOTICE '✅ ALL HORSES HAVE LIFETIME VIP CARDS!';
    END IF;
END $$;
