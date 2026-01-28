-- =====================================================
-- DROP UNION/AGENT TABLES
-- =====================================================
-- These tables are NOT part of Smarter Captain (TableCaptain)
-- TableCaptain is for physical poker room management only
-- =====================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_agent_stats ON captain_agent_players;
DROP TRIGGER IF EXISTS trigger_update_union_venue_count ON captain_union_venues;
DROP TRIGGER IF EXISTS trigger_set_agent_code ON captain_agents;

-- Drop functions
DROP FUNCTION IF EXISTS update_agent_stats();
DROP FUNCTION IF EXISTS update_union_venue_count();
DROP FUNCTION IF EXISTS generate_agent_code();

-- Drop tables in dependency order (child tables first)
DROP TABLE IF EXISTS captain_union_analytics CASCADE;
DROP TABLE IF EXISTS captain_agent_commissions CASCADE;
DROP TABLE IF EXISTS captain_agent_players CASCADE;
DROP TABLE IF EXISTS captain_agents CASCADE;
DROP TABLE IF EXISTS captain_union_venues CASCADE;
DROP TABLE IF EXISTS captain_unions CASCADE;
