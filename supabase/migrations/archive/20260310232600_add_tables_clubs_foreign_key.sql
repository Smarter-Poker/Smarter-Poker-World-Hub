DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_tables_club_id'
    ) THEN
        ALTER TABLE tables
        ADD CONSTRAINT fk_tables_club_id
        FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;
    END IF;
END $$;
