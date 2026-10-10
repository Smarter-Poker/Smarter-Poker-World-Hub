export function suppliedArticleMetadata({ title, description, image, siteName } = {}) {
  return {
    title: title || null,
    description: description || null,
    image: image || null,
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
    image: supplied?.image || fetched.image || null,
    siteName: supplied?.siteName || fetched.siteName || null,
  };
}
