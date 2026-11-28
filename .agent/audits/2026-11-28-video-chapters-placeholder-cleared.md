# 2026-11-28: video chapter placeholder clear, corrected row count

Migration: `supabase/migrations/20261128030000_video_chapters_placeholder_cleared.sql`
(installed: `supabase_migrations.schema_migrations` has version `20261128030000`,
name `video_chapters_placeholder_cleared`).

## The correction

The migration header says the placeholder chapter
`[{"title":"Video Start","start_seconds":0}]` "was written for 22,131 of 22,485
enrichment records" and that the rolled-back probe "cleared 22,131 rows". Both
figures are from the read at 02:05-02:06 UTC on 2026-11-28.

When the migration was applied, it cleared **21,699** rows, not 22,131.

## Why the numbers differ

Between the probe and the install, the creator-chapter backfill
(`scripts/video_source_registry_ingest.py`, entries marked
`source = 'creator_description'`) had already replaced the placeholder on
**432** rows with the creator's own chapter list. The migration's UPDATE only
touches rows whose `chapters` is exactly the placeholder, so those 432 were
correctly left alone: 22,131 - 432 = 21,699.

The migration's own post-apply assertions still held: zero placeholder rows
remained, and the number of rows carrying creator chapters was unchanged by the
UPDATE.

## Read-back (2026-11-28, read-only, Supabase MCP `execute_sql`)

```sql
SELECT count(*) total,
       count(*) FILTER (WHERE chapters = '[]'::jsonb) empty,
       count(*) FILTER (WHERE chapters @> '[{"source":"creator_description"}]'::jsonb) creator,
       count(*) FILTER (WHERE chapters = '[{"title":"Video Start","start_seconds":0}]'::jsonb) placeholder
FROM public.video_enrichment_records;
-- total 22485, empty 22042, creator 443, placeholder 0
```

No placeholder remains. The creator count has since grown past 432 as the
backfill continued.

## Why the migration file was not edited

The file is an installed migration. Its SQL must not change, and the repo's
schema-lineage check (`scripts/ci/check-shared-schema-lineage.py`) compares
historical migration files byte for byte ("Historical migration bytes
changed"), so even a comment-only edit is refused. This note is the record of
the correct count.
