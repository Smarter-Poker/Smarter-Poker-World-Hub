import React, { useEffect, useState } from 'react';
import {
  PokerNearMePanelShell,
  PokerNearMeConsoleIcon,
} from './PokerNearMeConsole';
import styles from './PokerNearMeHomeGameConsole.module.css';

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
      <PokerNearMePanelShell
        as="section"
        role="alert"
        className={`${styles.recoveryPanel} ${this.props.compact ? styles.recoveryPanelCompact : ''}`.trim()}
        bodyClassName={styles.recoveryBody}
      >
        <div className={styles.recoveryContent}>
          <PokerNearMeConsoleIcon name="info" />
          <p className="pnc-label pnc-ink--gold">{this.props.errorTitle}</p>
          <p className={`pnc-copy pnc-copy--center ${styles.recoveryMessage}`}>
            {String(this.state.error?.message || 'Unknown Error')}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className={`${styles.paintedAction} ${styles.recoveryAction}`}
          >
            {this.props.resetLabel}
          </button>
        </div>
      </PokerNearMePanelShell>
    );
  }
}

export function PodErrorBoundary({ podName, onReset, children }) {
  return (
    <ControllerErrorBoundary
      compact
      surfaceName={`Pod "${podName}"`}
      errorTitle={`"${podName}" Encountered An Error`}
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
      className={`${styles.paintedAction} ${styles.toast}${exiting ? ` ${styles.toastExit}` : ''}`}
      onClick={onClick}
      aria-live="polite"
    >
      <PokerNearMeConsoleIcon name="saved" className={styles.actionIcon} />
      <span>{message}</span>
    </button>
  );
}
