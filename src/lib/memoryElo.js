export const DEFAULT_ELO = 1200;

const K_FACTOR_NEW = 40;
const K_FACTOR_NORMAL = 24;
const K_FACTOR_EXPERT = 16;

const LEVEL_RATINGS = {
    1: 800,
    2: 900,
    3: 1000,
    4: 1100,
    5: 1200,
    6: 1300,
    7: 1400,
    8: 1500,
    9: 1600,
    10: 1700,
};

function getKFactor(gamesPlayed) {
    if (gamesPlayed < 10) return K_FACTOR_NEW;
    if (gamesPlayed >= 100) return K_FACTOR_EXPERT;
    return K_FACTOR_NORMAL;
}

function expectedScore(playerRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

export function calculateNewELO(currentELO, level, accuracy, gamesPlayed) {
    const opponentRating = LEVEL_RATINGS[level] || DEFAULT_ELO;
    const K = getKFactor(gamesPlayed);

    let gameScore;
    if (accuracy >= 90) {
        gameScore = 1;
    } else if (accuracy >= 70) {
        gameScore = 0.5 + ((accuracy - 70) / 40);
    } else if (accuracy >= 50) {
        gameScore = (accuracy - 50) / 40;
    } else {
        gameScore = 0;
    }

    const expected = expectedScore(currentELO, opponentRating);
    const change = Math.round(K * (gameScore - expected));
    const newELO = Math.max(100, currentELO + change);

    return {
        previousELO: currentELO,
        newELO,
        change,
        level,
        accuracy,
        gameScore,
        expected,
        opponentRating,
    };
}

export function getRankTitle(elo) {
    if (elo >= 2000) return { title: 'GTO Master', icon: '👑', color: '#FFD700' };
    if (elo >= 1800) return { title: 'Diamond', icon: '💎', color: '#00D4FF' };
    if (elo >= 1600) return { title: 'Platinum', icon: '⚪', color: '#E5E4E2' };
    if (elo >= 1400) return { title: 'Gold', icon: '🥇', color: '#FFD700' };
    if (elo >= 1200) return { title: 'Silver', icon: '🥈', color: '#C0C0C0' };
    if (elo >= 1000) return { title: 'Bronze', icon: '🥉', color: '#CD7F32' };
    return { title: 'Novice', icon: '🎮', color: '#9CA3AF' };
}
