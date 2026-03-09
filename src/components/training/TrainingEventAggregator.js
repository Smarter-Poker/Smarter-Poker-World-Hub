import { useEffect } from 'react';
import { eventBus, EventType } from '../../engine/EventBus';
import { toast } from '../../stores/toastStore';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL TRAINING EVENT AGGREGATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Mounts at the root app level to listen for training completions across the Hub.
 * Dispatches a toast notification so users see their live progress anywhere.
 */
export default function TrainingEventAggregator() {
    useEffect(() => {
        // Listen to any training session ending anywhere in the app
        const unsub = eventBus.on(EventType.SESSION_END, (event) => {
            const { source, payload } = event;
            try {
                // Determine the game or tool name from the source
                const toolName = typeof source === 'string'
                    ? source.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                    : 'GTO Training';

                // Extract accuracy or correct score from the payload (if provided)
                let performanceStr = '';
                if (payload && typeof payload === 'object') {
                    if (payload.accuracy !== undefined) {
                        performanceStr = `${payload.accuracy}% Accuracy`;
                    } else if (payload.questionsAnswered > 0) {
                        const acc = Math.round((payload.questionsCorrect / payload.questionsAnswered) * 100);
                        performanceStr = `${acc}% Accuracy`;
                    } else if (payload.total_questions > 0) {
                        const acc = Math.round((payload.correct_count / payload.total_questions) * 100);
                        performanceStr = `${acc}% Accuracy`;
                    }
                }

                // If no performance string could be derived (e.g. non-scored tools like Focus Timer)
                if (!performanceStr) {
                    performanceStr = 'Session Completed';
                }

                // Dispatch native info toast
                toast.info(`🎯 ${toolName} — ${performanceStr}`, 4000);
            } catch (err) {
                console.warn('[TrainingEventAggregator] Failed to parse and toast event:', err);
            }
        });

        return unsub;
    }, []);

    return null; // Invisible global listener
}
