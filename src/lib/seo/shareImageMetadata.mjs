export function absoluteShareImage(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
    ? `https://smarter.poker${url}` : url;
}

// Known source dimensions are kept with the image identity, not guessed from
// the site's default landscape card. Other images retain existing defaults.
export function shareImageMetadata(url) {
  const path = String(absoluteShareImage(url) || '').split(/[?#]/)[0];
  const type = /\.png$/i.test(path) ? 'image/png'
    : /\.webp$/i.test(path) ? 'image/webp'
    : /\.jpe?g$/i.test(path) ? 'image/jpeg' : null;
  const suppliedClubLogo = path === 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/club-logos/the-felt-society/logo-20261020.png';
  const kingsClubLogo = path === 'https://smarter.poker/hub/club-arena/images/kings-club-logo.png';
  return { type, ...(suppliedClubLogo ? { width: 1025, height: 1031 } : kingsClubLogo ? { width: 1254, height: 1254 } : {}) };
}
