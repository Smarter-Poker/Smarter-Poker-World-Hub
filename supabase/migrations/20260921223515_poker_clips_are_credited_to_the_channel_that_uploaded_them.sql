-- ═══════════════════════════════════════════════════════════════════════
-- poker_clips_are_credited_to_the_channel_that_uploaded_them
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (data repair on public.poker_clips; no schema change)
-- AUTHOR:      Claude (Cowork session 014itMNpU4PSxe29DNWH5kt4), Fleet Content Programme Phase 4
-- AFFECTS:     public.poker_clips rows listed below by video_id, origin 'scraper'
-- IRREVERSIBLE: no (rollback block at the end restores the observed state)
--
-- WHY:
--   20260921223141_poker_sources_come_back_under_their_own_channels corrected
--   21 registry rows that were reading another channel's feed. The clips those
--   rows had already imported still carry the wrong credit: 362 active scraper
--   clips whose source is one of those rows. A horse caption names the source
--   ("Andrew Neeme's latest"), so a clip filed under the wrong source is a
--   false statement waiting to be posted. The fleet is switched off, so none
--   of these has been shown; this repairs them before it can be.
--
-- EVIDENCE: identity/oembed.tsv. Every one of the 362 clips was looked up on
--   2026-09-21 22:23..22:31 UTC through YouTube's own oEmbed endpoint from the
--   owner's Mac; all 362 answered HTTP 200 with the uploading channel's name
--   and handle (author_name, author_url).
--
-- HOW (plain English):
--   MOVE 48: the uploader IS another registered source, so the clip is
--     re-credited to it (Alec Torelli and Conscious Poker held each other's
--     videos; PokerGO Sport's videos are PokerStars' own).
--   OFF 221: the uploader is not the source it is filed under and is not a
--     registered source (different creator, re-upload or fan channel,
--     non-English regional channel, or unverified affiliation). is_active is
--     set false; nothing is deleted.
--   KEPT, untouched, 93: the uploader is the source's own creator on another of
--     their channels (Jaime Staples, Brad Owen Clips, Doug Polk's vlog, Joey
--     Ingram's podcast clips, Spraggy VODS, Ethan "Rampage" Yau), so the credit
--     is already true.
--   Clips from the video library (origin 'video_library'/'library') carry the
--   library's own channel credit and are not touched.
--   Every change is keyed by video_id (natural key) AND the clip's current
--   source; the pre-flight block refuses to run unless all rows are as observed.
--   Off by source: {'Raise Your Edge': 15, 'Poker Central': 15, 'World Series of Poker': 34, 'Hustler Casino Live': 19, 'GTO Wizard': 15, 'Daniel Negreanu': 15, 'Triton Poker': 15, 'Andrew Neeme': 25, 'BotezLive': 20, 'TCH Live': 15, 'PokerStars': 18, 'Johnnie Vibes': 15}
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _clip_moves (video_id text PRIMARY KEY, old_source text NOT NULL, new_source text NOT NULL) ON COMMIT DROP;
INSERT INTO _clip_moves (video_id, old_source, new_source) VALUES
    ('-MSNSA2-eBY', 'Alec Torelli', 'Conscious Poker'),
    ('-ulcUsfPd_Q', 'Alec Torelli', 'Conscious Poker'),
    ('2XD8w1UOCeU', 'Alec Torelli', 'Conscious Poker'),
    ('FQFWOOG3zG4', 'Alec Torelli', 'Conscious Poker'),
    ('GzGCG20U_e4', 'Alec Torelli', 'Conscious Poker'),
    ('He3VHuv022o', 'Alec Torelli', 'Conscious Poker'),
    ('NBWAJ_Gg1e4', 'Alec Torelli', 'Conscious Poker'),
    ('Uu_fO3NRLUI', 'Alec Torelli', 'Conscious Poker'),
    ('W3cwdX6Xbfo', 'Alec Torelli', 'Conscious Poker'),
    ('a0Eqni1S6Ic', 'Alec Torelli', 'Conscious Poker'),
    ('c-LwR3ahb8M', 'Alec Torelli', 'Conscious Poker'),
    ('e6A2mhow9iM', 'Alec Torelli', 'Conscious Poker'),
    ('fN0fyhdNckg', 'Alec Torelli', 'Conscious Poker'),
    ('uxF6zxWWJ5Y', 'Alec Torelli', 'Conscious Poker'),
    ('x3ZKXU1Du44', 'Alec Torelli', 'Conscious Poker'),
    ('yZprnbAj7xg', 'Alec Torelli', 'Conscious Poker'),
    ('0aLgi-3-3Lc', 'Conscious Poker', 'Alec Torelli'),
    ('4A9Y_qKVf-Q', 'Conscious Poker', 'Alec Torelli'),
    ('4z0QrSiaBmI', 'Conscious Poker', 'Alec Torelli'),
    ('536ClQYKL1I', 'Conscious Poker', 'Alec Torelli'),
    ('FOPENTWRkSU', 'Conscious Poker', 'Alec Torelli'),
    ('KvtF7lVffLI', 'Conscious Poker', 'Alec Torelli'),
    ('NS-nKFHyB28', 'Conscious Poker', 'Alec Torelli'),
    ('OZ52E_b_vUc', 'Conscious Poker', 'Alec Torelli'),
    ('Oc84L1IF5Wo', 'Conscious Poker', 'Alec Torelli'),
    ('OtUrshAVtkc', 'Conscious Poker', 'Alec Torelli'),
    ('W0UKevns1po', 'Conscious Poker', 'Alec Torelli'),
    ('ZBrqdb8ps9Q', 'Conscious Poker', 'Alec Torelli'),
    ('aiJu4rRDHVQ', 'Conscious Poker', 'Alec Torelli'),
    ('fiEnuAZHBjA', 'Conscious Poker', 'Alec Torelli'),
    ('qkFyAQ-DR_M', 'Conscious Poker', 'Alec Torelli'),
    ('wxcBXYuba7Y', 'Conscious Poker', 'Alec Torelli'),
    ('-p1XsQ2wu-o', 'PokerGO Sport', 'PokerStars'),
    ('9QTJliIpDFc', 'PokerGO Sport', 'PokerStars'),
    ('C5n61l2RquQ', 'PokerGO Sport', 'PokerStars'),
    ('CEAiK_oTb48', 'PokerGO Sport', 'PokerStars'),
    ('Cr1WurMQOLI', 'PokerGO Sport', 'PokerStars'),
    ('DGdRMyZrDFQ', 'PokerGO Sport', 'PokerStars'),
    ('GP9iFpw7SqU', 'PokerGO Sport', 'PokerStars'),
    ('L0iU2UBU2IA', 'PokerGO Sport', 'PokerStars'),
    ('N_xW4oF_fnQ', 'PokerGO Sport', 'PokerStars'),
    ('SVAXwKxzyZY', 'PokerGO Sport', 'PokerStars'),
    ('VThl8xP_bo4', 'PokerGO Sport', 'PokerStars'),
    ('YaSDNz23vvQ', 'PokerGO Sport', 'PokerStars'),
    ('kPBcPIcSPoI', 'PokerGO Sport', 'PokerStars'),
    ('kfUtCkvQPWM', 'PokerGO Sport', 'PokerStars'),
    ('s2-fts0-rTs', 'PokerGO Sport', 'PokerStars'),
    ('wWFFzrwLqdM', 'PokerGO Sport', 'PokerStars');

CREATE TEMP TABLE _clip_off (video_id text PRIMARY KEY, source text NOT NULL) ON COMMIT DROP;
INSERT INTO _clip_off (video_id, source) VALUES
    -- Andrew Neeme: uploaded by Poker At The Lodge (@thelodgelive), a different creator
    ('0UzuM_MsujU', 'Andrew Neeme'),
    ('2nViE1ZpYXc', 'Andrew Neeme'),
    ('4LVI9xDaVAs', 'Andrew Neeme'),
    ('92WbIVt9UA0', 'Andrew Neeme'),
    ('AArP2Fsv0BM', 'Andrew Neeme'),
    ('AYRpwP9wv7U', 'Andrew Neeme'),
    ('Cyj2q1t_eRw', 'Andrew Neeme'),
    ('D48NvMexkGU', 'Andrew Neeme'),
    ('FI_JmVWIvYY', 'Andrew Neeme'),
    ('RVPF3MkW3-k', 'Andrew Neeme'),
    ('XYrFanUgY-c', 'Andrew Neeme'),
    ('aCQCwMBv6UY', 'Andrew Neeme'),
    ('cXYVKvBC2ro', 'Andrew Neeme'),
    ('cdWbjhdBYyQ', 'Andrew Neeme'),
    ('eAnvTIoZSCU', 'Andrew Neeme'),
    ('hAfY8NEhwf0', 'Andrew Neeme'),
    ('hCK3aBMFRsg', 'Andrew Neeme'),
    ('o2Z7zqQGQEg', 'Andrew Neeme'),
    ('rFddHQxVwcQ', 'Andrew Neeme'),
    ('rb7lajS_De4', 'Andrew Neeme'),
    ('skl-75zYeRw', 'Andrew Neeme'),
    ('tv6rG53zA9k', 'Andrew Neeme'),
    ('vvRjA-lJ0PM', 'Andrew Neeme'),
    ('x9UoLYtlzL8', 'Andrew Neeme'),
    ('youTtaHfxN4', 'Andrew Neeme'),
    -- BotezLive: uploaded by Botez Sisters Podcast (@botezsisters), not the registered channel
    ('1HamEAtjZgo', 'BotezLive'),
    ('43AzDmA8-84', 'BotezLive'),
    ('455HdkJybzY', 'BotezLive'),
    ('9qYy_UGeaok', 'BotezLive'),
    ('BcUHFr_EWIQ', 'BotezLive'),
    ('Evqrcx8Yru8', 'BotezLive'),
    ('Gsqo3MRs9V8', 'BotezLive'),
    ('HxrUe4z3ZxY', 'BotezLive'),
    ('K1TdOJN9Ugw', 'BotezLive'),
    ('Kcf0EaKn4V0', 'BotezLive'),
    ('NLQmRnQTqW0', 'BotezLive'),
    ('THl9GfUNdiw', 'BotezLive'),
    ('WegGsH8B5sY', 'BotezLive'),
    ('cDHczflrCG4', 'BotezLive'),
    ('j2lxTXCOHv4', 'BotezLive'),
    ('lqDM-3ez5wY', 'BotezLive'),
    ('oVH3NGszTQs', 'BotezLive'),
    ('vApPczLpgtY', 'BotezLive'),
    ('vHUhS3vIjSY', 'BotezLive'),
    ('vfblrCaWwxo', 'BotezLive'),
    -- Daniel Negreanu: uploaded by The MANIA Podcast (@themaniapodcast), not verified as his channel
    ('03ialZPxraE', 'Daniel Negreanu'),
    ('C0d8jH_bzAk', 'Daniel Negreanu'),
    ('DSWWSVvQtwU', 'Daniel Negreanu'),
    ('Rad5FpQcRI8', 'Daniel Negreanu'),
    ('SxA6Jgr5WNQ', 'Daniel Negreanu'),
    ('TT-XtXaFzOM', 'Daniel Negreanu'),
    ('bzF8tRI6cIA', 'Daniel Negreanu'),
    ('cPWQQsJAFV8', 'Daniel Negreanu'),
    ('dIvyQ9TjK6M', 'Daniel Negreanu'),
    ('dY7lVtUp40w', 'Daniel Negreanu'),
    ('e3rwrsmWH1I', 'Daniel Negreanu'),
    ('j1NY7DrsY4k', 'Daniel Negreanu'),
    ('jI7Q_Hiqjhs', 'Daniel Negreanu'),
    ('m-3GTTep1Vw', 'Daniel Negreanu'),
    ('rMWVzOruMnQ', 'Daniel Negreanu'),
    -- GTO Wizard: uploaded by GTOWizard RU (@gtowizard_ru), Russian-language channel
    ('2SiHd8cri10', 'GTO Wizard'),
    ('8KkAie-iXNI', 'GTO Wizard'),
    ('AKx_mkL3BLA', 'GTO Wizard'),
    ('FJG7N-r9Q54', 'GTO Wizard'),
    ('Lb23Hl4HBLY', 'GTO Wizard'),
    ('QhFvXZDVI1s', 'GTO Wizard'),
    ('_3cAUbHV5DE', 'GTO Wizard'),
    ('ddelbKUBjQY', 'GTO Wizard'),
    ('etXP5uUkBmU', 'GTO Wizard'),
    ('lxgR3psxbZ8', 'GTO Wizard'),
    ('nngpBBnPF-4', 'GTO Wizard'),
    ('sE4bmwMCYOo', 'GTO Wizard'),
    ('sGbAxiFLSM8', 'GTO Wizard'),
    ('uqN0UUXUn-Y', 'GTO Wizard'),
    ('xVpVe57SVk4', 'GTO Wizard'),
    -- Hustler Casino Live: uploaded by High Stakes Highlights (@highstakeshighlightspoker), a re-upload channel
    ('-TOAGRKOBac', 'Hustler Casino Live'),
    ('0F1C7MIBsL0', 'Hustler Casino Live'),
    ('1jHrwAq-RGM', 'Hustler Casino Live'),
    ('BlCFpxvUEbg', 'Hustler Casino Live'),
    ('GDxQT71LofQ', 'Hustler Casino Live'),
    ('K-V4an-dY9w', 'Hustler Casino Live'),
    ('NdJre0uQ3n8', 'Hustler Casino Live'),
    ('P5Jx5Uct128', 'Hustler Casino Live'),
    ('Q0rfoPDcxA8', 'Hustler Casino Live'),
    ('TsQA5D5Cmk0', 'Hustler Casino Live'),
    ('Ww0-0RxLImg', 'Hustler Casino Live'),
    ('aFAsGKsyQ68', 'Hustler Casino Live'),
    ('av6lX5ykQ8w', 'Hustler Casino Live'),
    ('cNSb7G_7qEo', 'Hustler Casino Live'),
    ('g_CrLtJtYUU', 'Hustler Casino Live'),
    ('i7nWq9FpaCk', 'Hustler Casino Live'),
    ('tuW7QTEPnRc', 'Hustler Casino Live'),
    ('u4WLuWo3NJg', 'Hustler Casino Live'),
    ('zUP3sDWFgbc', 'Hustler Casino Live'),
    -- Johnnie Vibes: uploaded by SKILL GAME Poker (@skillgamemafia), a different creator
    ('77brgOinh2M', 'Johnnie Vibes'),
    ('I1olPUkGqss', 'Johnnie Vibes'),
    ('IiFMc6lAbMw', 'Johnnie Vibes'),
    ('NFEIiKEnspQ', 'Johnnie Vibes'),
    ('NQCuhu4YkT8', 'Johnnie Vibes'),
    ('Z1ZsPDzj2cU', 'Johnnie Vibes'),
    ('c4etFnDUk5I', 'Johnnie Vibes'),
    ('cTJMdwCS_sA', 'Johnnie Vibes'),
    ('d8VRc6KmGcg', 'Johnnie Vibes'),
    ('hjesSQRDpUs', 'Johnnie Vibes'),
    ('lk5lbBjde6o', 'Johnnie Vibes'),
    ('q6SZwk3wY8c', 'Johnnie Vibes'),
    ('qwgVT_whkoM', 'Johnnie Vibes'),
    ('woCzVth6z-g', 'Johnnie Vibes'),
    ('x1V4CMcTcM8', 'Johnnie Vibes'),
    -- Poker Central: uploaded by the personal channel that now owns @PokerCentral; titles are Russian dates, not poker
    ('2v8O2-UnJfU', 'Poker Central'),
    ('58PglUQPyTQ', 'Poker Central'),
    ('5OnjthpaDvU', 'Poker Central'),
    ('8RxDwU33et4', 'Poker Central'),
    ('9UlfEARnrRE', 'Poker Central'),
    ('BePWLsJ2K_c', 'Poker Central'),
    ('Edfn-MfjsgY', 'Poker Central'),
    ('PV2t5JJn0n8', 'Poker Central'),
    ('SsIT5nirCAo', 'Poker Central'),
    ('V4J-SHyaZSw', 'Poker Central'),
    ('Y3yNA4SAvVM', 'Poker Central'),
    ('YbE58TjBODo', 'Poker Central'),
    ('_i_8_LkwDsw', 'Poker Central'),
    ('gGsROtxMDEg', 'Poker Central'),
    ('qBxDp4ntQbk', 'Poker Central'),
    -- PokerStars: uploaded by PokerStars Brasil (@pokerstarsbrasil), Portuguese-language channel
    ('1hqohheJWaw', 'PokerStars'),
    ('2jW4A4wcKqw', 'PokerStars'),
    ('423G-UK5k74', 'PokerStars'),
    ('4mcVzT7vha0', 'PokerStars'),
    ('5cD10nx5tKY', 'PokerStars'),
    ('E3CDpcll7oA', 'PokerStars'),
    ('HDweBOL0UsY', 'PokerStars'),
    ('NVEu_GWJF7Q', 'PokerStars'),
    ('OMH1Al9XysQ', 'PokerStars'),
    ('TgLxFzUOKAE', 'PokerStars'),
    ('ZdVML3ilkNE', 'PokerStars'),
    ('ZvIIOPF6zcg', 'PokerStars'),
    ('Zwqg-CnSo0s', 'PokerStars'),
    ('f_ON5q5uIKs', 'PokerStars'),
    ('mM32fdDS8sY', 'PokerStars'),
    ('sbchY1ZzwFA', 'PokerStars'),
    ('uIOvECZsANE', 'PokerStars'),
    ('z8oJJ2GKTEA', 'PokerStars'),
    -- Raise Your Edge: uploaded by Bencb (@bencb9207), an unrelated channel
    ('2s_KhiVIbs4', 'Raise Your Edge'),
    ('3uYcFLkCRPY', 'Raise Your Edge'),
    ('8sgC1cwYzp8', 'Raise Your Edge'),
    ('B2tccpCGH-o', 'Raise Your Edge'),
    ('IHAS0z5EEXs', 'Raise Your Edge'),
    ('Ngylwyujdqc', 'Raise Your Edge'),
    ('QhSDAT43wQg', 'Raise Your Edge'),
    ('QkvdfteiqEI', 'Raise Your Edge'),
    ('aTcB1GCbJCg', 'Raise Your Edge'),
    ('agvCiHGW8us', 'Raise Your Edge'),
    ('eTVrxiZdnbA', 'Raise Your Edge'),
    ('eZd7yf15ppg', 'Raise Your Edge'),
    ('k1tLfiKYR-c', 'Raise Your Edge'),
    ('q-E2iNEPKwM', 'Raise Your Edge'),
    ('sKfZuqTOxUI', 'Raise Your Edge'),
    -- TCH Live: uploaded by Best TCH Poker Hands (@besttchpokerhands), a fan compilation channel
    ('194qnmWVKTQ', 'TCH Live'),
    ('1dR-NMkOjg0', 'TCH Live'),
    ('JsRtYNc_9NI', 'TCH Live'),
    ('SqTXKptqjd4', 'TCH Live'),
    ('TcBJb54Xu0o', 'TCH Live'),
    ('W21IxWVo7KA', 'TCH Live'),
    ('ceSV1UFcHk8', 'TCH Live'),
    ('dOTtr7geNns', 'TCH Live'),
    ('eoNacMMFRnY', 'TCH Live'),
    ('g4r9gwwtLkw', 'TCH Live'),
    ('gjGD50HpXNQ', 'TCH Live'),
    ('ifTAHgP4vL4', 'TCH Live'),
    ('kpWKFSvE0PA', 'TCH Live'),
    ('mUwGbuJ6QUg', 'TCH Live'),
    ('orOun0Ex1CU', 'TCH Live'),
    -- Triton Poker: uploaded by Triton One (@tritononepoker), affiliation not verified
    ('4QX7ZoZGxJw', 'Triton Poker'),
    ('4nceTGIzOBM', 'Triton Poker'),
    ('G1DawRoOrog', 'Triton Poker'),
    ('LwK_ZfoJlGc', 'Triton Poker'),
    ('RToimwGFj5M', 'Triton Poker'),
    ('RkkO2PDq0g4', 'Triton Poker'),
    ('VM5ntq8wKSc', 'Triton Poker'),
    ('WdyS-IPKwh4', 'Triton Poker'),
    ('YB9sddbYkTw', 'Triton Poker'),
    ('ZasgskXJ6jg', 'Triton Poker'),
    ('bGIpEqSer6c', 'Triton Poker'),
    ('cwu7oXOPSfI', 'Triton Poker'),
    ('gaLXjbMCYvw', 'Triton Poker'),
    ('p66YHbjkZg4', 'Triton Poker'),
    ('q7WiJUVxmAw', 'Triton Poker'),
    -- World Series of Poker: uploaded by GGPoker (@ggpoker), a different brand
    ('-5gP8voTfiU', 'World Series of Poker'),
    ('0uejE2n9NRA', 'World Series of Poker'),
    ('2EBsojaZeh0', 'World Series of Poker'),
    ('3BDCTmUso_8', 'World Series of Poker'),
    ('4n_bxMwkFfA', 'World Series of Poker'),
    ('C7DL7hcjjG4', 'World Series of Poker'),
    ('CTeA5bfCNuk', 'World Series of Poker'),
    ('CkIyIZeOWSE', 'World Series of Poker'),
    ('ERtaXtbB-Us', 'World Series of Poker'),
    ('FlhjGUcG6ps', 'World Series of Poker'),
    ('GoG2y88Hk5o', 'World Series of Poker'),
    ('HOHELeIw_as', 'World Series of Poker'),
    ('HfI_GgDJrkQ', 'World Series of Poker'),
    ('JECdusdd_tA', 'World Series of Poker'),
    ('Kj7apMQIMPs', 'World Series of Poker'),
    ('PJMo9Ia_ZtE', 'World Series of Poker'),
    ('SpPaw3mOzlc', 'World Series of Poker'),
    ('UF0AsRESfNU', 'World Series of Poker'),
    ('WwYLdiHdWUg', 'World Series of Poker'),
    ('YOXlI0ptPLk', 'World Series of Poker'),
    ('bXt0x-6f2P4', 'World Series of Poker'),
    ('brqKwI4NUSY', 'World Series of Poker'),
    ('eHwFdSzosWQ', 'World Series of Poker'),
    ('eV2cF5stNW4', 'World Series of Poker'),
    ('fOHrIEzmqSI', 'World Series of Poker'),
    ('h9HUOQhIhbg', 'World Series of Poker'),
    ('jOkpmxnX6Fo', 'World Series of Poker'),
    ('jxOeo9yXHSc', 'World Series of Poker'),
    ('kxBzXre_gQE', 'World Series of Poker'),
    ('rUlxrTS5nkw', 'World Series of Poker'),
    ('t0g0jR-5_Kc', 'World Series of Poker'),
    ('w7FY4kbUB_Y', 'World Series of Poker'),
    ('wAsX2qB7m5I', 'World Series of Poker'),
    ('y22FlISZC38', 'World Series of Poker');

-- 1. PRE-FLIGHT: every listed clip must be active, from the scraper, under the observed source.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_clips c JOIN _clip_moves m ON m.video_id = c.video_id AND m.old_source = c.source
   WHERE c.is_active AND c.origin = 'scraper';
  IF n <> 48 THEN RAISE EXCEPTION 'pre-flight MOVE: expected 48 clips under their old source, found %', n; END IF;

  SELECT count(*) INTO n FROM public.poker_clips c JOIN _clip_off o ON o.video_id = c.video_id AND o.source = c.source
   WHERE c.is_active AND c.origin = 'scraper';
  IF n <> 221 THEN RAISE EXCEPTION 'pre-flight OFF: expected 221 active clips, found %', n; END IF;

  SELECT count(*) INTO n FROM (SELECT DISTINCT new_source FROM _clip_moves) m
    JOIN public.content_sources s ON s.domain = 'poker' AND s.name = m.new_source AND s.is_active;
  IF n <> 3 THEN RAISE EXCEPTION 'pre-flight MOVE: expected 3 active target sources, found %', n; END IF;
END $$;

-- 2. THE CHANGES
UPDATE public.poker_clips c
   SET source = s.name, source_id = s.id, channel_handle = s.handle
  FROM _clip_moves m
  JOIN public.content_sources s ON s.domain = 'poker' AND s.name = m.new_source
 WHERE c.video_id = m.video_id AND c.source = m.old_source AND c.is_active AND c.origin = 'scraper';

UPDATE public.poker_clips c
   SET is_active = false
  FROM _clip_off o
 WHERE c.video_id = o.video_id AND c.source = o.source AND c.is_active AND c.origin = 'scraper';

-- 3. POST-APPLY ASSERTIONS
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.poker_clips c JOIN _clip_moves m ON m.video_id = c.video_id
    JOIN public.content_sources s ON s.domain = 'poker' AND s.name = m.new_source
   WHERE c.source = m.new_source AND c.source_id = s.id AND c.channel_handle IS NOT DISTINCT FROM s.handle AND c.is_active;
  IF n <> 48 THEN RAISE EXCEPTION 'post-apply MOVE: % of 48 clips re-credited', n; END IF;

  SELECT count(*) INTO n FROM public.poker_clips c JOIN _clip_off o ON o.video_id = c.video_id
   WHERE c.is_active = false AND c.source = o.source;
  IF n <> 221 THEN RAISE EXCEPTION 'post-apply OFF: % of 221 clips switched off', n; END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste into a new _revert_ migration; re-create the two lists
-- above as temp tables first, then run):
-- ═══════════════════════════════════════════════════════════════════════
-- UPDATE public.poker_clips c SET source = s.name, source_id = s.id, channel_handle = s.handle
--   FROM _clip_moves m JOIN public.content_sources s ON s.domain = 'poker' AND s.name = m.old_source
--  WHERE c.video_id = m.video_id AND c.source = m.new_source;
-- UPDATE public.poker_clips c SET is_active = true FROM _clip_off o
--  WHERE c.video_id = o.video_id AND c.source = o.source AND c.is_active = false;
