export function isArticlePreviewImage(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return !/(?:^|[\/_-])(?:logo|favicon|icon|emoji|smiley|emoticon)(?:[\/_.-]|$)/i.test(url.pathname);
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
  return Boolean(url && !metadata?.image);
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
