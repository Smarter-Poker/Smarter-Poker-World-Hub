-- ════════════════════════════════════════════════════════════════════════════
--  Home Group Contact Info — Phase 42
--  Adds contact_phone and website_url to commander_home_groups so hosts can
--  publish contact details on their public home game card and details page.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add columns (nullable — existing groups are not affected)
ALTER TABLE public.commander_home_groups
  ADD COLUMN IF NOT EXISTS contact_phone  TEXT,
  ADD COLUMN IF NOT EXISTS website_url    TEXT;

-- 2. Length constraints — prevents DoS / oversized payloads
ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_contact_phone_len
    CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 30);

ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_contact_phone_len;

ALTER TABLE public.commander_home_groups
  ADD CONSTRAINT chk_grp_website_url_len
    CHECK (website_url IS NULL OR char_length(website_url) <= 255);

ALTER TABLE public.commander_home_groups VALIDATE CONSTRAINT chk_grp_website_url_len;

-- 3. Comment for future devs
COMMENT ON COLUMN public.commander_home_groups.contact_phone IS
  'Optional host phone number shown on the public home game page and card. Stored as text so formatting (dashes, parens) is preserved.';
COMMENT ON COLUMN public.commander_home_groups.website_url IS
  'Optional host website / social link shown on the public home game page.';
