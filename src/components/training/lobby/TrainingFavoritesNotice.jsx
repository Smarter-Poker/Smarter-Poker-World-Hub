export default function TrainingFavoritesNotice({ loading, error, onRetry }) {
  if (!loading && !error) return null;
  return (
    <div className="sp-arena-empty" role="status">
      <p>{error || 'Loading Favorites…'}</p>
      {error && (
        <button type="button" className="sd-button" onClick={onRetry}>Retry Favorites</button>
      )}
    </div>
  );
}
