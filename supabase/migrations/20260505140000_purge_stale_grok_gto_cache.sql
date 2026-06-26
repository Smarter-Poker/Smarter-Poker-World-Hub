BEGIN;
DO $$
BEGIN
    DELETE FROM training_question_cache WHERE question_data->>'source' = 'GROK_GTO';
END $$;
COMMIT;
