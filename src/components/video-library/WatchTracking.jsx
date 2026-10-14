import Link from 'next/link';

// Only a same-site path may be the return destination after sign-in.
export function watchSignInHref(returnPath) {
    const path = typeof returnPath === 'string' && /^\/hub\/video-library(?:\/|$)/.test(returnPath) && !returnPath.startsWith('//')
        ? returnPath : '/hub/video-library';
    return `/auth/login?redirect=${encodeURIComponent(path)}`;
}

export default function WatchTracking({ tracking, ownerId, returnPath }) {
    if (!ownerId) return <p className="vl-watch-tracking" data-watch-tracking="anonymous"><Link href={watchSignInHref(returnPath)}>Sign In To Save Watch Progress</Link></p>;
    const labels = {
        loading: 'Loading Watch Progress', ready: 'Watch Progress Saves While You Watch',
        saving: 'Saving Watch Progress', saved: 'Watch Progress Saved',
        submitted: 'Watch Progress Sent For Saving', error: 'Watch Progress Could Not Be Saved',
    };
    return <p className="vl-watch-tracking" data-watch-tracking={tracking.status} role="status">
        {tracking.status === 'error' ? (tracking.error || labels.error) : (labels[tracking.status] || labels.ready)}
    </p>;
}
