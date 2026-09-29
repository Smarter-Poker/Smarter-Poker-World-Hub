/**
 * GLOSSARY STUDY TOOL
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Search, filter and save the poker glossary. The definitions come from
 * src/content/glossary/terms.js, the one source of truth; the indexable
 * reference for them is /glossary, so this page canonicals there.
 *
 * Route: /hub/training/glossary
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

// TRAIN-CSS-TOKENS-BATCH5-17 — hex sweep batch 5: literals routed to --sp-* tokens
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { GLOSSARY_TERMS, GLOSSARY_CATEGORIES, glossaryTermPath } from '../../../src/content/glossary/terms';
// TRAIN-WIRE-EMPTY-3c — adoption: shared empty-state primitive


// BUG FIX (TRAIN-GLOSSARY-A11Y-1): SVG icon components replacing emoji
// where they appear in interactive controls: back arrow, search empty
// state, and the per-term favorite star toggle. Same surface-specific
// a11y pattern as PR #320/#322/#324/#327/#328/#329/#330/#331/#332.
const ICON_PROPS = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};
function BackArrowIcon({ size=18 }) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}
function StarToggleIcon({ filled=false, size=14 }) {
  // Filled uses currentColor for both fill+stroke; outline uses stroke only.
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   ONE PAGE PER REAL THING (AEO section 3.4, 2026-09-22). The 50 terms that
   lived here as a local TERMS array moved to src/content/glossary/terms.js,
   were rewritten as 40 to 80 word answer-first definitions and joined by
   the club poker, live room and basics vocabulary. /glossary renders the
   same module as the indexable reference, one server-rendered page per
   term, and carries the DefinedTermSet this page used to ship. Two pages
   showing the same definitions would compete for the same questions, so
   this one is the study tool: it canonicals to /glossary, is not in the
   sitemap, and links every card to its term page.
   ───────────────────────────────────────────────────────────────────────── */
const TERMS = GLOSSARY_TERMS;
const CATS = ['All', ...GLOSSARY_CATEGORIES];

const CAT_COLORS = { 'Club Poker': 'var(--sp-accent-cyan)', 'Live Room': 'var(--sp-accent-amber)', Basics: 'var(--sp-fg-muted)', Preflop: 'var(--sp-accent-blue)', Postflop: 'var(--sp-accent-green)', Math: 'var(--sp-accent-amber)', Theory: 'var(--sp-accent-purple)' };

