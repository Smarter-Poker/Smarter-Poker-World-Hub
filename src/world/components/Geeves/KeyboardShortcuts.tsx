/* ═══════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS — Global keyboard handler for Jarvis
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';

interface KeyboardShortcutsProps {
    onOpenJarvis: () => void;
    onCloseJarvis: () => void;
    isOpen: boolean;
}

export function useKeyboardShortcuts({ onOpenJarvis, onCloseJarvis, isOpen }: KeyboardShortcutsProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+J or Ctrl+J → Open Jarvis
            if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
                e.preventDefault();
                if (!isOpen) {
                    onOpenJarvis();
                }
            }

            // Esc → Close Jarvis
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                onCloseJarvis();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onOpenJarvis, onCloseJarvis]);
}

/**
 * Keyboard shortcut hints component
 */
export function KeyboardShortcutHints() {
    return (
        <div style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            display: 'flex',
            gap: '8px',
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.3)',
            pointerEvents: 'none'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                <kbd style={{
                    padding: '2px 4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                }}>⌘J</kbd>
                <span>Open</span>
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                <kbd style={{
                    padding: '2px 4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                }}>Esc</kbd>
                <span>Close</span>
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                <kbd style={{
                    padding: '2px 4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                }}>↵</kbd>
                <span>Send</span>
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                <kbd style={{
                    padding: '2px 4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '3px',
                    fontFamily: 'monospace'
                }}>⇧↵</kbd>
                <span>New Line</span>
            </div>
        </div>
    );
}
