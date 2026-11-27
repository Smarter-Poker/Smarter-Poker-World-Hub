import styles from './TrainingLobby.module.css';

export default function TrainingFavoritesNotice({ loading, error, onRetry }) {
  if (!loading && !error) return null;
  return (
    <div className={styles.notice} role="status">
      <p>{error || 'Loading Favorites…'}</p>
      {error && <button type="button" className={styles.chromeButton} onClick={onRetry}>Retry Favorites</button>}
    </div>
  );
}
