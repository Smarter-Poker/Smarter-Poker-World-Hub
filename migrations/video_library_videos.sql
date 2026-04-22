-- ═══════════════════════════════════════════════════════════════════════
-- VIDEO LIBRARY VIDEOS TABLE
-- Stores scraped YouTube videos from all 25 creators, refreshed daily.
-- Replaces the static videoLibraryData.js with a live database-backed
-- source of truth so new content appears automatically every day.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.video_library_videos (
    id                  uuid primary key default gen_random_uuid(),

    -- YouTube identity
    youtube_video_id    text not null unique,          -- e.g. 'D5R_ZQZDR1Q'
    video_url           text not null,                 -- full YouTube URL

    -- Creator info (matches SOURCES in videoLibraryData.js)
    source_id           text not null,                 -- 'HCL', 'LODGE', 'BRAD_OWEN', etc.
    source_name         text not null,                 -- human-readable name

    -- Content metadata
    type                text not null check (type in ('cash', 'tournament')),
    title               text not null,
    thumbnail_url       text,
    duration            text,                          -- 'MM:SS' or 'H:MM:SS', null until enriched
    views_text          text default '0',              -- '1.2M', '890K'
    views_count         bigint default 0,

    -- Timestamps
    published_at        timestamptz,                   -- when the video was published on YouTube
    scraped_at          timestamptz default now(),     -- when we first ingested it
    enriched_at         timestamptz,                   -- when duration was enriched via yt-dlp

    -- Audit
    created_at          timestamptz default now(),
    updated_at          timestamptz default now()
);

-- Indexes for common query patterns
create index if not exists idx_vlv_source_id     on public.video_library_videos (source_id);
create index if not exists idx_vlv_type          on public.video_library_videos (type);
create index if not exists idx_vlv_published_at  on public.video_library_videos (published_at desc);
create index if not exists idx_vlv_scraped_at    on public.video_library_videos (scraped_at desc);
create index if not exists idx_vlv_yt_id         on public.video_library_videos (youtube_video_id);

-- Auto-update updated_at
create or replace function public.set_vlv_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_vlv_updated_at on public.video_library_videos;
create trigger trg_vlv_updated_at
    before update on public.video_library_videos
    for each row execute function public.set_vlv_updated_at();

-- RLS: readable by all, writable only by service role
alter table public.video_library_videos enable row level security;

drop policy if exists "video_library_videos_public_read" on public.video_library_videos;
create policy "video_library_videos_public_read"
    on public.video_library_videos for select
    using (true);

drop policy if exists "video_library_videos_service_write" on public.video_library_videos;
create policy "video_library_videos_service_write"
    on public.video_library_videos for all
    using (auth.role() = 'service_role');

-- Seed the existing static videos from videoLibraryData.js
-- (static data as bootstrap — scraper will add more daily)
insert into public.video_library_videos
    (youtube_video_id, source_id, source_name, type, title, views_text, duration, video_url, thumbnail_url, published_at, scraped_at)
