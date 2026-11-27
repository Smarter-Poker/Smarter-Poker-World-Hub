import Link from 'next/link';
import { ChevronDown, Grid2X2, List, Timer, History } from 'lucide-react';
import styles from './TrainingLobby.module.css';

const SORT_OPTIONS = [
  { key: 'recommended', dir: 'asc', label: 'Recommended' },
  { key: 'difficulty', dir: 'asc', label: 'Easiest First' },
  { key: 'difficulty', dir: 'desc', label: 'Hardest First' },
  { key: 'progress', dir: 'desc', label: 'Most Progress' },
  { key: 'progress', dir: 'asc', label: 'Least Progress' },
  { key: 'stack', dir: 'asc', label: 'Shortest Stack' },
  { key: 'stack', dir: 'desc', label: 'Deepest Stack' },
  { key: 'name', dir: 'asc', label: 'Name (A-Z)' },
  { key: 'name', dir: 'desc', label: 'Name (Z-A)' },
];

export default function TrainingSortBar({
  filters,
  onSortChange,
  filteredCount,
  totalCount,
  viewMode = 'grid',
  onViewModeChange,
  fiveMinuteLeakFix,
  onPlayGame,
}) {
  const count = filteredCount ?? (filters.favoritesOnly ? null : totalCount);
  const warmupGame = fiveMinuteLeakFix?.game;
  const detected = fiveMinuteLeakFix?.basis && fiveMinuteLeakFix.basis !== 'daily-warmup';

  return (
    <div className={styles.resultTools}>
      <div className={styles.sortBar}>
        <span className={styles.resultCount} role="status" aria-live="polite">
          {count == null ? 'Favorites' : `${count} ${count === 1 ? 'Game' : 'Games'}`}
        </span>
        <label className={styles.sortSelect}>
          <span className={styles.srOnly}>Sort Training Games</span>
          <select
            value={`${filters.sortKey}:${filters.sortDir}`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(':');
              onSortChange(key, direction);
            }}
          >
            {SORT_OPTIONS.map((option) => <option key={`${option.key}:${option.dir}`} value={`${option.key}:${option.dir}`}>{option.label}</option>)}
          </select>
          <ChevronDown size={20} aria-hidden="true" />
        </label>
        <div className={styles.viewSwitch} role="group" aria-label="Game Layout">
          <button type="button" className={`${styles.chromeButton} ${styles.iconButton}`} aria-label="Grid View" aria-pressed={viewMode === 'grid'} data-training-view="grid" onClick={() => onViewModeChange?.('grid')}><Grid2X2 size={22} aria-hidden="true" /></button>
          <button type="button" className={`${styles.chromeButton} ${styles.iconButton}`} aria-label="List View" aria-pressed={viewMode === 'list'} data-training-view="list" onClick={() => onViewModeChange?.('list')}><List size={24} aria-hidden="true" /></button>
        </div>
      </div>
      <div className={styles.utilityRow}>
        <button
          type="button"
          className={styles.chromeButton}
          disabled={!warmupGame || !onPlayGame}
          data-training-warmup="true"
          data-top-detected-leak-cta={detected ? 'true' : undefined}
          data-leak-basis={fiveMinuteLeakFix?.basis}
          title={fiveMinuteLeakFix?.title}
          onClick={() => onPlayGame?.(warmupGame, fiveMinuteLeakFix?.overrides)}
        >
          <Timer size={23} aria-hidden="true" /><span>{detected ? '10-Hand Leak Fix' : '10-Hand Warmup'}</span>
        </button>
        <Link href="/hub/session-history" className={styles.chromeButton}><History size={24} aria-hidden="true" /><span>History</span></Link>
      </div>
    </div>
  );
}
