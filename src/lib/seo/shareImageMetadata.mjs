// Known source dimensions are kept with the image identity, not guessed from
// the site's default landscape card. Other images retain existing defaults.
export function shareImageMetadata(url) {
  const path = String(url || '').split(/[?#]/)[0];
  const type = /\.png$/i.test(path) ? 'image/png'
    : /\.webp$/i.test(path) ? 'image/webp'
    : /\.jpe?g$/i.test(path) ? 'image/jpeg' : null;
  const suppliedClubLogo = path === 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/club-logos/the-felt-society/logo-20261020.png';
  return { type, ...(suppliedClubLogo ? { width: 1025, height: 1031 } : {}) };
}