values
    -- HCL
    ('D5R_ZQZDR1Q','HCL','Hustler Casino Live','cash','Doug Polk Goes FULL DEGEN in LA Poker Game!','1.2M','18:34','https://youtube.com/watch?v=D5R_ZQZDR1Q','https://img.youtube.com/vi/D5R_ZQZDR1Q/maxresdefault.jpg', now() - interval '30 days', now()),
    ('bjSK8Ajhm2g','HCL','Hustler Casino Live','cash','Jungleman & Senor Tilt Attempt to BLUFF Mariano','890K','15:22','https://youtube.com/watch?v=bjSK8Ajhm2g','https://img.youtube.com/vi/bjSK8Ajhm2g/maxresdefault.jpg', now() - interval '29 days', now()),
    ('fif_M-C7uxM','HCL','Hustler Casino Live','cash','Jungleman Makes 3 IMPOSSIBLE HERO CALLS in 1 Game!','750K','14:45','https://youtube.com/watch?v=fif_M-C7uxM','https://img.youtube.com/vi/fif_M-C7uxM/maxresdefault.jpg', now() - interval '28 days', now()),
    ('4ErqhJMdTqE','HCL','Hustler Casino Live','cash','Nik Airball RUNS OVER The Table & Wins All The Money','980K','16:18','https://youtube.com/watch?v=4ErqhJMdTqE','https://img.youtube.com/vi/4ErqhJMdTqE/maxresdefault.jpg', now() - interval '27 days', now()),
    ('7fe18ZyRR3o','HCL','Hustler Casino Live','cash','Nik Airball Biggest Win of All Time | $1.3 MILLION','4.5M','28:12','https://youtube.com/watch?v=7fe18ZyRR3o','https://img.youtube.com/vi/7fe18ZyRR3o/maxresdefault.jpg', now() - interval '20 days', now()),
    ('d-MMWutIvhQ','HCL','Hustler Casino Live','cash','QUADS vs STRAIGHT FLUSH! Craziest Hand in HCL HISTORY!','5.2M','18:55','https://youtube.com/watch?v=d-MMWutIvhQ','https://img.youtube.com/vi/d-MMWutIvhQ/maxresdefault.jpg', now() - interval '15 days', now()),
    -- LODGE
    ('yJZxw9u7_DU','LODGE','The Lodge','cash','Craziest Straight Flushes of 2025','680K','18:22','https://youtube.com/watch?v=yJZxw9u7_DU','https://img.youtube.com/vi/yJZxw9u7_DU/maxresdefault.jpg', now() - interval '25 days', now()),
    ('9ZjGeSFzCgE','LODGE','The Lodge','cash','POCKET ACES For $36,185','540K','14:33','https://youtube.com/watch?v=9ZjGeSFzCgE','https://img.youtube.com/vi/9ZjGeSFzCgE/maxresdefault.jpg', now() - interval '22 days', now()),
    ('PA8XtrwroQ8','LODGE','The Lodge','cash','10 Biggest Poker Hands of 2025','1.2M','28:45','https://youtube.com/watch?v=PA8XtrwroQ8','https://img.youtube.com/vi/PA8XtrwroQ8/maxresdefault.jpg', now() - interval '18 days', now()),
    -- TRITON
    ('524_3UypGkU','TRITON','Triton Poker','tournament','$150K NLH 8-Handed Final Table Highlights','1.2M','32:18','https://youtube.com/watch?v=524_3UypGkU','https://img.youtube.com/vi/524_3UypGkU/maxresdefault.jpg', now() - interval '40 days', now()),
    ('RpU9bwH-2WI','TRITON','Triton Poker','tournament','Largest Poker Pot Ever: Ossi Ketola vs Alex Foxen!','2.4M','18:55','https://youtube.com/watch?v=RpU9bwH-2WI','https://img.youtube.com/vi/RpU9bwH-2WI/maxresdefault.jpg', now() - interval '35 days', now()),
    -- LATB
    ('hg02g0fgIGU','LATB','Live at the Bike','cash','Almost $50,000 On The Line! Can He Hold With KK?','450K','14:22','https://youtube.com/watch?v=hg02g0fgIGU','https://img.youtube.com/vi/hg02g0fgIGU/maxresdefault.jpg', now() - interval '30 days', now()),
    -- WSOP
    ('BdUvr_CXSxk','WSOP','WSOP','tournament','WSOP Main Event 2022 - Final Table','4.5M','78:33','https://youtube.com/watch?v=BdUvr_CXSxk','https://img.youtube.com/vi/BdUvr_CXSxk/maxresdefault.jpg', now() - interval '60 days', now()),
    -- WPT
    ('_4nrOGfFssE','WPT','World Poker Tour','tournament','WPT World Championship $40M GTD Final Table','2.8M','125:33','https://youtube.com/watch?v=_4nrOGfFssE','https://img.youtube.com/vi/_4nrOGfFssE/maxresdefault.jpg', now() - interval '50 days', now()),
    -- Brad Owen
    ('P5OT-cOcTRs','BRAD_OWEN','Brad Owen','cash','MANIAC Wants To Get STACKED!! Nashville Poker Is WILD!!','520K','38:22','https://youtube.com/watch?v=P5OT-cOcTRs','https://img.youtube.com/vi/P5OT-cOcTRs/maxresdefault.jpg', now() - interval '20 days', now()),
    ('I-dJDxwatNo','BRAD_OWEN','Brad Owen','cash','I Play $60,000+ Pot vs Mariano!! GIGANTIC ALL IN Pots!','1.2M','45:33','https://youtube.com/watch?v=I-dJDxwatNo','https://img.youtube.com/vi/I-dJDxwatNo/maxresdefault.jpg', now() - interval '15 days', now()),
    -- Doug Polk
    ('fhgYiIyxtSE','POLK','Doug Polk Poker','cash','My HEADS UP Battle vs Daniel Negreanu','4.5M','55:22','https://youtube.com/watch?v=fhgYiIyxtSE','https://img.youtube.com/vi/fhgYiIyxtSE/maxresdefault.jpg', now() - interval '45 days', now()),
    -- Garrett
    ('G_qXrxrzNvQ','GARRETT','Garrett Adelstein','cash','Garrett Adelstein DESTROYS Everyone - HCL','8.5M','28:44','https://youtube.com/watch?v=G_qXrxrzNvQ','https://img.youtube.com/vi/G_qXrxrzNvQ/maxresdefault.jpg', now() - interval '55 days', now()),
    -- Tom Dwan
    ('dS_uv88YuPs','DWAN','Tom Dwan','cash','Every Tom Dwan Bluff on High Stakes Poker','6.2M','28:44','https://youtube.com/watch?v=dS_uv88YuPs','https://img.youtube.com/vi/dS_uv88YuPs/maxresdefault.jpg', now() - interval '60 days', now()),
    -- Phil Ivey
    ('HY2V4mHdQJw','IVEY','Phil Ivey','cash','Phil Ivey Best Bluff Ever vs Paul Jackson','5.2M','18:22','https://youtube.com/watch?v=HY2V4mHdQJw','https://img.youtube.com/vi/HY2V4mHdQJw/maxresdefault.jpg', now() - interval '65 days', now())
on conflict (youtube_video_id) do nothing;

comment on table public.video_library_videos is
    'YouTube videos scraped daily from 25 poker creators. Replaces static videoLibraryData.js. Refreshed every day at 06:00 UTC via OpenClaw.';
