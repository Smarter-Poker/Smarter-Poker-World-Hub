import { useState } from 'react';
import { newsImageUrl } from '../../lib/security/imageHosts.js';
import { decodedPreviewIsUsable } from '../../lib/previewImageValidation.mjs';
import { isArticlePreviewImage } from '../../lib/articlePreviewMetadata.mjs';

export default function ReelThumbnail({ thumbnail, fallback, caption }) {
  const [failed, setFailed] = useState([]);
  const source = [thumbnail, fallback].filter(isArticlePreviewImage).map(newsImageUrl).find((url) => url && !failed.includes(url));
  if (!source) return <span className="vlc-reel-card__fallback">Preview Unavailable</span>;
  const fail = () => setFailed((urls) => urls.includes(source) ? urls : [...urls, source]);
  return <img key={source} src={source} alt={caption || 'Reel preview'} loading="lazy" decoding="async" onError={fail} onLoad={async (event) => {
    if (await decodedPreviewIsUsable(event.currentTarget) === false) fail();
  }} />;
}
