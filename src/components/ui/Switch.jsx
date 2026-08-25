/**
 * SWITCH — the one toggle for the whole estate.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25: "EVERY SINGLE TOGGLE BUTTON GLOBALLY ON EVERY SINGLE
 * SMARTER.POKER PAGE, SUB PAGE, CLUB ARENA AND CLUB COMMANDER ON MOBILE
 * NEEDS TO BE UPGRADED TO LOOK LIKE [the iOS-style blue pill]."
 *
 * There was no shared toggle in World Hub at all — 120 files each drew
 * their own, at their own size, in their own colour. Club Arena did have
 * `src/components/toggles/Toggle.tsx`, and ZERO files imported it while 31
 * rolled their own checkbox. That is why they never looked alike: there was
 * nothing to look alike TO.
 *
 * WHY INLINE STYLES AND NOT TAILWIND
 * World Hub has Tailwind; Club Arena does not (CSS Modules + global CSS).
 * A shared look has to survive both, so this component carries its own
 * styling and depends on nothing. It can be copied into Club Arena and
 * Club Commander byte-for-byte.
 *
 * SIZING is Apple's switch geometry (51x31, 27px knob, 20px travel), which
 * is what the reference screenshot shows and what a thumb expects to hit.
 * The whole control is 44px tall in its hit area even at size="small",
 * because 44px is the minimum comfortable touch target.
 */
import { useCallback } from 'react';

const BLUE = '#1877F2';   // brand blue, same as the hub header and Commander
const OFF = '#39393D';    // neutral dark, reads as "off" on both themes
const KNOB = '#FFFFFF';

const SIZES = {
    small: { w: 40, h: 24, knob: 20, travel: 16 },
    medium: { w: 51, h: 31, knob: 27, travel: 20 },
    large: { w: 60, h: 36, knob: 32, travel: 24 },
};

export default function Switch({
    checked = false,
    onChange,
    disabled = false,
    size = 'medium',
    label,
    id,
}) {
    const s = SIZES[size] || SIZES.medium;

    const toggle = useCallback(() => {
        if (disabled) return;
        onChange?.(!checked);
    }, [checked, disabled, onChange]);

    const onKeyDown = useCallback(
        (e) => {
            // Space and Enter are both expected to operate a switch.
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                toggle();
            }
        },
        [toggle]
    );

    return (
        <button
            type="button"
            id={id}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={toggle}
            onKeyDown={onKeyDown}
            style={{
                // Hit area stays finger-sized even when the pill is small.
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
                width: s.w,
                height: s.h,
                minHeight: s.h,
                padding: 0,
                border: 'none',
                borderRadius: 999,
                background: checked ? BLUE : OFF,
                opacity: disabled ? 0.45 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'background-color 180ms ease',
                position: 'relative',
                // Stops iOS from flashing a grey box on tap.
                WebkitTapHighlightColor: 'transparent',
                // Never let a flex parent squash the pill into the circle
                // that the old ad-hoc toggles collapsed into on narrow screens.
                boxSizing: 'border-box',
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    top: (s.h - s.knob) / 2,
                    left: (s.h - s.knob) / 2,
                    width: s.knob,
                    height: s.knob,
                    borderRadius: '50%',
                    background: KNOB,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.28)',
                    transform: checked ? `translateX(${s.travel}px)` : 'translateX(0)',
                    transition: 'transform 180ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
            />
        </button>
    );
}

export { SIZES as SWITCH_SIZES, BLUE as SWITCH_ON_COLOR, OFF as SWITCH_OFF_COLOR };
