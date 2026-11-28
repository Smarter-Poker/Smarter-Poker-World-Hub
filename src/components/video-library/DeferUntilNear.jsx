import { useEffect, useRef, useState } from 'react';

// Mounts its children only once the wrapper comes within `margin` of the
// viewport. Built for the watch page's below-the-fold account panels, whose
// painted border-image plates (about 113 KB of PNG) were fetched on every
// phone visit before anybody scrolled. CSS content-visibility does not help
// there: Chromium still resolves the skipped subtree's border images.
//
// The rendered panel is unchanged; only when it arrives differs. A browser
// without IntersectionObserver renders it straight away. Rendering crawlers
// lay the page out in a tall viewport, so they still see the panel.
export default function DeferUntilNear({ children, className, style, margin = '600px 0px', placeholderHeight = 320 }) {
    const ref = useRef(null);
    const [near, setNear] = useState(false);
    useEffect(() => {
        if (near) return undefined;
        const element = ref.current;
        if (!element || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
            setNear(true);
            return undefined;
        }
        const observer = new window.IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setNear(true);
                observer.disconnect();
            }
        }, { rootMargin: margin });
        observer.observe(element);
        return () => observer.disconnect();
    }, [near, margin]);
    return <div ref={ref} className={className} style={near ? style : { ...style, minHeight: placeholderHeight }} data-deferred={near ? 'mounted' : 'waiting'}>
        {near ? children : null}
    </div>;
}
