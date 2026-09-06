-- The retired clip array becomes rows.
--
-- Companion to 20260906113000_poker_gets_a_supply_that_renews.sql, which
-- built the table. This puts the 149 distinct clips from the retired
-- ClipLibrary.ts array into it, each carrying the oEmbed answer measured on
-- 2026-09-06: 113 alive, 36 dead.
--
-- WHY SEED AT ALL, when a scraper is shipping in the same phase: the pool
-- must never be empty for an instant. The publisher falls back to sports
-- when poker has nothing, and that fallback is the defect this phase exists
-- to end - cutting over to an empty table would make it worse for however
-- long the first scrape takes. The good clips were hand-verified once and
-- are worth keeping; the dead ones are kept too, as tombstones with
-- is_active = false, so the scraper cannot rediscover a video we have
-- already proved is gone.
--
-- The 36 dead are why this matters: 22 answered 404 (deleted or private) and
-- 14 answered 401 (embedding disabled). Every one of them was postable
-- yesterday, because the only validity cache on the platform was a Map in
-- process memory that dies with the container.
--
-- SAFE: inserts into a table nothing reads yet, with ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO public.poker_clips
  (video_id, title, source, category, oembed_ok, is_active, source_url, oembed_checked_at, origin, source_type)
SELECT v.video_id, v.title, v.source, v.category, v.ok, v.ok,
       'https://www.youtube.com/watch?v=' || v.video_id,
       now(), 'library', 'youtube'
