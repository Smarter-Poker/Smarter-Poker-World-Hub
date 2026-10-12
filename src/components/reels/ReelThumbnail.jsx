import { useState } from 'react';
import { newsImageUrl } from '../../lib/security/imageHosts.js';

export default function ReelThumbnail({ thumbnail, fallback, caption }) {
  const [failed, setFailed] = useState([]);
  const source = [thumbnail, fallback].filter(Boolean).map(newsImageUrl).find((url) => url && !failed.includes(url));
  if (!source) return <span className="vlc-reel-card__fallback">Preview Unavailable</span>;
  return <img src={source} alt={caption || 'Reel preview'} loading="lazy" decoding="async" onError={() => setFailed((urls) => [...urls, source])} />;
}

