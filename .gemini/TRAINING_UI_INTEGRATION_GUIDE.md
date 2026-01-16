# 🔌 TRAINING UI INTEGRATION GUIDE

**Target**: Connect God Mode service to training game UI  
**Status**: ⏳ READY FOR INTEGRATION

---

## **📋 CURRENT STATE**

**File**: `pages/hub/training/play/[gameId].js` (1,892 lines)

**Current Data Flow**:
```
gameId → TRAINING_LIBRARY → getQuestionsForGame() → Dummy questions
```

**Target Data Flow**:
```
levelId → generateLevelQuiz() → Real GTO questions → Live feedback
```

---

## **🔧 REQUIRED CHANGES**

### **Step 1: Update Imports**

**Add at top of file** (after line 27):
```javascript
import { generateLevelQuiz } from '../../../../lib/god-mode-service';
import { submitAnswer } from '../../../../lib/game-engine-service';
import { useSupabaseClient,useUser } from '@supabase/auth-helpers-react';
```

### **Step 2: Update State Management**

**Replace  lines 408-421** with:
```javascript
// State
const supabase = useSupabaseClient();
const user = useUser();
const [game, setGame] = useState(null);
const [quiz, setQuiz] = useState(null); // NEW: Full quiz object
const [questions, setQuestions] = useState([]);
const [questionIndex, setQuestionIndex] = useState(0);
const [correctCount, setCorrectCount] = useState(0);
const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
const [showResult, setShowResult] = useState(false);
const [selectedAnswer, setSelectedAnswer] = useState(null);
const [selectedHand, setSelectedHand] = useState(null); // NEW: Track selected hand
const [isComplete, setIsComplete] = useState(false);
const [streak, setStreak] = useState(0);
const [bestStreak, setBestStreak] = useState(0);
const [xpEarned, setXpEarned] = useState(0);
const [showXPBurst, setShowXPBurst] = useState(false);
const [lastXP, setLastXP] = useState(0);
const [playerCount, setPlayerCount] = useState(6);
const [isLoading, setIsLoading] = useState(true); // NEW: Loading state
```

### **Step 3: Load Real Questions**

**Replace** the `useEffect` at lines 435-448 with:
```javascript
// Load game and generate quiz
useEffect(() => {
    async function loadQuiz() {
        if (!gameId || !user) return;

        const foundGame = getGameById(gameId);
        if (!foundGame) return;

        setGame(foundGame);
        setIsLoading(true);

        // Get dynamic player count
        const count = getPlayerCount(gameId);
        setPlayerCount(count);

        // Map gameId to levelId (temporary - create a mapping function)
        const levelId = getLevelIdFromGameId(gameId);

        // Generate real GTO quiz
        const generatedQuiz = await generateLevelQuiz(user.id, levelId);

        if (generatedQuiz) {
            setQuiz(generatedQuiz);
            setQuestions(generatedQuiz.questions);
            console.log(`✅ Loaded ${generatedQuiz.fresh_questions} fresh questions`);
            if (generatedQuiz.is_review_mode) {
                console.log(`🔄 Review mode: ${generatedQuiz.review_questions} repeats`);
            }
        } else {
            console.error('Failed to generate quiz');
            // Fallback to dummy data
            const gameQuestions = getQuestionsForGame(gameId);
            setQuestions(gameQuestions);
        }

        setIsLoading(false);
    }

    loadQuiz();
}, [gameId, user]);

// Helper: Map gameId to levelId
function getLevelIdFromGameId(gameId) {
    // Example mapping - customize based on your game structure
    const mapping = {
        'flop-mastery': 1,
        'turn-tactics': 2,
        'river-play': 3,
        // ... map all 100 games
    };
    return mapping[gameId] || 1; // Default to level 1
}
```

### **Step 4: Update Answer Checking**

**Find the `handleAnswerClick` function** and update it:

```javascript
const handleAnswerClick = useCallback(async (answerKey, hand) => {
    if (showResult) return;

    setSelectedAnswer(answerKey);
    setSelectedHand(hand);
    clearInterval(timerRef.current);

    // Get current question
    const currentQuestion = questions[questionIndex];
    if (!currentQuestion) return;

    // Get GTO solution for selected hand
    const handKey = hand.join(''); // e.g., "AhKd"
    const gtoStrategy = currentQuestion.strategy_matrix[handKey];

    if (!gtoStrategy) {
        console.error(`No GTO data for hand: ${handKey}`);
        return;
    }

    // Determine if answer is correct
    const bestAction = gtoStrategy.best_action;
    const isCorrect = answerKey === bestAction || 
                     (best Action === 'Mixed' && gtoStrategy.actions[answerKey].freq > 0.05);

    // Calculate EV loss
    const evLoss = gtoStrategy.actions[answerKey]?.ev_loss || 0;

    // Update score
    if (isCorrect) {
        setCorrectCount(prev => prev + 1);
        setStreak(prev => {
            const newStreak = prev + 1;
            setBestStreak(current => Math.max(current, newStreak));
            return newStreak;
        });

        // Award XP
        const baseXP = 25;
        const streakBonus = streak >= 3 ? 10 : 0;
        const totalXP = baseXP + streak Bonus;
        setXpEarned(prev => prev + totalXP);
        setLastXP(totalXP);
        setShowXPBurst(true);
        setTimeout(() => setShowXPBurst(false), 800);

        // Trigger success effects
        feedback.success();
        screenEffects.correctAnswer(arenaRef.current);
    } else {
        setStreak(0);
        feedback.error();
        screenEffects.wrongAnswer(arenaRef.current);
    }

    setShowResult(true);

    // Submit answer to database
    if (user) {
        await submitAnswer({
            userId: user.id,
            scenarioHash: currentQuestion.scenario_hash,
            levelId: quiz?.level_id || 1,
            userAction: answerKey,
            gtoAction: bestAction,
            evLoss,
            result: isCorrect ? 'Correct' : 'Incorrect'
        });
    }

    // Auto-advance to next question
    setTimeout(() => {
        if (questionIndex < questions.length - 1) {
            setQuestionIndex(prev => prev + 1);
            setTimeLeft(TIME_PER_QUESTION);
            setShowResult(false);
            setSelectedAnswer(null);
            setSelectedHand(null);
        } else {
            finalizeSession();
        }
    }, 2500);
}, [showResult, questionIndex, questions, user, quiz, streak]);
```