FROM (VALUES
  ('hrcKuXcRhCc','Perfect Trap','HCL','soul_read',true),
  ('ecNLi6z8bSk','Never Laugh Again','HCL','table_drama',true),
  ('6zCDWw2wskQ','$92k Pot','HCL','massive_pot',true),
  ('CTUh5LohLV8','Genius Shows Hand','HCL','bad_beat',true),
  ('ShI-eFe8PLQ','Airball Too Small','HCL','celebrity',true),
  ('Wp5G4CDS2Tk','Airball Hero','HCL','bluff',true),
  ('h1YsGpdcf7Y','Mariano Crushing','HCL','massive_pot',true),
  ('aSRhwwXnWtg','Mariano Disbelief','HCL','bad_beat',true),
  ('3ovHEAWhhzg','Mariano 3x River','HCL','bluff',true),
  ('ZW14QdHMtKk','$125k Miracle','HCL','massive_pot',true),
  ('8eG3f0K3eas','Britney Revenge','HCL','table_drama',true),
  ('qbVkC0sUTlY','Britney Outplayed','HCL','bad_beat',true),
  ('fwr4hulh-Y0','Top 25 Pots 2022','HCL','massive_pot',true),
  ('cX8o0xRJpME','Hero Call','LODGE','soul_read',false),
  ('7Cfd4QRGz0g','Polk Plays','LODGE','celebrity',false),
  ('QWvL7RFVpR4','Texas Action','LODGE','massive_pot',false),
  ('fhgYiIyxtSE','Mariano Pick','LODGE','massive_pot',true),
  ('4kkx1r3YaAU','Taras Crazy','LODGE','table_drama',true),
  ('lD4xok14Dig','Biggest Pots','LODGE','massive_pot',true),
  ('N6S1UlkMLN8','Fold Set','LODGE','soul_read',true),
  ('nA3klZ8Oy1M','Tesla Debut','LODGE','celebrity',true),
  ('XwBuVG9jT7Y','Hero Fold','LATB','soul_read',false),
  ('qpOq8KGH7k8','Big Pot','LATB','massive_pot',false),
  ('VlF78eSKJpE','Table Talk','LATB','table_drama',false),
  ('2KjPKwgycOQ','Garrett Soul Read','LATB','soul_read',true),
  ('rAHFyM3ve2c','Sick River','LATB','bad_beat',true),
  ('L85WOvR7Pqs','All In Call','LATB','bluff',true),
  ('DGPqtqInt6c','Massive Bluff','LATB','bluff',true),
  ('D5R_ZQZDR1Q','Set vs Set','LATB','bad_beat',true),
  ('GnTDT3H8-Zo','Sick Read','TCH','soul_read',false),
  ('wM6B8-eMFkA','$50k All In','TCH','high_stakes',false),
  ('bjSK8Ajhm2g','Texas Hold Em','TCH','massive_pot',true),
  ('fif_M-C7uxM','Dallas Pot','TCH','massive_pot',true),
  ('4ErqhJMdTqE','Hero Fold','TCH','soul_read',true),
  ('2aaQ8D5mQiQ','Quads vs Full','TCH','bad_beat',true),
  ('Tvt3ib08foo','Bluff Catch','TCH','soul_read',true),
  ('TKuwraMHM4s','River Drama','TCH','table_drama',true),
  ('h3TaxH8cVzY','Ivey Play','TRITON','celebrity',false),
  ('JNmqGd8bPWY','Biggest Pot Ever','TRITON','high_stakes',false),
  ('UfUbnwLZKQY','Bluff War','TRITON','bluff',false),
  ('524_3UypGkU','Montenegro','TRITON','high_stakes',false),
  ('185vMNh9ECc','Monte Carlo','TRITON','tournament',false),
  ('5wTToeCyu6I','Jeju Series','TRITON','high_stakes',false),
  ('CbXDixknmeM','$500k NLH','TRITON','high_stakes',false),
  ('4441ee7htt0','GG Million','TRITON','tournament',false),
  ('5OYabw6Zq9s','Hellmuth Blowup','WSOP','table_drama',false),
  ('T8eDXdxkVZc','Final Table','WSOP','tournament',false),
  ('Xh3c4b8xoI8','Brutal Beat','WSOP','bad_beat',false),
  ('wFHgCRnx_JU','Lucky Moments','WSOP','bad_beat',true),
  ('gqH0Og9Z--k','Crazy Bluffs','WSOP','bluff',true),
  ('obkeMpIYOqY','Biggest Moments','WSOP','tournament',true),
  ('Fy6I9DmPrmA','Negreanu','WSOP','celebrity',true),
  ('49FxwnBtCFQ','Kassouf Exit','WSOP','table_drama',true),
  ('LFQmLZuYMf0','Million Dollar','WPT','massive_pot',false),
  ('fK4sL_h9pL0','Legend Play','WPT','celebrity',false),
  ('_l-ndw-CDG4','Championship','WPT','tournament',true),
  ('Aefg8dqdtLI','Final Table','WPT','tournament',true),
  ('-3F5MA8AvYs','Big Bluff','WPT','bluff',true),
  ('HB__atwkWpE','Soul Read','WPT','soul_read',true),
  ('RuuJsLyQJNY','River Card','WPT','bad_beat',true),
  ('Q6RjPaXyRhY','All In','WPT','massive_pot',true),
  ('LMnBAdZ3Dqc','Sick Fold','EPT','soul_read',false),
  ('B8k4l4fxHZU','Hero Call Win','EPT','tournament',false),
  ('qMkzvbIccq0','Prague','EPT','tournament',true),
  ('Ykbx5yv6xzA','London','EPT','tournament',true),
  ('B90Y2efQHYA','Paris','EPT','tournament',true),
  ('rc8bOm2uZ0g','Massive Pot','EPT','massive_pot',true),
  ('yyj2qZwCq2A','Drama','EPT','table_drama',true),
  ('0JKcmKgGvgk','Bluff Catch','EPT','soul_read',true),
  ('o1SIuqZDz2E','HSP Classic','POKERGO','high_stakes',true),
  ('dLBj_EziMKk','NGNG','POKERGO','celebrity',true),
  ('-dXBX-iUw0Q','Super HS','POKERGO','high_stakes',true),
  ('yRJMtgIK9C8','Big Pot','POKERGO','massive_pot',true),
  ('ZRSfWVI950c','Bluff','POKERGO','bluff',true),
  ('G4oVJGOXQGg','Read','POKERGO','soul_read',true),
  ('Gqoeoy1MIZ8','Drama','POKERGO','table_drama',true),
  ('M-10B7u4Sy4','Best 2024','POKERGO','celebrity',true),
  ('QWr9fpDMoU8','Sick Read','BRAD','soul_read',false),
  ('XxD8Gy2_RFM','WSOP Run','BRAD','tournament',false),
  ('ksRivQHYwgI','Bellagio','BRAD','vlog',true),
  ('P5OT-cOcTRs','Wynn Session','BRAD','vlog',true),
  ('PalPSvIIxUg','Aria','BRAD','vlog',true),
  ('I-dJDxwatNo','Big Win','BRAD','massive_pot',true),
  ('NKFFVY6Q37s','Lodge','BRAD','vlog',true),
  ('HFPNAXxQjvQ','Comeback','BRAD','vlog',true),
  ('f8Y8H8PwzMU','Cooler Story','NEEME','bad_beat',false),
  ('VknSBaSAX2I','Vegas','NEEME','vlog',true),
  ('qeItZFws2Hk','Aria','NEEME','vlog',true),
  ('Dwv4ekxyS3A','Bellagio','NEEME','vlog',true),
  ('rSQpzr24-fY','Downswing','NEEME','bad_beat',true),
  ('vXBrOA-AHKY','Upswing','NEEME','massive_pot',true),
  ('JgxFJJ7FLNE','Soul Read','NEEME','soul_read',true),
  ('HNJAz1EuPnk','Bluff','NEEME','bluff',true),
  ('Q8mD5s1k2lE','WSOP Deep','RAMPAGE','tournament',false),
  ('Lw8vMxU5wGQ','On Tilt','RAMPAGE','funny',false),
  ('6vyO89eugpA','Sick Bluff','RAMPAGE','bluff',true),
  ('IVGRM1OF-oo','Hero Call','RAMPAGE','soul_read',true),
  ('Fx3TLCUpRNc','All In','RAMPAGE','massive_pot',true),
  ('9ucgJSjFZc4','Bad Beat','RAMPAGE','bad_beat',true),
  ('UNDaUcrBGPY','Comeback','RAMPAGE','massive_pot',true),
  ('Cq75gEVn5F8','Ship It','RAMPAGE','tournament',true),
  ('uYVmCE6meLI','Top 10 2025','MARIANO','celebrity',true),
  ('Wo1mGd8_XXE','Hero Fold','MARIANO','soul_read',true),
  ('uvCjBlQXupw','Bluff Call','MARIANO','soul_read',true),
  ('kCfNqGeHWpM','$179k Pot','MARIANO','massive_pot',true),
  ('gkLoIe5J45g','Lodge Session','MARIANO','vlog',true),
  ('WcwJL2TAqnM','Brutal 2025','MARIANO','bad_beat',true),
  ('KuTzb8Am_DI','Aces Cracked','MARIANO','bad_beat',true),
  ('tOSzCNYe-e8','Best Hands','MARIANO','celebrity',true),
  ('LA4z0Hi0Jf8','Vegas Run','WOLFGANG','vlog',false),
  ('jJeZntAfOp4','Big Win','WOLFGANG','massive_pot',true),
  ('pFbHkHhJO4Y','Short Form','WOLFGANG','funny',false),
  ('KQRZs6ytdWc','Session','WOLFGANG','vlog',false),
  ('fzNt4SdBGuQ','Bluff','WOLFGANG','bluff',false),
  ('-rjQT0JOhGA','Soul Read','WOLFGANG','soul_read',false),
  ('oINUSqHq_ck','Bad Beat','WOLFGANG','bad_beat',false),
  ('TXarmUgk02Q','WSOP','WOLFGANG','tournament',false),
  ('RqFP6HdkAaM','Common Mistakes','JLITTLE','educational',false),
  ('Dhlr255j55o','Strategy','JLITTLE','educational',true),
  ('3QGcW70nKAo','Preflop','JLITTLE','educational',true),
  ('VqnW-BqOrLM','Postflop','JLITTLE','educational',true),
  ('oW3Dhzt0m68','River Play','JLITTLE','educational',true),
  ('7i3fqwd6KsI','Bluffing','JLITTLE','educational',true),
  ('1I8bbDENedI','Value Bet','JLITTLE','educational',true),
  ('P5Ju7eb4uXs','Tournament','JLITTLE','tournament',true),
  ('k9LoVaVbsKg','HU Battle','POLK','high_stakes',true),
  ('46ayQpwVzFI','Lodge','POLK','vlog',true),
  ('vWVwhXeILoI','Analysis','POLK','educational',true),
  ('yJZxw9u7_DU','Commentary','POLK','educational',true),
  ('yIZcxafGzXQ','Roast','POLK','funny',true),
  ('9ZjGeSFzCgE','Crypto','POLK','celebrity',true),
  ('hpcKG_xl16c','News','POLK','celebrity',true),
  ('6I10JPRg-XM','Interview','POLK','celebrity',true),
  ('9RMgHjToDFw','WSOP 2024','DANIEL','tournament',true),
  ('FGytzJRnXsg','Miracle','DANIEL','bad_beat',true),
  ('AhfeoNu7EnA','Tips','DANIEL','educational',true),
  ('RTvaz9x7ER0','Hand Review','DANIEL','educational',true),
  ('__jU-p7PrrU','Live Stream','DANIEL','celebrity',true),
  ('0FK4cqOMrJ8','Vlog','DANIEL','vlog',true),
  ('uEwzQFhCdps','Bluff','DANIEL','bluff',true),
  ('ADVw3c91-NI','Big Pot','DANIEL','massive_pot',true),
  ('CwXfzhYSayI','Blowup','HELLMUTH','table_drama',true),
  ('hbUUGtnAA5Q','WSOP Bracelet','HELLMUTH','tournament',true),
  ('cmuvpO-vSb8','Brat Mode','HELLMUTH','funny',true),
  ('m0qxj0FNag4','Read','HELLMUTH','soul_read',true),
  ('RGQGKUmFEdo','Crazy Bluff','HELLMUTH','bluff',true),
  ('bEmvJ8i_2oY','Legend','HELLMUTH','celebrity',true),
  ('_LzFC20Olis','High Stakes','HELLMUTH','high_stakes',true),
  ('JPA4I5arlG0','Interview','HELLMUTH','celebrity',true)
) AS v(video_id, title, source, category, ok)
ON CONFLICT (video_id) DO NOTHING;

-- Attach each seeded clip to its registry row where the names line up.
UPDATE public.poker_clips pc SET source_id = cs.id
FROM public.content_sources cs
WHERE cs.domain = 'poker' AND pc.source_id IS NULL
  AND upper(replace(cs.name,' ','')) LIKE upper(pc.source) || '%';

DO $$
DECLARE v_clips int; v_live int; v_dead int;
BEGIN
  SELECT count(*) INTO v_clips FROM public.poker_clips;
  SELECT count(*) INTO v_live  FROM public.poker_clips WHERE is_active;
  SELECT count(*) INTO v_dead  FROM public.poker_clips WHERE NOT is_active;
  IF v_clips < 149 THEN
    RAISE EXCEPTION 'poker_clips: expected the 149 retired library clips, found %', v_clips;
  END IF;
  -- The measurement IS the point. If this does not match what was probed
  -- today, the seed did not land as written and the publisher would be
  -- handed dead videos as though they were good.
  IF v_dead <> 36 THEN
    RAISE EXCEPTION 'poker_clips: expected 36 tombstoned dead videos, found %', v_dead;
  END IF;
  RAISE NOTICE 'poker_clips seeded: % rows (% live, % dead)', v_clips, v_live, v_dead;
END $$;

COMMIT;
