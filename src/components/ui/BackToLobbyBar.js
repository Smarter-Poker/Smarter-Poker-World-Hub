/**
 * BackToLobbyBar — Shared "Back to Poker Near Me" navigation bar
 * Used on all pages reachable from the Poker Near Me Lobby grid icons.
 */
import { useRouter } from 'next/router';

export default function BackToLobbyBar({ label = 'Poker Near Me' }) {
  const router = useRouter();
  return (
    <div className="back-to-lobby-bar">
      <button
        className="back-to-lobby-btn"
        onClick={() => router.push('/hub/poker-near-me/lobby')}
        aria-label={`Back to ${label}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back To {label}</span>
      </button>

      <style jsx>{`
        .back-to-lobby-bar {
          padding: 8px 20px 0;
          max-width: 1600px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        .back-to-lobby-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 16px 7px 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(148,163,184,0.15);
          border-radius: 8px;
          color: rgba(200,214,229,0.7);
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.2px;
        }
        .back-to-lobby-btn:hover {
          background: rgba(212,168,83,0.1);
          border-color: rgba(212,168,83,0.35);
          color: #d4a853;
          transform: translateX(-2px);
        }
        .back-to-lobby-btn svg {
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }
        .back-to-lobby-btn:hover svg {
          transform: translateX(-2px);
        }
        @media (max-width: 768px) {
          .back-to-lobby-bar {
            padding: 6px 12px 0;
          }
          .back-to-lobby-btn {
            font-size: 12px;
            padding: 6px 12px 6px 8px;
          }
        }
      `}</style>
    </div>
  );
}
