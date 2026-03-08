/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES LOCAL KNOWLEDGE BASE — Matching Engine
   
   3-Tier Pipeline: Local KB (FREE) → Cache (FREE) → Grok (PAID)
   This module handles Tier 1: instant, zero-cost answers.
   ═══════════════════════════════════════════════════════════════════════════ */

import { KNOWLEDGE_ENTRIES } from './geevesKB/geevesKnowledgeEntries';

// ── Normalize input for matching ──
function normalize(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

// ── Score a question against a KB entry ──
function scoreEntry(question, entry) {
    const q = normalize(question);
    let score = 0;

    // 1. Exact pattern match (highest priority)
    for (const pattern of entry.patterns || []) {
        const p = normalize(pattern);
        if (q === p) return 100; // Perfect match
        if (q.includes(p) || p.includes(q)) score += 60;
    }

    // 2. Keyword matching (weighted)
    const words = q.split(' ');
    const keywordHits = (entry.keywords || []).filter(kw => {
        const k = normalize(kw);
        return q.includes(k) || words.some(w => w === k);
    });
    score += keywordHits.length * 15;

    // 3. Category-specific boost
    if (entry.category && q.includes(normalize(entry.category))) {
        score += 5;
    }

    return score;
}

// ── Page-to-category mapping for context-aware boosting ──
const PAGE_CONTEXT_MAP = {
    'toke-tracker': ['Toke Tracker', 'Bankroll', 'Financial'],
    'commander': ['Club Commander', 'Tournament', 'Venue'],
    'club-arena': ['Club Arena', 'Club', 'Gaming'],
    'training': ['Training', 'GTO', 'Strategy'],
    'gto': ['GTO', 'Training', 'Strategy'],
    'bankroll': ['Bankroll', 'Financial', 'Toke Tracker'],
    'trivia': ['Trivia', 'Gaming'],
    'social': ['Social', 'Platform'],
    'sandbox': ['Strategy', 'Training', 'GTO'],
    'diamond': ['Diamond', 'VIP', 'Economy'],
    'tournament': ['Tournament', 'Club Commander'],
};

function getPageCategories(currentPage) {
    if (!currentPage) return [];
    const p = currentPage.toLowerCase();
    for (const [key, cats] of Object.entries(PAGE_CONTEXT_MAP)) {
        if (p.includes(key)) return cats;
    }
    return [];
}

// ── Main lookup function ──
export function lookupKnowledgeBase(question, currentPage) {
    if (!question || question.trim().length < 3) return null;

    const pageCategories = getPageCategories(currentPage);
    let bestMatch = null;
    let bestScore = 0;

    for (const entry of KNOWLEDGE_ENTRIES) {
        let score = scoreEntry(question, entry);

        // Context-aware boost: entries matching the current page category get +15
        if (pageCategories.length > 0 && entry.category) {
            const entryCategory = entry.category.toLowerCase();
            if (pageCategories.some(c => entryCategory.includes(c.toLowerCase()))) {
                score += 15;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = entry;
        }
    }

    // Minimum threshold to return a match (prevents weak false positives)
    if (bestScore < 30) return null;

    return {
        answer: bestMatch.answer,
        category: bestMatch.category,
        followUps: bestMatch.followUps || [],
        confidence: Math.min(bestScore, 100),
        fromLocalKB: true,
        entryId: bestMatch.id,
    };
}

export { KNOWLEDGE_ENTRIES };
