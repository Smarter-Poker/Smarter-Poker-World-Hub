-- Enable Realtime for Tournament Director tables
-- Required for useTournamentRealtime hook to receive postgres_changes events
-- Without this, WebSocket subscriptions connect but receive zero events

ALTER PUBLICATION supabase_realtime ADD TABLE commander_tournament_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE commander_tournaments;
