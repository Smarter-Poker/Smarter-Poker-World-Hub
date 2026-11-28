import Link from 'next/link';

// Only a same-site path may be the return destination after sign-in.
export function watchSignInHref(returnPath) {
    const path = typeof returnPath === 'string' && /^\/hub\/video-library(?:\/|$)/.test(returnPath) && !returnPath.startsWith('//')
        ? returnPath : '/hub/video-library';
    return `/auth/login?redirect=${encodeURIComponent(path)}`;
}

export default function WatchTracking({ tracking, ownerId, returnPath }) {
    if (!ownerId) return <p className="vl-watch-tracking" data-watch-tracking="anonymous"><Link href={watchSignInHref(returnPath)} rel="nofollow" prefetch={false}>Sign In To Save Watch Progress</Link></p>;
    // The steady state says nothing: that progress saves while you watch lives
    // behind the watch page's "?" (Dan, 2026-11-27). Real events still show.
    if (tracking.status === 'ready') return null;
    const labels = {
        loading: 'Loading Watch Progress',
        saving: 'Saving Watch Progress', saved: 'Watch Progress Saved',
        submitted: 'Watch Progress Sent For Saving', error: 'Watch Progress Could Not Be Saved',
    };
    const label = tracking.status === 'error' ? (tracking.error || labels.error) : labels[tracking.status];
    if (!label) return null;
    return <p className="vl-watch-tracking" data-watch-tracking={tracking.status} role="status">{label}</p>;
}
