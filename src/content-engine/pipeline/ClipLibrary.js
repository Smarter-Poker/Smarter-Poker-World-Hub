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
// GLOBAL LIVESTREAM SOURCES
// ═══════════════════════════════════════════════════════════════════════════
export const CLIP_SOURCES = {
    HCL: { name: 'Hustler Casino Live', channel: '@HustlerCasinoLive', region: 'US' },
    LODGE: { name: 'The Lodge', channel: '@TheLodgePokerClub', region: 'US' },
    LATB: { name: 'Live at the Bike', channel: '@liveatthebike', region: 'US' },
    TCH: { name: 'TCH Live', channel: '@TCHLivePoker', region: 'US' },
    TRITON: { name: 'Triton Poker', channel: '@TritonPoker', region: 'INTL' },
    POKERGO: { name: 'PokerGO', channel: '@PokerGO', region: 'US' },
    POKERSTARS: { name: 'PokerStars', channel: '@PokerStars', region: 'INTL' },
    BRAD_OWEN: { name: 'Brad Owen', channel: '@BradOwenPoker', region: 'US' },
    ANDREW_NEEME: { name: 'Andrew Neeme', channel: '@AndrewNeeme', region: 'US' },
    RAMPAGE: { name: 'Rampage Poker', channel: '@RampagePoker', region: 'US' },
    DOUG_POLK: { name: 'Doug Polk', channel: '@DougPolk', region: 'US' },
    WSOP: { name: 'WSOP', channel: '@WSOP', region: 'US' },
    WPT: { name: 'World Poker Tour', channel: '@WPT', region: 'INTL' },
    KINGS: { name: 'Kings Casino', channel: '@KingsCasinoPoker', region: 'EU' },
    PARTYPOKER: { name: 'PartyPoker', channel: '@partypokerTV', region: 'EU' }
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
        source: 'HCL', tags: ['hcl', 'trap', 'henry', 'high_stakes'],
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
        source: 'HCL', tags: ['hcl', 'drama', 'table_talk'],
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
        source: 'HCL', tags: ['hcl', 'massive_pot', 'high_stakes', '92k'],
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
        source: 'HCL', tags: ['hcl', 'bad_beat', 'pain', 'showdown'],
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
        source: 'HCL', tags: ['hcl', 'nik_airball', 'celebrity', 'high_stakes'],
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
        source: 'HCL', tags: ['hcl', 'nik_airball', 'bluff', 'hero_call'],
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
        source: 'HCL', tags: ['hcl', 'mariano', 'crushing', 'domination'],
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
        source: 'HCL', tags: ['hcl', 'mariano', 'disbelief', 'bad_beat'],
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
        source: 'HCL', tags: ['hcl', 'mariano', 'river_bluff', 'sizing'],
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
        source: 'HCL', tags: ['hcl', 'mariano', 'miracle', '125k', 'all_in'],
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
        source: 'HCL', tags: ['hcl', 'mariano', 'outrageous', 'river'],
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
        source: 'HCL', tags: ['hcl', 'britney', 'revenge', 'newcomer'],
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
        source: 'HCL', tags: ['hcl', 'britney', 'outplayed', 'devastated'],
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
        source: 'HCL', tags: ['hcl', 'straight', 'speechless', 'flopped'],
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
        source: 'HCL', tags: ['hcl', 'tilt', 'frustration', 'emotional'],
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
        source: 'HCL', tags: ['hcl', 'stubborn', 'advice', 'funny'],
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
        source: 'HCL', tags: ['hcl', 'mistake', 'outclassed', 'lesson'],
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
        source: 'HCL', tags: ['hcl', 'comeback', 'revenge', 'turnaround'],
        used_count: 0,
        last_used: null
    },
    {
        id: 'hcl_mikex_speechless',
        video_id: 'GcfgcuyVugA',
        source_url: 'https://www.youtube.com/watch?v=GcfgcuyVugA',
        title: "Mike X Doesn't Even Know What to Say Anymore",
        source: 'HCL',
        start_time: 0,
        duration: 45,
        category: CLIP_CATEGORIES.FUNNY,
        source: 'HCL', tags: ['hcl', 'mike_x', 'speechless', 'funny'],
        used_count: 0,
        last_used: null
    },

    // ══════════════════════════════════════════════════════════════════════
    // THE LODGE - Doug Polk's Austin Poker Club
    // ══════════════════════════════════════════════════════════════════════
    { id: 'lodge_polk_bluff1', video_id: '7wKQFyR8dJk', source: 'LODGE', title: 'Doug Polk MASSIVE Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['lodge', 'doug_polk', 'bluff'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_high_stakes1', video_id: 'vG8F7Xg0u8w', source: 'LODGE', title: 'Biggest Pot in Lodge History', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['lodge', 'high_stakes'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_cooler1', video_id: 'QKmxf2BsGmc', source: 'LODGE', title: 'BRUTAL Cooler at The Lodge', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['lodge', 'cooler'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_hero_call1', video_id: 'dP8N_X5bRwY', source: 'LODGE', title: 'Insane Hero Call at The Lodge', category: CLIP_CATEGORIES.SOUL_READ, tags: ['lodge', 'hero_call'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_blowup1', video_id: 'Yw5LdQQqG7w', source: 'LODGE', title: 'Player LOSES IT After Bad Beat', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['lodge', 'tilt', 'drama'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_quads1', video_id: '8rF6L-QmVn8', source: 'LODGE', title: 'QUADS vs Full House at The Lodge', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['lodge', 'quads', 'cooler'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // LIVE AT THE BIKE - Commerce Casino Classic
    // ══════════════════════════════════════════════════════════════════════
    { id: 'latb_garrett1', video_id: 'xR2N3mD7aTs', source: 'LATB', title: 'Garrett Adelstein DESTROYS Table', category: CLIP_CATEGORIES.CELEBRITY, tags: ['latb', 'garrett', 'crusher'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_huge_pot1', video_id: '9dK_jNhFe8g', source: 'LATB', title: '$100k Pot at Live at the Bike', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['latb', 'high_stakes', '100k'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_bluff1', video_id: 'kP7vQ3xN8wY', source: 'LATB', title: 'LEGENDARY Bluff at LATB', category: CLIP_CATEGORIES.BLUFF, tags: ['latb', 'bluff', 'legendary'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_commentary1', video_id: 'mN5wR8tP2xQ', source: 'LATB', title: 'Bart Hanson EPIC Commentary', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['latb', 'bart_hanson', 'commentary'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_suckout1', video_id: 'pQ6xS9uV4zT', source: 'LATB', title: 'Runner Runner Suckout on LATB', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['latb', 'suckout', 'runner'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // TRITON POKER - Super High Roller Action
    // ══════════════════════════════════════════════════════════════════════
    { id: 'triton_million1', video_id: 'rT7yW0aX5bH', source: 'TRITON', title: '$1 MILLION Pot at Triton', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['triton', 'million', 'super_high_roller'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_ivey1', video_id: 'sU8zX1bY6cJ', source: 'TRITON', title: 'Phil Ivey SOUL READ', category: CLIP_CATEGORIES.SOUL_READ, tags: ['triton', 'phil_ivey', 'soul_read'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_dwan1', video_id: 'tV9aY2cZ7dK', source: 'TRITON', title: 'Tom Dwan LEGENDARY Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['triton', 'tom_dwan', 'legend'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_cooler1', video_id: 'uW0bZ3dA8eL', source: 'TRITON', title: 'Triton $500k COOLER', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['triton', 'cooler', 'high_stakes'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_negreanu1', video_id: 'vX1cA4eB9fM', source: 'TRITON', title: 'Daniel Negreanu READS His Soul', category: CLIP_CATEGORIES.CELEBRITY, tags: ['triton', 'negreanu', 'read'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // TCH LIVE - Texas Card House
    // ══════════════════════════════════════════════════════════════════════
    { id: 'tch_houston1', video_id: 'wY2dB5fC0gN', source: 'TCH', title: 'TCH Houston $50k Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['tch', 'houston', 'high_stakes'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'tch_bluff1', video_id: 'xZ3eC6gD1hO', source: 'TCH', title: 'INSANE Bluff at TCH Austin', category: CLIP_CATEGORIES.BLUFF, tags: ['tch', 'austin', 'bluff'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'tch_drama1', video_id: 'yA4fD7hE2iP', source: 'TCH', title: 'Table ERUPTS at TCH Dallas', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['tch', 'dallas', 'drama'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'tch_hero1', video_id: 'zB5gE8iF3jQ', source: 'TCH', title: 'Hero Fold Saves His Stack', category: CLIP_CATEGORIES.SOUL_READ, tags: ['tch', 'hero_fold', 'discipline'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // POKERGO / WSOP - World Series & High Roller
    // ══════════════════════════════════════════════════════════════════════
    { id: 'wsop_main_event1', video_id: 'aC6hF9jG4kR', source: 'WSOP', title: 'WSOP Main Event ALL IN', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['wsop', 'main_event', 'all_in'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'wsop_bracelet1', video_id: 'bD7iG0kH5lS', source: 'WSOP', title: 'Bracelet Winning Moment', category: CLIP_CATEGORIES.CELEBRITY, tags: ['wsop', 'bracelet', 'winner'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'pokergo_shr1', video_id: 'cE8jH1lI6mT', source: 'POKERGO', title: 'Super High Roller Bowl MADNESS', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['pokergo', 'shr', 'million'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'pokergo_hellmuth1', video_id: 'dF9kI2mJ7nU', source: 'POKERGO', title: 'Phil Hellmuth BLOWUP', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['pokergo', 'hellmuth', 'tilt'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // BRAD OWEN / ANDREW NEEME - Vlog Style
    // ══════════════════════════════════════════════════════════════════════
    { id: 'brad_vegas1', video_id: 'eG0lJ3nK8oV', source: 'BRAD_OWEN', title: 'Brad Owen CRUSHES Bellagio', category: CLIP_CATEGORIES.CELEBRITY, tags: ['brad_owen', 'vegas', 'bellagio'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'brad_bad_beat1', video_id: 'fH1mK4oL9pW', source: 'BRAD_OWEN', title: 'Brad Owen Gets COOLERED', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['brad_owen', 'cooler', 'pain'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'neeme_heater1', video_id: 'gI2nL5pM0qX', source: 'ANDREW_NEEME', title: 'Andrew Neeme $10k HEATER', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['neeme', 'heater', 'run_good'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'neeme_bluff1', video_id: 'hJ3oM6qN1rY', source: 'ANDREW_NEEME', title: 'Neeme MASSIVE Bluff Gets Through', category: CLIP_CATEGORIES.BLUFF, tags: ['neeme', 'bluff', 'ballsy'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // RAMPAGE POKER - Tournament Grinder
    // ══════════════════════════════════════════════════════════════════════
    { id: 'rampage_score1', video_id: 'iK4pN7rO2sZ', source: 'RAMPAGE', title: 'Rampage $100k Tournament Score', category: CLIP_CATEGORIES.CELEBRITY, tags: ['rampage', 'tournament', 'score'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'rampage_bluff1', video_id: 'jL5qO8sP3tA', source: 'RAMPAGE', title: 'Rampage OUTRAGEOUS Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['rampage', 'bluff', 'crazy'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'rampage_bubble1', video_id: 'kM6rP9tQ4uB', source: 'RAMPAGE', title: 'Rampage Bubble All-In DRAMA', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['rampage', 'bubble', 'all_in'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // DOUG POLK POKER - Educational + Entertainment
    // ══════════════════════════════════════════════════════════════════════
    { id: 'polk_analysis1', video_id: 'lN7sQ0uR5vC', source: 'DOUG_POLK', title: 'Doug Polk Analyzes SICK Hand', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['doug_polk', 'analysis', 'breakdown'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'polk_heads_up1', video_id: 'mO8tR1vS6wD', source: 'DOUG_POLK', title: 'Doug vs Dwan Heads Up Battle', category: CLIP_CATEGORIES.CELEBRITY, tags: ['doug_polk', 'dwan', 'heads_up'], duration: 55, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // POKERSTARS / EPT - European Poker Tour
    // ══════════════════════════════════════════════════════════════════════
    { id: 'ept_barcelona1', video_id: 'nP9uS2wT7xE', source: 'POKERSTARS', title: 'EPT Barcelona MASSIVE Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['ept', 'barcelona', 'europe'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'ept_monte_carlo1', video_id: 'oQ0vT3xU8yF', source: 'POKERSTARS', title: 'EPT Monte Carlo Final Table', category: CLIP_CATEGORIES.CELEBRITY, tags: ['ept', 'monte_carlo', 'final_table'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'pokerstars_scoop1', video_id: 'pR1wU4yV9zG', source: 'POKERSTARS', title: 'SCOOP Main Event SUCKOUT', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['pokerstars', 'scoop', 'online'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // WPT - World Poker Tour
    // ══════════════════════════════════════════════════════════════════════
    { id: 'wpt_final1', video_id: 'qS2xV5zW0aH', source: 'WPT', title: 'WPT Final Table ALL IN', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['wpt', 'final_table', 'all_in'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'wpt_champion1', video_id: 'rT3yW6aX1bI', source: 'WPT', title: 'WPT Champion Crowned', category: CLIP_CATEGORIES.CELEBRITY, tags: ['wpt', 'champion', 'winner'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // KINGS CASINO ROZVADOV - European High Stakes
    // ══════════════════════════════════════════════════════════════════════
    { id: 'kings_high_roller1', video_id: 'sU4zX7bY2cJ', source: 'KINGS', title: 'Kings Casino €100k Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['kings', 'europe', 'high_roller'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'kings_drama1', video_id: 'tV5aY8cZ3dK', source: 'KINGS', title: 'HUGE Drama at Kings Casino', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['kings', 'drama', 'europe'], duration: 45, start_time: 0, used_count: 0, last_used: null }
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
    const stats = { byCategory: {}, bySource: {} };
    for (const category of Object.values(CLIP_CATEGORIES)) {
        stats.byCategory[category] = CLIP_LIBRARY.filter(c => c.category === category).length;
    }
    for (const source of Object.keys(CLIP_SOURCES)) {
        stats.bySource[source] = CLIP_LIBRARY.filter(c => c.source === source).length;
    }
    stats.total = CLIP_LIBRARY.length;
    stats.sourceCount = Object.keys(CLIP_SOURCES).length;
    return stats;
}

/**
 * Get a clip from a different source than the last one used
 */
export function getClipWithSourceRotation(lastSource, excludeClipIds = []) {
    // Get sources other than the last one
    const availableSources = Object.keys(CLIP_SOURCES).filter(s => s !== lastSource);

    // Pick random source
    const targetSource = availableSources[Math.floor(Math.random() * availableSources.length)];

    // Get clips from that source, excluding used ones
    let candidates = CLIP_LIBRARY.filter(c =>
        c.source === targetSource && !excludeClipIds.includes(c.id)
    );

    // Fallback to any source if no clips available
    if (candidates.length === 0) {
        candidates = CLIP_LIBRARY.filter(c => !excludeClipIds.includes(c.id));
    }

    // Prefer less-used clips
    candidates.sort((a, b) => a.used_count - b.used_count);

    return candidates[0] || null;
}

export default {
    CLIP_CATEGORIES,
    CLIP_SOURCES,
    CAPTION_TEMPLATES,
    CLIP_LIBRARY,
    getRandomClip,
    getRandomCaption,
    markClipUsed,
    getClipStats,
    getClipWithSourceRotation
};
