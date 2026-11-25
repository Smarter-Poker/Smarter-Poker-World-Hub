export const VIDEO_COVER_FOLDER = 'video-covers';

export const VIDEO_COVER_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function isCustomVideoCover(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      /^\/storage\/v1\/object\/public\/social-media\/video-covers\/[0-9a-f-]{36}\/[^/]+\.(jpg|png|webp)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isVideoCoverFile(file) {
  return Boolean(file && Object.hasOwn(VIDEO_COVER_IMAGE_TYPES, file.type) &&
    file.size >= 100 && file.size <= 10 * 1024 * 1024);
}
