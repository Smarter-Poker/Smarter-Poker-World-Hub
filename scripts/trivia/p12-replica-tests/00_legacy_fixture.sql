\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE postgres NOLOGIN SUPERUSER;

CREATE SCHEMA auth;

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY,
    is_horse boolean NOT NULL DEFAULT false,
    display_name text,
    username text
);

CREATE TABLE public.trivia_tournaments (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    entry_fee integer NOT NULL DEFAULT 25,
    prize_pool integer NOT NULL DEFAULT 0,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    completed_at timestamptz,
    engine_version text
);

CREATE TABLE public.trivia_tournament_entries (
    id uuid PRIMARY KEY,
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    score integer NOT NULL DEFAULT 0,
    correct_count integer NOT NULL DEFAULT 0,
    time_spent integer NOT NULL DEFAULT 0,
    rank integer,
    payout integer NOT NULL DEFAULT 0
);

CREATE TABLE public.competitive_quarantine (
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    reason_code text NOT NULL,
    invariant_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (entity_type, entity_id)
);

INSERT INTO public.trivia_tournaments (
    id, name, start_time, end_time, entry_fee, prize_pool,
    status, created_at, completed_at, engine_version
)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'Legacy 100 A', '2026-08-20 01:00+00', '2026-08-20 03:00+00', 23, 2300, 'completed', '2026-08-19 20:00+00', '2026-08-20 02:30+00', NULL),
    ('10000000-0000-4000-8000-000000000002', 'Legacy 100 B', '2026-08-21 01:00+00', '2026-08-21 03:00+00', 23, 2300, 'complete',  '2026-08-20 20:00+00', '2026-08-21 02:30+00', NULL),
    ('10000000-0000-4000-8000-000000000003', 'Legacy 184 Evidence', '2026-08-22 01:00+00', '2026-08-22 03:00+00', 23, 184, 'completed', '2026-08-21 20:00+00', '2026-08-22 02:30+00', NULL),
    ('10000000-0000-4000-8000-000000000004', 'Legacy Cancelled A', '2026-08-23 01:00+00', '2026-08-23 03:00+00', 23, 0, 'cancelled', '2026-08-22 20:00+00', NULL, NULL),
    ('10000000-0000-4000-8000-000000000005', 'Legacy Cancelled B', '2026-08-24 01:00+00', '2026-08-24 03:00+00', 23, 0, 'cancelled', '2026-08-23 20:00+00', NULL, NULL);

INSERT INTO public.profiles (id, is_horse, display_name, username)
SELECT ('20000000-0000-4000-8000-' || pg_catalog.lpad(sequence::text, 12, '0'))::uuid,
       true,
       'Smarter Horse ' || sequence,
       'horse_' || sequence
  FROM pg_catalog.generate_series(1, 208) AS sequence;

INSERT INTO public.trivia_tournament_entries (
    id, tournament_id, user_id, score, correct_count, time_spent, rank, payout
)
SELECT ('30000000-0000-4000-8000-' || pg_catalog.lpad(sequence::text, 12, '0'))::uuid,
       CASE
           WHEN sequence <= 100 THEN '10000000-0000-4000-8000-000000000001'::uuid
           WHEN sequence <= 200 THEN '10000000-0000-4000-8000-000000000002'::uuid
           ELSE '10000000-0000-4000-8000-000000000003'::uuid
       END,
       ('20000000-0000-4000-8000-' || pg_catalog.lpad(sequence::text, 12, '0'))::uuid,
       CASE WHEN sequence > 200 THEN 0 ELSE 100 - ((sequence - 1) % 100) END,
       CASE WHEN sequence > 200 THEN 0 ELSE 20 - ((sequence - 1) % 20) END,
       CASE WHEN sequence > 200 THEN 0 ELSE 60 + ((sequence - 1) % 120) END,
       CASE WHEN sequence > 200 THEN NULL ELSE 1 + ((sequence - 1) % 100) END,
       CASE WHEN sequence IN (1, 101) THEN 2300 ELSE 0 END
  FROM pg_catalog.generate_series(1, 208) AS sequence;

INSERT INTO public.competitive_quarantine (
    entity_type, entity_id, reason_code, invariant_snapshot
)
VALUES (
    'trivia_tournament',
    '10000000-0000-4000-8000-000000000003',
    'legacy_8_horse_184_pool_unsettled',
    '{"entry_count":8,"horse_count":8,"ranked_count":0,"total_payout":0}'::jsonb
);
