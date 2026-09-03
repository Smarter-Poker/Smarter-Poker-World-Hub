/**
 * ErrorBoundary - one tab failing must not white-screen the console.
 *
 * Before this existed a single render throw anywhere in pages/horses/index.js
 * took all sixteen tabs down with it, and the operator saw a blank page with
 * no way back. Wrapped around the active panel, a throw now costs exactly one
 * tab: the nav stays usable, the tab is named, the message is shown verbatim,
 * and "Reload Tab" re-mounts the panel.
 *
 * `resetKey` is the active tab id. Changing it clears a captured error, so
 * navigating away and back is also a recovery path.
 */
import React from 'react';
import styles from './shared.module.css';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    // A different tab is a different panel. Do not carry the failure across.
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, info);
    }
  }

  handleReload() {
    // The attempt counter is the remount key: without it React reuses the
    // same element tree and the same throw happens before paint.
    this.setState((prev) => ({ error: null, attempt: prev.attempt + 1 }));
    if (typeof this.props.onReset === 'function') this.props.onReset();
  }

  render() {
    const { error } = this.state;
    const { label, children } = this.props;
    if (error) {
      const message = (error && error.message) ? error.message : String(error);
      return (
        <div className={styles.boundary} role="alert">
          <h2 className={styles.boundaryTitle}>
            {label ? `${label} Could Not Be Displayed` : 'This Tab Could Not Be Displayed'}
          </h2>
          <p className={styles.boundaryText}>
            Something In This Panel Threw While Rendering. The Rest Of The Console Is
            Still Usable - Pick Another Tab, Or Reload Just This One.
          </p>
          <code className={styles.boundaryCode}>{message}</code>
          <button type="button" className={styles.boundaryBtn} onClick={this.handleReload}>
            Reload Tab
          </button>
        </div>
      );
    }
    return <React.Fragment key={this.state.attempt}>{children}</React.Fragment>;
  }
}
