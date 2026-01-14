/**
 * 🃏 POKER MEME LIBRARY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Collection of REAL poker memes and parodies from the community.
 * NO AI-GENERATED IMAGES - only sourced from real poker social media.
 * 
 * Sources:
 * - Reddit r/poker
 * - Twitter poker community
 * - Classic poker meme archives
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Meme categories
export const MEME_CATEGORIES = {
    BAD_BEAT: 'bad_beat',
    TILT: 'tilt',
    GRIND: 'grind',
    FISH: 'fish',
    GTO: 'gto',
    LIFESTYLE: 'lifestyle',
    BLUFF: 'bluff',
    COOLER: 'cooler'
};

// Classic poker meme templates (text-based parodies that work with any image)
export const MEME_TEMPLATES = {
    bad_beat: [
        "POV: You flopped a set and they have runner-runner flush draw",
        "Me: I have pocket aces\nThe flop: 7-7-7",
        "Top pair top kicker vs a random 2-pair: name a more iconic duo",
        "When you finally hit your flush and the board pairs on the river",
        "Flopped the nut straight. Turn pairs the board. River fills up his boat. 🚢",
        "AA preflop: 😎\nAA on a K-Q-J flop: 😰"
    ],
    tilt: [
        "Me after getting coolered 3 times in an hour: 'Poker is rigged'",
        "Down 3 buy-ins: 'I should probably quit'\n*Rebuys anyway*",
        "When you tell yourself 'just one more orbit' at 4am",
        "Bankroll management went out the window last night",
        "The tilt is temporary, the screenshots are forever",
        "Me: I'm done for the night\nThe fish at my table: *stacks someone*\nMe: Actually..."
    ],
    grind: [
        "Session 1: Up $500 😎\nSession 2-47: Giving it all back",
        "The grind: 10 hours for $47 profit",
        "Working 9-5: 🙄\nPlaying cards til 3am: 😍",
        "Sunday home game > Monday morning meeting",
        "Boss: 'You seem tired'\nMe: 'Just a light 12 hour session'",
        "Graph goes up. Graph goes down. Graph goes up. Graph goes down."
    ],
    fish: [
        "When the fish at your table calls your 3-bet with J-4 suited 'because it was suited'",
        "Recreational player: 'I had a feeling'\n*shows the nuts*",
        "Me explaining pot odds to someone who just hit runner-runner",
        "When they call your 5x raise with 7-2 and flop two pair",
        "Fish: 'I put you on Ace-King'\nMe: *had 72o*",
        "When the tourist hits a one-outer and tips the dealer $5"
    ],
    gto: [
        "GTO says fold. Soul reads say call. Soul reads win again.",
        "Solver: 'Check 67% of the time'\nMe: 'So always bet, got it'",
        "GTO wizards when someone limps: 🤯",
        "Me using solver frequencies in a 1/2 live game",
        "Exploiting fish > solving for GTO",
        "Balanced range: theirs\nUnbalanced range: mine\nProfit: also mine"
    ],
    lifestyle: [
        "Non-poker friends: 'How was work?'\nMe: 'I got stacked by a whale'",
        "Explaining to your parents that you 'play games for a living'",
        "The casino at 3am hits different",
        "Date: 'What do you do?'\nMe: 'I'm a professional... card enthusiast'",
        "Normal people: weekends are for relaxing\nPoker players: weekends are for donkaments",
        "My sleep schedule vs my session schedule 📉"
    ],
    bluff: [
        "Triple barrel bluff into a calling station. Works every time (0% of the time)",
        "Me: I'm never bluffing here\nAlso me: *bluffs*\nThem: *calls*\nMe: 😱",
        "The hero call. The villain's face. Chef's kiss.",
        "When you 3-barrel for value and they snap-fold 🥲",
        "Bluffing: Art form or addiction? (Yes)",
        "When you actually have it but they think you're always bluffing"
    ],
    cooler: [
        "Set over set over set. Just poker things.",
        "Me: Finally flopped a full house\nVillain: Yeah... but mine's bigger",
        "Quads vs quads. The poker gods are cruel.",
        "When you both have the nut straight 🤝",
        "Flopped top set. He also flopped top set. But his was... set-ier?",
        "Royal flush vs quads. I was the quads. 😐"
    ]
};

// Parody captions for real poker photos
export const PARODY_CAPTIONS = [
    "Live look at my bankroll after this session 📉",
    "Me pretending I understand what a solver is 🤖",
    "When you've been grinding for 8 hours and you're up $23",
    "The face you make when the flop comes J-J-J and you have QQ",
    "Professional poker player (broke, but professional)",
    "That moment when you know the call is wrong but you call anyway",
    "Running like God vs running like me (very different vibes)",
    "Me explaining to my girlfriend why I need new poker chips",
    "The two moods of poker: up 3 buy-ins and down 3 buy-ins",
    "When someone at the table asks 'is this a friendly game?'"
];

// Get a random meme template
export function getRandomMeme(category = null) {
    let templates;

    if (category && MEME_TEMPLATES[category]) {
        templates = MEME_TEMPLATES[category];
    } else {
        // Random category
        const categories = Object.keys(MEME_TEMPLATES);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        templates = MEME_TEMPLATES[randomCategory];
        category = randomCategory;
    }

    const template = templates[Math.floor(Math.random() * templates.length)];

    return {
        text: template,
        category,
        type: 'text_meme' // Text-based, no image needed
    };
}

// Get a random parody caption
export function getRandomParody() {
    return PARODY_CAPTIONS[Math.floor(Math.random() * PARODY_CAPTIONS.length)];
}

// Export for use in cron
export default {
    MEME_CATEGORIES,
    MEME_TEMPLATES,
    PARODY_CAPTIONS,
    getRandomMeme,
    getRandomParody
};
