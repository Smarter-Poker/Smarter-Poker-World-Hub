const ARTICLE_ORIGIN = 'https://smarter.poker';

export function internalArticlePath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, ARTICLE_ORIGIN);
    if (url.origin !== ARTICLE_ORIGIN || url.username || url.password) return null;
    if (!value.startsWith('/') && !/^https:\/\//i.test(value)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function isArticlePreviewImage(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    if (value.includes('\\')) return false;
    const url = new URL(value, ARTICLE_ORIGIN);
    if (!value.startsWith('/') && !/^https?:\/\//i.test(value)) return false;
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    const imagePath = `${url.pathname} ${url.searchParams.get('img') || ''} ${url.searchParams.get('url') || ''}`;
    return !/(?:^|[\s\/_-])(?:logos?|favicon|icon|emoji|smiley|smilies|emoticon|avatar|sprite|placeholder|default)(?:[\/_.-]|$)|espn_red|espnlogo|espn_logos/i.test(imagePath);
  } catch {
    return false;
  }
}

export function suppliedArticleMetadata({ title, description, image, siteName } = {}) {
  return {
    title: title || null,
    description: description || null,
    image: isArticlePreviewImage(image) ? image : null,
    siteName: siteName || null,
  };
}

export function articlePreviewNeedsHydration(url, metadata) {
  return Boolean(url && !internalArticlePath(url) && !metadata?.image);
}

export function mergeArticleMetadata(supplied, fetched) {
  if (!fetched || typeof fetched !== 'object') return suppliedArticleMetadata(supplied);
  return {
    title: supplied?.title || fetched.title || null,
    description: supplied?.description || fetched.description || null,
    image: isArticlePreviewImage(supplied?.image)
      ? supplied.image
      : isArticlePreviewImage(fetched.image) ? fetched.image : null,
    siteName: supplied?.siteName || fetched.siteName || null,
  };
}
