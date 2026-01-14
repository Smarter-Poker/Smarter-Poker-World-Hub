/**
 * 🎬 VIRAL CLIP LIBRARY - Real HCL Poker Clips
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * REAL CLIPS from HCL Poker Clips YouTube channel
 * These are pre-clipped viral hands from Hustler Casino Live
 * 
 * 90% of Horse content should come from these real video clips
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CLIP CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// CAPTION TEMPLATES - Authentic poker player reactions
// ═══════════════════════════════════════════════════════════════════════════
export const CAPTION_TEMPLATES = {
    [CLIP_CATEGORIES.MASSIVE_POT]: [
        "this pot is INSANE 🤯",
        "imagine having this kind of action at your table",
        "i need to find games like this wtf",
        "pot like this would make my year tbh",
        "the casuals dont understand how sick this is"
    ],
    [CLIP_CATEGORIES.BLUFF]: [
        "THE BALLS ON THIS GUY 😂",
        "i could never... actually yeah i could",
        "this is either genius or suicidal",
        "study this hand. memorize it.",
        "ice in his veins fr"
    ],
    [CLIP_CATEGORIES.BAD_BEAT]: [
        "this is why i have PTSD",
        "poker is 100% skill right? RIGHT?",
        "i felt physical pain watching this",
        "showed this to my therapist",
        "imagine running this bad 💀"
    ],
    [CLIP_CATEGORIES.SOUL_READ]: [
        "HE KNEW. HE JUST KNEW.",
        "when your reads are absolutely DIALED",
        "this is what GTO players wish they could do",
        "exploitative poker at its finest",
        "he saw into his soul"
    ],
    [CLIP_CATEGORIES.TABLE_DRAMA]: [
        "the tension at this table 😬",
        "i live for this drama ngl",
        "this is why poker is the best game",
        "awkward??? nah this is CONTENT",
        "when keeping it real goes wrong"
    ],
    [CLIP_CATEGORIES.CELEBRITY]: [
        "legend stuff right here",
        "different breed of player",
        "studying the masters",
        "the GOAT doing GOAT things",
        "take notes"
    ],
    [CLIP_CATEGORIES.FUNNY]: [
        "LMAOOO poker is comedy",
        "i cant breathe 😂😂",
        "saving this forever",
        "this is peak poker content",
        "the laugh i needed today"
    ],
    [CLIP_CATEGORIES.EDUCATIONAL]: [
        "this is actually a great spot to study",
        "pay attention to sizing here",
        "interesting line, thoughts?",
        "what would you do here?",
        "this is +EV content right here"
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// REAL VIRAL CLIPS - From HCL Poker Clips channel
// Downloaded 2026-01-14 - All verified working
// ═══════════════════════════════════════════════════════════════════════════
export const CLIP_LIBRARY = [
    // ══════════════════════════════════════════════════════════════════════
    // TRAPS & SICK PLAYS
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'hcl_trap_henry',
        video_id: 'hrcKuXcRhCc',
        source_url: 'https://www.youtube.com/watch?v=hrcKuXcRhCc',
        title: 'He Set The PERFECT TRAP And Henry Took The Bait',
        start_time: 0,
        duration: 45,  // Clip first 45 seconds
        category: CLIP_CATEGORIES.SOUL_READ,
        tags: ['hcl', 'trap', 'henry', 'high_stakes'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_warn_laugh',
        video_id: 'ecNLi6z8bSk',
        source_url: 'https://www.youtube.com/watch?v=ecNLi6z8bSk',
        title: 'He Had To WARN Him To NEVER Laugh Again After SICK Hand',
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.TABLE_DRAMA,
        tags: ['hcl', 'drama', 'table_talk'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_desperate_92k',
        video_id: '6zCDWw2wskQ',
        source_url: 'https://www.youtube.com/watch?v=6zCDWw2wskQ',
        title: "He's DESPERATE To Avoid Disaster In $92,000 Hand",
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.MASSIVE_POT,
        tags: ['hcl', 'massive_pot', 'high_stakes', '92k'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_pain_genius',
        video_id: 'CTUh5LohLV8',
        source_url: 'https://www.youtube.com/watch?v=CTUh5LohLV8',
        title: "He's In So Much PAIN After The GENIUS Shows His Hand",
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.BAD_BEAT,
        tags: ['hcl', 'bad_beat', 'pain', 'showdown'],
        used_count: 0,
        last_used: null
    },

    // ══════════════════════════════════════════════════════════════════════
    // NIK AIRBALL CONTENT
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'hcl_airball_small',
        video_id: 'ShI-eFe8PLQ',
        source_url: 'https://www.youtube.com/watch?v=ShI-eFe8PLQ',
        title: 'He Knows This Game Is Too Small For Nik Airball',
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.CELEBRITY,
        tags: ['hcl', 'nik_airball', 'celebrity', 'high_stakes'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_airball_hero',
        video_id: 'Wp5G4CDS2Tk',
        source_url: 'https://www.youtube.com/watch?v=Wp5G4CDS2Tk',
        title: 'Nik Airball Thinks He Could Become A Hero With This Play',
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.BLUFF,
        tags: ['hcl', 'nik_airball', 'bluff', 'hero_call'],
        used_count: 0,
        last_used: null
    },

    // ══════════════════════════════════════════════════════════════════════
    // MARIANO CONTENT
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'hcl_mariano_crushing',
        video_id: 'h1YsGpdcf7Y',
        source_url: 'https://www.youtube.com/watch?v=h1YsGpdcf7Y',
        title: "Mariano Is CRUSHING Him While He's Down",
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.MASSIVE_POT,
        tags: ['hcl', 'mariano', 'crushing', 'domination'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_mariano_disbelief',
        video_id: 'aSRhwwXnWtg',
        source_url: 'https://www.youtube.com/watch?v=aSRhwwXnWtg',
        title: "Mariano Cannot Believe What's Happening To Him",
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.BAD_BEAT,
        tags: ['hcl', 'mariano', 'disbelief', 'bad_beat'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_mariano_3x_river',
        video_id: '3ovHEAWhhzg',
        source_url: 'https://www.youtube.com/watch?v=3ovHEAWhhzg',
        title: 'Mariano Raises 3X Pot On The River But...',
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.BLUFF,
        tags: ['hcl', 'mariano', 'river_bluff', 'sizing'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_mariano_miracle',
        video_id: 'ZW14QdHMtKk',
        source_url: 'https://www.youtube.com/watch?v=ZW14QdHMtKk',
        title: 'Mariano Needs a Miracle in This $125,000 Poker Hand',
        start_time: 0,
        duration: 55,
        category: CLIP_CATEGORIES.MASSIVE_POT,
        tags: ['hcl', 'mariano', 'miracle', '125k', 'all_in'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_mariano_outrageous',
        video_id: 'ktO22X37VzE',
        source_url: 'https://www.youtube.com/watch?v=ktO22X37VzE',
        title: 'Mariano Makes An OUTRAGEOUS Play On The River But...',
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.BLUFF,
        tags: ['hcl', 'mariano', 'outrageous', 'river'],
        used_count: 0,
        last_used: null
    },

    // ══════════════════════════════════════════════════════════════════════
    // BRITNEY CONTENT
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'hcl_britney_revenge',
        video_id: '8eG3f0K3eas',
        source_url: 'https://www.youtube.com/watch?v=8eG3f0K3eas',
        title: 'Britney Is Out For REVENGE Against Newcomer Kid In HUGE Pot',
        start_time: 0,
        duration: 55,
        category: CLIP_CATEGORIES.TABLE_DRAMA,
        tags: ['hcl', 'britney', 'revenge', 'newcomer'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_britney_devastated',
        video_id: 'qbVkC0sUTlY',
        source_url: 'https://www.youtube.com/watch?v=qbVkC0sUTlY',
        title: 'Britney Is Devastated After Being OUTPLAYED In Sick Hand',
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.BAD_BEAT,
        tags: ['hcl', 'britney', 'outplayed', 'devastated'],
        used_count: 0,
        last_used: null
    },

    // ══════════════════════════════════════════════════════════════════════
    // MISCELLANEOUS DRAMA & ACTION
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'hcl_straight_speechless',
        video_id: 'B_YCUAq86s8',
        source_url: 'https://www.youtube.com/watch?v=B_YCUAq86s8',
        title: 'He Flopped A Straight But His Opponent Left Him SPEECHLESS',
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.SOUL_READ,
        tags: ['hcl', 'straight', 'speechless', 'flopped'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_couldnt_take',
        video_id: 'IeW8wan12Yo',
        source_url: 'https://www.youtube.com/watch?v=IeW8wan12Yo',
        title: "He Just Couldn't Take It Anymore...",
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.TABLE_DRAMA,
        tags: ['hcl', 'tilt', 'frustration', 'emotional'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_stubborn_save',
        video_id: 't5AWRr9TM74',
        source_url: 'https://www.youtube.com/watch?v=t5AWRr9TM74',
        title: "He Tried Saving Her Money But She's Too Stubborn",
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.FUNNY,
        tags: ['hcl', 'stubborn', 'advice', 'funny'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_never_sat',
        video_id: 'CvhEPtf-GC8',
        source_url: 'https://www.youtube.com/watch?v=CvhEPtf-GC8',
        title: "He Should've Never Sat In This Game",
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.BAD_BEAT,
        tags: ['hcl', 'mistake', 'outclassed', 'lesson'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_destroy_not_done',
        video_id: 'qqHDqxTKY5Q',
        source_url: 'https://www.youtube.com/watch?v=qqHDqxTKY5Q',
        title: "She Thought She Could Destroy Him… But He Wasn't Done",
        start_time: 0,
        duration: 50,
        category: CLIP_CATEGORIES.SOUL_READ,
        tags: ['hcl', 'comeback', 'revenge', 'turnaround'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_mikex_speechless',
        video_id: 'GcfgcuyVugA',
        source_url: 'https://www.youtube.com/watch?v=GcfgcuyVugA',
        title: "Mike X Doesn't Even Know What to Say Anymore",
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.FUNNY,
        tags: ['hcl', 'mike_x', 'speechless', 'funny'],
        used_count: 0,
        last_used: null
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a random clip from the library matching criteria
 */
