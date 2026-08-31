import React, { useEffect, useState } from 'react';

class ControllerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.warn(`[PNM] ${this.props.surfaceName || 'Discovery surface'} crashed:`, error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          textAlign: 'center',
          padding: this.props.compact ? 40 : 60,
          color: this.props.compact ? 'rgba(200,214,229,0.5)' : 'rgba(200,214,229,0.6)',
        }}
      >
        <div style={{ fontSize: this.props.compact ? 36 : 40, marginBottom: 12, opacity: 0.3 }}>
          {'\u26A0'}
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#f59e0b' }}>
          {this.props.errorTitle}
        </p>
        <p
          style={{
            fontSize: 12,
            margin: this.props.compact ? '0 0 16px' : '0 auto 20px',
            color: this.props.compact
              ? 'rgba(200,214,229,0.35)'
              : 'rgba(200,214,229,0.4)',
            maxWidth: this.props.compact ? undefined : 300,
          }}
        >
          {String(this.state.error?.message || 'Unknown error')}
        </p>
        <button
          type="button"
          onClick={this.reset}
          style={{
            padding: this.props.compact ? '8px 20px' : '10px 24px',
            borderRadius: 20,
            border: this.props.compact
              ? '1px solid rgba(212,168,83,0.25)'
              : '1px solid rgba(212,168,83,0.3)',
            background: this.props.compact
              ? 'rgba(212,168,83,0.08)'
              : 'rgba(212,168,83,0.1)',
            color: '#d4a853',
            fontSize: this.props.compact ? 13 : 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {this.props.resetLabel}
        </button>
      </div>
    );
  }
}

export function PodErrorBoundary({ podName, onReset, children }) {
  return (
    <ControllerErrorBoundary
      compact
      surfaceName={`Pod "${podName}"`}
      errorTitle={`"${podName}" encountered an error`}
      resetLabel="Reset Pod"
      onReset={onReset}
    >
      {children}
    </ControllerErrorBoundary>
  );
}

export function TabErrorBoundary({ children }) {
  return (
    <ControllerErrorBoundary
      surfaceName="Tab"
      errorTitle="This Tab Encountered An Error"
      resetLabel="Reset Tab"
    >
      {children}
    </ControllerErrorBoundary>
  );
}

export function FavLiveToast({ message, onClick }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 5000);
    const hideTimer = setTimeout(() => setExiting(true), 7000);
    const removeTimer = setTimeout(() => setVisible(false), 7400);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className={`pnm-fav-toast${exiting ? ' pnm-fav-toast-exit' : ''}`}
      onClick={onClick}
      style={{ font: 'inherit', cursor: 'pointer' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="none">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
      <span>{message}</span>
    </button>
  );
}
