import GTOQuestionCard from '../GTOQuestionCard';

export default function PsychologyTiltControlUI({ gameId, question, onAnswer, showFeedback, feedbackResult, explanation, questionNumber, totalQuestions, level, onNextHand }) {
    if (!question) return null;

    return (
        <div
            data-training-game-id={gameId}
            data-training-ui="psychology-scenario"
            style={{ width: '100%', maxWidth: 1180, margin: '0 auto' }}
        >
            <GTOQuestionCard
                gameId={gameId}
                question={question}
                level={level}
                questionNumber={questionNumber}
                totalQuestions={totalQuestions}
                onAnswer={onAnswer}
                showFeedback={showFeedback}
                feedbackResult={feedbackResult}
                explanation={explanation}
                onNextHand={onNextHand}
            />
        </div>
    );
}
