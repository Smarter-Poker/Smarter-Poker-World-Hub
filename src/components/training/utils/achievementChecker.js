/**
 * ACHIEVEMENT CHECKER UTILITY
 * Handles achievement evaluation and speed bonus tracking for training sessions
 */

/**
 * Check if answer qualifies for speed bonus and return bonus amount
 * @param {Object} meta - Answer metadata
 * @param {number} meta.answerTimeSeconds - Time taken to answer in seconds
 * @param {boolean} meta.isCorrect - Whether the answer was correct
 * @returns {number} - Bonus diamonds earned (0 if no bonus)
 */
export function checkSpeedBonus(meta) {
    if (!meta || meta.answerTimeSeconds === undefined || !meta.isCorrect) {
        return 0;
    }

    // Award 5 diamonds for answers completed in under 5 seconds
    if (meta.answerTimeSeconds < 5) {
        return 5;
    }

    return 0;
}

/**
 * Calculate total speed bonuses from answer metadata
 * @param {Object} meta - Answer metadata
 * @returns {number} - Total accumulated speed bonus diamonds
 */
export function calculateSpeedBonus(meta) {
    return checkSpeedBonus(meta);
}

/**
 * Check for streak-based achievements
 * @param {number} currentStreak - Current answer streak
 * @param {number} bestStreak - Best streak achieved in session
 * @returns {Object|null} - Achievement object if unlocked, null otherwise
 */
export function checkStreakAchievement(currentStreak, bestStreak) {
    // Milestone streaks that unlock achievements
    const streakMilestones = [5, 10, 15, 20, 25];

    // Check if current streak just hit a milestone
    if (streakMilestones.includes(currentStreak) && currentStreak === bestStreak) {
        return {
            type: 'streak',
            value: currentStreak,
            title: `${currentStreak} Hand Streak`,
            description: `Answered ${currentStreak} questions correctly in a row`,
            diamonds: currentStreak * 2, // Award 2 diamonds per streak length
        };
    }

    return null;
}

/**
 * Check for accuracy-based achievements
 * @param {number} accuracy - Session accuracy percentage (0-100)
 * @param {number} questionsAnswered - Number of questions answered
 * @returns {Object|null} - Achievement object if unlocked, null otherwise
 */
export function checkAccuracyAchievement(accuracy, questionsAnswered) {
    // Only check accuracy after minimum number of questions
    const minQuestions = 10;
    if (questionsAnswered < minQuestions) return null;

    // Accuracy milestones
    const accuracyMilestones = [
        { threshold: 95, title: 'Near Perfect', diamonds: 50 },
        { threshold: 90, title: 'Excellence', diamonds: 30 },
        { threshold: 80, title: 'Strong Performance', diamonds: 20 },
    ];

    // Find highest milestone achieved
    for (const milestone of accuracyMilestones) {
        if (accuracy >= milestone.threshold) {
            return {
                type: 'accuracy',
                value: accuracy,
                title: milestone.title,
                description: `Achieved ${accuracy}% accuracy over ${questionsAnswered} questions`,
                diamonds: milestone.diamonds,
            };
        }
    }

    return null;
}

/**
 * Check for level completion achievements
 * @param {number} level - Level number completed
 * @param {boolean} levelPassed - Whether level was passed
 * @param {number} gtowScore - GTOW score achieved
 * @returns {Object|null} - Achievement object if unlocked, null otherwise
 */
export function checkLevelCompletionAchievement(level, levelPassed, gtowScore) {
    if (!levelPassed) return null;

    // Special achievements for perfect level completion
    if (gtowScore === 100) {
        return {
            type: 'perfect_level',
            value: level,
            title: `Perfect Level ${level}`,
            description: 'Completed level with 100 GTOW score',
            diamonds: 100,
        };
    }

    // Milestone levels
    const levelMilestones = [5, 10, 15, 20, 25];
    if (levelMilestones.includes(level)) {
        return {
            type: 'level_milestone',
            value: level,
            title: `Level ${level} Milestone`,
            description: `Completed Level ${level}`,
            diamonds: level * 3,
        };
    }

    return null;
}

/**
 * Aggregate all achievements for a session
 * @param {Object} sessionData - Session data object
 * @returns {Array} - Array of achievement objects
 */
export function checkAllAchievements(sessionData) {
    const achievements = [];
    const {
        currentStreak = 0,
        bestStreak = 0,
        accuracy = 0,
        questionsAnswered = 0,
        level = 1,
        levelPassed = false,
        gtowScore = 0,
    } = sessionData;

    // Check streak achievement
    const streakAchievement = checkStreakAchievement(currentStreak, bestStreak);
    if (streakAchievement) achievements.push(streakAchievement);

    // Check accuracy achievement
    const accuracyAchievement = checkAccuracyAchievement(accuracy, questionsAnswered);
    if (accuracyAchievement) achievements.push(accuracyAchievement);

    // Check level completion achievement
    const levelAchievement = checkLevelCompletionAchievement(level, levelPassed, gtowScore);
    if (levelAchievement) achievements.push(levelAchievement);

    return achievements;
}
