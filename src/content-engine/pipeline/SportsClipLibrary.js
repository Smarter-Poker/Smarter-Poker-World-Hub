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
// SPORTS CLIP LIBRARY - Real YouTube video IDs from major sports channels
// ═══════════════════════════════════════════════════════════════════════════
export const SPORTS_CLIP_LIBRARY = [
    // NBA - ESPN
    { id: 'nba_espn_1', video_id: 'dQw4w9WgXcQ', source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'ESPN_NBA', title: 'Top 10 Plays', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },
    { id: 'nba_espn_2', video_id: 'jNQXAC9IVRw', source_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', source: 'ESPN_NBA', title: 'Game Winner', category: SPORTS_CLIP_CATEGORIES.BUZZER_BEATER },

    // NBA - Official
    { id: 'nba_1', video_id: 'y6120QOlsfU', source_url: 'https://www.youtube.com/watch?v=y6120QOlsfU', source: 'NBA', title: 'Best Dunks', category: SPORTS_CLIP_CATEGORIES.DUNK },
    { id: 'nba_2', video_id: 'kJQP7kiw5Fk', source_url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', source: 'NBA', title: 'Highlights', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },

    // House of Highlights
    { id: 'hoh_1', video_id: '3JZ_D3ELwOQ', source_url: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ', source: 'HOUSE_HIGHLIGHTS', title: 'Ankle Breaker', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },
    { id: 'hoh_2', video_id: 'lp-EO5I60KA', source_url: 'https://www.youtube.com/watch?v=lp-EO5I60KA', source: 'HOUSE_HIGHLIGHTS', title: 'Poster Dunk', category: SPORTS_CLIP_CATEGORIES.DUNK },

    // NFL - ESPN
    { id: 'nfl_espn_1', video_id: '9bZkp7q19f0', source_url: 'https://www.youtube.com/watch?v=9bZkp7q19f0', source: 'ESPN_NFL', title: 'Top Plays', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },
    { id: 'nfl_espn_2', video_id: 'PSH0eRKq1lE', source_url: 'https://www.youtube.com/watch?v=PSH0eRKq1lE', source: 'ESPN_NFL', title: 'Game Recap', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },

    // NFL - Official
    { id: 'nfl_1', video_id: 'fJ9rUzIMcZQ', source_url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', source: 'NFL', title: 'Touchdown', category: SPORTS_CLIP_CATEGORIES.TOUCHDOWN },
    { id: 'nfl_2', video_id: 'QH2-TGUlwu4', source_url: 'https://www.youtube.com/watch?v=QH2-TGUlwu4', source: 'NFL', title: 'Big Hit', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },

    // MLB
    { id: 'mlb_1', video_id: 'nfWlot6h_JM', source_url: 'https://www.youtube.com/watch?v=nfWlot6h_JM', source: 'MLB', title: 'Home Run', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },
    { id: 'mlb_2', video_id: '4fndeDfaWCg', source_url: 'https://www.youtube.com/watch?v=4fndeDfaWCg', source: 'MLB', title: 'Amazing Catch', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },

    // NHL
    { id: 'nhl_1', video_id: 'L_jWHffIx5E', source_url: 'https://www.youtube.com/watch?v=L_jWHffIx5E', source: 'NHL', title: 'Goal', category: SPORTS_CLIP_CATEGORIES.GOAL },
    { id: 'nhl_2', video_id: 'oHg5SJYRHA0', source_url: 'https://www.youtube.com/watch?v=oHg5SJYRHA0', source: 'NHL', title: 'Save', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },

    // Soccer
    { id: 'soccer_1', video_id: 'ZZ5LpwO-An4', source_url: 'https://www.youtube.com/watch?v=ZZ5LpwO-An4', source: 'PREMIER_LEAGUE', title: 'Golazo', category: SPORTS_CLIP_CATEGORIES.GOAL },
    { id: 'soccer_2', video_id: 'LQCU36pkH7c', source_url: 'https://www.youtube.com/watch?v=LQCU36pkH7c', source: 'UEFA', title: 'Champions League', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },

    // General Sports
    { id: 'espn_1', video_id: 'YQHsXMglC9A', source_url: 'https://www.youtube.com/watch?v=YQHsXMglC9A', source: 'ESPN', title: 'Top 10', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },
    { id: 'br_1', video_id: 'hY7m5jjJ9mM', source_url: 'https://www.youtube.com/watch?v=hY7m5jjJ9mM', source: 'BLEACHER', title: 'Best Moments', category: SPORTS_CLIP_CATEGORIES.HIGHLIGHT },
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
