import React from 'react';
import { motion } from 'framer-motion';

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
 */
export default function ClubArenaSkeleton() {
  return (
    <div className="skeleton-container">
      {/* ── STYLES ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .skeleton-container {
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
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }

        .shimmer {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.03) 25%,
            rgba(255, 255, 255, 0.08) 50%,
            rgba(255, 255, 255, 0.03) 75%
          );
          background-size: 1000px 100%;
          animation: shimmer 2s infinite linear;
          border-radius: 8px;
        }

        /* Hero Section */
        .hero-skel {
          width: 100%;
          height: 120px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          padding: 0 32px;
          gap: 24px;
        }

        .hero-icon-skel { width: 64px; height: 64px; border-radius: 50%; }
        .hero-text-skel { flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .hero-title-skel { width: 40%; height: 32px; border-radius: 6px; }
        .hero-sub-skel { width: 25%; height: 16px; border-radius: 4px; }

        /* Filter Bar Section */
        .filter-skel {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }

        .search-skel { width: 250px; height: 40px; border-radius: 12px; }
        
        .tabs-skel { display: flex; gap: 12px; }
        .tab-btn-skel { width: 90px; height: 36px; border-radius: 18px; }

        /* Tables Grid */
        .grid-header-skel { width: 120px; height: 28px; border-radius: 6px; margin-bottom: 16px; }

        .tables-grid-skel {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .table-card-skel {
          height: 180px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.03);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .tc-header { display: flex; justify-content: space-between; align-items: center; }
        .tc-title { width: 50%; height: 24px; }
        .tc-badge { width: 60px; height: 24px; border-radius: 12px; }

        .tc-middle { display: flex; gap: 16px; align-items: center; flex: 1; }
        .tc-avatar { width: 48px; height: 48px; border-radius: 50%; }
        .tc-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .tc-line-1 { width: 80%; height: 12px; }
        .tc-line-2 { width: 60%; height: 12px; }

        .tc-bottom { width: 100%; height: 36px; border-radius: 8px; }
        
        @media (max-width: 768px) {
          .hero-skel { padding: 0 16px; height: 100px; gap: 16px; }
          .hero-icon-skel { width: 48px; height: 48px; }
          .hero-title-skel { width: 60%; }
          .hero-sub-skel { width: 40%; }
          .filter-skel { flex-direction: column; align-items: flex-start; gap: 16px; }
          .search-skel { width: 100%; }
        }
      `}} />

      {/* ── HERO SECTION ── */}
      <div className="hero-skel shimmer">
        <div className="hero-icon-skel shimmer" style={{ background: 'rgba(255, 255, 255, 0.08)' }} />
        <div className="hero-text-skel">
          <div className="hero-title-skel shimmer" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />
          <div className="hero-sub-skel shimmer" style={{ background: 'rgba(255, 255, 255, 0.04)' }} />
        </div>
      </div>

      {/* ── FILTER BAR ── */}
      <div className="filter-skel">
        <div className="search-skel shimmer" />
        <div className="tabs-skel">
          <div className="tab-btn-skel shimmer" />
          <div className="tab-btn-skel shimmer" />
          <div className="tab-btn-skel shimmer" style={{ opacity: 0.5 }} />
        </div>
      </div>

      {/* ── TABLES GRID ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="grid-header-skel shimmer" />
        <div className="tables-grid-skel">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="table-card-skel shimmer">
              <div className="tc-header">
                <div className="tc-title shimmer" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />
                <div className="tc-badge shimmer" style={{ background: 'rgba(255, 255, 255, 0.04)' }} />
              </div>
              <div className="tc-middle">
                <div className="tc-avatar shimmer" style={{ background: 'rgba(255, 255, 255, 0.05)' }} />
                <div className="tc-lines">
                  <div className="tc-line-1 shimmer" style={{ background: 'rgba(255, 255, 255, 0.04)' }} />
                  <div className="tc-line-2 shimmer" style={{ background: 'rgba(255, 255, 255, 0.03)' }} />
                </div>
              </div>
              <div className="tc-bottom shimmer" style={{ background: 'rgba(255, 255, 255, 0.05)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
