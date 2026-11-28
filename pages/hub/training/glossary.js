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
import { useOnlineStatus } from '../../../src/hooks/useOnlineStatus';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import TrainerEmptyState from '../../../src/components/training/TrainerEmptyState';
import { GLOSSARY_TERMS, GLOSSARY_CATEGORIES, glossaryTermPath } from '../../../src/content/glossary/terms';
import { authedFetch } from '../../../src/lib/authUtils';
import TrainingPageHead from '../../../src/components/training/TrainingPageHead';
import st from '../../../src/styles/training/study-tools.module.css';
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

export default function GlossaryPage() {
  const online = useOnlineStatus();
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
    authedFetch('/api/training/tool-records?tool_id=glossary&limit=5')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const latest = Array.isArray(json?.records)
          ? json.records.find((r) => Array.isArray(r?.payload?.favorites))
          : null;
        if (latest) {
          setFavorites((prev) => {
            const merged = new Set([...(prev || []), ...(latest.payload.favorites || [])]);
            try {
              localStorage.setItem('glossary-favorites', JSON.stringify([...merged]));
            } catch (_) {}
            return merged;
          });
        }
      })
      .catch(() => {});
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
    const list = [...next];
    try {
      localStorage.setItem('glossary-favorites', JSON.stringify(list));
    } catch (e) { console.warn('[App] Handled exception:', e); }
    authedFetch('/api/training/tool-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_id: 'glossary',
        record_key: 'favorites_snapshot',
        record_type: 'favorites_snapshot',
        title: `Glossary Favorites (${list.length})`,
        summary: `Toggled ${term}`,
        payload: { favorites: list },
      }),
    }).catch(() => {});
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
      <div className={st.shell}>
        <TrainingPageHead slug="training-glossary" />
        <div className={st.page}>

          {!online && <p role="status" className={st.notice}>Glossary Terms Are Available Offline.</p>}
          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Terms..."
            aria-label="Search Glossary Terms"
            type="search"
            className={st.input}
          />

          {/* Category */}
          <div className={st.chips} role="group" aria-label="Filter Glossary By Category">
            {CATS.map((c) => (
              <motion.button
                key={c}
                type="button"
                aria-pressed={catFilter === c}
                aria-label={`Filter by ${c} terms`}
                whileTap={{ scale: 0.95 }}
                onClick={() => setCatFilter(c)}
                className="sd-button"
              >
                {c}
              </motion.button>
            ))}
          </div>

          {/* Results count */}
          {/* TRAIN-GLOSSARY-A11Y-1: live region for filtered count */}
          <div className={st.small} role="status" aria-live="polite" aria-atomic="true">
            {filtered.length} Terms
          </div>

          {/* Terms */}
          <div className={st.list}>
          {filtered.map((t, i) => (
            <motion.div
              key={t.term}
              // A stable anchor per term; the citable URL is the term page.
              id={`term-${t.slug}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i, 20) * 0.015 }}
              onClick={() => setExpanded(expanded === t.term ? null : t.term)}
              className={`${st.item} ${st.termCard} ${favorites.has(t.term) ? st.itemActive : ''}`}
            >
              <div className={st.termHead}>
                <h2 className={st.itemTitle}>
                  {t.term}
                </h2>
                <span className={st.tag}>{t.category}</span>
                <motion.button
                  type="button"
                  aria-label={favorites.has(t.term) ? `Remove ${t.term} from favorites` : `Add ${t.term} to favorites`}
                  aria-pressed={favorites.has(t.term)}
                  whileTap={{ scale: 0.8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(t.term);
                  }}
                  className={`sd-button ${st.close}`}
                >
                  {/* TRAIN-GLOSSARY-A11Y-1: SVG StarToggle replaces ★/☆ */}
                  <StarToggleIcon filled={favorites.has(t.term)} size={16} />
                </motion.button>
              </div>
              {expanded === t.term ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <div className={st.copy}>
                    {t.definition}
                  </div>
                </motion.div>
              ) : (
                <div className={`${st.small} ${st.clamp}`}>
                  {t.definition}
                </div>
              )}
              <a
                href={glossaryTermPath(t.slug)}
                onClick={(e) => e.stopPropagation()}
                className={st.link}
              >
                Full Entry: {t.term}
              </a>
            </motion.div>
          ))}
          </div>

          {filtered.length === 0 && (
            <TrainerEmptyState
              variant="no-data"
              title="No Matching Terms"
              message="Try A Different Search Or Clear Your Filters."
              compact
            />
          )}
        </div>
      </div>
    </>
  );
}
