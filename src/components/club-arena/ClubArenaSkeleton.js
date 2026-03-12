import React from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ZERO-JANK SKELETON PRE-LOADER (CLUB ARENA LOBBY)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This component perfectly mimics the layout of `LobbyPage.tsx` in Club Arena.
 * It is displayed instantly while the iframe boots, parses JavaScript, and runs 
 * its initial Apollo/Zustand queries. 
 * 
 * Once the iframe is strictly authenticated and hydrated, it cross-fades out.
 * 
 * NOTE: All class names are prefixed with `ca-sk-` to prevent global CSS
 * collisions with other components that may also use `.shimmer` etc.
 */
export default function ClubArenaSkeleton() {
  return (
    <div className="ca-sk-container">
      {/* ── STYLES ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .ca-sk-container {
          width: 100%;
          height: 100%;
          padding: 16px;
          box-sizing: border-box;
          background: #0B1120; /* Matches Club Arena core background */
          display: flex;
          flex-direction: column;
          gap: 24px;
          overflow: hidden;
        }

        /* Base Shimmer Animation */
        @keyframes ca-sk-shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }

        .ca-sk-shimmer {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.03) 25%,
            rgba(255, 255, 255, 0.08) 50%,
            rgba(255, 255, 255, 0.03) 75%
          );
          background-size: 1000px 100%;
          animation: ca-sk-shimmer 2s infinite linear;
          border-radius: 8px;
        }

        /* Hero Section */
        .ca-sk-hero {
          width: 100%;
          height: 120px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          padding: 0 32px;
          gap: 24px;
        }

        .ca-sk-hero-icon { width: 64px; height: 64px; border-radius: 50%; }
        .ca-sk-hero-text { flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .ca-sk-hero-title { width: 40%; height: 32px; border-radius: 6px; }
        .ca-sk-hero-sub { width: 25%; height: 16px; border-radius: 4px; }

        /* Filter Bar Section */
        .ca-sk-filter {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .ca-sk-search { width: 250px; height: 40px; border-radius: 12px; }
        
        .ca-sk-tabs { display: flex; gap: 12px; }
        .ca-sk-tab-btn { width: 90px; height: 36px; border-radius: 18px; }

        /* Tables Grid */
        .ca-sk-grid-header { width: 120px; height: 28px; border-radius: 6px; margin-bottom: 16px; }

        .ca-sk-tables-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .ca-sk-table-card {
          height: 180px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.03);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .ca-sk-tc-header { display: flex; justify-content: space-between; align-items: center; }
        .ca-sk-tc-title { width: 50%; height: 24px; }
        .ca-sk-tc-badge { width: 60px; height: 24px; border-radius: 12px; }

        .ca-sk-tc-middle { display: flex; gap: 16px; align-items: center; flex: 1; }
        .ca-sk-tc-avatar { width: 48px; height: 48px; border-radius: 50%; }
        .ca-sk-tc-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .ca-sk-tc-line-1 { width: 80%; height: 12px; }
        .ca-sk-tc-line-2 { width: 60%; height: 12px; }

        .ca-sk-tc-bottom { width: 100%; height: 36px; border-radius: 8px; }
        
        @media (max-width: 768px) {
          .ca-sk-hero { padding: 0 16px; height: 100px; gap: 16px; }
          .ca-sk-hero-icon { width: 48px; height: 48px; }
          .ca-sk-hero-title { width: 60%; }
          .ca-sk-hero-sub { width: 40%; }
          .ca-sk-filter { flex-direction: column; align-items: flex-start; gap: 16px; }
          .ca-sk-search { width: 100%; }
        }
      `}} />

      {/* ── HERO SECTION ── */}
      <div className="ca-sk-hero ca-sk-shimmer">
        <div className="ca-sk-hero-icon ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.08)' }} />
        <div className="ca-sk-hero-text">
          <div className="ca-sk-hero-title ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />
          <div className="ca-sk-hero-sub ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.04)' }} />
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="ca-sk-filter">
        <div className="ca-sk-search ca-sk-shimmer" />
        <div className="ca-sk-tabs">
          <div className="ca-sk-tab-btn ca-sk-shimmer" />
          <div className="ca-sk-tab-btn ca-sk-shimmer" />
          <div className="ca-sk-tab-btn ca-sk-shimmer" style={{ opacity: 0.5 }} />
        </div>
      </div>

      {/* ── TABLES GRID ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="ca-sk-grid-header ca-sk-shimmer" />
        <div className="ca-sk-tables-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="ca-sk-table-card ca-sk-shimmer">
              <div className="ca-sk-tc-header">
                <div className="ca-sk-tc-title ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />
                <div className="ca-sk-tc-badge ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.04)' }} />
              </div>
              <div className="ca-sk-tc-middle">
                <div className="ca-sk-tc-avatar ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.05)' }} />
                <div className="ca-sk-tc-lines">
                  <div className="ca-sk-tc-line-1 ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.04)' }} />
                  <div className="ca-sk-tc-line-2 ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.03)' }} />
                </div>
              </div>
              <div className="ca-sk-tc-bottom ca-sk-shimmer" style={{ background: 'rgba(255, 255, 255, 0.05)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
