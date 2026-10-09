import React from 'react';
import {
  PokerNearMeConsoleIcon,
  PokerNearMePanelShell,
} from '../PokerNearMeConsole';

export const PNM_US_STATE_CODES = Object.freeze([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

const STATE_ICONS = Object.freeze({
  loading: 'globe',
  error: 'alert',
  empty: 'search',
  intro: 'info',
});

export default function LobbyPodConsole({ children, className = '' }) {
  return (
    <div className={`pnm-lobby-pod ${className}`.trim()} data-pnm-console="painted-lobby-pod-v1">
      {children}
    </div>
  );
}

export function LobbyPodPanel({ children, className = '', bodyClassName = '', ...props }) {
  return (
    <PokerNearMePanelShell
      className={`pnm-lobby-pod__panel ${className}`.trim()}
      bodyClassName={`pnm-lobby-pod__panel-body ${bodyClassName}`.trim()}
      {...props}
    >
      {children}
    </PokerNearMePanelShell>
  );
}

export function LobbyPodControlPanel({ title, description, icon = 'filter', children }) {
  return (
    <LobbyPodPanel as="section" className="pnm-lobby-pod__controls" aria-label={title}>
      <header className="pnm-lobby-pod__section-head">
        <PokerNearMeConsoleIcon name={icon} className="pnm-lobby-pod__section-icon" />
        <span className="pnm-lobby-pod__section-copy">
          <strong>{title}</strong>
          {description ? <span>{description}</span> : null}
        </span>
      </header>
      <div className="pnm-lobby-pod__control-stack">{children}</div>
    </LobbyPodPanel>
  );
}

export function LobbyPodField({ label, icon, className = '', children }) {
  return (
    <label className={`pnm-lobby-pod__field ${className}`.trim()}>
      <span className="pnm-lobby-pod__field-label">{label}</span>
      <span className="pnm-lobby-pod__field-well">
        {icon ? <PokerNearMeConsoleIcon name={icon} className="pnm-lobby-pod__field-icon" /> : null}
        {children}
      </span>
    </label>
  );
}

export function LobbyPodSegmentGroup({ label, value, options, onChange }) {
  return (
    <fieldset className="pnm-lobby-pod__segments">
      <legend>{label}</legend>
      <div className="pnm-lobby-pod__segment-grid">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="pnm-lobby-pod__segment"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function LobbyPodAction({ variant = 'primary', className = '', children, ...buttonProps }) {
  return (
    <button
      type="button"
      className={`pnm-lobby-pod__action pnm-lobby-pod__action--${variant} ${className}`.trim()}
      {...buttonProps}
    >
      <span>{children}</span>
    </button>
  );
}

export function LobbyPodResultsBar({ children, onClear, clearLabel = 'Clear Filters' }) {
  return (
    <div className="pnm-lobby-pod__results-bar">
      <span
        className="pnm-lobby-pod__results-copy"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {children}
      </span>
      {onClear ? (
        <button type="button" className="pnm-lobby-pod__clear" onClick={onClear} aria-label={clearLabel}>
          <PokerNearMeConsoleIcon name="close" />
          <span className="pnm-lobby-pod__sr-only">{clearLabel}</span>
        </button>
      ) : null}
    </div>
  );
}

export function LobbyPodState({
  kind = 'empty',
  title,
  children,
  action,
  className = '',
}) {
  const isError = kind === 'error';
  const isLoading = kind === 'loading';
  return (
    <LobbyPodPanel
      as="section"
      className={`pnm-lobby-pod__state pnm-lobby-pod__state--${kind} ${className}`.trim()}
      bodyClassName="pnm-lobby-pod__state-body"
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={isLoading ? 'true' : undefined}
    >
      <PokerNearMeConsoleIcon name={STATE_ICONS[kind] || STATE_ICONS.empty} className="pnm-lobby-pod__state-icon" />
      <h3>{title}</h3>
      {children ? <div className="pnm-lobby-pod__state-copy">{children}</div> : null}
      {action ? <div className="pnm-lobby-pod__state-action">{action}</div> : null}
    </LobbyPodPanel>
  );
}

export function LobbyPodInfoPanel({ icon = 'info', title, children, className = '' }) {
  return (
    <LobbyPodPanel className={`pnm-lobby-pod__nearby-head ${className}`.trim()}>
      <PokerNearMeConsoleIcon name={icon} className="pnm-lobby-pod__section-icon" />
      <span className="pnm-lobby-pod__nearby-copy">
        <strong>{title}</strong>
        {children ? <span>{children}</span> : null}
      </span>
    </LobbyPodPanel>
  );
}

export function LobbyPodCardList({ children, className = '' }) {
  return <div className={`pnm-lobby-pod__cards ${className}`.trim()}>{children}</div>;
}

export function LobbyPodDistance({ children }) {
  return <span className="pnm-lobby-pod__distance">{children}</span>;
}
