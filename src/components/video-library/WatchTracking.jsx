import Link from 'next/link';

export default function WatchTracking({ tracking, ownerId }) {
    if (!ownerId) return <p className="vl-watch-tracking" data-watch-tracking="anonymous"><Link href="/auth/login?redirect=%2Fhub%2Fvideo-library">Sign In To Save Watch Progress</Link></p>;
    const labels = {
        loading: 'Loading Watch Progress', ready: 'Watch Progress Saves While You Watch',
        saving: 'Saving Watch Progress', saved: 'Watch Progress Saved',
        submitted: 'Watch Progress Sent For Saving', error: 'Watch Progress Could Not Be Saved',
    };
    return <p className="vl-watch-tracking" data-watch-tracking={tracking.status} role="status">
        {tracking.status === 'error' ? (tracking.error || labels.error) : (labels[tracking.status] || labels.ready)}
    </p>;
}
