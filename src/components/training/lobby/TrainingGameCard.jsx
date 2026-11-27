import { memo } from 'react';
import { Play, Star, SlidersHorizontal, Lock, Check, Sparkles, Target, CircleDashed } from 'lucide-react';
import TrainingGameArt from '../TrainingGameArt';
import styles from './TrainingLobby.module.css';

/** Artwork-first presentation of the existing catalog and launch/favorite actions. */
const TrainingGameCard = memo(function TrainingGameCard({
  item,
  index = 0,
  onStart,
  onToggleFavorite,
  favoritesUnavailable,
  onOpenPreview,
  selectedVariant,
  viewMode = 'grid',
}) {
  const { game, meta, isFavorite, isRecommended, isLeakTarget } = item;
  const progress = Math.max(0, Math.min(100, Number(item.progress) || 0));
  const statusLabel = isLeakTarget ? 'Leak Fix'
    : progress >= 100 ? 'Mastered'
      : progress > 0 ? `${Math.round(progress)}% Complete`
        : isRecommended ? 'For You' : 'Not Started';
  const StatusIcon = isLeakTarget ? Target : progress >= 100 ? Check
    : isRecommended ? Sparkles : CircleDashed;
  const variant = selectedVariant && selectedVariant !== 'ALL'
    ? selectedVariant.toUpperCase() : meta.variantShort;
  const titleId = `training-card-title-${game.id}`;

  return (
    <article
      className={`${styles.gameCard}${viewMode === 'list' ? ` ${styles.gameCardList}` : ''}`}
      data-game-id={game.id}
      data-training-game-card={game.id}
      data-category={meta.category.toLowerCase()}
      data-training-play-game={game.id}
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className={styles.cardArtButton}
        onClick={() => onStart(game)}
        aria-label={`Play ${game.name}`}
        tabIndex={-1}
      >
        <TrainingGameArt
          gameId={game.id}
          loading={index < 3 ? 'eager' : 'lazy'}
          sizes="(max-width: 600px) 88vw, (max-width: 1000px) 46vw, 400px"
          className={styles.cardArt}
        />
        {meta.vipOnly && <span className={styles.vipBadge}><Lock size={13} aria-hidden="true" /> VIP</span>}
      </button>

      <div className={styles.cardBody}>
        <div className={styles.cardIdentity}>
          <div className={styles.cardCopy}>
            <h3 id={titleId} className={`${styles.cardTitle} sp-arena-row__title`}>{game.name}</h3>
            <p className={styles.cardFocus} data-game-preset-summary="true">{game.focus}</p>
          </div>
          <button
            type="button"
            className={`${styles.chromeButton} ${styles.favoriteButton}`}
            aria-pressed={Boolean(isFavorite)}
            aria-label={isFavorite ? `Remove ${game.name} From Favorites` : `Add ${game.name} To Favorites`}
            data-favorite-game={game.id}
            disabled={favoritesUnavailable}
            onClick={() => onToggleFavorite(game.id)}
          >
            <Star size={22} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className={styles.cardMeta}>
          <p className={styles.cardDetails}>
            <span>{meta.styleLabel}</span><span aria-hidden="true">·</span>
            <span>Level {meta.difficulty}</span>
            {meta.stackBb != null && <><span aria-hidden="true">·</span><span>{meta.stackBb} BB</span></>}
            {selectedVariant && selectedVariant !== 'ALL' && meta.category !== 'PSYCHOLOGY'
              && <><span aria-hidden="true">·</span><span>{variant}</span></>}
          </p>
          <span className={styles.cardStatus}>
            <StatusIcon size={16} aria-hidden="true" /><span>{statusLabel}</span>
          </span>
        </div>
        {progress > 0 && (
          <div className={styles.progressTrack} role="progressbar" aria-label={`${game.name} Progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className={styles.cardActions}>
          <button
            type="button"
            className={`${styles.chromeButton} ${styles.primaryButton}`}
            onClick={() => onStart(game)}
            aria-label={`Play ${game.name}, ${variant}, ${meta.plaqueLabel}, Level ${meta.difficulty}`}
            data-play-game={game.id}
          >
            <Play size={21} aria-hidden="true" /><span>Play</span>
          </button>
          {onOpenPreview && (
            <button
              type="button"
              className={styles.chromeButton}
              aria-label={`Customize And Preview ${game.name}`}
              data-preview-game={game.id}
              onClick={() => onOpenPreview(item)}
            >
              <SlidersHorizontal size={20} aria-hidden="true" /><span>Configure</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
});

export default TrainingGameCard;
