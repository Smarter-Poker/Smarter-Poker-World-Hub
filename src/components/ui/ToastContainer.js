/**
 * TOAST NOTIFICATION CONTAINER
 * Animated toast notifications with optional click-to-navigate action.
 *
 * This shell is in the site-wide _app bundle; the animated stack is not. Every
 * page used to ship framer-motion (about 118 KB of minified JS) for a toast
 * that most visits never show. The fixed container renders exactly as before,
 * and the first toast mounts ToastStack (same markup, same motion), which then
 * stays mounted so later toasts and exit animations are instant.
 * Pinned by __tests__/site-wide-payload-budget.test.mjs.
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useToastStore } from '../../stores/toastStore';

const ToastStack = dynamic(() => import('./ToastStack'), { ssr: false, loading: () => null });

export default function ToastContainer() {
    const hasToasts = useToastStore((s) => s.toasts.length > 0);
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (hasToasts) setArmed(true);
    }, [hasToasts]);

    return (
        <div style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 100000, // Must exceed all modal z-indexes (10000)
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
        }}>
            {(armed || hasToasts) && <ToastStack />}
        </div>
    );
}
