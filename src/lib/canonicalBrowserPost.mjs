const hasOwn = (value, key) => Boolean(value)
  && Object.prototype.hasOwnProperty.call(value, key);

/**
 * Merge an authoritative single-row read into the page's legacy view model.
 * Own-property checks are deliberate: null is an authoritative clear, while
 * an absent key means the endpoint did not speak about that field.
 */
export function mergeCanonicalBrowserPost(existing = {}, fresh = {}) {
  const value = (key, fallback) => hasOwn(fresh, key) ? fresh[key] : fallback;
  const media = value('media_urls', undefined);
  const topics = value('topics', undefined);
  const freshAuthor = value('author', undefined);
  const author = freshAuthor === undefined
    ? existing.author
    : freshAuthor === null
      ? null
      : {
          ...existing.author,
          name: freshAuthor.display_name || freshAuthor.username || existing.author?.name || null,
          username: hasOwn(freshAuthor, 'username')
            ? freshAuthor.username
            : existing.author?.username || null,
          avatar: hasOwn(freshAuthor, 'avatar_url')
            ? freshAuthor.avatar_url
            : existing.author?.avatar || null,
        };

  return {
    ...existing,
    content: value('content', existing.content),
    contentType: value('content_type', existing.contentType),
    mediaUrls: Array.isArray(media) ? media : media === null ? [] : existing.mediaUrls,
    thumbnailUrl: value('thumbnail_url', existing.thumbnailUrl),
    thumbnail_url: value('thumbnail_url', existing.thumbnail_url),
    link_url: value('link_url', existing.link_url),
    link_title: value('link_title', existing.link_title),
    link_description: value('link_description', existing.link_description),
    link_image: value('link_image', existing.link_image),
    link_site_name: value('link_site_name', existing.link_site_name),
    metadata: value('metadata', existing.metadata),
    playback_type: value('playback_type', existing.playback_type),
    topic: value('topic', existing.topic),
    topics: Array.isArray(topics) ? topics : topics === null ? [] : existing.topics,
    rights_status: value('rights_status', existing.rights_status),
    transcodeStatus: value('transcode_status', existing.transcodeStatus),
    eligibilityExpiresAt: value('eligibility_expires_at', existing.eligibilityExpiresAt),
    author,
  };
}

export default mergeCanonicalBrowserPost;
