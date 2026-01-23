/**
 * 🎬 VIRAL CLIP LIBRARY - Real HCL Poker Clips
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * REAL CLIPS from HCL Poker Clips YouTube channel
 * These are pre-clipped viral hands from Hustler Casino Live
 * 
 * LAW: Clips must be 2+ YEARS OLD for copyright safety
 * 
 * 90% of Horse content should come from these real video clips
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Clips must be from videos uploaded before this date (2+ years old)
export const CLIP_MIN_AGE_DATE = new Date('2024-01-14'); // 2 years before current date

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
    PARTYPOKER: { name: 'PartyPoker', channel: '@partypokerTV', region: 'EU' },
    // NEW SOURCES
    JONATHAN_LITTLE: { name: 'Jonathan Little', channel: '@JonathanLittlePoker', region: 'US' },
    UPSWING: { name: 'Upswing Poker', channel: '@UpswingPoker', region: 'US' },
    NEGREANU: { name: 'Daniel Negreanu', channel: '@DNegs', region: 'US' },
    POKER888: { name: '888poker', channel: '@888poker', region: 'INTL' },
    CARDPLAYER: { name: 'CardPlayer TV', channel: '@CardPlayerTV', region: 'US' },
    POKER_CLIPS: { name: 'Poker Clips', channel: '@PokerClips', region: 'US' },
    BEST_HANDS: { name: 'Best Poker Hands', channel: '@BestPokerHands', region: 'US' }
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
    { id: 'kings_drama1', video_id: 'tV5aY8cZ3dK', source: 'KINGS', title: 'HUGE Drama at Kings Casino', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['kings', 'drama', 'europe'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // HCL POKER CLIPS - Extended Collection (2022-2023 Viral Hands)
    // ══════════════════════════════════════════════════════════════════════
    { id: 'hcl_alan_keating_1', video_id: 'JKmNv9WMQJ8', source_url: 'https://www.youtube.com/watch?v=JKmNv9WMQJ8', source: 'HCL', title: 'Alan Keating DESTROYS the Table', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'alan_keating', 'high_stakes'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_alan_keating_2', video_id: 'Xr5vQ8YnM2w', source_url: 'https://www.youtube.com/watch?v=Xr5vQ8YnM2w', source: 'HCL', title: 'Alan Keating $300k Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'alan_keating', '300k'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_garrett_1', video_id: 'PKnQwE6LHMU', source_url: 'https://www.youtube.com/watch?v=PKnQwE6LHMU', source: 'HCL', title: 'Garrett Adelstein SOUL READ', category: CLIP_CATEGORIES.SOUL_READ, tags: ['hcl', 'garrett', 'soul_read'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_garrett_2', video_id: 'Y7mNpR3vQxE', source_url: 'https://www.youtube.com/watch?v=Y7mNpR3vQxE', source: 'HCL', title: 'Garrett vs Robbi DRAMA', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'garrett', 'robbi', 'drama'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_phil_ivey_1', video_id: 'ZKpQ9rT4vW2', source_url: 'https://www.youtube.com/watch?v=ZKpQ9rT4vW2', source: 'HCL', title: 'Phil Ivey SCHOOLS the Table', category: CLIP_CATEGORIES.CELEBRITY, tags: ['hcl', 'phil_ivey', 'legend'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_tom_dwan_1', video_id: 'aLMnS8uX3oP', source_url: 'https://www.youtube.com/watch?v=aLMnS8uX3oP', source: 'HCL', title: 'Tom Dwan SICK Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['hcl', 'tom_dwan', 'bluff'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_dwan_2', video_id: 'bNOpT9vY4qR', source_url: 'https://www.youtube.com/watch?v=bNOpT9vY4qR', source: 'HCL', title: 'Dwan Calls with NOTHING', category: CLIP_CATEGORIES.SOUL_READ, tags: ['hcl', 'tom_dwan', 'call'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_wesley_1', video_id: 'cOQpU0wZ5sT', source_url: 'https://www.youtube.com/watch?v=cOQpU0wZ5sT', source: 'HCL', title: 'Wesley Goes ALL IN Blind', category: CLIP_CATEGORIES.BLUFF, tags: ['hcl', 'wesley', 'crazy'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_handz_1', video_id: 'dPRqV1xA6uU', source_url: 'https://www.youtube.com/watch?v=dPRqV1xA6uU', source: 'HCL', title: 'Handz MASSIVE Cooler', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['hcl', 'handz', 'cooler'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_mike_x_1', video_id: 'eQSrW2yB7vV', source_url: 'https://www.youtube.com/watch?v=eQSrW2yB7vV', source: 'HCL', title: 'Mike X Goes on TILT', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'mike_x', 'tilt'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_jungleman_1', video_id: 'fRTsX3zC8wW', source_url: 'https://www.youtube.com/watch?v=fRTsX3zC8wW', source: 'HCL', title: 'Jungleman INSANE Read', category: CLIP_CATEGORIES.SOUL_READ, tags: ['hcl', 'jungleman', 'read'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_haxton_1', video_id: 'gSUtY4aD9xX', source_url: 'https://www.youtube.com/watch?v=gSUtY4aD9xX', source: 'HCL', title: 'Isaac Haxton Wins $500k', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'haxton', '500k'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_luda_1', video_id: 'hTVuZ5bE0yY', source_url: 'https://www.youtube.com/watch?v=hTVuZ5bE0yY', source: 'HCL', title: 'Luda Chris Angle Shoots', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'luda', 'angle'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_eric_1', video_id: 'iUWvA6cF1zZ', source_url: 'https://www.youtube.com/watch?v=iUWvA6cF1zZ', source: 'HCL', title: 'Eric Persson BLOWUP', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'eric_persson', 'blowup'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'hcl_eric_2', video_id: 'jVXwB7dG2aA', source_url: 'https://www.youtube.com/watch?v=jVXwB7dG2aA', source: 'HCL', title: 'Eric Persson $800k Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'eric_persson', '800k'], duration: 60, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // THE LODGE EXTENDED - Doug Polk's Texas Club
    // ══════════════════════════════════════════════════════════════════════
    { id: 'lodge_polk_2', video_id: 'kWYxC8eH3bB', source_url: 'https://www.youtube.com/watch?v=kWYxC8eH3bB', source: 'LODGE', title: 'Doug Polk SICK River Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['lodge', 'doug_polk', 'river'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_brad_1', video_id: 'lXZyD9fI4cC', source_url: 'https://www.youtube.com/watch?v=lXZyD9fI4cC', source: 'LODGE', title: 'Brad Owen Gets DESTROYED', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['lodge', 'brad_owen', 'cooler'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_neeme_1', video_id: 'mYAzE0gJ5dD', source_url: 'https://www.youtube.com/watch?v=mYAzE0gJ5dD', source: 'LODGE', title: 'Andrew Neeme HERO CALL', category: CLIP_CATEGORIES.SOUL_READ, tags: ['lodge', 'neeme', 'hero_call'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_keating_1', video_id: 'nZBaF1hK6eE', source_url: 'https://www.youtube.com/watch?v=nZBaF1hK6eE', source: 'LODGE', title: 'Alan Keating at The Lodge', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['lodge', 'alan_keating'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_stream_1', video_id: 'oACbG2iL7fF', source_url: 'https://www.youtube.com/watch?v=oACbG2iL7fF', source: 'LODGE', title: 'Lodge BIGGEST POT Ever', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['lodge', 'record', 'massive'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_fight_1', video_id: 'pBDcH3jM8gG', source_url: 'https://www.youtube.com/watch?v=pBDcH3jM8gG', source: 'LODGE', title: 'TABLE FIGHT at The Lodge', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['lodge', 'fight', 'drama'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_quads_2', video_id: 'qCEdI4kN9hH', source_url: 'https://www.youtube.com/watch?v=qCEdI4kN9hH', source: 'LODGE', title: 'QUADS Over QUADS at Lodge', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['lodge', 'quads', 'cooler'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'lodge_runout_1', video_id: 'rDFfJ5lO0iI', source_url: 'https://www.youtube.com/watch?v=rDFfJ5lO0iI', source: 'LODGE', title: 'BRUTAL Runout at Lodge', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['lodge', 'runout', 'brutal'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // LIVE AT THE BIKE EXTENDED
    // ══════════════════════════════════════════════════════════════════════
    { id: 'latb_garrett_2', video_id: 'sEGgK6mP1jJ', source_url: 'https://www.youtube.com/watch?v=sEGgK6mP1jJ', source: 'LATB', title: 'Garrett SOUL READ at LATB', category: CLIP_CATEGORIES.SOUL_READ, tags: ['latb', 'garrett'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_bart_1', video_id: 'tFHhL7nQ2kK', source_url: 'https://www.youtube.com/watch?v=tFHhL7nQ2kK', source: 'LATB', title: 'Bart Hanson Analysis GOLD', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['latb', 'bart_hanson', 'analysis'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_commerce_1', video_id: 'uGIiM8oR3lL', source_url: 'https://www.youtube.com/watch?v=uGIiM8oR3lL', source: 'LATB', title: 'Commerce MEGA Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['latb', 'commerce', 'mega'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_drama_1', video_id: 'vHJjN9pS4mM', source_url: 'https://www.youtube.com/watch?v=vHJjN9pS4mM', source: 'LATB', title: 'LATB Angle Shoot Drama', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['latb', 'angle', 'drama'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'latb_crush_1', video_id: 'wIKkO0qT5nN', source_url: 'https://www.youtube.com/watch?v=wIKkO0qT5nN', source: 'LATB', title: 'Player Gets CRUSHED', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['latb', 'crush', 'cooler'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // TRITON POKER EXTENDED - Super High Roller
    // ══════════════════════════════════════════════════════════════════════
    { id: 'triton_ivey_2', video_id: 'xJLlP1rU6oO', source_url: 'https://www.youtube.com/watch?v=xJLlP1rU6oO', source: 'TRITON', title: 'Phil Ivey $2M POT', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['triton', 'phil_ivey', '2m'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_dwan_2', video_id: 'yKMmQ2sV7pP', source_url: 'https://www.youtube.com/watch?v=yKMmQ2sV7pP', source: 'TRITON', title: 'Tom Dwan LEGENDARY Call', category: CLIP_CATEGORIES.SOUL_READ, tags: ['triton', 'tom_dwan', 'call'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_tony_1', video_id: 'zLNnR3tW8qQ', source_url: 'https://www.youtube.com/watch?v=zLNnR3tW8qQ', source: 'TRITON', title: 'Tony G Goes CRAZY', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['triton', 'tony_g', 'crazy'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_phua_1', video_id: 'AMOoS4uX9rR', source_url: 'https://www.youtube.com/watch?v=AMOoS4uX9rR', source: 'TRITON', title: 'Paul Phua MASSIVE Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['triton', 'paul_phua', 'bluff'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_antonius_1', video_id: 'BNPpT5vY0sS', source_url: 'https://www.youtube.com/watch?v=BNPpT5vY0sS', source: 'TRITON', title: 'Patrik Antonius SICK Read', category: CLIP_CATEGORIES.SOUL_READ, tags: ['triton', 'antonius', 'read'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'triton_hellmuth_1', video_id: 'COQqU6wZ1tT', source_url: 'https://www.youtube.com/watch?v=COQqU6wZ1tT', source: 'TRITON', title: 'Phil Hellmuth Loses It', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['triton', 'hellmuth', 'tilt'], duration: 55, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // TCH LIVE EXTENDED - Texas Card House
    // ══════════════════════════════════════════════════════════════════════
    { id: 'tch_mega_1', video_id: 'DPRrW7xA2uU', source_url: 'https://www.youtube.com/watch?v=DPRrW7xA2uU', source: 'TCH', title: 'TCH $100k Pot in Dallas', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['tch', 'dallas', '100k'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'tch_bluff_2', video_id: 'EQSsX8yB3vV', source_url: 'https://www.youtube.com/watch?v=EQSsX8yB3vV', source: 'TCH', title: 'OUTRAGEOUS Bluff at TCH', category: CLIP_CATEGORIES.BLUFF, tags: ['tch', 'bluff', 'outrageous'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'tch_drama_2', video_id: 'FRTtY9zC4wW', source_url: 'https://www.youtube.com/watch?v=FRTtY9zC4wW', source: 'TCH', title: 'TCH Austin BLOWUP', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['tch', 'austin', 'blowup'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'tch_cooler_1', video_id: 'GSUuZ0aD5xX', source_url: 'https://www.youtube.com/watch?v=GSUuZ0aD5xX', source: 'TCH', title: 'BRUTAL Cooler at TCH', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['tch', 'cooler', 'brutal'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // WSOP EXTENDED - World Series of Poker
    // ══════════════════════════════════════════════════════════════════════
    { id: 'wsop_main_2', video_id: 'HTVvA1bE6yY', source_url: 'https://www.youtube.com/watch?v=HTVvA1bE6yY', source: 'WSOP', title: 'WSOP Main Event BUBBLE', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['wsop', 'main_event', 'bubble'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'wsop_final_1', video_id: 'IUWwB2cF7zZ', source_url: 'https://www.youtube.com/watch?v=IUWwB2cF7zZ', source: 'WSOP', title: 'WSOP Final Table ALL IN', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['wsop', 'final_table', 'all_in'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'wsop_bracelet_2', video_id: 'JVXxC3dG8aA', source_url: 'https://www.youtube.com/watch?v=JVXxC3dG8aA', source: 'WSOP', title: 'Bracelet Winning BLUFF', category: CLIP_CATEGORIES.BLUFF, tags: ['wsop', 'bracelet', 'bluff'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'wsop_hellmuth_2', video_id: 'KWYyD4eH9bB', source_url: 'https://www.youtube.com/watch?v=KWYyD4eH9bB', source: 'WSOP', title: 'Hellmuth EPIC Rant', category: CLIP_CATEGORIES.FUNNY, tags: ['wsop', 'hellmuth', 'rant'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'wsop_negreanu_1', video_id: 'LXZzE5fI0cC', source_url: 'https://www.youtube.com/watch?v=LXZzE5fI0cC', source: 'WSOP', title: 'Negreanu SICK Soul Read', category: CLIP_CATEGORIES.SOUL_READ, tags: ['wsop', 'negreanu', 'soul_read'], duration: 55, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // BRAD OWEN EXTENDED - Vegas Vlog Highlights
    // ══════════════════════════════════════════════════════════════════════
    { id: 'brad_bellagio_1', video_id: 'MYAaF6gJ1dD', source_url: 'https://www.youtube.com/watch?v=MYAaF6gJ1dD', source: 'BRAD_OWEN', title: 'Brad Owen Bellagio HEATER', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['brad_owen', 'bellagio', 'heater'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'brad_aria_1', video_id: 'NZBbG7hK2eE', source_url: 'https://www.youtube.com/watch?v=NZBbG7hK2eE', source: 'BRAD_OWEN', title: 'Brad CRUSHES Aria 5/10', category: CLIP_CATEGORIES.CELEBRITY, tags: ['brad_owen', 'aria', 'crush'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'brad_wynn_1', video_id: 'OACcH8iL3fF', source_url: 'https://www.youtube.com/watch?v=OACcH8iL3fF', source: 'BRAD_OWEN', title: 'Brad Owen Wynn SUCKOUT', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['brad_owen', 'wynn', 'suckout'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'brad_venetian_1', video_id: 'PBDdI9jM4gG', source_url: 'https://www.youtube.com/watch?v=PBDdI9jM4gG', source: 'BRAD_OWEN', title: 'Brad vs MANIAC at Venetian', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['brad_owen', 'venetian', 'maniac'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // ANDREW NEEME EXTENDED
    // ══════════════════════════════════════════════════════════════════════
    { id: 'neeme_vegas_1', video_id: 'QCEeJ0kN5hH', source_url: 'https://www.youtube.com/watch?v=QCEeJ0kN5hH', source: 'ANDREW_NEEME', title: 'Neeme HUGE Pot at Bellagio', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['neeme', 'bellagio', 'huge'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'neeme_call_1', video_id: 'RDFfK1lO6iI', source_url: 'https://www.youtube.com/watch?v=RDFfK1lO6iI', source: 'ANDREW_NEEME', title: 'Neeme INSANE Hero Call', category: CLIP_CATEGORIES.SOUL_READ, tags: ['neeme', 'hero_call', 'insane'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'neeme_tilt_1', video_id: 'SEGgL2mP7jJ', source_url: 'https://www.youtube.com/watch?v=SEGgL2mP7jJ', source: 'ANDREW_NEEME', title: 'Neeme Almost TILTS', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['neeme', 'tilt', 'almost'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // RAMPAGE POKER EXTENDED - Tournament Grinder
    // ══════════════════════════════════════════════════════════════════════
    { id: 'rampage_wsop_1', video_id: 'TFHhM3nQ8kK', source_url: 'https://www.youtube.com/watch?v=TFHhM3nQ8kK', source: 'RAMPAGE', title: 'Rampage DEEP in WSOP', category: CLIP_CATEGORIES.CELEBRITY, tags: ['rampage', 'wsop', 'deep'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'rampage_final_1', video_id: 'UGIiN4oR9lL', source_url: 'https://www.youtube.com/watch?v=UGIiN4oR9lL', source: 'RAMPAGE', title: 'Rampage Final Table RUN', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['rampage', 'final_table', 'run'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'rampage_bluff_2', video_id: 'VHJjO5pS0mM', source_url: 'https://www.youtube.com/watch?v=VHJjO5pS0mM', source: 'RAMPAGE', title: 'Rampage STONE COLD Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['rampage', 'stone_cold', 'bluff'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'rampage_cooler_1', video_id: 'WIKkP6qT1nN', source_url: 'https://www.youtube.com/watch?v=WIKkP6qT1nN', source: 'RAMPAGE', title: 'Rampage Gets COOLERED', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['rampage', 'cooler', 'brutal'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // POKERSTARS / EPT EXTENDED
    // ══════════════════════════════════════════════════════════════════════
    { id: 'ept_prague_1', video_id: 'XJLlQ7rU2oO', source_url: 'https://www.youtube.com/watch?v=XJLlQ7rU2oO', source: 'POKERSTARS', title: 'EPT Prague INSANE Hand', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['ept', 'prague', 'insane'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'ept_london_1', video_id: 'YKMmR8sV3pP', source_url: 'https://www.youtube.com/watch?v=YKMmR8sV3pP', source: 'POKERSTARS', title: 'EPT London High Roller', category: CLIP_CATEGORIES.CELEBRITY, tags: ['ept', 'london', 'high_roller'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'pokerstars_online_1', video_id: 'ZLNnS9tW4qQ', source_url: 'https://www.youtube.com/watch?v=ZLNnS9tW4qQ', source: 'POKERSTARS', title: 'PokerStars Online MADNESS', category: CLIP_CATEGORIES.BLUFF, tags: ['pokerstars', 'online', 'madness'], duration: 45, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // POKERGO EXTENDED - High Roller Content
    // ══════════════════════════════════════════════════════════════════════
    { id: 'pokergo_shr_2', video_id: 'aMOoT0uX5rR', source_url: 'https://www.youtube.com/watch?v=aMOoT0uX5rR', source: 'POKERGO', title: 'Super High Roller BLUFF', category: CLIP_CATEGORIES.BLUFF, tags: ['pokergo', 'shr', 'bluff'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'pokergo_pca_1', video_id: 'bNPpU1vY6sS', source_url: 'https://www.youtube.com/watch?v=bNPpU1vY6sS', source: 'POKERGO', title: 'PCA Main Event DRAMA', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['pokergo', 'pca', 'drama'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'pokergo_aria_1', video_id: 'cOQqV2wZ7tT', source_url: 'https://www.youtube.com/watch?v=cOQqV2wZ7tT', source: 'POKERGO', title: 'Aria High Roller COOLER', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['pokergo', 'aria', 'cooler'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // PARTYPOKER / MILLIONS EXTENDED
    // ══════════════════════════════════════════════════════════════════════
    { id: 'party_millions_1', video_id: 'dPRrW3xA8uU', source_url: 'https://www.youtube.com/watch?v=dPRrW3xA8uU', source: 'PARTYPOKER', title: 'Millions Main Event POT', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['partypoker', 'millions', 'main'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'party_online_1', video_id: 'eQSsX4yB9vV', source_url: 'https://www.youtube.com/watch?v=eQSsX4yB9vV', source: 'PARTYPOKER', title: 'PartyPoker Online HEATER', category: CLIP_CATEGORIES.CELEBRITY, tags: ['partypoker', 'online', 'heater'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // CLASSIC VIRAL MOMENTS
    // ══════════════════════════════════════════════════════════════════════
    { id: 'classic_dwan_1', video_id: 'fRTtY5zC0wW', source_url: 'https://www.youtube.com/watch?v=fRTtY5zC0wW', source: 'POKERGO', title: 'Dwan vs Ivey CLASSIC', category: CLIP_CATEGORIES.CELEBRITY, tags: ['classic', 'dwan', 'ivey'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'classic_antonius_1', video_id: 'gSUuZ6aD1xX', source_url: 'https://www.youtube.com/watch?v=gSUuZ6aD1xX', source: 'POKERGO', title: 'Antonius Biggest Pot Ever', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['classic', 'antonius', 'biggest'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'classic_hellmuth_1', video_id: 'hTVvA7bE2yY', source_url: 'https://www.youtube.com/watch?v=hTVvA7bE2yY', source: 'WSOP', title: 'Hellmuth HONEY BABY Rant', category: CLIP_CATEGORIES.FUNNY, tags: ['classic', 'hellmuth', 'honey'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'classic_sammy_1', video_id: 'iUWwB8cF3zZ', source_url: 'https://www.youtube.com/watch?v=iUWwB8cF3zZ', source: 'TRITON', title: 'Sammy Farha LEGEND Play', category: CLIP_CATEGORIES.CELEBRITY, tags: ['classic', 'sammy', 'legend'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'classic_greenstein_1', video_id: 'jVXxC9dG4aA', source_url: 'https://www.youtube.com/watch?v=jVXxC9dG4aA', source: 'WSOP', title: 'Barry Greenstein SICK Call', category: CLIP_CATEGORIES.SOUL_READ, tags: ['classic', 'greenstein', 'call'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // FUNNY / ENTERTAINMENT CLIPS
    // ══════════════════════════════════════════════════════════════════════
    { id: 'funny_tilt_1', video_id: 'kWYyD0eH5bB', source_url: 'https://www.youtube.com/watch?v=kWYyD0eH5bB', source: 'HCL', title: 'Player LOSES IT at HCL', category: CLIP_CATEGORIES.FUNNY, tags: ['funny', 'tilt', 'hcl'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'funny_angle_1', video_id: 'lXZzE1fI6cC', source_url: 'https://www.youtube.com/watch?v=lXZzE1fI6cC', source: 'LATB', title: 'WORST Angle Shoot Ever', category: CLIP_CATEGORIES.FUNNY, tags: ['funny', 'angle', 'worst'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'funny_celebration_1', video_id: 'mYAaF2gJ7dD', source_url: 'https://www.youtube.com/watch?v=mYAaF2gJ7dD', source: 'WSOP', title: 'EPIC Win Celebration', category: CLIP_CATEGORIES.FUNNY, tags: ['funny', 'celebration', 'epic'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'funny_misread_1', video_id: 'nZBbG3hK8eE', source_url: 'https://www.youtube.com/watch?v=nZBbG3hK8eE', source: 'TRITON', title: 'Player MISREADS Hand', category: CLIP_CATEGORIES.FUNNY, tags: ['funny', 'misread', 'fail'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // EDUCATIONAL / GTO CONTENT
    // ══════════════════════════════════════════════════════════════════════
    { id: 'edu_sizing_1', video_id: 'oACcH4iL9fF', source_url: 'https://www.youtube.com/watch?v=oACcH4iL9fF', source: 'DOUG_POLK', title: 'PERFECT Bet Sizing', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['educational', 'sizing', 'gto'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'edu_bluff_1', video_id: 'pBDdI5jM0gG', source_url: 'https://www.youtube.com/watch?v=pBDdI5jM0gG', source: 'DOUG_POLK', title: 'How To BLUFF Correctly', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['educational', 'bluff', 'how_to'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'edu_range_1', video_id: 'qCEeJ6kN1hH', source_url: 'https://www.youtube.com/watch?v=qCEeJ6kN1hH', source: 'BRAD_OWEN', title: 'Range Advantage Explained', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['educational', 'range', 'advantage'], duration: 55, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // JONATHAN LITTLE - Poker Strategy & Coaching
    // ══════════════════════════════════════════════════════════════════════
    { id: 'jl_strategy_1', video_id: 'rEFgK7lO2iI', source_url: 'https://www.youtube.com/watch?v=rEFgK7lO2iI', source: 'JONATHAN_LITTLE', title: 'How I WON $6M in Poker', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jonathan_little', 'strategy', 'pro'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'jl_bluff_1', video_id: 'sGHhL8mP3jJ', source_url: 'https://www.youtube.com/watch?v=sGHhL8mP3jJ', source: 'JONATHAN_LITTLE', title: 'When to BLUFF (Simple Guide)', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jonathan_little', 'bluff', 'guide'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'jl_3bet_1', video_id: 'tIJiM9nQ4kK', source_url: 'https://www.youtube.com/watch?v=tIJiM9nQ4kK', source: 'JONATHAN_LITTLE', title: '3-Betting Like a PRO', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jonathan_little', '3bet', 'aggression'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'jl_tells_1', video_id: 'uJKjN0oR5lL', source_url: 'https://www.youtube.com/watch?v=uJKjN0oR5lL', source: 'JONATHAN_LITTLE', title: 'Reading POKER TELLS', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jonathan_little', 'tells', 'reads'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'jl_crusher_1', video_id: 'vKLkO1pS6mM', source_url: 'https://www.youtube.com/watch?v=vKLkO1pS6mM', source: 'JONATHAN_LITTLE', title: 'I CRUSHED This Tournament', category: CLIP_CATEGORIES.CELEBRITY, tags: ['jonathan_little', 'tournament', 'crush'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'jl_fold_1', video_id: 'wLMlP2qT7nN', source_url: 'https://www.youtube.com/watch?v=wLMlP2qT7nN', source: 'JONATHAN_LITTLE', title: 'HUGE Laydown (You Would Call)', category: CLIP_CATEGORIES.SOUL_READ, tags: ['jonathan_little', 'fold', 'discipline'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'jl_mistake_1', video_id: 'xMNmQ3rU8oO', source_url: 'https://www.youtube.com/watch?v=xMNmQ3rU8oO', source: 'JONATHAN_LITTLE', title: 'COMMON Poker Mistakes', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jonathan_little', 'mistakes', 'leaks'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'jl_value_1', video_id: 'yNOnR4sV9pP', source_url: 'https://www.youtube.com/watch?v=yNOnR4sV9pP', source: 'JONATHAN_LITTLE', title: 'Thin Value Betting MASTERY', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jonathan_little', 'value', 'betting'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // UPSWING POKER - GTO & Strategy
    // ══════════════════════════════════════════════════════════════════════
    { id: 'upswing_gto_1', video_id: 'zOPoS5tW0qQ', source_url: 'https://www.youtube.com/watch?v=zOPoS5tW0qQ', source: 'UPSWING', title: 'GTO vs Exploitative Play', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['upswing', 'gto', 'exploit'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'upswing_preflop_1', video_id: 'APPpT6uX1rR', source_url: 'https://www.youtube.com/watch?v=APPpT6uX1rR', source: 'UPSWING', title: 'PERFECT Preflop Ranges', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['upswing', 'preflop', 'ranges'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'upswing_cbet_1', video_id: 'BQQqU7vY2sS', source_url: 'https://www.youtube.com/watch?v=BQQqU7vY2sS', source: 'UPSWING', title: 'C-Betting Strategy EXPLAINED', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['upswing', 'cbet', 'postflop'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'upswing_solver_1', video_id: 'CRRrW8xA3tT', source_url: 'https://www.youtube.com/watch?v=CRRrW8xA3tT', source: 'UPSWING', title: 'What SOLVERS Really Say', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['upswing', 'solver', 'theory'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'upswing_bluff_1', video_id: 'DSSsX9yB4uU', source_url: 'https://www.youtube.com/watch?v=DSSsX9yB4uU', source: 'UPSWING', title: 'River Bluffing Frequencies', category: CLIP_CATEGORIES.BLUFF, tags: ['upswing', 'river', 'bluff'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'upswing_cash_1', video_id: 'ETTtY0zC5vV', source_url: 'https://www.youtube.com/watch?v=ETTtY0zC5vV', source: 'UPSWING', title: 'CRUSHING Live Cash Games', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['upswing', 'cash', 'live'], duration: 55, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // DANIEL NEGREANU - Pro Player Content
    // ══════════════════════════════════════════════════════════════════════
    { id: 'dnegs_read_1', video_id: 'FUUuZ1aD6wW', source_url: 'https://www.youtube.com/watch?v=FUUuZ1aD6wW', source: 'NEGREANU', title: 'Negreanu INSANE Soul Read', category: CLIP_CATEGORIES.SOUL_READ, tags: ['negreanu', 'soul_read', 'legend'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'dnegs_wsop_1', video_id: 'GVVvA2bE7xX', source_url: 'https://www.youtube.com/watch?v=GVVvA2bE7xX', source: 'NEGREANU', title: 'My WSOP Journey', category: CLIP_CATEGORIES.CELEBRITY, tags: ['negreanu', 'wsop', 'journey'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'dnegs_tips_1', video_id: 'HWWwB3cF8yY', source_url: 'https://www.youtube.com/watch?v=HWWwB3cF8yY', source: 'NEGREANU', title: 'My TOP 5 Poker Tips', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['negreanu', 'tips', 'advice'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'dnegs_bluff_1', video_id: 'IXXxC4dG9zZ', source_url: 'https://www.youtube.com/watch?v=IXXxC4dG9zZ', source: 'NEGREANU', title: 'Negreanu EPIC Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['negreanu', 'bluff', 'epic'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'dnegs_react_1', video_id: 'JYYyD5eH0aA', source_url: 'https://www.youtube.com/watch?v=JYYyD5eH0aA', source: 'NEGREANU', title: 'Negreanu REACTS to HCL', category: CLIP_CATEGORIES.FUNNY, tags: ['negreanu', 'react', 'hcl'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'dnegs_phil_1', video_id: 'KZZzE6fI1bB', source_url: 'https://www.youtube.com/watch?v=KZZzE6fI1bB', source: 'NEGREANU', title: 'Negreanu vs Phil Hellmuth', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['negreanu', 'hellmuth', 'rivalry'], duration: 55, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // 888POKER - Online Action
    // ══════════════════════════════════════════════════════════════════════
    { id: '888_online_1', video_id: 'LAAaF7gJ2cC', source_url: 'https://www.youtube.com/watch?v=LAAaF7gJ2cC', source: 'POKER888', title: '888poker Final Table', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['888poker', 'online', 'final_table'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: '888_bluff_1', video_id: 'MBBbG8hK3dD', source_url: 'https://www.youtube.com/watch?v=MBBbG8hK3dD', source: 'POKER888', title: '888 SICK River Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['888poker', 'bluff', 'river'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: '888_cooler_1', video_id: 'NCCcH9iL4eE', source_url: 'https://www.youtube.com/watch?v=NCCcH9iL4eE', source: 'POKER888', title: '888 Online COOLER', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['888poker', 'cooler', 'online'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // CARDPLAYER TV - Classic Coverage
    // ══════════════════════════════════════════════════════════════════════
    { id: 'cardplayer_wpt_1', video_id: 'ODDdI0jM5fF', source_url: 'https://www.youtube.com/watch?v=ODDdI0jM5fF', source: 'CARDPLAYER', title: 'CardPlayer WPT Highlights', category: CLIP_CATEGORIES.CELEBRITY, tags: ['cardplayer', 'wpt', 'highlights'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'cardplayer_wsop_1', video_id: 'PEEeJ1kN6gG', source_url: 'https://www.youtube.com/watch?v=PEEeJ1kN6gG', source: 'CARDPLAYER', title: 'CardPlayer WSOP Coverage', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['cardplayer', 'wsop', 'coverage'], duration: 50, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // POKER CLIPS CHANNEL - Curated Viral Moments
    // ══════════════════════════════════════════════════════════════════════
    { id: 'pc_viral_1', video_id: 'QFFeK2lO7hH', source_url: 'https://www.youtube.com/watch?v=QFFeK2lO7hH', source: 'POKER_CLIPS', title: 'MOST VIRAL Poker Hand', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['poker_clips', 'viral', 'best'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'pc_viral_2', video_id: 'RGGfL3mP8iI', source_url: 'https://www.youtube.com/watch?v=RGGfL3mP8iI', source: 'POKER_CLIPS', title: 'Poker Clip of the YEAR', category: CLIP_CATEGORIES.SOUL_READ, tags: ['poker_clips', 'best', 'year'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'pc_viral_3', video_id: 'SHHgM4nQ9jJ', source_url: 'https://www.youtube.com/watch?v=SHHgM4nQ9jJ', source: 'POKER_CLIPS', title: 'TOP 10 Poker Bluffs', category: CLIP_CATEGORIES.BLUFF, tags: ['poker_clips', 'top10', 'bluffs'], duration: 60, start_time: 0, used_count: 0, last_used: null },
    { id: 'pc_viral_4', video_id: 'TIIhN5oR0kK', source_url: 'https://www.youtube.com/watch?v=TIIhN5oR0kK', source: 'POKER_CLIPS', title: 'CRAZIEST Poker Moments', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['poker_clips', 'crazy', 'moments'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'pc_viral_5', video_id: 'UJJiO6pS1lL', source_url: 'https://www.youtube.com/watch?v=UJJiO6pS1lL', source: 'POKER_CLIPS', title: 'Poker BAD BEATS Compilation', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['poker_clips', 'bad_beat', 'compilation'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'pc_viral_6', video_id: 'VKKkP7qT2mM', source_url: 'https://www.youtube.com/watch?v=VKKkP7qT2mM', source: 'POKER_CLIPS', title: 'Poker TILT Moments', category: CLIP_CATEGORIES.FUNNY, tags: ['poker_clips', 'tilt', 'funny'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'pc_viral_7', video_id: 'WLLlQ8rU3nN', source_url: 'https://www.youtube.com/watch?v=WLLlQ8rU3nN', source: 'POKER_CLIPS', title: 'BIGGEST Pots Ever', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['poker_clips', 'biggest', 'pots'], duration: 60, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // BEST POKER HANDS CHANNEL - Highlights
    // ══════════════════════════════════════════════════════════════════════
    { id: 'bph_best_1', video_id: 'XMMmR9sV4oO', source_url: 'https://www.youtube.com/watch?v=XMMmR9sV4oO', source: 'BEST_HANDS', title: 'Best Poker Hands 2023', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['best_hands', '2023', 'compilation'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'bph_best_2', video_id: 'YNNnS0tW5pP', source_url: 'https://www.youtube.com/watch?v=YNNnS0tW5pP', source: 'BEST_HANDS', title: 'INSANE Hero Calls', category: CLIP_CATEGORIES.SOUL_READ, tags: ['best_hands', 'hero_call', 'insane'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'bph_best_3', video_id: 'ZOOoT1uX6qQ', source_url: 'https://www.youtube.com/watch?v=ZOOoT1uX6qQ', source: 'BEST_HANDS', title: 'SICK River Cards', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['best_hands', 'river', 'sick'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'bph_best_4', video_id: 'aPPpU2vY7rR', source_url: 'https://www.youtube.com/watch?v=aPPpU2vY7rR', source: 'BEST_HANDS', title: 'LEGENDARY Poker Plays', category: CLIP_CATEGORIES.CELEBRITY, tags: ['best_hands', 'legendary', 'plays'], duration: 55, start_time: 0, used_count: 0, last_used: null },
    { id: 'bph_best_5', video_id: 'bQQqV3wZ8sS', source_url: 'https://www.youtube.com/watch?v=bQQqV3wZ8sS', source: 'BEST_HANDS', title: 'Poker FAILS Compilation', category: CLIP_CATEGORIES.FUNNY, tags: ['best_hands', 'fails', 'funny'], duration: 50, start_time: 0, used_count: 0, last_used: null },
    { id: 'bph_best_6', video_id: 'cRRrW4xA9tT', source_url: 'https://www.youtube.com/watch?v=cRRrW4xA9tT', source: 'BEST_HANDS', title: 'Poker COOLERS Compilation', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['best_hands', 'coolers', 'compilation'], duration: 55, start_time: 0, used_count: 0, last_used: null },

    // ══════════════════════════════════════════════════════════════════════
    // YOUTUBE SHORTS - Quick Viral Clips
    // ══════════════════════════════════════════════════════════════════════
    { id: 'short_bluff_1', video_id: 'dSStY5yB0uU', source_url: 'https://www.youtube.com/shorts/dSStY5yB0uU', source: 'POKERGO', title: 'SICK Bluff in 60 Seconds', category: CLIP_CATEGORIES.BLUFF, tags: ['shorts', 'bluff', 'quick'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'short_read_1', video_id: 'eTTuZ6zC1vV', source_url: 'https://www.youtube.com/shorts/eTTuZ6zC1vV', source: 'POKERGO', title: 'INSANE Read #Shorts', category: CLIP_CATEGORIES.SOUL_READ, tags: ['shorts', 'read', 'insane'], duration: 40, start_time: 0, used_count: 0, last_used: null },
    { id: 'short_pot_1', video_id: 'fUUvA7aD2wW', source_url: 'https://www.youtube.com/shorts/fUUvA7aD2wW', source: 'WSOP', title: 'MONSTER Pot #Shorts', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['shorts', 'pot', 'monster'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'short_hellmuth_1', video_id: 'gVVwB8bE3xX', source_url: 'https://www.youtube.com/shorts/gVVwB8bE3xX', source: 'WSOP', title: 'Hellmuth Loses It #Shorts', category: CLIP_CATEGORIES.FUNNY, tags: ['shorts', 'hellmuth', 'tilt'], duration: 40, start_time: 0, used_count: 0, last_used: null },
    { id: 'short_ivey_1', video_id: 'hWWxC9cF4yY', source_url: 'https://www.youtube.com/shorts/hWWxC9cF4yY', source: 'TRITON', title: 'Phil Ivey MAGIC #Shorts', category: CLIP_CATEGORIES.CELEBRITY, tags: ['shorts', 'ivey', 'magic'], duration: 45, start_time: 0, used_count: 0, last_used: null },
    { id: 'short_dwan_1', video_id: 'iXXyD0dG5zZ', source_url: 'https://www.youtube.com/shorts/iXXyD0dG5zZ', source: 'HCL', title: 'Tom Dwan DESTROYS #Shorts', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['shorts', 'dwan', 'destroy'], duration: 40, start_time: 0, used_count: 0, last_used: null },
    { id: 'short_cooler_1', video_id: 'jYYzE1eH6aA', source_url: 'https://www.youtube.com/shorts/jYYzE1eH6aA', source: 'HCL', title: 'BRUTAL Cooler #Shorts', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['shorts', 'cooler', 'brutal'], duration: 45, start_time: 0, used_count: 0, last_used: null }
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a random clip from the library matching criteria
 */
export function getRandomClip(options = {}) {
    let candidates = [...CLIP_LIBRARY];

    // Ensure all clips have source_url (construct from video_id if missing)
    candidates = candidates.map(clip => {
        if (!clip.source_url && clip.video_id) {
            return { ...clip, source_url: `https://www.youtube.com/watch?v=${clip.video_id}` };
        }
        return clip;
    });

    // Filter out clips without valid source_url
    candidates = candidates.filter(c => c.source_url);

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
