-- =====================================================
-- DROP UNION/AGENT TABLES
-- =====================================================
-- These tables are NOT part of Club Commander (TableCaptain)
-- TableCaptain is for physical poker room management only
-- =====================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_agent_stats ON commander_agent_players;
DROP TRIGGER IF EXISTS trigger_update_union_venue_count ON commander_union_venues;
DROP TRIGGER IF EXISTS trigger_set_agent_code ON commander_agents;

-- Drop functions
DROP FUNCTION IF EXISTS update_agent_stats();
DROP FUNCTION IF EXISTS update_union_venue_count();
DROP FUNCTION IF EXISTS generate_agent_code();

-- Drop tables in dependency order (child tables first)
DROP TABLE IF EXISTS commander_union_analytics CASCADE;
DROP TABLE IF EXISTS commander_agent_commissions CASCADE;
DROP TABLE IF EXISTS commander_agent_players CASCADE;
DROP TABLE IF EXISTS commander_agents CASCADE;
DROP TABLE IF EXISTS commander_union_venues CASCADE;
DROP TABLE IF EXISTS commander_unions CASCADE;
