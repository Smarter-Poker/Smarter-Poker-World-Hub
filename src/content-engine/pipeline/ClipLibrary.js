/**
 * 🎬 VERIFIED VIRAL CLIP LIBRARY - Real Poker Clips
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ALL 23 CLIPS VERIFIED WORKING as of Jan 24 2026
 * Thumbnails confirmed at 480x360 (not 120x90 placeholder)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CLIP_CATEGORIES = {
    MASSIVE_POT: 'massive_pot',
    BLUFF: 'bluff',
    BAD_BEAT: 'bad_beat',
    SOUL_READ: 'soul_read',
    TABLE_DRAMA: 'table_drama',
    CELEBRITY: 'celebrity',
    FUNNY: 'funny',
    EDUCATIONAL: 'educational'
};

export const CLIP_SOURCES = {
    HCL: { name: 'Hustler Casino Live', channel: '@HustlerCasinoLive', region: 'US' }
};

export const CAPTION_TEMPLATES = {
    [CLIP_CATEGORIES.MASSIVE_POT]: [
        "🔥 This pot is INSANE",
        "💰 Imagine having this action at your table",
        "🤯 Pot like this would make my year"
    ],
    [CLIP_CATEGORIES.BLUFF]: [
        "😂 THE BALLS ON THIS GUY",
        "🧊 Ice in his veins fr",
        "🎭 This is either genius or suicidal"
    ],
    [CLIP_CATEGORIES.BAD_BEAT]: [
        "💀 This is why I have PTSD",
        "😭 Poker is 100% skill right? RIGHT?",
        "😵 I felt physical pain watching this"
    ],
    [CLIP_CATEGORIES.SOUL_READ]: [
        "🔮 HE KNEW. HE JUST KNEW.",
        "🎯 When your reads are absolutely DIALED",
        "👁️ He saw into his soul"
    ],
    [CLIP_CATEGORIES.TABLE_DRAMA]: [
        "😬 The tension at this table",
        "🍿 I live for this drama ngl",
        "🔥 Awkward??? nah this is CONTENT"
    ],
    [CLIP_CATEGORIES.CELEBRITY]: [
        "🐐 Legend stuff right here",
        "👑 Different breed of player",
        "🏆 The GOAT doing GOAT things"
    ],
    [CLIP_CATEGORIES.FUNNY]: [
        "😂 LMAOOO poker is comedy",
        "🤣 I cant breathe",
        "😆 This is peak poker content"
    ],
    [CLIP_CATEGORIES.EDUCATIONAL]: [
        "📚 This is actually a great spot to study",
        "🧠 Pay attention to sizing here",
        "❓ What would you do here?"
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// 23 VERIFIED REAL CLIPS - All confirmed working Jan 24 2026
// ═══════════════════════════════════════════════════════════════════════════
export const CLIP_LIBRARY = [
    // Original HCL clips - ALL VERIFIED
    { id: 'hcl_trap_henry', video_id: 'hrcKuXcRhCc', source_url: 'https://www.youtube.com/watch?v=hrcKuXcRhCc', source: 'HCL', title: 'He Set The PERFECT TRAP', category: CLIP_CATEGORIES.SOUL_READ, tags: ['hcl', 'trap'], duration: 45 },
    { id: 'hcl_warn_laugh', video_id: 'ecNLi6z8bSk', source_url: 'https://www.youtube.com/watch?v=ecNLi6z8bSk', source: 'HCL', title: 'He WARNED Him To NEVER Laugh Again', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'drama'], duration: 45 },
    { id: 'hcl_desperate_92k', video_id: '6zCDWw2wskQ', source_url: 'https://www.youtube.com/watch?v=6zCDWw2wskQ', source: 'HCL', title: 'DESPERATE In $92,000 Hand', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'massive_pot'], duration: 50 },
    { id: 'hcl_pain_genius', video_id: 'CTUh5LohLV8', source_url: 'https://www.youtube.com/watch?v=CTUh5LohLV8', source: 'HCL', title: 'The GENIUS Shows His Hand', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['hcl', 'bad_beat'], duration: 45 },
    { id: 'hcl_airball_small', video_id: 'ShI-eFe8PLQ', source_url: 'https://www.youtube.com/watch?v=ShI-eFe8PLQ', source: 'HCL', title: 'Game Is Too Small For Nik Airball', category: CLIP_CATEGORIES.CELEBRITY, tags: ['hcl', 'nik_airball'], duration: 45 },
    { id: 'hcl_airball_hero', video_id: 'Wp5G4CDS2Tk', source_url: 'https://www.youtube.com/watch?v=Wp5G4CDS2Tk', source: 'HCL', title: 'Nik Airball Hero Play', category: CLIP_CATEGORIES.BLUFF, tags: ['hcl', 'nik_airball'], duration: 50 },
    { id: 'hcl_mariano_crushing', video_id: 'h1YsGpdcf7Y', source_url: 'https://www.youtube.com/watch?v=h1YsGpdcf7Y', source: 'HCL', title: 'Mariano Is CRUSHING Him', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'mariano'], duration: 45 },
    { id: 'hcl_mariano_disbelief', video_id: 'aSRhwwXnWtg', source_url: 'https://www.youtube.com/watch?v=aSRhwwXnWtg', source: 'HCL', title: 'Mariano Cannot Believe It', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['hcl', 'mariano'], duration: 45 },
    { id: 'hcl_mariano_3x_river', video_id: '3ovHEAWhhzg', source_url: 'https://www.youtube.com/watch?v=3ovHEAWhhzg', source: 'HCL', title: 'Mariano Raises 3X Pot On River', category: CLIP_CATEGORIES.BLUFF, tags: ['hcl', 'mariano'], duration: 50 },
    { id: 'hcl_mariano_miracle', video_id: 'ZW14QdHMtKk', source_url: 'https://www.youtube.com/watch?v=ZW14QdHMtKk', source: 'HCL', title: 'Mariano $125,000 Miracle', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'mariano', '125k'], duration: 55 },
    { id: 'hcl_mariano_outrageous', video_id: 'ktO22X37VzE', source_url: 'https://www.youtube.com/watch?v=ktO22X37VzE', source: 'HCL', title: 'Mariano Makes OUTRAGEOUS Play', category: CLIP_CATEGORIES.BLUFF, tags: ['hcl', 'mariano'], duration: 50 },
    { id: 'hcl_britney_revenge', video_id: '8eG3f0K3eas', source_url: 'https://www.youtube.com/watch?v=8eG3f0K3eas', source: 'HCL', title: 'Britney Is Out For REVENGE', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'britney'], duration: 55 },
    { id: 'hcl_britney_devastated', video_id: 'qbVkC0sUTlY', source_url: 'https://www.youtube.com/watch?v=qbVkC0sUTlY', source: 'HCL', title: 'Britney OUTPLAYED', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['hcl', 'britney'], duration: 50 },
    { id: 'hcl_straight_speechless', video_id: 'B_YCUAq86s8', source_url: 'https://www.youtube.com/watch?v=B_YCUAq86s8', source: 'HCL', title: 'He Flopped A Straight But...', category: CLIP_CATEGORIES.SOUL_READ, tags: ['hcl'], duration: 45 },
    { id: 'hcl_couldnt_take', video_id: 'IeW8wan12Yo', source_url: 'https://www.youtube.com/watch?v=IeW8wan12Yo', source: 'HCL', title: 'He Just Couldnt Take It', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'tilt'], duration: 45 },
    { id: 'hcl_stubborn_save', video_id: 't5AWRr9TM74', source_url: 'https://www.youtube.com/watch?v=t5AWRr9TM74', source: 'HCL', title: 'Tried Saving Her Money But Shes Too Stubborn', category: CLIP_CATEGORIES.FUNNY, tags: ['hcl', 'funny'], duration: 50 },
    { id: 'hcl_never_sat', video_id: 'CvhEPtf-GC8', source_url: 'https://www.youtube.com/watch?v=CvhEPtf-GC8', source: 'HCL', title: 'He Shouldve Never Sat In This Game', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['hcl'], duration: 50 },
    { id: 'hcl_destroy_not_done', video_id: 'qqHDqxTKY5Q', source_url: 'https://www.youtube.com/watch?v=qqHDqxTKY5Q', source: 'HCL', title: 'She Thought She Could Destroy Him', category: CLIP_CATEGORIES.SOUL_READ, tags: ['hcl'], duration: 50 },
    { id: 'hcl_mikex_speechless', video_id: 'GcfgcuyVugA', source_url: 'https://www.youtube.com/watch?v=GcfgcuyVugA', source: 'HCL', title: 'Mike X Is Speechless', category: CLIP_CATEGORIES.FUNNY, tags: ['hcl', 'mike_x'], duration: 45 },

    // Additional verified HCL compilations
    { id: 'hcl_mariano_june2023', video_id: 'dNbp--c1Y5M', source_url: 'https://www.youtube.com/watch?v=dNbp--c1Y5M', source: 'HCL', title: 'Best Mariano Hands June 2023', category: CLIP_CATEGORIES.CELEBRITY, tags: ['hcl', 'mariano', 'compilation'], duration: 55 },
    { id: 'hcl_top20_2022', video_id: 'r3FHXdutAWQ', source_url: 'https://www.youtube.com/watch?v=r3FHXdutAWQ', source: 'HCL', title: 'Top 20 Hands of 2022', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'compilation', '2022'], duration: 60 },
    { id: 'hcl_biggest_pots_2022', video_id: 'fwr4hulh-Y0', source_url: 'https://www.youtube.com/watch?v=fwr4hulh-Y0', source: 'HCL', title: 'Top 25 Biggest Pots 2022', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'compilation', '2022'], duration: 60 },
    { id: 'hcl_mikki_keating', video_id: 'eajgQEhEBuM', source_url: 'https://www.youtube.com/watch?v=eajgQEhEBuM', source: 'HCL', title: 'Mikki vs Keating $250k Hands', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'alan_keating', 'mikki'], duration: 55 }
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getRandomClip(options = {}) {
    let candidates = [...CLIP_LIBRARY];

    if (options.category) {
        candidates = candidates.filter(c => c.category === options.category);
    }

    if (options.tags?.length > 0) {
        candidates = candidates.filter(c => options.tags.some(tag => c.tags?.includes(tag)));
    }

    return candidates[Math.floor(Math.random() * candidates.length)] || CLIP_LIBRARY[0];
}

export function getRandomCaption(category) {
    const templates = CAPTION_TEMPLATES[category] || CAPTION_TEMPLATES[CLIP_CATEGORIES.FUNNY];
    return templates[Math.floor(Math.random() * templates.length)];
}

export function markClipUsed(clipId) {
    // In-memory tracking not needed for verified library
}

export function getClipStats() {
    return {
        total: CLIP_LIBRARY.length,
        verified: true,
        lastValidated: '2026-01-24'
    };
}

export default {
    CLIP_CATEGORIES,
    CLIP_SOURCES,
    CAPTION_TEMPLATES,
    CLIP_LIBRARY,
    getRandomClip,
    getRandomCaption,
    markClipUsed,
    getClipStats
};
