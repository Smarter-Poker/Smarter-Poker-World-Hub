import { useMemo, useState } from 'react';
import { formatTriviaDisplayNumber } from '../../../lib/trivia/formatTriviaDisplayNumber';

export default function Phase9RunReview({ questions = [], settlement, title = 'Missed Questions' }) {
    const [open, setOpen] = useState(false);
    const missed = useMemo(() => {
        const roster = new Map((Array.isArray(questions) ? questions : []).map(question => [question?.id, question]));
        return (Array.isArray(settlement?.perQuestion) ? settlement.perQuestion : [])
            .filter(verdict => verdict && verdict.wasCorrect !== true && verdict.outcome !== 'voided')
            .map((verdict, index) => {
                const question = roster.get(verdict.questionId);
                const correctIndex = Number(verdict.correctDisplayIndex);
                return {
                    id: verdict.questionId || `missed-${index}`,
                    question: question?.question || 'Question Text Unavailable',
                    correctAnswer: Array.isArray(question?.options) && Number.isInteger(correctIndex)
                        ? question.options[correctIndex]
                        : 'Answer Unavailable',
                    explanation: verdict.explanation || question?.explanation || null,
                };
            });
    }, [questions, settlement]);

    if (missed.length === 0) return null;
    return (
        <section className="trivia-challenge-review" aria-labelledby="phase9-run-review-title">
            <h3 id="phase9-run-review-title">{title}</h3>
            <button
                type="button"
                className="trivia-challenge-action"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                aria-controls="phase9-run-review-list"
            >
                {open ? 'Hide Review' : `Review ${formatTriviaDisplayNumber(missed.length)} Missed`}
            </button>
            {open && (
                <ol id="phase9-run-review-list" className="trivia-challenge-list phase9-review-list">
                    {missed.map(item => (
                        <li key={item.id}>
                            <p>{item.question}</p>
                            <p><strong>Correct Answer:</strong> {item.correctAnswer}</p>
                            {item.explanation && <p>{item.explanation}</p>}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
