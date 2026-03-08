/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES KNOWLEDGE BASE — Upgraded Matching Engine v2.0
   
   Strategy 3: Partial Match Chaining + Dynamic Threshold
   Strategy 4: Semantic Synonym Expansion
   
   3-Tier Pipeline: Local KB (FREE) → Cache (FREE) → Grok (PAID)
   Goal: Answer ~80% of all questions from Tier 1 (zero cost).
   ═══════════════════════════════════════════════════════════════════════════ */

import { KNOWLEDGE_ENTRIES } from './geevesKB/geevesKnowledgeEntries';
import { buildSynonymIndex } from './geevesKB/synonyms';
import { checkContentGuard, sanitizeAnswer } from './geevesKB/contentGuard';

// ── Build the synonym index once at module load ──
const SYNONYM_INDEX = buildSynonymIndex();

// ── Normalize text for matching ──
function normalize(text) {
    return text.toLowerCase().trim()
        .replace(/['''`]/g, "'")
        .replace(/[^a-z0-9'\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Stem a word to its root (lightweight — handles most poker/platform terms) ──
function stem(word) {
    if (word.length < 4) return word;
    // Common poker phrase patterns
    if (word.endsWith('ing')) return word.slice(0, -3);
    if (word.endsWith('tion')) return word.slice(0, -4);
    if (word.endsWith('ings')) return word.slice(0, -4);
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('es') && word.length > 5) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('er') && word.length > 4) return word.slice(0, -2);
    return word;
}

// ── Get all synonym group indices that appear in a text string ──
function getSynonymGroups(text) {
    const words = normalize(text).split(' ');
    const groups = new Set();

    // Check single words and compound up to 4-word phrases
    for (let i = 0; i < words.length; i++) {
        for (let len = 1; len <= 4 && i + len <= words.length; len++) {
            const phrase = words.slice(i, i + len).join(' ');
            const stemmedPhrase = words.slice(i, i + len).map(stem).join(' ');

            if (SYNONYM_INDEX.has(phrase)) groups.add(SYNONYM_INDEX.get(phrase));
            if (SYNONYM_INDEX.has(stemmedPhrase)) groups.add(SYNONYM_INDEX.get(stemmedPhrase));
        }
    }

    return groups;
}

// ── Score a single entry against a query ──
function scoreEntry(question, entry, questionSynonymGroups) {
    const q = normalize(question);
    const qWords = q.split(' ');
    let score = 0;

    // 1. Exact pattern match (highest priority)
    for (const pattern of (entry.patterns || [])) {
        const p = normalize(pattern);
        if (q === p) return 100;                   // perfect match
        if (q.includes(p)) score += 70;            // question contains pattern
        if (p.includes(q)) score += 55;            // pattern contains question
    }

    // 2. Direct keyword matching (15 pts each)
    const keywordHits = (entry.keywords || []).filter(kw => {
        const k = normalize(kw);
        return q.includes(k) || qWords.some(w => w === k || stem(w) === stem(k));
    });
    score += keywordHits.length * 15;

    // 3. Synonym-expanded keyword matching (10 pts each — slightly less than direct hit)
    if (questionSynonymGroups.size > 0) {
        const entryText = [
            ...(entry.keywords || []),
            entry.category || '',
            ...(entry.patterns || []),
        ].join(' ');
        const entrySynonymGroups = getSynonymGroups(entryText);

        // Any synonym group overlap = semantic match
        for (const group of questionSynonymGroups) {
            if (entrySynonymGroups.has(group)) {
                score += 10;
            }
        }
    }

    // 4. Category boost (5 pts)
    if (entry.category) {
        const entryCategory = normalize(entry.category);
        if (q.includes(entryCategory) || qWords.some(w => entryCategory.includes(w) && w.length > 3)) {
            score += 5;
        }
    }

    // 5. Word-level partial overlap (2 pts per meaningful word)
    if (score < 20) {
        const meaningfulWords = qWords.filter(w => w.length > 3);
        const entryKeywords = (entry.keywords || []).map(normalize);
        for (const qw of meaningfulWords) {
            for (const kw of entryKeywords) {
                if (kw.includes(qw) || qw.includes(kw) || stem(qw) === stem(kw)) {
                    score += 2;
                    break;
                }
            }
        }
    }

    return score;
}

// ── Page-to-category mapping for context-aware boosting ──
const PAGE_CONTEXT_MAP = {
    'toke-tracker': ['Toke Tracker', 'Bankroll', 'Financial'],
    'commander': ['Club Commander', 'Tournament', 'Venue'],
    'club-arena': ['Club Arena', 'Club', 'Gaming'],
    'training': ['Training', 'GTO', 'Strategy'],
    'gto': ['GTO', 'Training', 'Strategy', 'GTO Strategy', 'Poker Math'],
    'bankroll': ['Bankroll Manager', 'Financial', 'Toke Tracker'],
    'trivia': ['Trivia', 'Gaming', 'Diamond Arcade'],
    'social': ['Social', 'Platform'],
    'sandbox': ['Sandbox', 'Strategy', 'Training', 'GTO', 'Poker Math'],
    'diamond': ['Diamond Store', 'VIP', 'Diamond Economy'],
    'tournament': ['Tournament Strategy', 'Club Commander', 'Training'],
    'personal-assistant': ['Sandbox', 'Training', 'GTO Strategy'],
    'poker-near-me': ['Poker Near Me', 'Platform'],
    'bankroll-manager': ['Bankroll Manager', 'Financial'],
    'world-hub': ['World Hub', 'Platform', 'Social'],
};

function getPageCategories(currentPage) {
    if (!currentPage) return [];
    const p = (currentPage || '').toLowerCase();
    for (const [key, cats] of Object.entries(PAGE_CONTEXT_MAP)) {
        if (p.includes(key)) return cats;
    }
    return [];
}

// ── Partial match chaining: combine two complementary entries ──
function tryChainAnswers(topMatches) {
    if (topMatches.length < 2) return null;

    const [first, second] = topMatches;
    // Only chain if both scores are in the "partial hit" range (30-60)
    // and they come from different categories (complementary info)
    if (
        first.score >= 30 && first.score < 65 &&
        second.score >= 25 && second.score < 60 &&
        first.entry.category !== second.entry.category
    ) {
        const combined = {
            answer: `${first.entry.answer}\n\n---\n\n**Also relevant:**\n${second.entry.answer}`,
            category: first.entry.category,
            followUps: [
                ...(first.entry.followUps || []).slice(0, 2),
                ...(second.entry.followUps || []).slice(0, 1),
            ],
            confidence: Math.round((first.score + second.score) / 2),
            fromLocalKB: true,
            chained: true,
            entryId: `${first.entry.id}+${second.entry.id}`,
        };
        return combined;
    }
    return null;
}

// ── Main lookup function ──
export function lookupKnowledgeBase(question, currentPage) {
    if (!question || question.trim().length < 3) return null;

    // ── SECURITY & BRAND GUARD (runs first — before any KB or Grok call) ──
    const guardResult = checkContentGuard(question);
    if (guardResult) return guardResult;

    // Pre-compute synonym groups for the question (done once, reused per entry)
    const questionSynonymGroups = getSynonymGroups(question);
    const pageCategories = getPageCategories(currentPage);

    const scored = [];

    for (const entry of KNOWLEDGE_ENTRIES) {
        let score = scoreEntry(question, entry, questionSynonymGroups);

        // Context-aware boost: +15 if entry matches current page category
        if (pageCategories.length > 0 && entry.category) {
            const entryCategory = entry.category.toLowerCase();
            if (pageCategories.some(c => entryCategory.includes(c.toLowerCase()))) {
                score += 15;
            }
        }

        if (score > 0) {
            scored.push({ score, entry });
        }
    }

    if (scored.length === 0) return null;

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const [best] = scored;

    // ── Dynamic threshold ──
    const STRONG_THRESHOLD = 60;
    const WEAK_THRESHOLD = 30;

    if (best.score >= STRONG_THRESHOLD) {
        return {
            answer: sanitizeAnswer(best.entry.answer),
            category: best.entry.category,
            followUps: best.entry.followUps || [],
            confidence: Math.min(best.score, 100),
            fromLocalKB: true,
            entryId: best.entry.id,
        };
    }

    if (best.score >= WEAK_THRESHOLD) {
        const chained = tryChainAnswers(scored.slice(0, 3));
        if (chained && chained.confidence >= WEAK_THRESHOLD) {
            return { ...chained, answer: sanitizeAnswer(chained.answer) };
        }

        return {
            answer: sanitizeAnswer(best.entry.answer),
            category: best.entry.category,
            followUps: best.entry.followUps || [],
            confidence: Math.min(best.score, 100),
            fromLocalKB: true,
            entryId: best.entry.id,
        };
    }

    // Below threshold — let Grok handle it
    return null;
}

export { KNOWLEDGE_ENTRIES };
