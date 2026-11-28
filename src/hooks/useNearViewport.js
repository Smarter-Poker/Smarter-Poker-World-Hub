import { useEffect, useState } from 'react';

/**
 * Returns [ref, near]. Attach `ref` (a callback ref) to an element; `near`
 * turns true once that element comes within `rootMargin` of the viewport and
 * stays true: a feed that has been asked for is never dropped again. The
 * element may mount later than the component (a section that opens on a tab);
 * observation starts whenever it appears. Without IntersectionObserver it
 * answers true as soon as the element mounts, so content is never withheld.
 */
export default function useNearViewport(rootMargin = '900px 0px') {
    const [node, setNode] = useState(null);
    const [near, setNear] = useState(false);
    useEffect(() => {
        if (near || !node) return undefined;
        if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
            setNear(true);
            return undefined;
        }
        const observer = new window.IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setNear(true);
                observer.disconnect();
            }
        }, { rootMargin });
        observer.observe(node);
        return () => observer.disconnect();
    }, [node, near, rootMargin]);
    return [setNode, near];
}
