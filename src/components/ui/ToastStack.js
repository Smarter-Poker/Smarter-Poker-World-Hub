/**
 * TOAST STACK - the animated list ToastContainer mounts once a toast exists.
 * Split out so framer-motion is not in the site-wide _app bundle
 * (__tests__/site-wide-payload-budget.test.mjs). Markup and motion unchanged.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../../stores/toastStore';
import { toastSlideIn } from '../../utils/animations';
import ToastCard from './ToastCard';

export default function ToastStack() {
    const toasts = useToastStore((s) => s.toasts);
    const removeToast = useToastStore((s) => s.removeToast);

    return (
        <AnimatePresence>
            {toasts.map((t) => (
                <ToastCard
                    key={t.id}
                    toast={t}
                    removeToast={removeToast}
                    as={motion.div}
                    wrapperProps={{ variants: toastSlideIn, initial: 'initial', animate: 'animate', exit: 'exit' }}
                />
            ))}
        </AnimatePresence>
    );
}
