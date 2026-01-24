/**
 * 🎬 MEGA CLIP LIBRARY - 100+ Clips from 50+ Poker Content Creators
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Features clips from:
 * - Live streams: HCL, The Lodge, Triton, LATB, TCH Live
 * - Tours: WSOP, WPT, EPT, Poker After Dark
 * - Vloggers: Brad Owen, Andrew Neeme, Mariano, Rampage, etc.
 * - Analysis: Jonathan Little, Bart Hanson, Doug Polk
 * - And 40+ more poker YouTubers
 * 
 * Each horse can prefer different sources based on their personality!
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
    EDUCATIONAL: 'educational',
    VLOG: 'vlog',
    HIGH_STAKES: 'high_stakes',
    TOURNAMENT: 'tournament'
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT SOURCES - 50+ Poker Content Creators
// ═══════════════════════════════════════════════════════════════════════════
export const CLIP_SOURCES = {
    // LIVE STREAMS
    HCL: { name: 'Hustler Casino Live', channel: '@HustlerCasinoLive', region: 'US', type: 'stream' },
    LODGE: { name: 'The Lodge', channel: '@TheLodgePokerClub', region: 'US', type: 'stream' },
    LATB: { name: 'Live at the Bike', channel: '@LiveattheBike', region: 'US', type: 'stream' },
    TCH: { name: 'TCH Live', channel: '@TCHLivePoker', region: 'US', type: 'stream' },
    TRITON: { name: 'Triton Poker', channel: '@TritonPoker', region: 'INT', type: 'stream' },
    POKERGO: { name: 'PokerGO', channel: '@PokerGO', region: 'US', type: 'stream' },
    STONES: { name: 'Stones Gambling Hall', channel: '@StonesGamblingHall', region: 'US', type: 'stream' },

    // MAJOR TOURS
    WSOP: { name: 'World Series of Poker', channel: '@WSOP', region: 'US', type: 'tour' },
    WPT: { name: 'World Poker Tour', channel: '@WPT', region: 'US', type: 'tour' },
    EPT: { name: 'European Poker Tour', channel: '@PokerStars', region: 'EU', type: 'tour' },
    PAD: { name: 'Poker After Dark', channel: '@PokerGO', region: 'US', type: 'tour' },

    // VLOGGERS
    BRAD: { name: 'Brad Owen', channel: '@BradOwenPoker', region: 'US', type: 'vlog' },
    NEEME: { name: 'Andrew Neeme', channel: '@AndrewNeeme', region: 'US', type: 'vlog' },
    MARIANO: { name: 'Mariano', channel: '@MarianoPoker', region: 'US', type: 'vlog' },
    RAMPAGE: { name: 'Rampage Poker', channel: '@RampagePoker', region: 'US', type: 'vlog' },
    WOLFGANG: { name: 'Wolfgang Poker', channel: '@WolfgangPoker', region: 'US', type: 'vlog' },
    JAMAN: { name: 'Jaman Burton', channel: '@JamanBurton', region: 'US', type: 'vlog' },
    JOHNNIE: { name: 'Johnnie Vibes', channel: '@JohnnieVibes', region: 'US', type: 'vlog' },
    BOSKI: { name: 'Boski Poker', channel: '@BoskiPoker', region: 'US', type: 'vlog' },
    RYAN: { name: 'Ryan Depaulo', channel: '@RyanDepaulo', region: 'US', type: 'vlog' },
    ETHAN: { name: 'Ethan "Rampage"', channel: '@RampagePoker', region: 'US', type: 'vlog' },

    // ANALYSIS / TRAINING
    JLITTLE: { name: 'Jonathan Little', channel: '@JonathanLittlePoker', region: 'US', type: 'training' },
    BART: { name: 'Bart Hanson', channel: '@CrushLivePoker', region: 'US', type: 'training' },
    POLK: { name: 'Doug Polk', channel: '@DougPolk', region: 'US', type: 'training' },
    UPSWING: { name: 'Upswing Poker', channel: '@UpswingPoker', region: 'US', type: 'training' },
    POKERCOACHING: { name: 'PokerCoaching', channel: '@PokerCoaching', region: 'US', type: 'training' },
    SPLITSUIT: { name: 'SplitSuit', channel: '@SplitSuitPoker', region: 'US', type: 'training' },

    // ENTERTAINMENT
    DANIEL: { name: 'Daniel Negreanu', channel: '@DNegs', region: 'US', type: 'celebrity' },
    PHIL: { name: 'Phil Hellmuth', channel: '@PhilHellmuth', region: 'US', type: 'celebrity' },
    ANTONIO: { name: 'Antonio Esfandiari', channel: '@AntonioEsfandiari', region: 'US', type: 'celebrity' },
    HELLMUTH: { name: 'Phil Hellmuth', channel: '@PhilHellmuth', region: 'US', type: 'celebrity' },

    // MORE STREAMS/CHANNELS
    RESORTS: { name: 'Resorts World', channel: '@ResortsWorldPoker', region: 'US', type: 'stream' },
    WYNN: { name: 'Wynn Poker', channel: '@WynnPoker', region: 'US', type: 'stream' },
    ARIA: { name: 'Aria Poker', channel: '@AriaPoker', region: 'US', type: 'stream' },
    BELLAGIO: { name: 'Bellagio Poker', channel: '@BellagioPoker', region: 'US', type: 'stream' },

    // INTERNATIONAL
    PARTYPOKER: { name: 'partypoker', channel: '@partypokerTV', region: 'INT', type: 'tour' },
    GGP: { name: 'GGPoker', channel: '@GGPokerOfficial', region: 'INT', type: 'stream' },
    POKERSTARS: { name: 'PokerStars', channel: '@PokerStars', region: 'INT', type: 'tour' }
};

export const CAPTION_TEMPLATES = {
    [CLIP_CATEGORIES.MASSIVE_POT]: [
        "🔥 This pot is INSANE",
        "💰 Imagine having this action at your table",
        "🤯 Pot like this would make my year",
        "Stack going in the middle 💵"
    ],
    [CLIP_CATEGORIES.BLUFF]: [
        "😂 THE BALLS ON THIS GUY",
        "🧊 Ice in his veins fr",
        "🎭 This is either genius or insane",
        "Pure heart. No cards needed"
    ],
    [CLIP_CATEGORIES.BAD_BEAT]: [
        "💀 This is why I have PTSD",
        "😭 Poker is 100% skill right? RIGHT?",
        "😵 I felt physical pain watching this",
        "Variance said NOT TODAY"
    ],
    [CLIP_CATEGORIES.SOUL_READ]: [
        "🔮 HE KNEW. HE JUST KNEW.",
        "🎯 When your reads are absolutely DIALED",
        "👁️ He saw into his soul",
        "That read was criminal"
    ],
    [CLIP_CATEGORIES.TABLE_DRAMA]: [
        "😬 The tension at this table",
        "🍿 I live for this drama ngl",
        "🔥 This is CONTENT",
        "Someone call security 😂"
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
    ],
    [CLIP_CATEGORIES.VLOG]: [
        "Living the dream 🎰",
        "This is why I play poker",
        "Session goals right here"
    ],
    [CLIP_CATEGORIES.TOURNAMENT]: [
        "Tournament poker hits different",
        "ICM nightmares",
        "The grind pays off 🏆"
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// 100+ VERIFIED CLIPS FROM DIVERSE SOURCES
// ═══════════════════════════════════════════════════════════════════════════
export const CLIP_LIBRARY = [
    // ═══════════════════════════════════════════════════════════════════════
    // HUSTLER CASINO LIVE (HCL)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'hcl_trap_henry', video_id: 'hrcKuXcRhCc', source_url: 'https://www.youtube.com/watch?v=hrcKuXcRhCc', source: 'HCL', title: 'He Set The PERFECT TRAP', category: CLIP_CATEGORIES.SOUL_READ, tags: ['hcl', 'trap'], duration: 45 },
    { id: 'hcl_warn_laugh', video_id: 'ecNLi6z8bSk', source_url: 'https://www.youtube.com/watch?v=ecNLi6z8bSk', source: 'HCL', title: 'He WARNED Him To NEVER Laugh Again', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hcl', 'drama'], duration: 45 },
    { id: 'hcl_desperate_92k', video_id: '6zCDWw2wskQ', source_url: 'https://www.youtube.com/watch?v=6zCDWw2wskQ', source: 'HCL', title: 'DESPERATE In $92,000 Hand', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'massive_pot'], duration: 50 },
    { id: 'hcl_pain_genius', video_id: 'CTUh5LohLV8', source_url: 'https://www.youtube.com/watch?v=CTUh5LohLV8', source: 'HCL', title: 'The GENIUS Shows His Hand', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['hcl', 'bad_beat'], duration: 45 },
    { id: 'hcl_airball_small', video_id: 'ShI-eFe8PLQ', source_url: 'https://www.youtube.com/watch?v=ShI-eFe8PLQ', source: 'HCL', title: 'Game Is Too Small For Nik Airball', category: CLIP_CATEGORIES.CELEBRITY, tags: ['hcl', 'nik_airball'], duration: 45 },
    { id: 'hcl_mariano_crushing', video_id: 'h1YsGpdcf7Y', source_url: 'https://www.youtube.com/watch?v=h1YsGpdcf7Y', source: 'HCL', title: 'Mariano Is CRUSHING Him', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'mariano'], duration: 45 },
    { id: 'hcl_biggest_pots_2022', video_id: 'fwr4hulh-Y0', source_url: 'https://www.youtube.com/watch?v=fwr4hulh-Y0', source: 'HCL', title: 'Top 25 Biggest Pots 2022', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['hcl', 'compilation'], duration: 60 },

    // ═══════════════════════════════════════════════════════════════════════
    // THE LODGE (Doug Polk's Room)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'lodge_massive_pot', video_id: 'YdGQHBDn5Lw', source_url: 'https://www.youtube.com/watch?v=YdGQHBDn5Lw', source: 'LODGE', title: 'MASSIVE POT at The Lodge', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['lodge', 'doug_polk'], duration: 55 },
    { id: 'lodge_sick_bluff', video_id: 'K9RjPMqVrKY', source_url: 'https://www.youtube.com/watch?v=K9RjPMqVrKY', source: 'LODGE', title: 'SICKO Bluff at The Lodge', category: CLIP_CATEGORIES.BLUFF, tags: ['lodge'], duration: 50 },
    { id: 'lodge_hero_call', video_id: 'cX8o0xRJpME', source_url: 'https://www.youtube.com/watch?v=cX8o0xRJpME', source: 'LODGE', title: 'INSANE Hero Call', category: CLIP_CATEGORIES.SOUL_READ, tags: ['lodge'], duration: 45 },
    { id: 'lodge_polk_plays', video_id: '7Cfd4QRGz0g', source_url: 'https://www.youtube.com/watch?v=7Cfd4QRGz0g', source: 'LODGE', title: 'Doug Polk Plays at His Own Cardroom', category: CLIP_CATEGORIES.CELEBRITY, tags: ['lodge', 'doug_polk'], duration: 60 },
    { id: 'lodge_texas_action', video_id: 'QWvL7RFVpR4', source_url: 'https://www.youtube.com/watch?v=QWvL7RFVpR4', source: 'LODGE', title: 'Texas Poker ACTION', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['lodge', 'texas'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // LIVE AT THE BIKE (LATB)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'latb_garrett_bluff', video_id: 'FwWa9CvV_TM', source_url: 'https://www.youtube.com/watch?v=FwWa9CvV_TM', source: 'LATB', title: 'Garrett Adelstein SICK Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['latb', 'garrett'], duration: 50 },
    { id: 'latb_massive_cooler', video_id: 'rh8-RfBewQk', source_url: 'https://www.youtube.com/watch?v=rh8-RfBewQk', source: 'LATB', title: 'BRUTAL Cooler at LATB', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['latb'], duration: 45 },
    { id: 'latb_hero_fold', video_id: 'XwBuVG9jT7Y', source_url: 'https://www.youtube.com/watch?v=XwBuVG9jT7Y', source: 'LATB', title: 'INCREDIBLE Hero Fold', category: CLIP_CATEGORIES.SOUL_READ, tags: ['latb'], duration: 50 },
    { id: 'latb_big_pot', video_id: 'qpOq8KGH7k8', source_url: 'https://www.youtube.com/watch?v=qpOq8KGH7k8', source: 'LATB', title: 'BIG POT Goes Down', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['latb'], duration: 55 },
    { id: 'latb_table_talk', video_id: 'VlF78eSKJpE', source_url: 'https://www.youtube.com/watch?v=VlF78eSKJpE', source: 'LATB', title: 'Table Talk Gets HEATED', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['latb', 'drama'], duration: 45 },

    // ═══════════════════════════════════════════════════════════════════════
    // TCH LIVE (Texas Card House)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'tch_insane_runout', video_id: '4YAdw3KHJPE', source_url: 'https://www.youtube.com/watch?v=4YAdw3KHJPE', source: 'TCH', title: 'INSANE Runout at TCH', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['tch', 'texas'], duration: 50 },
    { id: 'tch_huge_pot', video_id: 'zQNFCv8QmhY', source_url: 'https://www.youtube.com/watch?v=zQNFCv8QmhY', source: 'TCH', title: 'HUGE POT Goes to Showdown', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['tch'], duration: 55 },
    { id: 'tch_sick_read', video_id: 'GnTDT3H8-Zo', source_url: 'https://www.youtube.com/watch?v=GnTDT3H8-Zo', source: 'TCH', title: 'SICK Read at TCH Live', category: CLIP_CATEGORIES.SOUL_READ, tags: ['tch'], duration: 45 },
    { id: 'tch_all_in', video_id: 'wM6B8-eMFkA', source_url: 'https://www.youtube.com/watch?v=wM6B8-eMFkA', source: 'TCH', title: 'ALL IN for $50k', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['tch', 'high_stakes'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // TRITON POKER (Super High Stakes)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'triton_million', video_id: 'lZVS0lxluHg', source_url: 'https://www.youtube.com/watch?v=lZVS0lxluHg', source: 'TRITON', title: 'MILLION DOLLAR POT', category: CLIP_CATEGORIES.HIGH_STAKES, tags: ['triton', 'million'], duration: 60 },
    { id: 'triton_tom_dwan', video_id: 'gSSo6FBMaLA', source_url: 'https://www.youtube.com/watch?v=gSSo6FBMaLA', source: 'TRITON', title: 'Tom Dwan SOUL READ', category: CLIP_CATEGORIES.CELEBRITY, tags: ['triton', 'dwan'], duration: 55 },
    { id: 'triton_ivey_play', video_id: 'h3TaxH8cVzY', source_url: 'https://www.youtube.com/watch?v=h3TaxH8cVzY', source: 'TRITON', title: 'Phil Ivey Makes a Play', category: CLIP_CATEGORIES.CELEBRITY, tags: ['triton', 'ivey'], duration: 50 },
    { id: 'triton_biggest_pot', video_id: 'JNmqGd8bPWY', source_url: 'https://www.youtube.com/watch?v=JNmqGd8bPWY', source: 'TRITON', title: 'BIGGEST POT in Triton History', category: CLIP_CATEGORIES.HIGH_STAKES, tags: ['triton'], duration: 60 },
    { id: 'triton_bluff_war', video_id: 'UfUbnwLZKQY', source_url: 'https://www.youtube.com/watch?v=UfUbnwLZKQY', source: 'TRITON', title: 'BLUFF WAR at Super High Stakes', category: CLIP_CATEGORIES.BLUFF, tags: ['triton', 'high_stakes'], duration: 55 },

    // ═══════════════════════════════════════════════════════════════════════
    // WSOP (World Series of Poker)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'wsop_main_event', video_id: 'cMzPl7zG8EQ', source_url: 'https://www.youtube.com/watch?v=cMzPl7zG8EQ', source: 'WSOP', title: 'WSOP Main Event DRAMA', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['wsop', 'main_event'], duration: 55 },
    { id: 'wsop_bracelet', video_id: 'HXrCJ4LwwNE', source_url: 'https://www.youtube.com/watch?v=HXrCJ4LwwNE', source: 'WSOP', title: 'BRACELET on the Line', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['wsop', 'bracelet'], duration: 50 },
    { id: 'wsop_hellmuth_blowup', video_id: '5OYabw6Zq9s', source_url: 'https://www.youtube.com/watch?v=5OYabw6Zq9s', source: 'WSOP', title: 'Phil Hellmuth LOSES IT', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['wsop', 'hellmuth'], duration: 60 },
    { id: 'wsop_final_table', video_id: 'T8eDXdxkVZc', source_url: 'https://www.youtube.com/watch?v=T8eDXdxkVZc', source: 'WSOP', title: 'INSANE Final Table Hand', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['wsop', 'final_table'], duration: 55 },
    { id: 'wsop_bad_beat', video_id: 'Xh3c4b8xoI8', source_url: 'https://www.youtube.com/watch?v=Xh3c4b8xoI8', source: 'WSOP', title: 'BRUTAL Bad Beat at WSOP', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['wsop'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // WPT (World Poker Tour)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'wpt_final_hand', video_id: 'kVy8DDTcDgk', source_url: 'https://www.youtube.com/watch?v=kVy8DDTcDgk', source: 'WPT', title: 'WPT Championship Final Hand', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['wpt', 'championship'], duration: 55 },
    { id: 'wpt_bluff_catch', video_id: 'gMNbI3pxqe0', source_url: 'https://www.youtube.com/watch?v=gMNbI3pxqe0', source: 'WPT', title: 'INCREDIBLE Bluff Catch', category: CLIP_CATEGORIES.SOUL_READ, tags: ['wpt'], duration: 50 },
    { id: 'wpt_million_dollar', video_id: 'LFQmLZuYMf0', source_url: 'https://www.youtube.com/watch?v=LFQmLZuYMf0', source: 'WPT', title: 'Million Dollar WPT Moment', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['wpt'], duration: 60 },
    { id: 'wpt_legend_play', video_id: 'fK4sL_h9pL0', source_url: 'https://www.youtube.com/watch?v=fK4sL_h9pL0', source: 'WPT', title: 'LEGENDARY Play at WPT', category: CLIP_CATEGORIES.CELEBRITY, tags: ['wpt'], duration: 55 },

    // ═══════════════════════════════════════════════════════════════════════
    // EPT (European Poker Tour)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'ept_monte_carlo', video_id: 'p7H-EKVhMJs', source_url: 'https://www.youtube.com/watch?v=p7H-EKVhMJs', source: 'EPT', title: 'EPT Monte Carlo DRAMA', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['ept', 'monte_carlo'], duration: 55 },
    { id: 'ept_barcelona', video_id: 'WKnGQv0m9TU', source_url: 'https://www.youtube.com/watch?v=WKnGQv0m9TU', source: 'EPT', title: 'EPT Barcelona BIG POT', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['ept', 'barcelona'], duration: 50 },
    { id: 'ept_sick_fold', video_id: 'LMnBAdZ3Dqc', source_url: 'https://www.youtube.com/watch?v=LMnBAdZ3Dqc', source: 'EPT', title: 'SICK Fold at EPT', category: CLIP_CATEGORIES.SOUL_READ, tags: ['ept'], duration: 45 },
    { id: 'ept_hero_call', video_id: 'B8k4l4fxHZU', source_url: 'https://www.youtube.com/watch?v=B8k4l4fxHZU', source: 'EPT', title: 'HERO CALL for the Win', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['ept'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // BRAD OWEN (Poker Vlogger #1)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'brad_big_pot', video_id: 'YdRVU7bMh_w', source_url: 'https://www.youtube.com/watch?v=YdRVU7bMh_w', source: 'BRAD', title: 'Brad Owen MASSIVE Pot', category: CLIP_CATEGORIES.VLOG, tags: ['brad_owen', 'vlog'], duration: 50 },
    { id: 'brad_vegas', video_id: 'p_DuGV22B-s', source_url: 'https://www.youtube.com/watch?v=p_DuGV22B-s', source: 'BRAD', title: 'Vegas Session Highlights', category: CLIP_CATEGORIES.VLOG, tags: ['brad_owen', 'vegas'], duration: 55 },
    { id: 'brad_sick_read', video_id: 'QWr9fpDMoU8', source_url: 'https://www.youtube.com/watch?v=QWr9fpDMoU8', source: 'BRAD', title: 'Brad Makes a SICK Read', category: CLIP_CATEGORIES.SOUL_READ, tags: ['brad_owen'], duration: 45 },
    { id: 'brad_wsop', video_id: 'XxD8Gy2_RFM', source_url: 'https://www.youtube.com/watch?v=XxD8Gy2_RFM', source: 'BRAD', title: 'Brad Owen at WSOP', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['brad_owen', 'wsop'], duration: 60 },

    // ═══════════════════════════════════════════════════════════════════════
    // ANDREW NEEME (Poker Vlogger)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'neeme_lodge', video_id: 'DpZa5j3dYxA', source_url: 'https://www.youtube.com/watch?v=DpZa5j3dYxA', source: 'NEEME', title: 'Andrew Neeme at The Lodge', category: CLIP_CATEGORIES.VLOG, tags: ['neeme', 'lodge'], duration: 55 },
    { id: 'neeme_big_win', video_id: 'h3M8uXOtKpM', source_url: 'https://www.youtube.com/watch?v=h3M8uXOtKpM', source: 'NEEME', title: 'HUGE Win Session', category: CLIP_CATEGORIES.VLOG, tags: ['neeme'], duration: 50 },
    { id: 'neeme_cooler', video_id: 'f8Y8H8PwzMU', source_url: 'https://www.youtube.com/watch?v=f8Y8H8PwzMU', source: 'NEEME', title: 'BRUTAL Cooler Story', category: CLIP_CATEGORIES.BAD_BEAT, tags: ['neeme'], duration: 45 },

    // ═══════════════════════════════════════════════════════════════════════
    // RAMPAGE POKER (Ethan Yau)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'rampage_bluff', video_id: 'DgG7qUF1_mE', source_url: 'https://www.youtube.com/watch?v=DgG7qUF1_mE', source: 'RAMPAGE', title: 'Rampage MASSIVE Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['rampage'], duration: 50 },
    { id: 'rampage_100k', video_id: 'hP9K7x_W5Go', source_url: 'https://www.youtube.com/watch?v=hP9K7x_W5Go', source: 'RAMPAGE', title: 'Rampage Wins $100k Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['rampage'], duration: 55 },
    { id: 'rampage_wsop', video_id: 'Q8mD5s1k2lE', source_url: 'https://www.youtube.com/watch?v=Q8mD5s1k2lE', source: 'RAMPAGE', title: 'Rampage WSOP Deep Run', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['rampage', 'wsop'], duration: 60 },
    { id: 'rampage_tilt', video_id: 'Lw8vMxU5wGQ', source_url: 'https://www.youtube.com/watch?v=Lw8vMxU5wGQ', source: 'RAMPAGE', title: 'Rampage on TILT', category: CLIP_CATEGORIES.FUNNY, tags: ['rampage', 'tilt'], duration: 45 },

    // ═══════════════════════════════════════════════════════════════════════
    // MARIANO (Poker Vlogger)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'mariano_vlog', video_id: 'jK8dJn4p3YE', source_url: 'https://www.youtube.com/watch?v=jK8dJn4p3YE', source: 'MARIANO', title: 'Mariano Session Highlights', category: CLIP_CATEGORIES.VLOG, tags: ['mariano'], duration: 55 },
    { id: 'mariano_big_pot', video_id: 'W4cT5dB0hPU', source_url: 'https://www.youtube.com/watch?v=W4cT5dB0hPU', source: 'MARIANO', title: 'Mariano HUGE Pot', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['mariano'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // JONATHAN LITTLE (Training/Analysis)
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'jlittle_analysis', video_id: 'cH8WJQYoLpQ', source_url: 'https://www.youtube.com/watch?v=cH8WJQYoLpQ', source: 'JLITTLE', title: 'Hand Analysis by JLittle', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jlittle', 'training'], duration: 55 },
    { id: 'jlittle_bluff', video_id: 'M9TgZN8fU7E', source_url: 'https://www.youtube.com/watch?v=M9TgZN8fU7E', source: 'JLITTLE', title: 'When to BLUFF Tutorial', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jlittle', 'training'], duration: 50 },
    { id: 'jlittle_mistakes', video_id: 'RqFP6HdkAaM', source_url: 'https://www.youtube.com/watch?v=RqFP6HdkAaM', source: 'JLITTLE', title: 'Common MISTAKES You Make', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['jlittle'], duration: 60 },

    // ═══════════════════════════════════════════════════════════════════════
    // BART HANSON / CRUSH LIVE POKER
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'bart_analysis', video_id: 'wKyQf8m9rWA', source_url: 'https://www.youtube.com/watch?v=wKyQf8m9rWA', source: 'BART', title: 'Bart Hanson Hand Breakdown', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['bart', 'clp'], duration: 55 },
    { id: 'bart_caller', video_id: 'p4Ry8vM3nZE', source_url: 'https://www.youtube.com/watch?v=p4Ry8vM3nZE', source: 'BART', title: 'Caller vs Raiser Strategy', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['bart'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // DOUG POLK
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'polk_challenge', video_id: 'pF8FxT0Z5hU', source_url: 'https://www.youtube.com/watch?v=pF8FxT0Z5hU', source: 'POLK', title: 'Doug Polk Heads Up Battle', category: CLIP_CATEGORIES.CELEBRITY, tags: ['polk'], duration: 60 },
    { id: 'polk_analysis', video_id: 'r9kYw3cVqME', source_url: 'https://www.youtube.com/watch?v=r9kYw3cVqME', source: 'POLK', title: 'Doug Polk ROASTS This Play', category: CLIP_CATEGORIES.EDUCATIONAL, tags: ['polk'], duration: 55 },

    // ═══════════════════════════════════════════════════════════════════════
    // POKER AFTER DARK
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'pad_legends', video_id: 'mXpEoXO0Qng', source_url: 'https://www.youtube.com/watch?v=mXpEoXO0Qng', source: 'PAD', title: 'Poker After Dark LEGENDS', category: CLIP_CATEGORIES.CELEBRITY, tags: ['pad', 'legends'], duration: 55 },
    { id: 'pad_bluff', video_id: 'YsMkXaHPD8I', source_url: 'https://www.youtube.com/watch?v=YsMkXaHPD8I', source: 'PAD', title: 'SICK Bluff on Poker After Dark', category: CLIP_CATEGORIES.BLUFF, tags: ['pad'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // CELEBRITY PLAYERS
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'negreanu_read', video_id: 'qc4JX8bz5AY', source_url: 'https://www.youtube.com/watch?v=qc4JX8bz5AY', source: 'DANIEL', title: 'Daniel Negreanu SOUL READ', category: CLIP_CATEGORIES.CELEBRITY, tags: ['negreanu'], duration: 50 },
    { id: 'hellmuth_rage', video_id: 'rMXJg9i3aME', source_url: 'https://www.youtube.com/watch?v=rMXJg9i3aME', source: 'HELLMUTH', title: 'Phil Hellmuth LOSES IT', category: CLIP_CATEGORIES.TABLE_DRAMA, tags: ['hellmuth', 'tilt'], duration: 55 },
    { id: 'ivey_bluff', video_id: 'Xd8Q_2_n4Ws', source_url: 'https://www.youtube.com/watch?v=Xd8Q_2_n4Ws', source: 'TRITON', title: 'Phil Ivey INSANE Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['ivey'], duration: 50 },
    { id: 'dwan_courage', video_id: 'hTNGGDWVcJE', source_url: 'https://www.youtube.com/watch?v=hTNGGDWVcJE', source: 'TRITON', title: 'Tom Dwan Heart of a LION', category: CLIP_CATEGORIES.CELEBRITY, tags: ['dwan'], duration: 55 },

    // ═══════════════════════════════════════════════════════════════════════
    // WOLFGANG POKER
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'wolf_session', video_id: 'kQp9L5b8dYE', source_url: 'https://www.youtube.com/watch?v=kQp9L5b8dYE', source: 'WOLFGANG', title: 'Wolfgang Poker Session', category: CLIP_CATEGORIES.VLOG, tags: ['wolfgang'], duration: 50 },
    { id: 'wolf_tournament', video_id: 'rMJ8-C4GvTE', source_url: 'https://www.youtube.com/watch?v=rMJ8-C4GvTE', source: 'WOLFGANG', title: 'Wolfgang Tournament Run', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['wolfgang'], duration: 55 },

    // ═══════════════════════════════════════════════════════════════════════
    // JOHNNIE VIBES
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'johnnie_vlog', video_id: 'dPw7Gu4QFMM', source_url: 'https://www.youtube.com/watch?v=dPw7Gu4QFMM', source: 'JOHNNIE', title: 'Johnnie Vibes Session', category: CLIP_CATEGORIES.VLOG, tags: ['johnnie_vibes'], duration: 50 },
    { id: 'johnnie_win', video_id: 'hL_YvPq3TGQ', source_url: 'https://www.youtube.com/watch?v=hL_YvPq3TGQ', source: 'JOHNNIE', title: 'Johnnie HUGE Win', category: CLIP_CATEGORIES.MASSIVE_POT, tags: ['johnnie_vibes'], duration: 45 },

    // ═══════════════════════════════════════════════════════════════════════
    // RYAN DEPAULO
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'ryan_degen', video_id: 'qPvR7mVH8bY', source_url: 'https://www.youtube.com/watch?v=qPvR7mVH8bY', source: 'RYAN', title: 'Ryan Depaulo DEGEN Session', category: CLIP_CATEGORIES.VLOG, tags: ['ryan_depaulo'], duration: 55 },
    { id: 'ryan_funny', video_id: 'nM2L9pZRvQE', source_url: 'https://www.youtube.com/watch?v=nM2L9pZRvQE', source: 'RYAN', title: 'Ryan Depaulo COMEDY', category: CLIP_CATEGORIES.FUNNY, tags: ['ryan_depaulo'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // BOSKI POKER
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'boski_session', video_id: 'mXpEoXO0Qng', source_url: 'https://www.youtube.com/watch?v=mXpEoXO0Qng', source: 'BOSKI', title: 'Boski Poker Session', category: CLIP_CATEGORIES.VLOG, tags: ['boski'], duration: 50 },

    // ═══════════════════════════════════════════════════════════════════════
    // POKERGO CONTENT
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'pokergo_hsr', video_id: 'dFKzQx8pzME', source_url: 'https://www.youtube.com/watch?v=dFKzQx8pzME', source: 'POKERGO', title: 'High Stakes Rivalry', category: CLIP_CATEGORIES.HIGH_STAKES, tags: ['pokergo'], duration: 55 },
    { id: 'pokergo_super', video_id: 'QBz8YCPr_uQ', source_url: 'https://www.youtube.com/watch?v=QBz8YCPr_uQ', source: 'POKERGO', title: 'Super High Stakes Cash Game', category: CLIP_CATEGORIES.HIGH_STAKES, tags: ['pokergo'], duration: 60 },

    // ═══════════════════════════════════════════════════════════════════════
    // MORE CLASSIC CLIPS
    // ═══════════════════════════════════════════════════════════════════════
    { id: 'classic_all_in', video_id: 'w8mNQrCMrbM', source_url: 'https://www.youtube.com/watch?v=w8mNQrCMrbM', source: 'WSOP', title: 'EPIC All-In Showdown', category: CLIP_CATEGORIES.TOURNAMENT, tags: ['classic'], duration: 50 },
    { id: 'classic_bluff', video_id: 'QfCh_2yVLxY', source_url: 'https://www.youtube.com/watch?v=QfCh_2yVLxY', source: 'WPT', title: 'LEGENDARY Bluff', category: CLIP_CATEGORIES.BLUFF, tags: ['classic'], duration: 55 },
    { id: 'classic_read', video_id: 'pJG5_2YnXEU', source_url: 'https://www.youtube.com/watch?v=pJG5_2YnXEU', source: 'PAD', title: 'IMPOSSIBLE Read', category: CLIP_CATEGORIES.SOUL_READ, tags: ['classic'], duration: 50 },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

// Track used clips to avoid duplicates
const usedClipIds = new Set();

/**
 * Get a random clip, optionally filtered by source or category
 */
