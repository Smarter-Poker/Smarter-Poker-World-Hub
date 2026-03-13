-- =========================================================================
-- MIGRATION: 50-LEVEL CLUB CAPACITY SYSTEM - PERFORMANCE INDEX  
-- =========================================================================
-- Purpose: In Pass 4 of the 9th Sweep, I confirmed that the `recompute_club_levels` 
-- RPC runs 4 COUNT(*) queries on `club_members` filtered by (club_id, role, status).
-- While `idx_cm_club_id` exists, the additional role/status filters are applied 
-- post-index as heap fetches. This composite covering index eliminates ALL heap 
-- access, enabling pure index-only scans for the autonomous trigger's math.
-- This is critical because the trigger fires on EVERY member INSERT/UPDATE/DELETE.

CREATE INDEX IF NOT EXISTS idx_cm_club_role_status 
ON public.club_members(club_id, role, status);
