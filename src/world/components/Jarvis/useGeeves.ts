/* ═══════════════════════════════════════════════════════════════════════════
   USE GEEVES — Hook for Geeves panel state and keyboard shortcut
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';

export function useGeeves() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        // Keyboard shortcut: Cmd+G (Mac) or Ctrl+G (Windows/Linux)
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }

            // ESC to close
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        // Custom event to open Geeves from anywhere
        const handleOpenGeeves = () => {
            setIsOpen(true);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('open-geeves', handleOpenGeeves);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('open-geeves', handleOpenGeeves);
        };
    }, [isOpen]);

    return {
        isOpen,
        setIsOpen,
        onClose: () => setIsOpen(false)
    };
}
