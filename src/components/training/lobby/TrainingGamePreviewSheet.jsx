/**
 * TrainingGamePreviewSheet — Compact Quick-Preview & Variant Customize Dialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Opens from a row's ⚙ options button without cluttering the dense lobby list.
 * Displays the game's canonical TrainingGameArt, preset telemetry, variant and
 * street selector, favorite toggle, and direct Arena launch CTA.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Play, Star, Clock, Layers } from 'lucide-react';
import TrainingGameArt from '../TrainingGameArt';
import { VARIANT_METADATA, SUPPORTED_VARIANTS } from '../../../lib/training/trainingPresets.mjs';

const STREET_OPTIONS = [
  { id: '', label: 'Full Hand' },
  { id: 'preflop', label: 'Preflop' },
  { id: 'flop', label: 'Flop' },
  { id: 'turn', label: 'Turn' },
  { id: 'river', label: 'River' },
];

function isOutsideDialog(event, dialog) {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom
  );
}

export default function TrainingGamePreviewSheet({
  item,
  onClose,
  onLaunch,
  onToggleFavorite,
  defaultVariant,
}) {
  const dialogRef = useRef(null);
  const [variant, setVariant] = useState('nlh');
  const [targetStreet, setTargetStreet] = useState('');

  const game = item?.game || null;
  const meta = item?.meta || null;
  const isOpen = Boolean(game);

  useEffect(() => {
    if (!item) return;
    const initialVariant =
      defaultVariant && defaultVariant !== 'ALL' && SUPPORTED_VARIANTS.includes(defaultVariant)
        ? defaultVariant
        : (item.meta?.preset?.variant || 'nlh');
    setVariant(initialVariant);
    setTargetStreet('');
  }, [item, defaultVariant]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }

    const handleClose = () => {
      dialog.returnValue = '';
      if (isOpen) onClose();
    };
    dialog.addEventListener('close', handleClose);

    let cleanupBackdrop = null;
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const onPointerDown = (e) => { pressedOutside = isOutsideDialog(e, dialog); };
      const onPointerUp = (e) => {
        if (pressedOutside && isOutsideDialog(e, dialog) && dialog.open) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      cleanupBackdrop = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (cleanupBackdrop) cleanupBackdrop();
    };
  }, [isOpen, onClose]);

  const handleStart = () => {
    if (!game) return;
    const variantMeta = VARIANT_METADATA[variant] || VARIANT_METADATA.nlh;
    const overrides = {
      variant,
      bettingStructure: variantMeta.defaultStructure,
      ...(targetStreet ? { targetStreet } : {}),
    };
    dialogRef.current?.close();
    onLaunch(game, overrides);
  };

  const supportsVariants = meta?.category !== 'PSYCHOLOGY';

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      className="sp-arena-sheet sp-arena-sheet--preview"
      aria-labelledby="training-preview-title"
      data-training-preview-sheet="true"
    >
      {game && meta && (
        <div className="sp-arena-sheet__chrome">
          <header className="sp-arena-sheet__head">
            <div>
              <span className="sp-arena-preview__cat">{meta.categoryLabel} · {meta.plaqueLabel}</span>
              <h1 id="training-preview-title" className="sp-arena-sheet__title">{game.name}</h1>
            </div>
            <button
              type="button"
              className="sp-arena-sheet__close sd-button"
              aria-label="Close Preview"
              onClick={() => dialogRef.current?.close()}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="sp-arena-sheet__body">
            <div className="sp-arena-preview__banner">
              <TrainingGameArt
                gameId={game.id}
                loading="eager"
                sizes="(max-width: 600px) calc(100vw - 24px), 520px"
                className="sp-arena-preview__art"
              />
              <div className="sp-arena-preview__shade" aria-hidden="true" />
              <div className="sp-arena-preview__meta-bar">
                <span><Clock size={13} aria-hidden="true" /> {meta.estMinutes} Min</span>
                <span><Layers size={13} aria-hidden="true" /> {meta.handsTarget} Hands</span>
                <span className="sp-num">Level {meta.difficulty}/5</span>
                <span className="sp-num">{item.progress}% Calibrated</span>
              </div>
            </div>

            <p className="sp-arena-preview__focus">{game.focus}</p>
            {meta.preset?.summary && (
              <p className="sp-arena-preview__preset">{meta.preset.summary}</p>
            )}

            {supportsVariants && (
              <fieldset className="sp-arena-sheet__group">
                <legend className="sp-arena-sheet__label">Poker Variant</legend>
                <div className="sp-arena-sheet__pills">
                  {SUPPORTED_VARIANTS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="sp-arena-sheet__pill sd-button"
                      aria-pressed={variant === v}
                      onClick={() => setVariant(v)}
                    >
                      {VARIANT_METADATA[v].shortLabel}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {supportsVariants && (
              <fieldset className="sp-arena-sheet__group">
                <legend className="sp-arena-sheet__label">Street Focus</legend>
                <div className="sp-arena-sheet__pills">
                  {STREET_OPTIONS.map((opt) => (
                    <button
                      key={opt.id || 'full'}
                      type="button"
                      className="sp-arena-sheet__pill sd-button"
                      aria-pressed={targetStreet === opt.id}
                      onClick={() => setTargetStreet(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          <footer className="sp-arena-sheet__foot">
            <button
              type="button"
              className={`sp-arena-sheet__reset sd-button${item.isFavorite ? ' active' : ''}`}
              aria-pressed={item.isFavorite}
              onClick={() => onToggleFavorite(game.id)}
            >
              <Star size={15} aria-hidden="true" fill={item.isFavorite ? 'currentColor' : 'none'} />
              <span>{item.isFavorite ? 'Favorited' : 'Favorite'}</span>
            </button>
            <button
              type="button"
              className="sp-arena-sheet__apply sd-button sd-primary"
              onClick={handleStart}
            >
              <Play size={15} aria-hidden="true" />
              <span>Play Drill</span>
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
