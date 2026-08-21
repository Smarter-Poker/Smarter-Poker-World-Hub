-- ═══════════════════════════════════════════════════════════════════════
-- 20260821210001_profiles_cosmetics.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                              
-- AUTHOR:      Antigravity
-- AFFECTS:     tables: public.profiles (alter)
-- IRREVERSIBLE: no                            
--
-- WHY:
--   Phase 4 of Avatar Enhancements: Modular Cosmetics. Players can now equip
--   custom frames (e.g., Grandmaster Diamond) and particle auras (e.g., Fire)
--   that render on top of their avatars. Profiles table is the primary read target.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='equipped_frame') THEN
        ALTER TABLE public.profiles ADD COLUMN equipped_frame text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='equipped_aura') THEN
        ALTER TABLE public.profiles ADD COLUMN equipped_aura text;
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.equipped_frame IS 'CSS key for the cosmetic frame overlay (e.g. frame-diamond, frame-cyber)';
COMMENT ON COLUMN public.profiles.equipped_aura IS 'CSS key for the cosmetic particle aura (e.g. aura-fire, aura-glitch)';

COMMIT;
