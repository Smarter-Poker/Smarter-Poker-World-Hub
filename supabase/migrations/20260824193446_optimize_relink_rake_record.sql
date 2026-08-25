CREATE INDEX IF NOT EXISTS idx_rake_records_relink 
ON public.rake_records (table_id, (metadata->>'hand_number')) 
WHERE hand_id IS NULL;
