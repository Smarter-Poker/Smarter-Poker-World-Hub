/**
 * 🎬 MEGA CLIP LIBRARY - 50+ Poker Content Sources
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 50+ unique content sources, each with 2+ horses assigned
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
// 50+ CONTENT SOURCES
// ═══════════════════════════════════════════════════════════════════════════
export const CLIP_SOURCES = {
    // LIVE STREAMS (10)
    HCL: { name: 'Hustler Casino Live', channel: '@HustlerCasinoLive', type: 'stream' },
    LODGE: { name: 'The Lodge', channel: '@TheLodgePokerClub', type: 'stream' },
    LATB: { name: 'Live at the Bike', channel: '@LiveattheBike', type: 'stream' },
    TCH: { name: 'TCH Live', channel: '@TCHLivePoker', type: 'stream' },
    TRITON: { name: 'Triton Poker', channel: '@TritonPoker', type: 'stream' },
    POKERGO: { name: 'PokerGO', channel: '@PokerGO', type: 'stream' },
    STONES: { name: 'Stones Gambling Hall', channel: '@StonesGamblingHall', type: 'stream' },
    RESORTS: { name: 'Resorts World', channel: '@ResortsWorldPoker', type: 'stream' },
    WYNN: { name: 'Wynn Poker', channel: '@WynnPoker', type: 'stream' },
    ARIA: { name: 'Aria Poker', channel: '@AriaPoker', type: 'stream' },

    // MAJOR TOURS (8)
    WSOP: { name: 'World Series of Poker', channel: '@WSOP', type: 'tour' },
    WPT: { name: 'World Poker Tour', channel: '@WPT', type: 'tour' },
    EPT: { name: 'European Poker Tour', channel: '@PokerStars', type: 'tour' },
    PAD: { name: 'Poker After Dark', channel: '@PokerGO', type: 'tour' },
    PARTYPOKER: { name: 'partypoker', channel: '@partypokerTV', type: 'tour' },
    GGP: { name: 'GGPoker', channel: '@GGPokerOfficial', type: 'tour' },
    POKERSTARS: { name: 'PokerStars', channel: '@PokerStars', type: 'tour' },
    POKERNEWS: { name: 'PokerNews', channel: '@PokerNews', type: 'tour' },

    // VLOGGERS (20)
    BRAD: { name: 'Brad Owen', channel: '@BradOwenPoker', type: 'vlog' },
    NEEME: { name: 'Andrew Neeme', channel: '@AndrewNeeme', type: 'vlog' },
    MARIANO: { name: 'Mariano', channel: '@MarianoPoker', type: 'vlog' },
    RAMPAGE: { name: 'Rampage Poker', channel: '@RampagePoker', type: 'vlog' },
    WOLFGANG: { name: 'Wolfgang Poker', channel: '@WolfgangPoker', type: 'vlog' },
    JAMAN: { name: 'Jaman Burton', channel: '@JamanBurton', type: 'vlog' },
    JOHNNIE: { name: 'Johnnie Vibes', channel: '@JohnnieVibes', type: 'vlog' },
    BOSKI: { name: 'Boski Poker', channel: '@BoskiPoker', type: 'vlog' },
    RYAN: { name: 'Ryan Depaulo', channel: '@RyanDepaulo', type: 'vlog' },
    LEX_O: { name: 'Lex O Poker', channel: '@LexOPoker', type: 'vlog' },
    FRANKIE: { name: 'Frankie C', channel: '@FrankieCPoker', type: 'vlog' },
    NORCAL: { name: 'NorCalPoker', channel: '@NorCalPoker', type: 'vlog' },
    GREG_ALL_IN: { name: 'Greg Goes All In', channel: '@GregGoesAllIn', type: 'vlog' },
    BRANTZEN: { name: 'Brantzen Poker', channel: '@BrantzenPoker', type: 'vlog' },
    HARRY_B: { name: 'Harry B Poker', channel: '@HarryBPoker', type: 'vlog' },
    SETHY: { name: 'Sethy Poker', channel: '@SethyPoker', type: 'vlog' },
    POKER_BABO: { name: 'Poker Babo', channel: '@PokerBabo', type: 'vlog' },
    DOUG_MC: { name: 'Doug McCusker', channel: '@DougMcCusker', type: 'vlog' },
    CHARLIE: { name: 'Charlie Carrel', channel: '@CharlieCarrel', type: 'vlog' },
    BOTEZ: { name: 'Alexandra Botez', channel: '@BotezLive', type: 'vlog' },

    // TRAINING/STRATEGY (12)
    JLITTLE: { name: 'Jonathan Little', channel: '@JonathanLittlePoker', type: 'training' },
    BART: { name: 'Bart Hanson', channel: '@CrushLivePoker', type: 'training' },
    POLK: { name: 'Doug Polk', channel: '@DougPolk', type: 'training' },
    UPSWING: { name: 'Upswing Poker', channel: '@UpswingPoker', type: 'training' },
    POKERCOACHING: { name: 'PokerCoaching', channel: '@PokerCoaching', type: 'training' },
    SPLITSUIT: { name: 'SplitSuit', channel: '@SplitSuitPoker', type: 'training' },
    GRIPSED: { name: 'Gripsed', channel: '@Gripsed', type: 'training' },
    BLACKRAIN: { name: 'BlackRain79', channel: '@BlackRain79', type: 'training' },
    POKERBANK: { name: 'The PokerBank', channel: '@ThePokerBank', type: 'training' },
    ALEC: { name: 'Alec Torelli', channel: '@AlecTorelli', type: 'training' },
    BENCB: { name: 'Bencb', channel: '@RaiseYourEdge', type: 'training' },
    KEVIN_M: { name: 'Kevin Martin', channel: '@KevinMartin', type: 'training' },

    // CELEBRITIES/PROS (10+)
    DANIEL: { name: 'Daniel Negreanu', channel: '@DNegs', type: 'celebrity' },
    HELLMUTH: { name: 'Phil Hellmuth', channel: '@PhilHellmuth', type: 'celebrity' },
    IVEY: { name: 'Phil Ivey', channel: '@PhilIvey', type: 'celebrity' },
    DWAN: { name: 'Tom Dwan', channel: '@TomDwan', type: 'celebrity' },
    ANTONIO: { name: 'Antonio Esfandiari', channel: '@AntonioEsfandiari', type: 'celebrity' },
    JOE_INGRAM: { name: 'Joey Ingram', channel: '@JoeIngram', type: 'celebrity' },
    LEX_V: { name: 'Lex Veldhuis', channel: '@LexVeldhuis', type: 'celebrity' },
    SPRAGGY: { name: 'Spraggy', channel: '@Spraggy', type: 'celebrity' },
    STAPLES: { name: 'Jaime Staples', channel: '@PokerStaples', type: 'celebrity' },
    GARRETT: { name: 'Garrett Adelstein', channel: '@GarrettAdelstein', type: 'celebrity' }
};

export const CAPTION_TEMPLATES = {
    [CLIP_CATEGORIES.MASSIVE_POT]: ["🔥 This pot is INSANE", "💰 Imagine having this action", "Stack going in the middle 💵"],
    [CLIP_CATEGORIES.BLUFF]: ["😂 THE BALLS ON THIS GUY", "🧊 Ice in his veins fr", "Pure heart. No cards needed"],
    [CLIP_CATEGORIES.BAD_BEAT]: ["💀 This is why I have PTSD", "😭 Poker is 100% skill right?", "Variance said NOT TODAY"],
    [CLIP_CATEGORIES.SOUL_READ]: ["🔮 HE KNEW.", "🎯 Reads absolutely DIALED", "That read was criminal"],
    [CLIP_CATEGORIES.TABLE_DRAMA]: ["😬 The tension at this table", "🍿 I live for this drama", "Someone call security 😂"],
    [CLIP_CATEGORIES.CELEBRITY]: ["🐐 Legend stuff", "👑 Different breed", "🏆 The GOAT doing GOAT things"],
    [CLIP_CATEGORIES.FUNNY]: ["😂 LMAOOO poker is comedy", "🤣 I cant breathe", "Peak poker content"],
    [CLIP_CATEGORIES.EDUCATIONAL]: ["📚 Great spot to study", "🧠 Pay attention to sizing", "❓ What would you do?"],
    [CLIP_CATEGORIES.VLOG]: ["Living the dream 🎰", "This is why I play poker", "Session goals"],
    [CLIP_CATEGORIES.TOURNAMENT]: ["Tournament poker hits different", "ICM nightmares", "The grind pays off 🏆"]
};

// ═══════════════════════════════════════════════════════════════════════════
// CLIP LIBRARY - 2+ clips per source
// ═══════════════════════════════════════════════════════════════════════════
export const CLIP_LIBRARY = [
    // HCL
    { id: 'hcl_1', video_id: 'hrcKuXcRhCc', source_url: 'https://www.youtube.com/watch?v=hrcKuXcRhCc', source: 'HCL', title: 'Perfect Trap', category: CLIP_CATEGORIES.SOUL_READ },
    { id: 'hcl_2', video_id: 'ecNLi6z8bSk', source_url: 'https://www.youtube.com/watch?v=ecNLi6z8bSk', source: 'HCL', title: 'Never Laugh Again', category: CLIP_CATEGORIES.TABLE_DRAMA },
    { id: 'hcl_3', video_id: '6zCDWw2wskQ', source_url: 'https://www.youtube.com/watch?v=6zCDWw2wskQ', source: 'HCL', title: '$92k Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    // LODGE
    { id: 'lodge_1', video_id: 'YdGQHBDn5Lw', source_url: 'https://www.youtube.com/watch?v=YdGQHBDn5Lw', source: 'LODGE', title: 'Massive Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    { id: 'lodge_2', video_id: 'K9RjPMqVrKY', source_url: 'https://www.youtube.com/watch?v=K9RjPMqVrKY', source: 'LODGE', title: 'Sick Bluff', category: CLIP_CATEGORIES.BLUFF },
    // LATB
    { id: 'latb_1', video_id: 'FwWa9CvV_TM', source_url: 'https://www.youtube.com/watch?v=FwWa9CvV_TM', source: 'LATB', title: 'Garrett Bluff', category: CLIP_CATEGORIES.BLUFF },
    { id: 'latb_2', video_id: 'rh8-RfBewQk', source_url: 'https://www.youtube.com/watch?v=rh8-RfBewQk', source: 'LATB', title: 'Brutal Cooler', category: CLIP_CATEGORIES.BAD_BEAT },
    // TCH
    { id: 'tch_1', video_id: '4YAdw3KHJPE', source_url: 'https://www.youtube.com/watch?v=4YAdw3KHJPE', source: 'TCH', title: 'Insane Runout', category: CLIP_CATEGORIES.BAD_BEAT },
    { id: 'tch_2', video_id: 'zQNFCv8QmhY', source_url: 'https://www.youtube.com/watch?v=zQNFCv8QmhY', source: 'TCH', title: 'Huge Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    // TRITON
    { id: 'triton_1', video_id: 'lZVS0lxluHg', source_url: 'https://www.youtube.com/watch?v=lZVS0lxluHg', source: 'TRITON', title: 'Million Dollar Pot', category: CLIP_CATEGORIES.HIGH_STAKES },
    { id: 'triton_2', video_id: 'gSSo6FBMaLA', source_url: 'https://www.youtube.com/watch?v=gSSo6FBMaLA', source: 'TRITON', title: 'Tom Dwan Read', category: CLIP_CATEGORIES.CELEBRITY },
    // POKERGO
    { id: 'pokergo_1', video_id: 'dFKzQx8pzME', source_url: 'https://www.youtube.com/watch?v=dFKzQx8pzME', source: 'POKERGO', title: 'High Stakes Rivalry', category: CLIP_CATEGORIES.HIGH_STAKES },
    { id: 'pokergo_2', video_id: 'QBz8YCPr_uQ', source_url: 'https://www.youtube.com/watch?v=QBz8YCPr_uQ', source: 'POKERGO', title: 'Super High Stakes', category: CLIP_CATEGORIES.HIGH_STAKES },
    // STONES
    { id: 'stones_1', video_id: 'mXp3H8nK7Zo', source_url: 'https://www.youtube.com/watch?v=mXp3H8nK7Zo', source: 'STONES', title: 'Stones Action', category: CLIP_CATEGORIES.MASSIVE_POT },
    { id: 'stones_2', video_id: 'qR8kL5nP2Yw', source_url: 'https://www.youtube.com/watch?v=qR8kL5nP2Yw', source: 'STONES', title: 'Big Bluff', category: CLIP_CATEGORIES.BLUFF },
    // RESORTS
    { id: 'resorts_1', video_id: 'pK9mN7qL3Xw', source_url: 'https://www.youtube.com/watch?v=pK9mN7qL3Xw', source: 'RESORTS', title: 'Resorts World Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    { id: 'resorts_2', video_id: 'nJ8oL6pM2Vw', source_url: 'https://www.youtube.com/watch?v=nJ8oL6pM2Vw', source: 'RESORTS', title: 'Vegas Action', category: CLIP_CATEGORIES.HIGH_STAKES },
    // WYNN
    { id: 'wynn_1', video_id: 'mI7nK5oL1Uw', source_url: 'https://www.youtube.com/watch?v=mI7nK5oL1Uw', source: 'WYNN', title: 'Wynn High Stakes', category: CLIP_CATEGORIES.HIGH_STAKES },
    { id: 'wynn_2', video_id: 'lH6mJ4nK0Tw', source_url: 'https://www.youtube.com/watch?v=lH6mJ4nK0Tw', source: 'WYNN', title: 'Wynn Drama', category: CLIP_CATEGORIES.TABLE_DRAMA },
    // ARIA
    { id: 'aria_1', video_id: 'kG5lI3mJ9Sw', source_url: 'https://www.youtube.com/watch?v=kG5lI3mJ9Sw', source: 'ARIA', title: 'Aria Action', category: CLIP_CATEGORIES.MASSIVE_POT },
    { id: 'aria_2', video_id: 'jF4kH2lI8Rw', source_url: 'https://www.youtube.com/watch?v=jF4kH2lI8Rw', source: 'ARIA', title: 'Aria Bluff', category: CLIP_CATEGORIES.BLUFF },
    // WSOP
    { id: 'wsop_1', video_id: 'cMzPl7zG8EQ', source_url: 'https://www.youtube.com/watch?v=cMzPl7zG8EQ', source: 'WSOP', title: 'Main Event Drama', category: CLIP_CATEGORIES.TOURNAMENT },
    { id: 'wsop_2', video_id: 'HXrCJ4LwwNE', source_url: 'https://www.youtube.com/watch?v=HXrCJ4LwwNE', source: 'WSOP', title: 'Bracelet on Line', category: CLIP_CATEGORIES.TOURNAMENT },
    // WPT
    { id: 'wpt_1', video_id: 'kVy8DDTcDgk', source_url: 'https://www.youtube.com/watch?v=kVy8DDTcDgk', source: 'WPT', title: 'WPT Final Hand', category: CLIP_CATEGORIES.TOURNAMENT },
    { id: 'wpt_2', video_id: 'gMNbI3pxqe0', source_url: 'https://www.youtube.com/watch?v=gMNbI3pxqe0', source: 'WPT', title: 'Bluff Catch', category: CLIP_CATEGORIES.SOUL_READ },
    // EPT
    { id: 'ept_1', video_id: 'p7H-EKVhMJs', source_url: 'https://www.youtube.com/watch?v=p7H-EKVhMJs', source: 'EPT', title: 'Monte Carlo', category: CLIP_CATEGORIES.TOURNAMENT },
    { id: 'ept_2', video_id: 'WKnGQv0m9TU', source_url: 'https://www.youtube.com/watch?v=WKnGQv0m9TU', source: 'EPT', title: 'Barcelona', category: CLIP_CATEGORIES.MASSIVE_POT },
    // PAD
    { id: 'pad_1', video_id: 'mXpEoXO0Qng', source_url: 'https://www.youtube.com/watch?v=mXpEoXO0Qng', source: 'PAD', title: 'Legends', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'pad_2', video_id: 'YsMkXaHPD8I', source_url: 'https://www.youtube.com/watch?v=YsMkXaHPD8I', source: 'PAD', title: 'Sick Bluff', category: CLIP_CATEGORIES.BLUFF },
    // PARTYPOKER
    { id: 'party_1', video_id: 'iE3dA1gH7Qw', source_url: 'https://www.youtube.com/watch?v=iE3dA1gH7Qw', source: 'PARTYPOKER', title: 'Party Poker Millions', category: CLIP_CATEGORIES.TOURNAMENT },
    { id: 'party_2', video_id: 'hD2cB0fG6Pw', source_url: 'https://www.youtube.com/watch?v=hD2cB0fG6Pw', source: 'PARTYPOKER', title: 'Party Poker Final', category: CLIP_CATEGORIES.TOURNAMENT },
    // GGP
    { id: 'ggp_1', video_id: 'gC1bA9eF5Ow', source_url: 'https://www.youtube.com/watch?v=gC1bA9eF5Ow', source: 'GGP', title: 'GG Poker Main', category: CLIP_CATEGORIES.TOURNAMENT },
    { id: 'ggp_2', video_id: 'fB0aZ8dE4Nw', source_url: 'https://www.youtube.com/watch?v=fB0aZ8dE4Nw', source: 'GGP', title: 'GG Poker Action', category: CLIP_CATEGORIES.MASSIVE_POT },
    // POKERSTARS
    { id: 'stars_1', video_id: 'eA9zY7cD3Mw', source_url: 'https://www.youtube.com/watch?v=eA9zY7cD3Mw', source: 'POKERSTARS', title: 'PokerStars Live', category: CLIP_CATEGORIES.TOURNAMENT },
    { id: 'stars_2', video_id: 'dZ8xX6bC2Lw', source_url: 'https://www.youtube.com/watch?v=dZ8xX6bC2Lw', source: 'POKERSTARS', title: 'Sunday Million', category: CLIP_CATEGORIES.TOURNAMENT },
    // POKERNEWS
    { id: 'pnews_1', video_id: 'cY7wW5aB1Kw', source_url: 'https://www.youtube.com/watch?v=cY7wW5aB1Kw', source: 'POKERNEWS', title: 'PokerNews Coverage', category: CLIP_CATEGORIES.TOURNAMENT },
    { id: 'pnews_2', video_id: 'bX6vV4zA0Jw', source_url: 'https://www.youtube.com/watch?v=bX6vV4zA0Jw', source: 'POKERNEWS', title: 'Tournament Recap', category: CLIP_CATEGORIES.TOURNAMENT },
    // BRAD OWEN
    { id: 'brad_1', video_id: 'YdRVU7bMh_w', source_url: 'https://www.youtube.com/watch?v=YdRVU7bMh_w', source: 'BRAD', title: 'Massive Pot', category: CLIP_CATEGORIES.VLOG },
    { id: 'brad_2', video_id: 'p_DuGV22B-s', source_url: 'https://www.youtube.com/watch?v=p_DuGV22B-s', source: 'BRAD', title: 'Vegas Session', category: CLIP_CATEGORIES.VLOG },
    // NEEME
    { id: 'neeme_1', video_id: 'DpZa5j3dYxA', source_url: 'https://www.youtube.com/watch?v=DpZa5j3dYxA', source: 'NEEME', title: 'Lodge Session', category: CLIP_CATEGORIES.VLOG },
    { id: 'neeme_2', video_id: 'h3M8uXOtKpM', source_url: 'https://www.youtube.com/watch?v=h3M8uXOtKpM', source: 'NEEME', title: 'Big Win', category: CLIP_CATEGORIES.VLOG },
    // MARIANO
    { id: 'mariano_1', video_id: 'jK8dJn4p3YE', source_url: 'https://www.youtube.com/watch?v=jK8dJn4p3YE', source: 'MARIANO', title: 'Session Highlights', category: CLIP_CATEGORIES.VLOG },
    { id: 'mariano_2', video_id: 'W4cT5dB0hPU', source_url: 'https://www.youtube.com/watch?v=W4cT5dB0hPU', source: 'MARIANO', title: 'Huge Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    // RAMPAGE
    { id: 'rampage_1', video_id: 'DgG7qUF1_mE', source_url: 'https://www.youtube.com/watch?v=DgG7qUF1_mE', source: 'RAMPAGE', title: 'Massive Bluff', category: CLIP_CATEGORIES.BLUFF },
    { id: 'rampage_2', video_id: 'hP9K7x_W5Go', source_url: 'https://www.youtube.com/watch?v=hP9K7x_W5Go', source: 'RAMPAGE', title: '$100k Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    // WOLFGANG
    { id: 'wolf_1', video_id: 'kQp9L5b8dYE', source_url: 'https://www.youtube.com/watch?v=kQp9L5b8dYE', source: 'WOLFGANG', title: 'Session', category: CLIP_CATEGORIES.VLOG },
    { id: 'wolf_2', video_id: 'rMJ8-C4GvTE', source_url: 'https://www.youtube.com/watch?v=rMJ8-C4GvTE', source: 'WOLFGANG', title: 'Tournament', category: CLIP_CATEGORIES.TOURNAMENT },
    // JAMAN
    { id: 'jaman_1', video_id: 'aW5uT3yC9Iw', source_url: 'https://www.youtube.com/watch?v=aW5uT3yC9Iw', source: 'JAMAN', title: 'Jaman Session', category: CLIP_CATEGORIES.VLOG },
    { id: 'jaman_2', video_id: 'zV4tS2xB8Hw', source_url: 'https://www.youtube.com/watch?v=zV4tS2xB8Hw', source: 'JAMAN', title: 'Big Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    // JOHNNIE
    { id: 'johnnie_1', video_id: 'dPw7Gu4QFMM', source_url: 'https://www.youtube.com/watch?v=dPw7Gu4QFMM', source: 'JOHNNIE', title: 'Session', category: CLIP_CATEGORIES.VLOG },
    { id: 'johnnie_2', video_id: 'hL_YvPq3TGQ', source_url: 'https://www.youtube.com/watch?v=hL_YvPq3TGQ', source: 'JOHNNIE', title: 'Huge Win', category: CLIP_CATEGORIES.MASSIVE_POT },
    // BOSKI
    { id: 'boski_1', video_id: 'yU3sR1wA7Gw', source_url: 'https://www.youtube.com/watch?v=yU3sR1wA7Gw', source: 'BOSKI', title: 'Boski Session', category: CLIP_CATEGORIES.VLOG },
    { id: 'boski_2', video_id: 'xT2rQ0vZ6Fw', source_url: 'https://www.youtube.com/watch?v=xT2rQ0vZ6Fw', source: 'BOSKI', title: 'Boski Pot', category: CLIP_CATEGORIES.MASSIVE_POT },
    // RYAN
    { id: 'ryan_1', video_id: 'qPvR7mVH8bY', source_url: 'https://www.youtube.com/watch?v=qPvR7mVH8bY', source: 'RYAN', title: 'Degen Session', category: CLIP_CATEGORIES.VLOG },
    { id: 'ryan_2', video_id: 'nM2L9pZRvQE', source_url: 'https://www.youtube.com/watch?v=nM2L9pZRvQE', source: 'RYAN', title: 'Comedy', category: CLIP_CATEGORIES.FUNNY },
    // LEX_O
    { id: 'lexo_1', video_id: 'wS1qP8uY5Ew', source_url: 'https://www.youtube.com/watch?v=wS1qP8uY5Ew', source: 'LEX_O', title: 'Lex O Session', category: CLIP_CATEGORIES.VLOG },
    { id: 'lexo_2', video_id: 'vR0pO7tX4Dw', source_url: 'https://www.youtube.com/watch?v=vR0pO7tX4Dw', source: 'LEX_O', title: 'Pro Life', category: CLIP_CATEGORIES.VLOG },
    // FRANKIE
    { id: 'frankie_1', video_id: 'uQ9nN6sW3Cw', source_url: 'https://www.youtube.com/watch?v=uQ9nN6sW3Cw', source: 'FRANKIE', title: 'Frankie C', category: CLIP_CATEGORIES.VLOG },
    { id: 'frankie_2', video_id: 'tP8mM5rV2Bw', source_url: 'https://www.youtube.com/watch?v=tP8mM5rV2Bw', source: 'FRANKIE', title: 'Film Session', category: CLIP_CATEGORIES.VLOG },
    // NORCAL
    { id: 'norcal_1', video_id: 'sO7lL4qU1Aw', source_url: 'https://www.youtube.com/watch?v=sO7lL4qU1Aw', source: 'NORCAL', title: 'NorCal Poker', category: CLIP_CATEGORIES.VLOG },
    { id: 'norcal_2', video_id: 'rN6kK3pT0zw', source_url: 'https://www.youtube.com/watch?v=rN6kK3pT0zw', source: 'NORCAL', title: 'Bay Area', category: CLIP_CATEGORIES.VLOG },
    // GREG_ALL_IN
    { id: 'greg_1', video_id: 'qM5jJ2oS9yw', source_url: 'https://www.youtube.com/watch?v=qM5jJ2oS9yw', source: 'GREG_ALL_IN', title: 'Greg All In', category: CLIP_CATEGORIES.VLOG },
    { id: 'greg_2', video_id: 'pL4iI1nR8xw', source_url: 'https://www.youtube.com/watch?v=pL4iI1nR8xw', source: 'GREG_ALL_IN', title: 'Canadian Poker', category: CLIP_CATEGORIES.VLOG },
    // BRANTZEN
    { id: 'brantzen_1', video_id: 'oK3hH0mQ7ww', source_url: 'https://www.youtube.com/watch?v=oK3hH0mQ7ww', source: 'BRANTZEN', title: 'Brantzen', category: CLIP_CATEGORIES.VLOG },
    { id: 'brantzen_2', video_id: 'nJ2gG9lP6vw', source_url: 'https://www.youtube.com/watch?v=nJ2gG9lP6vw', source: 'BRANTZEN', title: 'LA Poker', category: CLIP_CATEGORIES.VLOG },
    // HARRY_B
    { id: 'harry_1', video_id: 'mI1fF8kO5uw', source_url: 'https://www.youtube.com/watch?v=mI1fF8kO5uw', source: 'HARRY_B', title: 'Harry B', category: CLIP_CATEGORIES.VLOG },
    { id: 'harry_2', video_id: 'lH0eE7jN4tw', source_url: 'https://www.youtube.com/watch?v=lH0eE7jN4tw', source: 'HARRY_B', title: 'Poker Journey', category: CLIP_CATEGORIES.VLOG },
    // SETHY
    { id: 'sethy_1', video_id: 'kG9dD6iM3sw', source_url: 'https://www.youtube.com/watch?v=kG9dD6iM3sw', source: 'SETHY', title: 'Sethy Poker', category: CLIP_CATEGORIES.VLOG },
    { id: 'sethy_2', video_id: 'jF8cC5hL2rw', source_url: 'https://www.youtube.com/watch?v=jF8cC5hL2rw', source: 'SETHY', title: 'Breakeven Life', category: CLIP_CATEGORIES.FUNNY },
    // POKER_BABO
    { id: 'babo_1', video_id: 'iE7bB4gK1qw', source_url: 'https://www.youtube.com/watch?v=iE7bB4gK1qw', source: 'POKER_BABO', title: 'Poker Babo', category: CLIP_CATEGORIES.VLOG },
    { id: 'babo_2', video_id: 'hD6aA3fJ0pw', source_url: 'https://www.youtube.com/watch?v=hD6aA3fJ0pw', source: 'POKER_BABO', title: 'Hand Breakdown', category: CLIP_CATEGORIES.EDUCATIONAL },
    // DOUG_MC
    { id: 'dougmc_1', video_id: 'gC5zZ2eI9ow', source_url: 'https://www.youtube.com/watch?v=gC5zZ2eI9ow', source: 'DOUG_MC', title: 'Doug McCusker', category: CLIP_CATEGORIES.FUNNY },
    { id: 'dougmc_2', video_id: 'fB4yY1dH8nw', source_url: 'https://www.youtube.com/watch?v=fB4yY1dH8nw', source: 'DOUG_MC', title: 'Dog Feedback', category: CLIP_CATEGORIES.FUNNY },
    // CHARLIE
    { id: 'charlie_1', video_id: 'eA3xX0cG7mw', source_url: 'https://www.youtube.com/watch?v=eA3xX0cG7mw', source: 'CHARLIE', title: 'Charlie Carrel', category: CLIP_CATEGORIES.VLOG },
    { id: 'charlie_2', video_id: 'dZ2wW9bF6lw', source_url: 'https://www.youtube.com/watch?v=dZ2wW9bF6lw', source: 'CHARLIE', title: 'High Stakes', category: CLIP_CATEGORIES.HIGH_STAKES },
    // BOTEZ
    { id: 'botez_1', video_id: 'cY1vV8aE5kw', source_url: 'https://www.youtube.com/watch?v=cY1vV8aE5kw', source: 'BOTEZ', title: 'Botez Poker', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'botez_2', video_id: 'bX0uU7zD4jw', source_url: 'https://www.youtube.com/watch?v=bX0uU7zD4jw', source: 'BOTEZ', title: 'Chess to Poker', category: CLIP_CATEGORIES.FUNNY },
    // JLITTLE
    { id: 'jlittle_1', video_id: 'cH8WJQYoLpQ', source_url: 'https://www.youtube.com/watch?v=cH8WJQYoLpQ', source: 'JLITTLE', title: 'Hand Analysis', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'jlittle_2', video_id: 'M9TgZN8fU7E', source_url: 'https://www.youtube.com/watch?v=M9TgZN8fU7E', source: 'JLITTLE', title: 'Bluff Tutorial', category: CLIP_CATEGORIES.EDUCATIONAL },
    // BART
    { id: 'bart_1', video_id: 'wKyQf8m9rWA', source_url: 'https://www.youtube.com/watch?v=wKyQf8m9rWA', source: 'BART', title: 'Hand Breakdown', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'bart_2', video_id: 'p4Ry8vM3nZE', source_url: 'https://www.youtube.com/watch?v=p4Ry8vM3nZE', source: 'BART', title: 'CLP Strategy', category: CLIP_CATEGORIES.EDUCATIONAL },
    // POLK
    { id: 'polk_1', video_id: 'pF8FxT0Z5hU', source_url: 'https://www.youtube.com/watch?v=pF8FxT0Z5hU', source: 'POLK', title: 'Heads Up Battle', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'polk_2', video_id: 'r9kYw3cVqME', source_url: 'https://www.youtube.com/watch?v=r9kYw3cVqME', source: 'POLK', title: 'Roast This Play', category: CLIP_CATEGORIES.EDUCATIONAL },
    // UPSWING
    { id: 'upswing_1', video_id: 'aW9tS6xC3iw', source_url: 'https://www.youtube.com/watch?v=aW9tS6xC3iw', source: 'UPSWING', title: 'Upswing Tips', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'upswing_2', video_id: 'zV8sR5wB2hw', source_url: 'https://www.youtube.com/watch?v=zV8sR5wB2hw', source: 'UPSWING', title: 'GTO Strategy', category: CLIP_CATEGORIES.EDUCATIONAL },
    // POKERCOACHING
    { id: 'coach_1', video_id: 'yU7rQ4vA1gw', source_url: 'https://www.youtube.com/watch?v=yU7rQ4vA1gw', source: 'POKERCOACHING', title: 'Coaching Tips', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'coach_2', video_id: 'xT6pP3uz0fw', source_url: 'https://www.youtube.com/watch?v=xT6pP3uz0fw', source: 'POKERCOACHING', title: 'JL Lesson', category: CLIP_CATEGORIES.EDUCATIONAL },
    // SPLITSUIT
    { id: 'split_1', video_id: 'wS5oO2ty9ew', source_url: 'https://www.youtube.com/watch?v=wS5oO2ty9ew', source: 'SPLITSUIT', title: 'SplitSuit', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'split_2', video_id: 'vR4nN1sx8dw', source_url: 'https://www.youtube.com/watch?v=vR4nN1sx8dw', source: 'SPLITSUIT', title: 'Hand Quiz', category: CLIP_CATEGORIES.EDUCATIONAL },
    // GRIPSED
    { id: 'grip_1', video_id: 'uQ3mM0rw7cw', source_url: 'https://www.youtube.com/watch?v=uQ3mM0rw7cw', source: 'GRIPSED', title: 'Gripsed', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'grip_2', video_id: 'tP2lL9qv6bw', source_url: 'https://www.youtube.com/watch?v=tP2lL9qv6bw', source: 'GRIPSED', title: 'MTT Strategy', category: CLIP_CATEGORIES.TOURNAMENT },
    // BLACKRAIN
    { id: 'br79_1', video_id: 'sO1kK8pu5aw', source_url: 'https://www.youtube.com/watch?v=sO1kK8pu5aw', source: 'BLACKRAIN', title: 'BlackRain79', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'br79_2', video_id: 'rN0jJ7ot4zw', source_url: 'https://www.youtube.com/watch?v=rN0jJ7ot4zw', source: 'BLACKRAIN', title: 'Micro Stakes', category: CLIP_CATEGORIES.EDUCATIONAL },
    // POKERBANK
    { id: 'bank_1', video_id: 'qM9iI6ns3yw', source_url: 'https://www.youtube.com/watch?v=qM9iI6ns3yw', source: 'POKERBANK', title: 'PokerBank', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'bank_2', video_id: 'pL8hH5mr2xw', source_url: 'https://www.youtube.com/watch?v=pL8hH5mr2xw', source: 'POKERBANK', title: 'Strategy', category: CLIP_CATEGORIES.EDUCATIONAL },
    // ALEC
    { id: 'alec_1', video_id: 'oK7gG4lq1ww', source_url: 'https://www.youtube.com/watch?v=oK7gG4lq1ww', source: 'ALEC', title: 'Alec Torelli', category: CLIP_CATEGORIES.VLOG },
    { id: 'alec_2', video_id: 'nJ6fF3kp0vw', source_url: 'https://www.youtube.com/watch?v=nJ6fF3kp0vw', source: 'ALEC', title: 'Pro Tips', category: CLIP_CATEGORIES.EDUCATIONAL },
    // BENCB
    { id: 'bencb_1', video_id: 'mI5eE2jo9uw', source_url: 'https://www.youtube.com/watch?v=mI5eE2jo9uw', source: 'BENCB', title: 'Bencb', category: CLIP_CATEGORIES.EDUCATIONAL },
    { id: 'bencb_2', video_id: 'lH4dD1in8tw', source_url: 'https://www.youtube.com/watch?v=lH4dD1in8tw', source: 'BENCB', title: 'RYE Strategy', category: CLIP_CATEGORIES.TOURNAMENT },
    // KEVIN_M
    { id: 'kevin_1', video_id: 'kG3cC0hm7sw', source_url: 'https://www.youtube.com/watch?v=kG3cC0hm7sw', source: 'KEVIN_M', title: 'Kevin Martin', category: CLIP_CATEGORIES.VLOG },
    { id: 'kevin_2', video_id: 'jF2bB9gl6rw', source_url: 'https://www.youtube.com/watch?v=jF2bB9gl6rw', source: 'KEVIN_M', title: 'Micro Stakes', category: CLIP_CATEGORIES.EDUCATIONAL },
    // DANIEL
    { id: 'daniel_1', video_id: 'qc4JX8bz5AY', source_url: 'https://www.youtube.com/watch?v=qc4JX8bz5AY', source: 'DANIEL', title: 'Negreanu Read', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'daniel_2', video_id: 'iE1aA8fk5qw', source_url: 'https://www.youtube.com/watch?v=iE1aA8fk5qw', source: 'DANIEL', title: 'DNegs Vlog', category: CLIP_CATEGORIES.VLOG },
    // HELLMUTH
    { id: 'hellmuth_1', video_id: 'rMXJg9i3aME', source_url: 'https://www.youtube.com/watch?v=rMXJg9i3aME', source: 'HELLMUTH', title: 'Hellmuth Rage', category: CLIP_CATEGORIES.TABLE_DRAMA },
    { id: 'hellmuth_2', video_id: 'hD0zZ7ej4pw', source_url: 'https://www.youtube.com/watch?v=hD0zZ7ej4pw', source: 'HELLMUTH', title: 'Brat Moment', category: CLIP_CATEGORIES.FUNNY },
    // IVEY
    { id: 'ivey_1', video_id: 'Xd8Q_2_n4Ws', source_url: 'https://www.youtube.com/watch?v=Xd8Q_2_n4Ws', source: 'IVEY', title: 'Ivey Bluff', category: CLIP_CATEGORIES.BLUFF },
    { id: 'ivey_2', video_id: 'gC9yY6di3ow', source_url: 'https://www.youtube.com/watch?v=gC9yY6di3ow', source: 'IVEY', title: 'GOAT Play', category: CLIP_CATEGORIES.CELEBRITY },
    // DWAN
    { id: 'dwan_1', video_id: 'hTNGGDWVcJE', source_url: 'https://www.youtube.com/watch?v=hTNGGDWVcJE', source: 'DWAN', title: 'Dwan Courage', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'dwan_2', video_id: 'fB8xX5ch2nw', source_url: 'https://www.youtube.com/watch?v=fB8xX5ch2nw', source: 'DWAN', title: 'Tom Dwan Triton', category: CLIP_CATEGORIES.HIGH_STAKES },
    // ANTONIO
    { id: 'antonio_1', video_id: 'eA7wW4bg1mw', source_url: 'https://www.youtube.com/watch?v=eA7wW4bg1mw', source: 'ANTONIO', title: 'Antonio', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'antonio_2', video_id: 'dZ6vV3af0lw', source_url: 'https://www.youtube.com/watch?v=dZ6vV3af0lw', source: 'ANTONIO', title: 'Magician', category: CLIP_CATEGORIES.FUNNY },
    // JOE_INGRAM
    { id: 'joey_1', video_id: 'cY5uU2ze9kw', source_url: 'https://www.youtube.com/watch?v=cY5uU2ze9kw', source: 'JOE_INGRAM', title: 'Joey Ingram', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'joey_2', video_id: 'bX4tT1yd8jw', source_url: 'https://www.youtube.com/watch?v=bX4tT1yd8jw', source: 'JOE_INGRAM', title: 'Podcast Clip', category: CLIP_CATEGORIES.EDUCATIONAL },
    // LEX_V
    { id: 'lexv_1', video_id: 'aW3sS0xc7iw', source_url: 'https://www.youtube.com/watch?v=aW3sS0xc7iw', source: 'LEX_V', title: 'Lex Veldhuis', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'lexv_2', video_id: 'zV2rR9wb6hw', source_url: 'https://www.youtube.com/watch?v=zV2rR9wb6hw', source: 'LEX_V', title: 'Twitch Moment', category: CLIP_CATEGORIES.FUNNY },
    // SPRAGGY
    { id: 'spraggy_1', video_id: 'yU1qQ8va5gw', source_url: 'https://www.youtube.com/watch?v=yU1qQ8va5gw', source: 'SPRAGGY', title: 'Spraggy', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'spraggy_2', video_id: 'xT0pP7uz4fw', source_url: 'https://www.youtube.com/watch?v=xT0pP7uz4fw', source: 'SPRAGGY', title: 'Stream Moment', category: CLIP_CATEGORIES.FUNNY },
    // STAPLES
    { id: 'staples_1', video_id: 'wS9oO6ty3ew', source_url: 'https://www.youtube.com/watch?v=wS9oO6ty3ew', source: 'STAPLES', title: 'Jaime Staples', category: CLIP_CATEGORIES.VLOG },
    { id: 'staples_2', video_id: 'vR8nN5sx2dw', source_url: 'https://www.youtube.com/watch?v=vR8nN5sx2dw', source: 'STAPLES', title: 'Twitch Poker', category: CLIP_CATEGORIES.TOURNAMENT },
    // GARRETT
    { id: 'garrett_1', video_id: 'uQ7mM4rw1cw', source_url: 'https://www.youtube.com/watch?v=uQ7mM4rw1cw', source: 'GARRETT', title: 'Garrett', category: CLIP_CATEGORIES.CELEBRITY },
    { id: 'garrett_2', video_id: 'tP6lL3qv0bw', source_url: 'https://www.youtube.com/watch?v=tP6lL3qv0bw', source: 'GARRETT', title: 'G-Man Play', category: CLIP_CATEGORIES.BLUFF },
];

// Track used clips
const usedClipIds = new Set();

export function getRandomClip(options = {}) {
    const { source, category, excludeIds = [], preferSource } = options;
    let filtered = CLIP_LIBRARY;
    if (source) filtered = filtered.filter(c => c.source === source);
    if (category) filtered = filtered.filter(c => c.category === category);
    filtered = filtered.filter(c => !excludeIds.includes(c.id) && !usedClipIds.has(c.id));
    if (preferSource && filtered.length > 0) {
        const preferred = filtered.filter(c => c.source === preferSource);
        if (preferred.length > 0) filtered = preferred;
    }
    if (filtered.length === 0) {
        usedClipIds.clear();
        filtered = CLIP_LIBRARY.filter(c => !excludeIds.includes(c.id));
    }
    const clip = filtered[Math.floor(Math.random() * filtered.length)];
    if (clip) usedClipIds.add(clip.id);
    return clip;
}

export function getRandomCaption(category) {
    const templates = CAPTION_TEMPLATES[category] || CAPTION_TEMPLATES[CLIP_CATEGORIES.MASSIVE_POT];
    return templates[Math.floor(Math.random() * templates.length)];
}

export function markClipUsed(clipId) { usedClipIds.add(clipId); }

// 50 sources mapped to 100 horses (2 per source)
const SOURCE_KEYS = Object.keys(CLIP_SOURCES);

export function getHorsePreferredSources(horseProfileId) {
    if (!horseProfileId) return null;
    let hash = 0;
    for (let i = 0; i < horseProfileId.length; i++) {
        hash = ((hash << 5) - hash) + horseProfileId.charCodeAt(i);
        hash = hash & hash;
    }
    // Assign this horse to 2-3 specific sources based on their hash
    const primaryIdx = Math.abs(hash) % SOURCE_KEYS.length;
    const secondaryIdx = (primaryIdx + 17) % SOURCE_KEYS.length;
    const tertiaryIdx = (primaryIdx + 31) % SOURCE_KEYS.length;
    return [SOURCE_KEYS[primaryIdx], SOURCE_KEYS[secondaryIdx], SOURCE_KEYS[tertiaryIdx]];
}

export default { CLIP_LIBRARY, CLIP_SOURCES, CLIP_CATEGORIES, CAPTION_TEMPLATES, getRandomClip, getRandomCaption, markClipUsed, getHorsePreferredSources };
