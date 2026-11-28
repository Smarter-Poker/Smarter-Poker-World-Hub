/**
 * BANKROLL FILTER MENU
 *
 * One dropdown of the dashboard filters row (location, time range, game
 * types, chart type). It replaces four hand-built copies that each differed:
 * the chart menu never closed on an outside tap, none answered Escape or the
 * arrow keys, none told a screen reader whether it was open, and the right
 * column's menus ran off a 375px screen.
 *
 * Disclosure pattern: the trigger is a button with aria-expanded, the open
 * list is a labelled group of buttons, and aria-pressed marks the chosen
 * value(s). The trigger's accessible name is its visible text.
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import { GRADIENTS, METAL } from './metalStyles';
import { nextMenuIndex } from '../../lib/bankroll/dashboardFilters.mjs';

export default function BankrollFilterMenu({
  label,
  buttonText,
  options,
  multiple = false,
  open,
  onOpenChange,
  onSelect,
  align = 'left',
  minWidth = 160,
}) {
  const popupId = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const close = useCallback((focusTrigger) => {
    onOpenChange(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, [onOpenChange]);

  // A tap or click anywhere outside closes it. pointerdown, not click: a drag
  // that starts on the page should close it too, and click would arrive after
  // another control already reacted.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  const items = () => Array.from(listRef.current?.querySelectorAll('button') || []);
  const focusItem = (index) => { const list = items(); if (list[index]) list[index].focus(); };

  // Opening from the keyboard puts focus on the chosen value (or the first).
  const openAndFocus = (where) => {
    onOpenChange(true);
    requestAnimationFrame(() => {
      const list = items();
      if (!list.length) return;
      if (where === 'last') { list[list.length - 1].focus(); return; }
      const chosen = list.findIndex((el) => el.getAttribute('aria-pressed') === 'true');
      list[chosen >= 0 && !multiple ? chosen : 0].focus();
    });
  };

  const onTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openAndFocus(event.key === 'ArrowUp' ? 'last' : 'first');
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
    }
  };

  const onListKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const list = items();
    const next = nextMenuIndex(list.indexOf(document.activeElement), event.key, list.length);
    if (next !== null) {
      event.preventDefault();
      focusItem(next);
    }
  };

  // Tabbing out of the menu closes it, so a keyboard user never leaves an
  // open list behind covering the chart.
  const onBlur = (event) => {
    if (open && rootRef.current && !rootRef.current.contains(event.relatedTarget)) onOpenChange(false);
  };

  return (
    <div ref={rootRef} style={styles.container} onBlur={onBlur} data-filter-menu={label}>
      <button
        ref={triggerRef}
        type="button"
        style={styles.button}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={() => onOpenChange(!open)}
        onKeyDown={onTriggerKeyDown}
      >
        <span style={styles.buttonText}>{buttonText}</span>
        <span style={styles.arrow} aria-hidden="true">▼</span>
      </button>
      {open && (
        <div
          id={popupId}
          ref={listRef}
          role="group"
          aria-label={label}
          className="bankroll-dropdown-menu"
          style={{ ...styles.menu, minWidth: `max(${minWidth}px, 100%)`, ...(align === 'right' ? { right: 0, left: 'auto' } : { left: 0 }) }}
          onKeyDown={onListKeyDown}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={Boolean(option.selected)}
              style={{
                ...styles.item,
                ...(multiple ? styles.itemMulti : {}),
                background: option.selected ? 'rgba(35, 116, 225, 0.15)' : 'transparent',
              }}
              onClick={() => {
                onSelect(option.value);
                if (!multiple) close(true);
              }}
            >
              {multiple && (
                <span
                  aria-hidden="true"
                  style={{
                    ...styles.check,
                    border: option.selected ? '2px solid #2374e1' : '2px solid rgba(255,255,255,0.3)',
                    background: option.selected ? '#2374e1' : 'transparent',
                  }}
                >
                  {option.selected ? '✓' : ''}
                </span>
              )}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    width: '100%',
    minWidth: 0,
  },
  button: {
    padding: '8px 12px',
    minHeight: 44,
    touchAction: 'manipulation',
    background: GRADIENTS.metalButton,
    border: `1px solid ${METAL.highlight}`,
    borderRadius: 6,
    color: '#edf6ff',
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minWidth: 0,
  },
  buttonText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  arrow: {
    fontSize: 12,
    opacity: 0.6,
    flexShrink: 0,
  },
  menu: {
    position: 'absolute',
    top: '100%',
    marginTop: 4,
    background: GRADIENTS.darkPanel,
    border: `1px solid ${METAL.highlight}`,
    borderRadius: 8,
    padding: 4,
    zIndex: 100,
    maxHeight: 300,
    overflowY: 'auto',
    maxWidth: 'calc(100vw - 24px)',
    boxSizing: 'border-box',
  },
  item: {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    minHeight: 44,
    touchAction: 'manipulation',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
  },
  itemMulti: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  check: {
    width: 16,
    height: 16,
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: '#fff',
    flexShrink: 0,
  },
};
