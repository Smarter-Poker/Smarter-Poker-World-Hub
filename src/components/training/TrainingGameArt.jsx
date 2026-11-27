import { useEffect, useState } from 'react';
import { getGameImageSources } from '../../data/GAME_IMAGES';
import { getTrainingArt, getTrainingArtCardLayout, getTrainingArenaCardSrc, TRAINING_ART_VERSION } from '../../data/TRAINING_ART';
import styles from './TrainingGameArt.module.css';

function NativeArenaCard({ card, index, count, loading }) {
  const [fallback, setFallback] = useState(0);
  useEffect(() => setFallback(0), [card]);
  const src = getTrainingArenaCardSrc(card, fallback === 0 ? 'webp' : 'png');
  // Card faces must remain the native Arena assets, including on failures.
  // If both native formats are unavailable, keep the scene and omit that face.
  if (!src || fallback > 1) return null;

  return (
    <img
      className="training-art-card-face"
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading={loading}
      decoding="async"
      onError={() => setFallback((value) => value + 1)}
      style={{
        display: 'block',
        position: 'relative',
        inset: 'auto',
        width: `${100 / count}%`,
        height: '100%',
        minWidth: 0,
        maxWidth: 'none',
        margin: 0,
        padding: 0,
        objectFit: 'contain',
        objectPosition: 'center bottom',
        flex: `0 0 ${100 / count}%`,
        border: 0,
        background: 'transparent',
        opacity: 1,
        filter: 'none',
        transform: count > 2 ? 'none' : `rotate(${index === 0 ? -4 : 4}deg)`,
        transformOrigin: 'center bottom',
        boxShadow: 'none',
      }}
    />
  );
}

export default function TrainingGameArt({
  gameId,
  alt = '',
  className = '',
  sizes = '(max-width: 700px) 92vw, (max-width: 1200px) 46vw, 360px',
  loading = 'lazy',
  fetchPriority,
}) {
  // Keep the shared caller contract without forwarding this hydration-sensitive
  // hint to the underlying image. Eager loading remains controlled by `loading`.
  void fetchPriority;
  const sources = getGameImageSources(gameId);
  const art = getTrainingArt(gameId);
  const cards = art.cards;
  const cardLayout = getTrainingArtCardLayout(art);
  return (
    <span
      className={`training-art ${styles.surface} ${className}`.trim()}
      data-training-art-game={gameId}
      data-training-art-version={TRAINING_ART_VERSION}
      style={{ filter: 'none', opacity: 1 }}
    >
      <picture style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}>
        <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} />
        <source type="image/webp" srcSet={sources.webpSrcSet} sizes={sizes} />
        <img
          src={sources.src}
          alt={alt}
          className="training-art-scene"
          sizes={sizes}
          loading={loading}
          decoding="async"
          width={1440}
          height={810}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
      </picture>
      {cards.length > 0 && (
        <span
          className="training-art-hand"
          aria-hidden="true"
          data-training-art-cards={cards.join(' ')}
          style={{
            position: 'absolute',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            left: `${cardLayout.left}%`,
            bottom: `${cardLayout.bottom}%`,
            width: `${cardLayout.width}%`,
            height: `${cardLayout.height}%`,
            transform: 'translateX(-50%)',
            zIndex: 1,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 5px 6px rgba(0, 0, 0, .55))',
          }}
        >
          {cards.map((card, index) => (
            <NativeArenaCard key={card} card={card} index={index} count={cards.length} loading={loading} />
          ))}
        </span>
      )}
    </span>
  );
}
