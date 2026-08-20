-- Backfill existing profiles.avatar_url to use optimized @2x.webp assets
-- for all free and vip preset avatars.
-- Keeps the 1024x1024 PNG for anywhere that genuinely renders large if needed,
-- but the canonical profile avatar used in tables etc will be the 250x340 WebP.

UPDATE profiles
SET avatar_url = regexp_replace(
  avatar_url,
  '^/avatars/(vip|free)/([^/\.]+)\.png$',
  '/avatars/table/\1_\2@2x.webp',
  'i'
)
WHERE avatar_url ~* '^/avatars/(vip|free)/[^/\.]+\.png$';

UPDATE profiles
SET avatar_url = regexp_replace(
  avatar_url,
  '^.*/social-media/avatars/(vip|free)_([^/\.]+)\.(png|jpg|jpeg|webp)$',
  '/avatars/table/\1_\2@2x.webp',
  'i'
)
WHERE avatar_url ~* '^.*/social-media/avatars/(vip|free)_[^/\.]+\.(png|jpg|jpeg|webp)$';
