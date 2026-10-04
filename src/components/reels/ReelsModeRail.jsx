import { REELS_FEED_MODES } from '../../lib/reelsDeliveryContract.mjs';

export default function ReelsModeRail({ activeMode, onChange, signedIn = false }) {
  return (
    <>
      <nav className="sp-reels-mode-rail" aria-label="Reels feeds">
        {REELS_FEED_MODES.map((mode) => (
        <button
          type="button"
          key={mode.id}
          className={mode.id === activeMode ? 'is-active' : ''}
          aria-current={mode.id === activeMode ? 'page' : undefined}
          onClick={() => onChange(mode.id)}
        >
          <span>{mode.label}</span>
          {mode.requiresAccount && !signedIn ? <small>Sign In</small> : null}
        </button>
        ))}
      </nav>
      <style jsx>{`
        .sp-reels-mode-rail { position: fixed; z-index: 10020; top: max(76px, calc(env(safe-area-inset-top) + 62px)); left: 50%; width: min(calc(100vw - 16px), 680px); transform: translateX(-50%); display: flex; overflow-x: auto; scrollbar-width: none; border: 1px solid #456a84; background: #061019; box-shadow: inset 0 1px #bde8ff, 0 10px 28px #000c; }
        .sp-reels-mode-rail::-webkit-scrollbar { display: none; }
        button { flex: 1 0 auto; min-width: 88px; min-height: 44px; border: 0; border-right: 1px solid #233e52; border-radius: 0; background: linear-gradient(180deg, #122532 0%, #071018 52%, #020508 100%); color: #b8c3cc; font: 700 13px/1 'Roboto Condensed', 'Arial Narrow', sans-serif; letter-spacing: .035em; text-transform: uppercase; }
        button:last-child { border-right: 0; }
        button.is-active { color: #fff; background: linear-gradient(180deg, #19496a 0%, #0b2130 52%, #03090e 100%); box-shadow: inset 0 -3px #0ca8ff, inset 0 1px #e8f7ff; }
        small { display: block; margin-top: 4px; color: #7ccfff; font-size: 9px; }
        @media (min-width: 769px) { .sp-reels-mode-rail { top: 84px; } button { min-width: 112px; } }
        @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
      `}</style>
    </>
  );
}
