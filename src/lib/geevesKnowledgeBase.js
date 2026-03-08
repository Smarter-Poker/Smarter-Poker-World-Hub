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

// ── Main lookup function ──
export function lookupKnowledgeBase(question) {
    if (!question || question.trim().length < 3) return null;

    let bestMatch = null;
    let bestScore = 0;

    for (const entry of KNOWLEDGE_ENTRIES) {
        const score = scoreEntry(question, entry);
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
