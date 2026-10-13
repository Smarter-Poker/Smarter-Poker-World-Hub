import useVideoLibraryQueue from './useVideoLibraryQueue';
export default function VideoQueue({ currentVideoId, onPlay, ownerId = null }) {
    const { queue, error, remove, clear } = useVideoLibraryQueue(ownerId);
    const index = queue.items.findIndex(item => item.videoId === currentVideoId);
    const upcoming = queue.items.slice(index >= 0 ? index + 1 : 0);
    if (!queue.items.length && !error) return null;
    return <section className="vl-session-queue" aria-label="Session Queue"><div className="vl-queue-heading"><h2>Play Next</h2><button type="button" className="vl-text-button" onClick={clear}>Clear Queue</button></div><p>Saved For This Browser Session Only.</p>{error && <p role="alert">{error}</p>}{!upcoming.length && <p>No Videos Queued Next.</p>}<ol>{upcoming.map(item => <li key={item.videoId}><button type="button" className="vl-queue-play" onClick={() => onPlay?.(item)}>{item.title}</button><button type="button" className="vl-text-button" aria-label={`Remove ${item.title} From Queue`} onClick={() => remove(item.videoId)}>Remove</button></li>)}</ol></section>;
}
