import React, { useEffect, useRef } from 'react';
import { getWorldMenuStyleVariables } from '../../config/worldMenuNavigation';

function CommandMenuRecovery({ onClose, onRetry, world }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const palette = world?.menuPalette || {};
  const worldMenuStyle = getWorldMenuStyleVariables(world);
  const recoveryButtonStyle = {
    minHeight: 44, padding: '0 14px', color: palette.text || '#f4f8fc', font: 'inherit', fontWeight: 750,
    border: `1px solid ${palette.border || 'rgba(190,208,224,.42)'}`, borderRadius: 3,
    background: `linear-gradient(145deg,${palette.panel || '#202d38'},${palette.canvas || '#080d12'})`, cursor: 'pointer',
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      data-world-command-recovery={world?.id || 'global'}
      data-world-menu-scheme={palette.scheme || 'global'}
      data-world-menu-texture={palette.texture || 'none'}
      style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(0,0,0,.72)' }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-command-recovery-title"
        style={{
          width: 'min(400px, 100vw)', height: '100dvh', overflowY: 'auto', boxSizing: 'border-box',
          padding: 'max(22px, env(safe-area-inset-top)) 18px max(22px, env(safe-area-inset-bottom))',
          color: palette.text || '#edf4fb',
          background: `linear-gradient(180deg,${palette.canvasRaised || '#070d13'},${palette.canvas || '#020507'})`,
          borderRight: `1px solid ${palette.accent || world?.accent || '#2e9bff'}`,
          boxShadow: `18px 0 48px rgba(0,0,0,.75), inset -1px 0 ${palette.border || '#607080'}`,
          ...worldMenuStyle,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '.18em', color: palette.muted || '#8da1b5', textTransform: 'uppercase' }}>
              Safe Navigation
            </div>
            <h2 id="sp-command-recovery-title" style={{ margin: '8px 0 6px', fontSize: 20 }}>
              {world?.label || 'Smarter.Poker'} Commands
            </h2>
            <p role="alert" style={{ margin: 0, color: palette.muted || '#b7c4d1', fontSize: 13, lineHeight: 1.45 }}>
              A Menu Module Could Not Load. Your Primary Destinations Remain Available.
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close Safe Navigation" style={recoveryButtonStyle}>
            Close
          </button>
        </div>
        <nav aria-label={`${world?.label || 'World'} Safe Navigation`} style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 24 }}>
          {(world?.primaryItems || []).map((item) => (
            <a key={`${item.href}-${item.label}`} href={item.href} style={{
              minHeight: 72, display: 'flex', alignItems: 'center', padding: 12, boxSizing: 'border-box',
              color: palette.text || '#f4f8fc', textDecoration: 'none', fontWeight: 750, fontSize: 14,
              border: `1px solid ${palette.border || 'rgba(190,208,224,.3)'}`,
              background: `linear-gradient(145deg,${palette.tileActive || '#17212a'},${palette.tile || '#060a0e'})`,
              boxShadow: `inset 0 -2px ${palette.accent || world?.accent || '#2e9bff'}`,
            }}>
              {item.label}
            </a>
          ))}
        </nav>
        <button type="button" onClick={onRetry} style={{ ...recoveryButtonStyle, width: '100%', marginTop: 18 }}>
          Retry Full Command Menu
        </button>
      </section>
    </div>
  );
}

export class WorldCommandMenuBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error) {
    console.error('World command menu recovered from a module failure.', error);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sp:world-command-menu-error', {
        detail: { worldId: this.props.world?.id || 'global', message: String(error?.message || 'unknown') },
      }));
    }
  }

  render() {
    if (this.state.error && this.props.isOpen) {
      return (
        <CommandMenuRecovery
          onClose={this.props.onClose}
          onRetry={() => this.setState({ error: null })}
          world={this.props.world}
        />
      );
    }
    if (this.state.error) return null;
    return this.props.children;
  }
}

export default WorldCommandMenuBoundary;