### **Step 5: Update Level Completion**

**Update the `finalizeSession` function**:

```javascript
async function finalizeSession() {
    setIsComplete(true);

    const accuracy = Math.round((correctCount / questions.length) * 100);
    const passed = accuracy >= PASS_THRESHOLD;

    // Record session
    if (user && game) {
        await recordSession(game.id, {
            completed: true,
            accuracy,
            xpEarned,
            bestStreak,
        });
    }

    // Update level progress
    if (user && quiz) {
        const { completeTrainingSession } = await import('../../../../lib/game-engine-service');
        const progress = await completeTrainingSession(user.id, quiz.level_id);

        console.log('Session complete:', progress);
        console.log('Status:', progress?.status);
        console.log('Passed:', passed);
    }

    // Show completion screen
    // ...existing completion UI code
}
```

### **Step 6: Display Hand Selection UI**

**Add hand selector** (before answer buttons):

```javascript
{/* Hand Selector - NEW */}
{!showResult && (
    <div style={styles.handSelector}>
        <p>Select your hand:</p>
        <div style={styles.handGrid}>
            {['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AQs', 'AKo'].map(handString => {
                const hand = parseHandString(handString); // Helper to convert "AKs" to ["Ah", "Ks"]
                return (
                    <button
                        key={handString}
                        onClick={() => setSelectedHand(hand)}
                        style={{
                            ...styles.handButton,
                            background: selectedHand?.join('') === hand.join('')
                                ? '#00D4FF'
                                : 'rgba(255,255,255,0.1)'
                        }}
                    >
                        {handString}
                    </button>
                );
            })}
        </div>
    </div>
)}
```

### **Step 7: Update Action Buttons**

**Modify answer buttons** to use selected hand:

```javascript
{['Fold', 'Call', 'Raise'].map(action => {
    const gtoData = selectedHand && currentQuestion?.strategy_matrix[selectedHand.join('')];
    const frequency = gtoData?.actions[action]?.freq || 0;

    return (
        <button
            key={action}
            onClick={() => handleAnswerClick(action, selectedHand)}
            disabled={!selectedHand || showResult}
            style={{
                ...styles.actionButton,
                opacity: selectedHand ? 1 : 0.5
            }}
        >
            {action}
            {gtoData && (
                <span style={styles.freqHint}>
                    {(frequency * 100).toFixed(0)}%
                </span>
            )}
        </button>
    );
})}
```

---

## **🎯 HELPER FUNCTIONS**

Add these utility functions:

```javascript
// Parse hand string to card array
function parseHandString(handStr) {
    // "AKs" → ["Ah", "Ks"]
    // "AKo" → ["Ah", "Kd"]
    const ranks = handStr.slice(0, 2).split('');
    const suited = handStr.endsWith('s');

    const suits = suited ? ['h', 'h'] : ['h', 'd'];
    return [
        `${ranks[0]}${suits[0]}`,
        `${ranks[1]}${suits[1]}`
    ];
}

// Map gameId to levelId
function getLevelIdFromGameId(gameId) {
    // Customize based on your game → level mapping
    const mapping = {
        'flop-mastery': 1,
        'turn-tactics': 2,
        'river-play': 3,
        'full-street-mix': 4,
        'advanced-flops': 5,
        'advanced-turns': 6,
        'mtt-fundamentals': 7,
        'mtt-turn-play': 8,
        'short-stack-survival': 9,
        'cash-mastery': 10,
    };
    return mapping[gameId] || 1;
}
```

---

## **📊 TESTING CHECKLIST**

- [ ] Quiz loads with real GTO data
- [ ] Hand selector displays correctly
- [ ] Answer checking uses `strategy_matrix`
- [ ] EV loss calculated correctly
- [ ] Answers submitted to `user_question_history`
- [ ] Level progress updates on completion
- [ ] Passing threshold (85%) enforced
- [ ] Review mode flagged when activated

---

## **🚀 DEPLOYMENT STEPS**

1. **Apply database migrations** (if not done):
   ```bash
   supabase db push
   ```

2. **Update imports** in `[gameId].js`

3. **Replace state management** with God Mode hooks

4. **Update question loading** to use `generateLevelQuiz()`

5. **Modify answer checking** to use `strategy_matrix`

6. **Test with real user** and verify data flow

---

## **⚠️ IMPORTANT NOTES**

1. **User Authentication Required**: Component needs `useUser()` hook
2. **Loading State**: Show spinner while quiz generates
3. **Fallback**: Keep dummy data as backup if God Mode fails
4. **Hand Selection**: User must choose hand before answering
5. **Mapping**: Create complete `gameId → levelId` mapping table

---

**This integration connects your existing polished UI to the God Mode engine!** 🎮🔥

See `QUESTION_GENERATOR_COMPLETE.md` for API reference.
