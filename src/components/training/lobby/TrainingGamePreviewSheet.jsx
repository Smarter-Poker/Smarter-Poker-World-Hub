import { useEffect, useState } from 'react';
import { X, Play, Star, Layers } from 'lucide-react';
import TrainingGameArt from '../TrainingGameArt';
import { VARIANT_METADATA, SUPPORTED_VARIANTS } from '../../../lib/training/trainingPresets.mjs';
import TrainingLobbyDialog from './TrainingLobbyDialog';
import styles from './TrainingLobby.module.css';

const STREET_OPTIONS = [
  { id: '', label: 'Full Hand' },
  { id: 'preflop', label: 'Preflop' },
  { id: 'flop', label: 'Flop' },
  { id: 'turn', label: 'Turn' },
  { id: 'river', label: 'River' },
];

export default function TrainingGamePreviewSheet({
  item,
  isFavorite,
  onClose,
  onLaunch,
  onToggleFavorite,
  favoritesUnavailable,
  defaultVariant,
}) {
  const [variant, setVariant] = useState('nlh');
  const [targetStreet, setTargetStreet] = useState('');
  const game = item?.game || null;
  const meta = item?.meta || null;
  const supportsVariants = meta?.category !== 'PSYCHOLOGY';

  useEffect(() => {
    if (!item) return;
    setVariant(defaultVariant && defaultVariant !== 'ALL' && SUPPORTED_VARIANTS.includes(defaultVariant)
      ? defaultVariant : (item.meta?.preset?.variant || 'nlh'));
    setTargetStreet('');
  }, [item, defaultVariant]);

  const handleStart = () => {
    if (!game) return;
    const variantMeta = VARIANT_METADATA[variant] || VARIANT_METADATA.nlh;
    const overrides = {
      variant,
      bettingStructure: variantMeta.defaultStructure,
      ...(targetStreet ? { targetStreet } : {}),
    };
    onClose();
    onLaunch(game, overrides);
  };

  return (
    <TrainingLobbyDialog open={Boolean(game)} onClose={onClose} labelledBy="training-preview-title" data-training-preview-sheet="true">
      {game && meta && (
        <>
          <header className={styles.dialogHeader}>
            <div>
              <span className={styles.previewCategory}>{meta.categoryLabel} · {meta.plaqueLabel}</span>
              <h2 id="training-preview-title">{game.name}</h2>
            </div>
            <button type="button" className={`${styles.chromeButton} ${styles.iconButton}`} aria-label="Close Preview" onClick={onClose}><X size={21} aria-hidden="true" /></button>
          </header>
          <div className={styles.dialogBody}>
            <TrainingGameArt gameId={game.id} loading="eager" sizes="(max-width: 600px) calc(100vw - 48px), 620px" className={styles.previewArt} />
            <div className={styles.previewMeta}>
              {meta.stackBb != null && <span><Layers size={16} aria-hidden="true" /> {meta.stackBb} BB</span>}
              <span>Level {meta.difficulty}/5</span>
              <span>{Math.round(Number(item.progress) || 0)}% Complete</span>
            </div>
            <p className={styles.previewFocus}>{game.focus}</p>
            {meta.preset?.summary && <p className={styles.previewSummary}>{meta.preset.summary}</p>}
            {supportsVariants && (
              <>
                <fieldset className={styles.filterGroup}>
                  <legend className={styles.filterLabel}>Poker Variant</legend>
                  <div className={styles.filterOptions}>
                    {SUPPORTED_VARIANTS.map((value) => <button key={value} type="button" className={styles.chromeButton} aria-pressed={variant === value} onClick={() => setVariant(value)}>{VARIANT_METADATA[value].shortLabel}</button>)}
                  </div>
                </fieldset>
                <fieldset className={styles.filterGroup}>
                  <legend className={styles.filterLabel}>Street Focus</legend>
                  <div className={styles.filterOptions}>
                    {STREET_OPTIONS.map((option) => <button key={option.id || 'full'} type="button" className={styles.chromeButton} aria-pressed={targetStreet === option.id} onClick={() => setTargetStreet(option.id)}>{option.label}</button>)}
                  </div>
                </fieldset>
              </>
            )}
          </div>
          <footer className={styles.dialogFooter}>
            <button type="button" className={styles.chromeButton} aria-pressed={Boolean(isFavorite)} disabled={favoritesUnavailable} onClick={() => onToggleFavorite(game.id)}><Star size={19} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} /> {isFavorite ? 'Favorited' : 'Favorite'}</button>
            <button type="button" className={`${styles.chromeButton} ${styles.primaryButton}`} onClick={handleStart}><Play size={21} aria-hidden="true" /> Play Drill</button>
          </footer>
        </>
      )}
    </TrainingLobbyDialog>
  );
}