export default function GlossaryPage() {
  const router = useRouter();
  useTrainingBus('glossary');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [expanded, setExpanded] = useState(null);
  const [favorites, setFavorites] = useState(new Set());

  // Load favorites
  useEffect(() => {
    try {
      const saved = localStorage.getItem('glossary-favorites');
      if (saved) setFavorites(new Set(JSON.parse(saved)));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  }, []);

  // EventBus listener
  useEffect(() => {
    const unsub = eventBus.on(EventType?.SESSION_END || 'session:end', (e) => {
      if (e?.source === 'Glossary') return;
    });
    return unsub;
  }, []);

  const toggleFavorite = (term) => {
    const next = new Set(favorites);
    next.has(term) ? next.delete(term) : next.add(term);
    setFavorites(next);
    try {
      localStorage.setItem('glossary-favorites', JSON.stringify([...next]));
    } catch (e) { console.warn('[App] Handled exception:', e); }
  };

  const filtered = TERMS.filter((t) => {
    if (catFilter !== 'All' && t.category !== catFilter) return false;
    if (
      search &&
      !t.term.toLowerCase().includes(search.toLowerCase()) &&
      !t.definition.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <>
      <SEOHead
        title="Glossary Study Tool: Search And Save Terms"
        description="Search, Filter And Save The Smarter.Poker Poker Glossary While You Train. Every Definition Links To Its Full Entry In The Poker Glossary."
        canonical="/glossary"
      />
      <div
        style={{
          minHeight: '100dvh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'clip', boxSizing: 'border-box',
          background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
          color: 'var(--sp-fg)',
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            aria-label="Back to training"
            onClick={() => router.push('/hub/training')}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              color: 'var(--sp-fg-muted)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* TRAIN-GLOSSARY-A11Y-1: SVG arrow + button hardening */}
            <BackArrowIcon size={18} />
          </button>
          <div>
            {/* TRAIN-GLOSSARY-A11Y-1: semantic h1 */}
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Glossary Study Tool</h1>
            <div style={{ fontSize: 12, color: 'var(--sp-fg-dim)' }}>
              {TERMS.length} Terms · {TERMS.filter((t) => favorites.has(t.term)).length} Saved
            </div>
          </div>
        </div>
        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search terms..."
            aria-label="Search glossary terms"
            type="search"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--sp-fg)',
              fontSize: 13,
              marginBottom: 12,
              fontFamily: 'Inter, sans-serif',
            }}
          />

          {/* Category */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 16 }} role="group" aria-label="Filter Glossary By Category">
            {CATS.map((c) => (
              <motion.button
                key={c}
                type="button"
                aria-pressed={catFilter === c}
                aria-label={`Filter by ${c} terms`}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCatFilter(c)}
                style={{
                  flex: '1 0 auto',
                  padding: '6px',
                  borderRadius: 6,
                  border: `1px solid ${catFilter === c ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                  background: catFilter === c ? 'rgba(0,212,255,0.06)' : 'transparent',
                  color: catFilter === c ? 'var(--sp-accent-cyan)' : 'var(--sp-fg-dim)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {c}
              </motion.button>
            ))}
          </div>

          {/* Results count */}
          {/* TRAIN-GLOSSARY-A11Y-1: live region for filtered count */}
          <div style={{ fontSize: 12, color: 'var(--sp-fg-faint)', marginBottom: 10, paddingLeft: 4 }} role="status" aria-live="polite" aria-atomic="true">
            {filtered.length} Terms
          </div>

          {/* Terms */}
          {filtered.map((t, i) => (
            <motion.div
              key={t.term}
              // A stable anchor per term; the citable URL is the term page.
              id={`term-${t.slug}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.015 }}
              onClick={() => setExpanded(expanded === t.term ? null : t.term)}
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                marginBottom: 4,
                background: 'rgba(0,0,0,0.15)',
                border: `1px solid ${favorites.has(t.term) ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)'}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--sp-fg)', flex: 1, margin: 0 }}>
                  {t.term}
                </h2>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: `${CAT_COLORS[t.category]}12`,
                    color: CAT_COLORS[t.category],
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t.category}
                </span>
                <motion.button
                  type="button"
                  aria-label={favorites.has(t.term) ? `Remove ${t.term} from favorites` : `Add ${t.term} to favorites`}
                  aria-pressed={favorites.has(t.term)}
                  whileTap={{ scale: 0.8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(t.term);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                    display: 'inline-flex',
                    color: favorites.has(t.term) ? 'var(--sp-accent-amber)' : 'var(--sp-fg-faint)',
                  }}
                >
                  {/* TRAIN-GLOSSARY-A11Y-1: SVG StarToggle replaces ★/☆ */}
                  <StarToggleIcon filled={favorites.has(t.term)} size={14} />
                </motion.button>
              </div>
              {expanded === t.term ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div style={{ fontSize: 12, color: 'var(--sp-fg-muted)', lineHeight: 1.6, marginTop: 6 }}>
                    {t.definition}
                  </div>
                </motion.div>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--sp-fg-faint)',
                    lineHeight: 1.4,
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'normal',
                  }}
                >
                  {t.definition}
                </div>
              )}
              <a
                href={glossaryTermPath(t.slug)}
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'inline-block', marginTop: 6, fontSize: 12, color: 'var(--sp-accent-cyan)' }}
              >
                Full Entry: {t.term}
              </a>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="No matching terms"
              message="Try a different search or clear your filters."
              compact
            />
          )}
        </div>
      </div>
    </>
  );
}
