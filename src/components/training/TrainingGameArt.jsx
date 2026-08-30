import { getGameImageSources } from '../../data/GAME_IMAGES';

export default function TrainingGameArt({
  gameId,
  alt = '',
  className = '',
  sizes = '(max-width: 700px) 92vw, (max-width: 1200px) 46vw, 360px',
  loading = 'lazy',
  fetchPriority,
}) {
  const sources = getGameImageSources(gameId);
  return (
    <picture>
      <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} />
      <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} />
      <img
        src={sources.src}
        alt={alt}
        className={className}
        sizes={sizes}
        loading={loading}
        decoding="async"
        fetchpriority={fetchPriority}
      />
    </picture>
  );
}
