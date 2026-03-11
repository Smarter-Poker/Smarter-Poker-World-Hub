-- Add 'pko' (Progressive Knockout) to commander_tournaments tournament_type constraint
-- PKO is a bounty format where half the bounty goes to the eliminator and half is added to the eliminator's own bounty

ALTER TABLE commander_tournaments
  DROP CONSTRAINT IF EXISTS commander_tournaments_tournament_type_check;

ALTER TABLE commander_tournaments
  ADD CONSTRAINT commander_tournaments_tournament_type_check
  CHECK (tournament_type IN ('freezeout', 'rebuy', 'bounty', 'pko', 'satellite', 'shootout', 'turbo', 'hyper'));