export function getRandomClip(options = {}) {
    let candidates = [...CLIP_LIBRARY];

    // Filter by category if specified
    if (options.category) {
        candidates = candidates.filter(c => c.category === options.category);
    }

    // Filter by tags if specified
    if (options.tags && options.tags.length > 0) {
        candidates = candidates.filter(c =>
            options.tags.some(tag => c.tags.includes(tag))
        );
    }

    // Exclude recently used clips
    if (options.excludeUsedWithin) {
        const cutoff = Date.now() - options.excludeUsedWithin;
        candidates = candidates.filter(c =>
            !c.last_used || new Date(c.last_used).getTime() < cutoff
        );
    }

    // Prefer less-used clips
    candidates.sort((a, b) => a.used_count - b.used_count);

    // Take from top 50% least used
    const topHalf = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2)));

    return topHalf[Math.floor(Math.random() * topHalf.length)] || candidates[0];
}

/**
 * Get a random caption for a clip category
 */
export function getRandomCaption(category) {
    const templates = CAPTION_TEMPLATES[category] || CAPTION_TEMPLATES[CLIP_CATEGORIES.FUNNY];
    return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Mark a clip as used (updates in-memory tracking)
 */
export function markClipUsed(clipId) {
    const clip = CLIP_LIBRARY.find(c => c.id === clipId);
    if (clip) {
        clip.used_count++;
        clip.last_used = new Date().toISOString();
    }
}

/**
 * Get clip count by category
 */
export function getClipStats() {
    const stats = {};
    for (const category of Object.values(CLIP_CATEGORIES)) {
        stats[category] = CLIP_LIBRARY.filter(c => c.category === category).length;
    }
    stats.total = CLIP_LIBRARY.length;
    return stats;
}

export default {
    CLIP_CATEGORIES,
    CAPTION_TEMPLATES,
    CLIP_LIBRARY,
    getRandomClip,
    getRandomCaption,
    markClipUsed,
    getClipStats
};
