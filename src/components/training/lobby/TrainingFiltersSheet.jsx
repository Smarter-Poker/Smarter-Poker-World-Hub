import { X, Search, RotateCcw } from 'lucide-react';
import { QUICK_FILTER_PILLS } from '../../../lib/training/trainingLobbyFilter.mjs';
import TrainingLobbyDialog from './TrainingLobbyDialog';
import styles from './TrainingLobby.module.css';

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

const FILTER_GROUPS = [
  { label: 'Poker Variant', field: 'variant', options: VARIANT_OPTIONS },
  { label: 'Difficulty Level', field: 'difficultyTier', options: DIFFICULTY_OPTIONS },
  { label: 'Strategy Focus', field: 'styleTag', options: STYLE_OPTIONS },
  { label: 'Completion Status', field: 'statusFilter', options: STATUS_OPTIONS },
  { label: 'Access', field: 'accessFilter', options: ACCESS_OPTIONS },
];

export default function TrainingFiltersSheet({
  isOpen,
  onClose,
  filters,
  onUpdateFilters,
  onResetFilters,
  matchingCount,
}) {
  return (
    <TrainingLobbyDialog open={isOpen} onClose={onClose} labelledBy="training-filters-title" data-training-filters-sheet="true">
      <header className={styles.dialogHeader}>
        <h2 id="training-filters-title">Filter &amp; Sort Training Games</h2>
        <button type="button" className={`${styles.chromeButton} ${styles.iconButton}`} aria-label="Close Filters" onClick={onClose}><X size={21} aria-hidden="true" /></button>
      </header>
      <div className={styles.dialogBody}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="training-sheet-search">Search Games</label>
          <div className={styles.searchWell}>
            <Search size={21} aria-hidden="true" />
            <input id="training-sheet-search" type="search" value={filters.query} placeholder="Push/Fold, ICM, 3-Bet, River, Tilt" onChange={(event) => onUpdateFilters({ query: event.target.value })} />
          </div>
        </div>
        <fieldset className={styles.filterGroup}>
          <legend className={styles.filterLabel}>Quick Filters</legend>
          <div className={styles.filterOptions}>
            {QUICK_FILTER_PILLS.map((pill) => (
              <button type="button" key={pill.id} className={styles.chromeButton} data-quick-filter={pill.id.toLowerCase()} aria-pressed={filters.quickFilter === pill.id} onClick={() => onUpdateFilters({ quickFilter: filters.quickFilter === pill.id ? 'ALL' : pill.id })}>{pill.label}</button>
            ))}
          </div>
        </fieldset>
        {FILTER_GROUPS.map(({ label, field, options }) => (
          <fieldset key={field} className={styles.filterGroup}>
            <legend className={styles.filterLabel}>{label}</legend>
            <div className={styles.filterOptions}>
              {options.map((option) => (
                <button type="button" key={option.id} className={styles.chromeButton} aria-pressed={filters[field] === option.id} onClick={() => onUpdateFilters({ [field]: option.id })}>{option.label}</button>
              ))}
            </div>
          </fieldset>
        ))}
        <fieldset className={styles.filterGroup}>
          <legend className={styles.filterLabel}>Sort Order</legend>
          <div className={styles.filterOptions}>
            {SORT_OPTIONS.map((option) => (
              <button type="button" key={`${option.key}-${option.dir}`} className={styles.chromeButton} aria-pressed={filters.sortKey === option.key && filters.sortDir === option.dir} onClick={() => onUpdateFilters({ sortKey: option.key, sortDir: option.dir })}>{option.label}</button>
            ))}
          </div>
        </fieldset>
      </div>
      <footer className={styles.dialogFooter}>
        <button type="button" className={styles.chromeButton} onClick={onResetFilters}><RotateCcw size={18} aria-hidden="true" /> Reset All</button>
        <button type="button" className={`${styles.chromeButton} ${styles.primaryButton}`} onClick={onClose}>Show {matchingCount} {matchingCount === 1 ? 'Game' : 'Games'}</button>
      </footer>
    </TrainingLobbyDialog>
  );
}
