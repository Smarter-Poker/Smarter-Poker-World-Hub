/**
 * PreflopGameKit: the #SMARTERDESIGN pieces every Preflop Charts game screen
 * shares (Speed Drill, Pressure Cooker, Pattern Recognition, Local VS, Mixed
 * Strategy). Dan, 2026-11-27: "PREFLOP CHARTS NEEDS THE SAME #SMARTERDESIGN
 * UPGRADE TO EVERY SINGLE PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE".
 *
 * Before this file each game drew its own intro, top bar and result card in
 * inline styles: gold and pink pill buttons, emoji icons, violet figures and
 * rounded hairline boxes, five slightly different copies of the same screen.
 * Now they all render the same chrome surfaces from
 * src/styles/worlds/preflop-smarterdesign.css (`.preflop-sd-*`): one steel
 * rim per surface, chrome-stat readouts, steel buttons and a cobalt primary.
 *
 * These are presentational only. Every game keeps its own state, timers,
 * scoring, keyboard handling and persistence.
 */
import { ArrowLeft, ChevronRight, RotateCcw, Share2, Target, TriangleAlert } from 'lucide-react';

/** Grade letters carry the meaning; colour is only a second cue (no gold). */
export const GRADE_TONES = {
  S: '#86daff',
  A: '#39e9a5',
  B: '#5aa9ff',
  C: '#bdd0e2',
  D: '#ff5c74',
};

export function gradeTone(grade) {
  return GRADE_TONES[grade] || '#f2f7ff';
}

export function GameFrame({ children, className = '', ...rest }) {
  return (
    <div className={`preflop-sd-game smarterdesign${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </div>
  );
}

export function GameTopBar({ onExit, score, streak, children }) {
  return (
    <div className="preflop-sd-topbar">
      <button type="button" className="preflop-sd-button" onClick={onExit}>
        <ArrowLeft size={16} aria-hidden /> Exit
      </button>
      {score !== undefined && (
        <div className="preflop-sd-score" aria-label={`Score ${Number(score || 0).toLocaleString()}`}>
          {Number(score || 0).toLocaleString()}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 64, justifyContent: 'flex-end' }}>
        {streak > 1 && <span className="preflop-sd-chip">{streak}x Streak</span>}
        {children}
      </div>
    </div>
  );
}

export function GameIntro({ icon: Icon = Target, kicker, title, children, onStart, startLabel = 'Start', footer }) {
  return (
    <section className="preflop-sd-surface" aria-labelledby="preflop-sd-intro-title">
      <div className="preflop-sd-emblem" aria-hidden="true">
        <Icon size={40} strokeWidth={1.8} />
      </div>
      {kicker && <div className="preflop-sd-kicker">{kicker}</div>}
      <h1 id="preflop-sd-intro-title" className="preflop-sd-title">
        {title}
      </h1>
      <div className="preflop-sd-copy">{children}</div>
      {onStart && (
        <button type="button" className="preflop-sd-primary" onClick={onStart}>
          {startLabel} <kbd style={{ font: 'inherit', fontSize: 13, opacity: 0.8 }}>Space</kbd>
        </button>
      )}
      {footer}
    </section>
  );
}

export function GameResult({ grade, label = 'Performance Grade', headline, metrics = [], children }) {
  return (
    <section className="preflop-sd-surface" style={{ marginBottom: 12 }} aria-label={label}>
      {grade && (
        <div
          className="preflop-sd-title"
          style={{ margin: '0 0 2px', fontSize: 58, lineHeight: 1, color: gradeTone(grade) }}
        >
          {grade}
        </div>
      )}
      {headline && <div className="preflop-sd-title" style={{ margin: '0 0 2px' }}>{headline}</div>}
      <div className="preflop-sd-kicker" style={{ marginBottom: 14 }}>
        {label}
      </div>
      {metrics.length > 0 && (
        <div className="preflop-sd-metrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="preflop-sd-metric">
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      )}
      {children}
    </section>
  );
}

export function GameWeakness({ rows = [], title = 'Weakness Detected', note = 'Focus On These Spots In Your Next Session' }) {
  if (!rows.length) return null;
  return (
    <div className="preflop-sd-row" style={{ marginBottom: 12 }}>
      <div className="preflop-sd-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#ff8a9a' }}>
        <TriangleAlert size={15} aria-hidden /> {title}
      </div>
      {rows.map(([label, count], index) => (
        <div
          key={label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            padding: '6px 0',
            borderBottom: index < rows.length - 1 ? '1px solid rgba(134,218,255,0.12)' : 'none',
          }}
        >
          <span style={{ color: '#f2f7ff', fontSize: 14 }}>{label}</span>
          <span style={{ color: '#ff8a9a', fontSize: 13, fontWeight: 700 }}>
            {`${count} ${count === 1 ? 'Mistake' : 'Mistakes'}`}
          </span>
        </div>
      ))}
      {note && <div style={{ color: '#93a9bd', fontSize: 12, marginTop: 8 }}>{note}</div>}
    </div>
  );
}

export function GameNote({ children, tone = 'info' }) {
  return (
    <div
      className="preflop-sd-row"
      style={{ marginBottom: 12, textAlign: 'center', color: tone === 'good' ? '#6ef0b5' : '#f2f7ff', fontWeight: 700 }}
    >
      {children}
    </div>
  );
}

export function GameActions({ onReplay, replayLabel = 'Play Again', onExit, exitLabel = 'Back To Menu' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
      {onReplay && (
        <button type="button" className="preflop-sd-primary" onClick={onReplay}>
          <RotateCcw size={17} aria-hidden /> {replayLabel}
        </button>
      )}
      {onExit && (
        <button type="button" className="preflop-sd-button" onClick={onExit}>
          {exitLabel}
        </button>
      )}
    </div>
  );
}

export function GameShare({ onShare }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 10 }}>
      <button type="button" className="preflop-sd-button" onClick={onShare}>
        <Share2 size={15} aria-hidden /> Share Result
      </button>
    </div>
  );
}

export function GameCoachTip({ children }) {
  return (
    <div className="preflop-sd-row" style={{ marginTop: 10 }}>
      <div className="preflop-sd-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Target size={14} aria-hidden /> Coach Tip
      </div>
      <div style={{ color: '#bdd0e2', fontSize: 14, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export function GameSuggestedNext({ suggestion, onSelect }) {
  if (!suggestion) return null;
  return (
    <button
      type="button"
      className="preflop-sd-row"
      onClick={onSelect}
      style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: '#f2f7ff' }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="preflop-sd-kicker" style={{ display: 'block', marginBottom: 2 }}>
          Suggested Next
        </span>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>{suggestion.title}</span>
        {suggestion.reason && (
          <span style={{ display: 'block', color: '#bdd0e2', fontSize: 12, marginTop: 2 }}>{suggestion.reason}</span>
        )}
      </span>
      <ChevronRight size={18} aria-hidden style={{ color: '#86daff', flexShrink: 0 }} />
    </button>
  );
}

/** The in-play "Next Hand" control every game shows after a reveal. */
export function GameNextButton({ onClick, children }) {
  return (
    <button type="button" className="preflop-sd-primary" onClick={onClick} style={{ width: '100%', marginTop: 18 }}>
      {children}
    </button>
  );
}
