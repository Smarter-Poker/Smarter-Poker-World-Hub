import { useEffect, useRef, useState } from 'react';
import { QUEUE_EVENT, emptyQueue, readQueue, startQueue, enqueueNext, advanceQueue, removeQueueItem, clearQueue } from '../../lib/videoLibraryQueue.mjs';
export default function useVideoLibraryQueue(ownerId = null) {
    const previousOwner = useRef(ownerId);
    const observedAuthenticatedOwner = useRef(Boolean(ownerId));
    const [state, setState] = useState(() => ({ queue: emptyQueue(ownerId), error: null }));
    const refresh = () => {
        try { setState({ queue: readQueue(ownerId), error: null }); }
        catch { setState({ queue: emptyQueue(ownerId), error: 'Session Queue Storage Is Unavailable.' }); }
    };
    useEffect(() => {
        if (previousOwner.current !== ownerId) {
            previousOwner.current = ownerId;
            // A newly mounted route receives the profile after hydration.
            // Preserve its matching session queue on that first resolution;
            // a later sign-out/account change still clears the old session.
            if (observedAuthenticatedOwner.current || ownerId === null) {
                try { clearQueue(ownerId); } catch { /* refresh exposes storage failure */ }
            }
            if (ownerId) observedAuthenticatedOwner.current = true;
        }
        refresh();
        window.addEventListener(QUEUE_EVENT, refresh);
        return () => window.removeEventListener(QUEUE_EVENT, refresh);
    }, [ownerId]);
    const perform = action => {
        try { const queue = action(); setState({ queue, error: null }); return queue; }
        catch (error) { setState(previous => ({ ...previous, error: error.message || 'The Session Queue Could Not Be Updated.' })); return null; }
    };
    return { queue: state.queue.ownerId === ownerId ? state.queue : emptyQueue(ownerId), error: state.error,
        startQueue: (items, index = 0) => perform(() => startQueue(items, index, ownerId)),
        enqueueNext: (video, currentId) => perform(() => enqueueNext(video, currentId, ownerId)),
        advance: currentId => { const next = perform(() => advanceQueue(currentId, ownerId)); return next?.items.find(item => item.videoId === next.currentId) || null; },
        remove: videoId => perform(() => removeQueueItem(videoId, ownerId)), clear: () => perform(() => clearQueue(ownerId)) };
}
