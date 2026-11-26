/**
 * TrainingLobbyRow — Ultra-Dense Metallic Poker Arena-Style Game Card
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the ~480px tall poster card with a ~114px carbon-fiber & brushed-
 * steel metallic row modeled directly on Club Arena's PremiumMttRows:
 *   - Upper strip: Beveled 44x44 TrainingGameArt emblem + Title + 1-line focus
 *                  + Right recessed Format/Stack plaque + 44x44 ⚙ Customize btn
 *   - Lower strip: 5 exact CSS grid telemetry cells separated by hairline dividers:
 *                  STYLE | LEVEL (1-5 pips) | LENGTH | ★ FAVORITE | STATUS
 *   - 1-tap row click launches straight into the canonical preset Arena
 *   - Sibling buttons live in their own grid tracks (zero nested buttons, zero
 *     absolute-positioning drift across phone/tablet/desktop widths)
 *
 * Performance: below-the-fold rows (index >= 6) opt into CSS content-visibility:
 * auto with contain-intrinsic-size so 100+ rows render and scroll effortlessly.
 */

import { memo } from 'react';
import { Play, Star, SlidersHorizontal, Lock, Check, Sparkles, AlertTriangle } from 'lucide-react';
import TrainingGameArt from '../TrainingGameArt';

function DifficultyPips({ level }) {
  return (
    <span className="sp-arena-pips" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`sp-arena-pip${n <= level ? ' is-filled' : ''}`} />
      ))}
    </span>
  );
}

const TrainingLobbyRow = memo(function TrainingLobbyRow({
  item,
  index = 0,
  onStart,
  onToggleFavorite,
  onOpenPreview,
  selectedVariant,
}) {
  const { game, meta, progress, isFavorite, isRecommended, isLeakTarget } = item;

  const statusTone = isLeakTarget
    ? 'leak'
    : progress >= 100
      ? 'mastered'
      : progress > 0
        ? 'resume'
        : isRecommended
          ? 'recommended'
          : 'ready';

  const statusLabel = isLeakTarget
    ? 'Leak Fix'
    : progress >= 100
      ? 'Mastered'
      : progress > 0
        ? `Resume ${progress}%`
        : isRecommended
          ? 'For You'
          : 'Play Now';

  const ledTone = isLeakTarget
    ? 'crimson'
    : isRecommended
      ? 'ice'
      : progress >= 100
        ? 'emerald'
        : meta.ledTone;

  // Apply content-visibility: auto ONLY below the initial viewport fold
  const deferredClass = index >= 6 ? ' sp-arena-row--deferred' : '';

  const plaqueText = selectedVariant && selectedVariant !== 'ALL' && meta.category !== 'PSYCHOLOGY'
    ? `${selectedVariant.toUpperCase()} · ${meta.plaqueLabel}`
    : meta.plaqueLabel;

  return (
    <article
      className={`sp-arena-row sp-arena-row--led-${ledTone}${isRecommended || isLeakTarget ? ' is-featured' : ''}${deferredClass}`}
      data-game-id={game.id}
      data-category={meta.category.toLowerCase()}
      data-training-play-game={game.id}
    >
      {/* Top Row: Primary Launch Button + Dedicated 44x44 Options Track */}
      <div className="sp-arena-row__head-wrap">
        <button
          type="button"
          className="sp-arena-row__head"
          onClick={() => onStart(game)}
          aria-label={`Play ${game.name}, ${meta.categoryLabel}, Level ${meta.difficulty}, ${meta.estMinutes} minutes, ${progress}% complete`}
        >
          <span className="sp-arena-row__emblem" aria-hidden="true">
            <TrainingGameArt
              gameId={game.id}
              loading={index < 6 ? 'eager' : 'lazy'}
              sizes="(max-width: 600px) 48px, 56px"
              className="sp-arena-row__emblem-img"
            />
          </span>

          <span className="sp-arena-row__identity">
            <span className="sp-arena-row__title-line">
              <strong className="sp-arena-row__title">{game.name}</strong>
              {meta.vipOnly && (
                <span className="sp-arena-row__vip" aria-label="VIP Game">
                  <Lock size={12} aria-hidden="true" /> VIP
                </span>
              )}
            </span>
            <span className="sp-arena-row__focus">{plaqueText}</span>
          </span>

          <span className="sp-arena-row__plaque" aria-hidden="true">
            <Play size={12} /> Play
          </span>
        </button>

        {onOpenPreview && (
          <button
            type="button"
            className="sp-arena-row__options"
            aria-label={`Customize And Preview ${game.name}`}
            data-preview-game={game.id}
            onClick={() => onOpenPreview(item)}
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Bottom Telemetry Strip: Exact 5-Column Grid (Star sits in its own track) */}
      <div className="sp-arena-row__telemetry">
        <button
          type="button"
          tabIndex={-1}
          className="sp-arena-row__telemetry-left"
          onClick={() => onStart(game)}
          aria-hidden="true"
        >
          <span className="sp-arena-cell sp-arena-cell--style">
            <span className="sp-arena-cell__label">Style</span>
            <strong className="sp-arena-cell__value">{meta.styleLabel}</strong>
          </span>

          <span className="sp-arena-cell sp-arena-cell--level">
            <span className="sp-arena-cell__label">Level</span>
            <strong className="sp-arena-cell__value sp-num">Lvl {meta.difficulty}</strong>
            <DifficultyPips level={meta.difficulty} />
          </span>

          <span className="sp-arena-cell sp-arena-cell--length">
            <span className="sp-arena-cell__label">Length</span>
            <strong className="sp-arena-cell__value sp-num">{meta.estMinutes} Min</strong>
          </span>
        </button>

        <button
          type="button"
          className={`sp-arena-row__star${isFavorite ? ' is-starred' : ''}`}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${game.name} From Favorites` : `Add ${game.name} To Favorites`}
          data-favorite-game={game.id}
          onClick={() => onToggleFavorite(game.id)}
        >
          <Star size={17} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        <button
          type="button"
          tabIndex={-1}
          className={`sp-arena-cell sp-arena-cell--status sp-arena-cell--${statusTone} sp-arena-row__status-btn`}
          onClick={() => onStart(game)}
          aria-hidden="true"
        >
          <span className="sp-arena-cell__label">Status</span>
          <strong className="sp-arena-cell__value">
            {statusTone === 'leak' && <AlertTriangle size={12} aria-hidden="true" />}
            {statusTone === 'mastered' && <Check size={12} aria-hidden="true" />}
            {statusTone === 'recommended' && <Sparkles size={12} aria-hidden="true" />}
            <span>{statusLabel}</span>
          </strong>
          <span className="sp-arena-row__meter" aria-hidden="true">
            <span
              className="sp-arena-row__meter-fill"
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </span>
        </button>
      </div>
    </article>
  );
});

export default TrainingLobbyRow;
