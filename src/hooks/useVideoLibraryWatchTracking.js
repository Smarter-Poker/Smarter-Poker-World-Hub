import { useEffect, useRef, useState } from 'react';
import { playbackMessage } from '../lib/videoLibraryPlayback.mjs';
import { createVideoLibraryOwnerScope } from '../lib/videoLibraryOwnerScope.mjs';
import { createWatchTrackingSession, watchResumeSeconds } from '../lib/videoLibraryWatchTracking.mjs';
import { getAuthUserId } from '../lib/authUtils';
import { getWatchProgress, updateWatchDuration, flushWatchDuration } from '../services/videoWatchHistory';

export default function useVideoLibraryWatchTracking({ iframeRef, video, ownerId, active }) {
    const videoId = video?.videoId || video?.id || null;
    const durationSeconds = Number(video?.durationSeconds) || 0;
    const scopeRef = useRef(createVideoLibraryOwnerScope(ownerId));
    // Render-time invalidation also protects cleanup and an A -> B -> A change
    // whose earlier request settles after the new owner's render.
    scopeRef.current.activate(ownerId);
    const currentVideoRef = useRef(videoId);
    currentVideoRef.current = videoId;
    const statusVersionRef = useRef(0);
    const [result, setResult] = useState({ status: ownerId ? 'loading' : 'anonymous', resumeSeconds: 0 });
    const currentResult = result.ownerToken && scopeRef.current.isCurrent(result.ownerToken) && result.videoId === videoId
        ? result : { status: ownerId ? 'loading' : 'anonymous', resumeSeconds: 0 };

    useEffect(() => {
        const token = scopeRef.current.capture(ownerId);
        let cancelled = false;
        let timeout;
        const readVersion = ++statusVersionRef.current;
        setResult({ status: ownerId ? 'loading' : 'anonymous', resumeSeconds: 0, ownerToken: token, videoId });
        if (!ownerId || !videoId) return undefined;
        const read = getAuthUserId() === ownerId ? getWatchProgress(ownerId) : Promise.reject(new Error('Authentication Required'));
        const deadline = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Saved Watch Progress Could Not Load')), 15000); });
        void Promise.race([read, deadline]).then(progress => {
            if (cancelled || !scopeRef.current.isCurrent(token) || currentVideoRef.current !== videoId) return;
            // The first heartbeat can settle before a slow initial read. That
            // old snapshot cannot replace the newer authoritative save.
            if (statusVersionRef.current !== readVersion) return;
            const saved = progress.get(videoId);
            setResult(previous => ({ ...previous, status: 'ready', resumeSeconds: watchResumeSeconds(saved, durationSeconds),
                savedSeconds: Number(saved?.totalWatchedSeconds) || 0, savedPositionSeconds: Number(saved?.watchedSeconds) || 0 }));
        }).catch(() => {
            if (!cancelled && scopeRef.current.isCurrent(token) && currentVideoRef.current === videoId && statusVersionRef.current === readVersion) {
                setResult(previous => ({ ...previous, status: 'error', error: 'Saved Watch Progress Could Not Load' }));
            }
        }).finally(() => clearTimeout(timeout));
        return () => { cancelled = true; clearTimeout(timeout); };
    }, [ownerId, videoId, durationSeconds]);

    useEffect(() => {
        if (!active || !ownerId || !videoId) return undefined;
        const token = scopeRef.current.capture(ownerId);
        const isCurrent = () => scopeRef.current.isCurrent(token) && currentVideoRef.current === videoId && getAuthUserId() === ownerId;
        const metadata = position => ({ title: video?.title || null, thumbnail: video?.thumbnail || null, durationSeconds, progressSeconds: position });
        const session = createWatchTrackingSession({ durationSeconds, isCurrent,
            persist: (seconds, position) => updateWatchDuration(ownerId, videoId, seconds, metadata(position)),
            lifecyclePersist: (seconds, position) => flushWatchDuration(videoId, seconds, metadata(position)),
            onStatus: update => {
                statusVersionRef.current += 1;
                setResult(previous => ({ ...previous, ...update, ownerToken: token, videoId }));
            },
        });
        const receive = event => {
            const data = playbackMessage(event, iframeRef.current?.contentWindow);
            if (data) session.receive(data);
        };
        const visibility = () => session.visibility(!document.hidden);
        // A page restored from the browser's back/forward cache keeps this
        // hook mounted. Pause its credit window rather than closing forever.
        const leave = () => session.visibility(false);
        const returnToPage = () => session.visibility(!document.hidden);
        session.visibility(!document.hidden);
        window.addEventListener('message', receive);
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('pagehide', leave);
        window.addEventListener('pageshow', returnToPage);
        const heartbeat = setInterval(() => { void session.heartbeat(); }, 15000);
        return () => {
            clearInterval(heartbeat);
            window.removeEventListener('message', receive);
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pagehide', leave);
            window.removeEventListener('pageshow', returnToPage);
            void session.close();
        };
    }, [active, ownerId, videoId, durationSeconds, iframeRef, video?.title, video?.thumbnail]);
    return currentResult;
}
