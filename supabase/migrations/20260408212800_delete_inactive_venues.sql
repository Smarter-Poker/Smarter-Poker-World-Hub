-- Migration: Delete all 39 inactive venues from poker_venues
-- These venues have is_active=false and should not appear on smarter.poker
-- Uses dynamic execution to handle all dependent fkeys
-- Date: 2026-04-08

DO $$ 
DECLARE
  v_table_name text;
  v_column_name text;
  sql text;
  v_venue_ids text := '1929,1857,1866,1864,2498,2625,1949,2320,2654,2730,2653,2701,1873,2641,1874,2646,3118,2616,2692,1990,1989,2652,1846,2764,2729,2636,1900,1905,2413,1907,1910,2639,1914,1915,1916,2716,2759,1898,1897';
BEGIN
  -- First delete multi-layer dependent commander objects
  EXECUTE format('DELETE FROM commander_league_standings WHERE league_id IN (SELECT id FROM commander_leagues WHERE venue_id IN (%s))', v_venue_ids);
  
  -- Clear all foreign key relations referencing poker_venues
  FOR v_table_name, v_column_name IN 
    SELECT tc.table_name, kcu.column_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name 
    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name 
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name='poker_venues'
    AND tc.table_name NOT IN ('poker_venues', 'commander_league_standings')
  LOOP
    BEGIN
      -- Try setting NULL first to preserve historical data
      sql := format('UPDATE %I SET %I = NULL WHERE %I IN (%s)', v_table_name, v_column_name, v_column_name, v_venue_ids);
      EXECUTE sql;
    EXCEPTION WHEN not_null_violation THEN
      -- If NOT NULL constraint exists, delete the dependent row
      sql := format('DELETE FROM %I WHERE %I IN (%s)', v_table_name, v_column_name, v_venue_ids);
      EXECUTE sql;
    END;
  END LOOP;

  -- Delete the venues
  EXECUTE format('DELETE FROM poker_venues WHERE is_active = false AND id IN (%s)', v_venue_ids);
END $$;
