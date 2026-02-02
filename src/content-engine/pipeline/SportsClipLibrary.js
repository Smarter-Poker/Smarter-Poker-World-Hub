/**
 * 🏈 SPORTS CLIP LIBRARY - NBA, NFL, MLB, NHL, Soccer
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Major sports content sources for horses to share
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const SPORTS_CLIP_CATEGORIES = {
    HIGHLIGHT: 'highlight',
    BUZZER_BEATER: 'buzzer_beater',
    TOUCHDOWN: 'touchdown',
    DUNK: 'dunk',
    GOAL: 'goal',
    CONTROVERSY: 'controversy',
    FUNNY: 'funny',
    ANALYSIS: 'analysis',
    INTERVIEW: 'interview',
    PLAYOFF: 'playoff'
};

// ═══════════════════════════════════════════════════════════════════════════
// SPORTS CONTENT SOURCES
// ═══════════════════════════════════════════════════════════════════════════
export const SPORTS_CLIP_SOURCES = {
    // NBA (10)
    ESPN_NBA: { name: 'ESPN NBA', channel: '@ESPN', type: 'nba' },
    NBA: { name: 'NBA', channel: '@NBA', type: 'nba' },
    HOUSE_HIGHLIGHTS: { name: 'House of Highlights', channel: '@HouseofHighlights', type: 'nba' },
    BLEACHER_NBA: { name: 'Bleacher Report NBA', channel: '@BleacherReport', type: 'nba' },
    TNT_NBA: { name: 'NBA on TNT', channel: '@NBAonTNT', type: 'nba' },
    LAKERS: { name: 'Lakers', channel: '@Lakers', type: 'nba' },
    WARRIORS: { name: 'Warriors', channel: '@Warriors', type: 'nba' },
    CELTICS: { name: 'Celtics', channel: '@Celtics', type: 'nba' },
    HEAT: { name: 'Heat', channel: '@MiamiHeat', type: 'nba' },
    BUCKS: { name: 'Bucks', channel: '@Bucks', type: 'nba' },

    // NFL (10)
    ESPN_NFL: { name: 'ESPN NFL', channel: '@ESPN', type: 'nfl' },
    NFL: { name: 'NFL', channel: '@NFL', type: 'nfl' },
    NFL_FILMS: { name: 'NFL Films', channel: '@NFLFilms', type: 'nfl' },
    CHIEFS: { name: 'Chiefs', channel: '@Chiefs', type: 'nfl' },
    COWBOYS: { name: 'Cowboys', channel: '@DallasCowboys', type: 'nfl' },
    EAGLES: { name: 'Eagles', channel: '@Eagles', type: 'nfl' },
    NINERS: { name: '49ers', channel: '@49ers', type: 'nfl' },
    BILLS: { name: 'Bills', channel: '@BuffaloBills', type: 'nfl' },
    RAVENS: { name: 'Ravens', channel: '@Ravens', type: 'nfl' },
    PACKERS: { name: 'Packers', channel: '@packers', type: 'nfl' },

    // MLB (5)
    ESPN_MLB: { name: 'ESPN MLB', channel: '@ESPN', type: 'mlb' },
    MLB: { name: 'MLB', channel: '@MLB', type: 'mlb' },
    YANKEES: { name: 'Yankees', channel: '@Yankees', type: 'mlb' },
    DODGERS: { name: 'Dodgers', channel: '@Dodgers', type: 'mlb' },
    RED_SOX: { name: 'Red Sox', channel: '@RedSox', type: 'mlb' },

    // NHL (5)
    ESPN_NHL: { name: 'ESPN NHL', channel: '@ESPN', type: 'nhl' },
    NHL: { name: 'NHL', channel: '@NHL', type: 'nhl' },
    BRUINS: { name: 'Bruins', channel: '@NHLBruins', type: 'nhl' },
    MAPLE_LEAFS: { name: 'Maple Leafs', channel: '@MapleLeafs', type: 'nhl' },
    RANGERS: { name: 'Rangers', channel: '@NYRangers', type: 'nhl' },

    // SOCCER (5)
    ESPN_SOCCER: { name: 'ESPN FC', channel: '@ESPNFC', type: 'soccer' },
    UEFA: { name: 'UEFA', channel: '@UEFA', type: 'soccer' },
    PREMIER_LEAGUE: { name: 'Premier League', channel: '@PremierLeague', type: 'soccer' },
    LALIGA: { name: 'LaLiga', channel: '@LaLiga', type: 'soccer' },
    MLS: { name: 'MLS', channel: '@MLS', type: 'soccer' },

    // GENERAL SPORTS (5)
    ESPN: { name: 'ESPN', channel: '@ESPN', type: 'general' },
    BLEACHER: { name: 'Bleacher Report', channel: '@BleacherReport', type: 'general' },
    SPORTSCENTER: { name: 'SportsCenter', channel: '@SportsCenter', type: 'general' },
    FOX_SPORTS: { name: 'FOX Sports', channel: '@FOXSports', type: 'general' },
    CBS_SPORTS: { name: 'CBS Sports', channel: '@CBSSports', type: 'general' }
};

export const SPORTS_CAPTION_TEMPLATES = {
    [SPORTS_CLIP_CATEGORIES.HIGHLIGHT]: ["🔥 This is insane", "💯 Unreal", "Sheesh", "W"],
    [SPORTS_CLIP_CATEGORIES.BUZZER_BEATER]: ["😱 NO WAY", "🚨 CLUTCH", "Ice in his veins", "Built different"],
    [SPORTS_CLIP_CATEGORIES.TOUCHDOWN]: ["🏈 LETS GO", "💪 Touchdown baby", "W", "Huge"],
    [SPORTS_CLIP_CATEGORIES.DUNK]: ["🏀 POSTER", "😤 Nasty", "Filthy", "Boom"],
    [SPORTS_CLIP_CATEGORIES.GOAL]: ["⚽ GOLAZO", "🔥 What a strike", "Unreal", "Banger"],
    [SPORTS_CLIP_CATEGORIES.CONTROVERSY]: ["👀 Yikes", "😬 Uh oh", "Refs are blind", "No way"],
    [SPORTS_CLIP_CATEGORIES.FUNNY]: ["😂 LMAO", "🤣 Dead", "Comedy", "Cant make this up"],
    [SPORTS_CLIP_CATEGORIES.ANALYSIS]: ["📊 Breakdown", "🧠 Smart play", "Interesting", "Good take"],
    [SPORTS_CLIP_CATEGORIES.INTERVIEW]: ["💬 Real talk", "👀 Listen to this", "Facts", "He said what"],
    [SPORTS_CLIP_CATEGORIES.PLAYOFF]: ["🏆 Playoff basketball", "💪 Win or go home", "This is it", "Pressure"]
};

// ═══════════════════════════════════════════════════════════════════════════
// SPORTS CLIP LIBRARY - CLEANED: All fake placeholder video IDs removed
// ═══════════════════════════════════════════════════════════════════════════
// NOTE: The previous entries contained fake/placeholder YouTube video IDs 
// (Rick Roll, Despacito, Gangnam Style, etc.) that were causing broken video posts.
// This library needs to be populated with VERIFIED real sports video IDs.
// Until verified IDs are added, the sports clip posting functionality will be disabled.
export const SPORTS_CLIP_LIBRARY = [
    // TODO: Add verified real YouTube video IDs for sports content
    // Each entry should follow this format:
    // { id: 'unique_id', video_id: 'VERIFIED_YOUTUBE_ID', source_url: 'https://www.youtube.com/watch?v=VERIFIED_ID', source: 'SOURCE_KEY', title: 'Title', category: SPORTS_CLIP_CATEGORIES.CATEGORY }
];

// Track used clips
const usedSportsClipIds = new Set();

export function getRandomSportsClip(options = {}) {
    const { source, category, excludeIds = [], sportType } = options;
    let filtered = SPORTS_CLIP_LIBRARY;

    if (source) filtered = filtered.filter(c => c.source === source);
    if (category) filtered = filtered.filter(c => c.category === category);
    if (sportType) {
        const sources = Object.entries(SPORTS_CLIP_SOURCES)
            .filter(([_, s]) => s.type === sportType)
            .map(([key, _]) => key);
        filtered = filtered.filter(c => sources.includes(c.source));
    }

    filtered = filtered.filter(c => !excludeIds.includes(c.id) && !usedSportsClipIds.has(c.id));

    if (filtered.length === 0) {
        usedSportsClipIds.clear();
        filtered = SPORTS_CLIP_LIBRARY.filter(c => !excludeIds.includes(c.id));
    }

    const clip = filtered[Math.floor(Math.random() * filtered.length)];
    if (clip) usedSportsClipIds.add(clip.id);
    return clip;
}

export function getRandomSportsCaption(category) {
    const templates = SPORTS_CAPTION_TEMPLATES[category] || SPORTS_CAPTION_TEMPLATES[SPORTS_CLIP_CATEGORIES.HIGHLIGHT];
    return templates[Math.floor(Math.random() * templates.length)];
}

export function markSportsClipUsed(clipId) {
    usedSportsClipIds.add(clipId);
}

const SOURCE_KEYS = Object.keys(SPORTS_CLIP_SOURCES);

export function getHorseSportsPreferredSources(horseProfileId) {
    if (!horseProfileId) return null;
    let hash = 0;
    for (let i = 0; i < horseProfileId.length; i++) {
        hash = ((hash << 5) - hash) + horseProfileId.charCodeAt(i);
        hash = hash & hash;
    }
    // Assign this horse to 2-3 specific sports sources
    const primaryIdx = Math.abs(hash) % SOURCE_KEYS.length;
    const secondaryIdx = (primaryIdx + 13) % SOURCE_KEYS.length;
    const tertiaryIdx = (primaryIdx + 29) % SOURCE_KEYS.length;
    return [SOURCE_KEYS[primaryIdx], SOURCE_KEYS[secondaryIdx], SOURCE_KEYS[tertiaryIdx]];
}

export default {
    SPORTS_CLIP_LIBRARY,
    SPORTS_CLIP_SOURCES,
    SPORTS_CLIP_CATEGORIES,
    SPORTS_CAPTION_TEMPLATES,
    getRandomSportsClip,
    getRandomSportsCaption,
    markSportsClipUsed,
    getHorseSportsPreferredSources
};
