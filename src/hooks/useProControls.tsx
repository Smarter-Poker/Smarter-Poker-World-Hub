/**
 * ⌨️ PRO CONTROLS HOOK - Keyboard Hotkeys for Rapid-Fire Training
 * 
 * Enables pro-level play with keyboard shortcuts:
 * - [F] = Fold
 * - [C] = Check/Call
 * - [R] = Raise (opens slider)
 * - [Space] = Next Hand
 * - [Enter] = Confirm raise amount
 */

import { useEffect, useCallback, useState } from 'react';

export type HotkeyAction = 'fold' | 'call' | 'raise' | 'next' | 'confirm' | null;

interface ProControlsConfig {
    enabled: boolean;
    onFold?: () => void;
    onCall?: () => void;
    onRaise?: () => void;
    onNext?: () => void;
    onConfirm?: () => void;
}

interface ProControlsState {
    lastAction: HotkeyAction;
    isRaiseMode: boolean;
    keyPressCount: number;
}

export function useProControls({
    enabled,
    onFold,
    onCall,
    onRaise,
    onNext,
    onConfirm
}: ProControlsConfig): ProControlsState {
    const [state, setState] = useState<ProControlsState>({
        lastAction: null,
        isRaiseMode: false,
        keyPressCount: 0
    });

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!enabled) return;

        // Ignore if typing in an input field
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        const key = event.key.toLowerCase();

        switch (key) {
            case 'f':
                event.preventDefault();
                onFold?.();
                setState(prev => ({
                    ...prev,
                    lastAction: 'fold',
                    isRaiseMode: false,
                    keyPressCount: prev.keyPressCount + 1
                }));
                break;

            case 'c':
                event.preventDefault();
                onCall?.();
                setState(prev => ({
                    ...prev,
                    lastAction: 'call',
                    isRaiseMode: false,
                    keyPressCount: prev.keyPressCount + 1
                }));
                break;

            case 'r':
                event.preventDefault();
                onRaise?.();
                setState(prev => ({
                    ...prev,
                    lastAction: 'raise',
                    isRaiseMode: true,
                    keyPressCount: prev.keyPressCount + 1
                }));
                break;

            case ' ':
                event.preventDefault();
                onNext?.();
                setState(prev => ({
                    ...prev,
                    lastAction: 'next',
                    isRaiseMode: false,
                    keyPressCount: prev.keyPressCount + 1
                }));
                break;

            case 'enter':
                if (state.isRaiseMode) {
                    event.preventDefault();
                    onConfirm?.();
                    setState(prev => ({
                        ...prev,
                        lastAction: 'confirm',
                        isRaiseMode: false,
                        keyPressCount: prev.keyPressCount + 1
                    }));
                }
                break;
        }
    }, [enabled, onFold, onCall, onRaise, onNext, onConfirm, state.isRaiseMode]);

    useEffect(() => {
        if (enabled) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [enabled, handleKeyDown]);

    return state;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOTKEY BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface HotkeyBadgeProps {
    hotkey: string;
    style?: React.CSSProperties;
}

export function HotkeyBadge({ hotkey, style }: HotkeyBadgeProps) {
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '18px',
            height: '18px',
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#888',
            marginLeft: '6px',
            ...style
        }}>
            {hotkey}
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION BUTTON WITH HOTKEY
// ═══════════════════════════════════════════════════════════════════════════

interface ActionButtonProps {
    label: string;
    hotkey: string;
    onClick: () => void;
    variant: 'fold' | 'call' | 'raise' | 'next';
    disabled?: boolean;
    showHotkey?: boolean;
}

export function ActionButton({
    label,
    hotkey,
    onClick,
    variant,
    disabled = false,
    showHotkey = true
}: ActionButtonProps) {
    const colors = {
        fold: { bg: 'linear-gradient(135deg, #ef4444, #dc2626)', border: '#ef4444' },
        call: { bg: 'linear-gradient(135deg, #22c55e, #16a34a)', border: '#22c55e' },
        raise: { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', border: '#f59e0b' },
        next: { bg: 'linear-gradient(135deg, #00d4ff, #0099cc)', border: '#00d4ff' }
    };

    const { bg, border } = colors[variant];

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                padding: '12px 24px',
                background: disabled ? 'rgba(100,100,100,0.3)' : bg,
                border: `2px solid ${disabled ? '#444' : border}`,
                borderRadius: '10px',
                color: disabled ? '#666' : '#fff',
                fontWeight: 700,
                fontSize: '14px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'transform 0.1s, box-shadow 0.2s',
                boxShadow: disabled ? 'none' : `0 0 15px ${border}44`
            }}
        >
            {label}
            {showHotkey && <HotkeyBadge hotkey={hotkey} />}
        </button>
    );
}

export default useProControls;
