// Validate the image actually loaded by the browser (including CSP and the
// maintained same-origin proxy), not a separate HEAD request to its origin.
// A source change while decode is pending is stale, not a failure of the new art.
export async function decodedPreviewIsUsable(image) {
  if (!image) return false;
  if (image.isConnected === false) return null;
  const source = image.currentSrc || image.src;
  const dimensionsAreUsable = () => Number.isFinite(image.naturalWidth)
    && Number.isFinite(image.naturalHeight)
    && image.naturalWidth >= 240 && image.naturalHeight >= 120
    && image.naturalWidth / image.naturalHeight <= 8
    && image.naturalHeight / image.naturalWidth <= 8;
  if (!dimensionsAreUsable()) return false;
  if (typeof image.decode === 'function') {
    let timeout;
    try {
      await Promise.race([
        image.decode(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Preview decode timed out')), 3000); }),
      ]);
    } catch {
      return image.isConnected === false || (image.currentSrc || image.src) !== source ? null : false;
    } finally {
      clearTimeout(timeout);
    }
  }
  if (image.isConnected === false || (image.currentSrc || image.src) !== source) return null;
  return dimensionsAreUsable();
}
