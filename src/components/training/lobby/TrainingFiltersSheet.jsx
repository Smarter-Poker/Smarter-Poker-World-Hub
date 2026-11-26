/**
 * TrainingFiltersSheet — Native Modal Filters & Sort Sheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses native <dialog closedby="any"> opened with showModal() for built-in
 * top-layer stacking, focus containment, Esc dismissal, and focus return, with
 * the pointer-bounds light-dismiss fallback for browsers without closedby.
 */

import { useEffect, useRef } from 'react';
import { X, Search, RotateCcw } from 'lucide-react';

const VARIANT_OPTIONS = [
  { id: 'ALL', label: 'All Variants' },
  { id: 'nlh', label: "Hold'em" },
  { id: 'plo4', label: 'PLO4' },
  { id: 'plo5', label: 'PLO5' },
  { id: 'plo6', label: 'PLO6' },
  { id: 'plo8', label: 'PLO8 Hi-Lo' },
];

const DIFFICULTY_OPTIONS = [
  { id: 'ALL', label: 'All Levels' },
  { id: 'BEGINNER', label: 'Lvl 1-2 Beginner' },
  { id: 'INTERMEDIATE', label: 'Lvl 3 Mid' },
  { id: 'ADVANCED', label: 'Lvl 4 Advanced' },
  { id: 'BOSS', label: 'Lvl 5 Boss' },
];

const STYLE_OPTIONS = [
  { id: 'ALL', label: 'All Styles' },
  { id: 'gto', label: 'GTO' },
  { id: 'exploitative', label: 'Exploitative' },
  { id: 'math', label: 'Math & ICM' },
  { id: 'mental', label: 'Mental Game' },
];

const STATUS_OPTIONS = [
  { id: 'ALL', label: 'Any Progress' },
  { id: 'NEW', label: 'Unplayed (0%)' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'MASTERED', label: 'Mastered (100%)' },
];

const ACCESS_OPTIONS = [
  { id: 'ALL', label: 'All Drills' },
  { id: 'FREE', label: 'Free Drills' },
  { id: 'VIP', label: 'VIP Boss' },
];

const SORT_OPTIONS = [
  { key: 'recommended', dir: 'asc', label: 'Recommended' },
  { key: 'difficulty', dir: 'asc', label: 'Easiest First' },
  { key: 'difficulty', dir: 'desc', label: 'Hardest First' },
  { key: 'progress', dir: 'desc', label: 'Most Progress' },
  { key: 'stack', dir: 'asc', label: 'Shortest Stack First' },
  { key: 'name', dir: 'asc', label: 'Name (A-Z)' },
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

export default function TrainingFiltersSheet({
  isOpen,
  onClose,
  filters,
  onUpdateFilters,
  onResetFilters,
  matchingCount,
}) {
  const dialogRef = useRef(null);

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

    // Safari / fallback for browsers without native <dialog closedby="any">
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

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      className="sp-arena-sheet"
      aria-labelledby="training-filters-title"
      data-training-filters-sheet="true"
    >
      <div className="sp-arena-sheet__chrome">
        <header className="sp-arena-sheet__head">
          <h1 id="training-filters-title" className="sp-arena-sheet__title">
            Filter &amp; Sort Training Games
          </h1>
          <button
            type="button"
            className="sp-arena-sheet__close sd-button"
            aria-label="Close Filters"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="sp-arena-sheet__body">
          {/* Keyword Search */}
          <div className="sp-arena-sheet__group">
            <label className="sp-arena-sheet__label" htmlFor="training-sheet-search">
              Search Games
            </label>
            <div className="sp-arena-sheet__search">
              <Search size={15} aria-hidden="true" />
              <input
                id="training-sheet-search"
                type="search"
                value={filters.query}
                placeholder="Push/Fold, ICM, 3-Bet, River, Tilt…"
                onChange={(e) => onUpdateFilters({ query: e.target.value })}
              />
            </div>
          </div>

          {/* Poker Variant */}
          <fieldset className="sp-arena-sheet__group">
            <legend className="sp-arena-sheet__label">Poker Variant</legend>
            <div className="sp-arena-sheet__pills">
              {VARIANT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="sp-arena-sheet__pill sd-button"
                  aria-pressed={filters.variant === opt.id}
                  onClick={() => onUpdateFilters({ variant: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Difficulty Tier */}
          <fieldset className="sp-arena-sheet__group">
            <legend className="sp-arena-sheet__label">Difficulty Level</legend>
            <div className="sp-arena-sheet__pills">
              {DIFFICULTY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="sp-arena-sheet__pill sd-button"
                  aria-pressed={filters.difficultyTier === opt.id}
                  onClick={() => onUpdateFilters({ difficultyTier: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Strategy Focus */}
          <fieldset className="sp-arena-sheet__group">
            <legend className="sp-arena-sheet__label">Strategy Focus</legend>
            <div className="sp-arena-sheet__pills">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="sp-arena-sheet__pill sd-button"
                  aria-pressed={filters.styleTag === opt.id}
                  onClick={() => onUpdateFilters({ styleTag: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Progress Status */}
          <fieldset className="sp-arena-sheet__group">
            <legend className="sp-arena-sheet__label">Completion Status</legend>
            <div className="sp-arena-sheet__pills">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="sp-arena-sheet__pill sd-button"
                  aria-pressed={filters.statusFilter === opt.id}
                  onClick={() => onUpdateFilters({ statusFilter: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Access Tier */}
          <fieldset className="sp-arena-sheet__group">
            <legend className="sp-arena-sheet__label">Access</legend>
            <div className="sp-arena-sheet__pills">
              {ACCESS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="sp-arena-sheet__pill sd-button"
                  aria-pressed={filters.accessFilter === opt.id}
                  onClick={() => onUpdateFilters({ accessFilter: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Sort Order */}
          <fieldset className="sp-arena-sheet__group">
            <legend className="sp-arena-sheet__label">Sort Order</legend>
            <div className="sp-arena-sheet__pills">
              {SORT_OPTIONS.map((opt) => {
                const active = filters.sortKey === opt.key && filters.sortDir === opt.dir;
                return (
                  <button
                    key={`${opt.key}-${opt.dir}`}
                    type="button"
                    className="sp-arena-sheet__pill sd-button"
                    aria-pressed={active}
                    onClick={() => onUpdateFilters({ sortKey: opt.key, sortDir: opt.dir })}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <footer className="sp-arena-sheet__foot">
          <button
            type="button"
            className="sp-arena-sheet__reset sd-button"
            onClick={onResetFilters}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Reset All</span>
          </button>
          <button
            type="button"
            className="sp-arena-sheet__apply sd-button sd-primary"
            onClick={() => dialogRef.current?.close()}
          >
            Show {matchingCount} {matchingCount === 1 ? 'Game' : 'Games'}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
