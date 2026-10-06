import { useEffect, useState } from 'react';

export default function usePhase9ReducedMotion() {
    const [reduced, setReduced] = useState(() => (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ));

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReduced(media.matches);
        sync();
        media.addEventListener?.('change', sync);
        return () => media.removeEventListener?.('change', sync);
    }, []);

    return reduced;
}