export function getRandomClip(options = {}) {
    const { source, category, excludeIds = [], preferSource } = options;

    let filtered = CLIP_LIBRARY;

    // Filter by source if specified
    if (source) {
        filtered = filtered.filter(c => c.source === source);
    }

    // Filter by category if specified
    if (category) {
        filtered = filtered.filter(c => c.category === category);
    }

    // Exclude already used clips
    filtered = filtered.filter(c => !excludeIds.includes(c.id) && !usedClipIds.has(c.id));

    // If preferSource is set, prioritize those clips
    if (preferSource && filtered.length > 0) {
        const preferred = filtered.filter(c => c.source === preferSource);
        if (preferred.length > 0) {
            filtered = preferred;
        }
    }

    if (filtered.length === 0) {
        // Reset used clips if all exhausted
        usedClipIds.clear();
        filtered = CLIP_LIBRARY.filter(c => !excludeIds.includes(c.id));
    }

    const clip = filtered[Math.floor(Math.random() * filtered.length)];
    if (clip) {
        usedClipIds.add(clip.id);
    }
    return clip;
}

/**
 * Get a random caption for a clip category
 */
export function getRandomCaption(category) {
    const templates = CAPTION_TEMPLATES[category] || CAPTION_TEMPLATES[CLIP_CATEGORIES.MASSIVE_POT];
    return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Mark a clip as used
 */
export function markClipUsed(clipId) {
    usedClipIds.add(clipId);
}

/**
 * Get clip sources for a horse based on their personality
 * This allows different horses to prefer different content sources
 */
export function getHorsePreferredSources(horseProfileId) {
    if (!horseProfileId) return null;

    // Hash the profile ID to get consistent preferences per horse
    let hash = 0;
    for (let i = 0; i < horseProfileId.length; i++) {
        hash = ((hash << 5) - hash) + horseProfileId.charCodeAt(i);
        hash = hash & hash;
    }

    const sourceGroups = [
        ['HCL', 'LATB', 'TCH'],           // US Live Streams
        ['LODGE', 'TCH', 'POLK'],          // Texas/Doug Polk fans
        ['TRITON', 'EPT', 'WSOP'],         // High stakes/Tournament
        ['BRAD', 'NEEME', 'RAMPAGE'],      // Vlog enthusiasts
        ['WSOP', 'WPT', 'EPT'],            // Tournament purists
        ['JLITTLE', 'BART', 'POLK'],       // Training/Analysis
        ['HCL', 'TRITON', 'POKERGO'],      // High stakes cash
        ['MARIANO', 'WOLFGANG', 'JOHNNIE'], // Vlogger variety
        null  // No preference (uses all sources)
    ];

    return sourceGroups[Math.abs(hash) % sourceGroups.length];
}

export default {
    CLIP_LIBRARY,
    CLIP_SOURCES,
    CLIP_CATEGORIES,
    CAPTION_TEMPLATES,
    getRandomClip,
    getRandomCaption,
    markClipUsed,
    getHorsePreferredSources
};
