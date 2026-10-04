import { REEL_FEEDBACK_ACTIONS } from '../../lib/reelsFeedback.mjs';

export default function ReelFeedbackActions({ onFeedback, className = '', buttonClassName = '' }) {
  return (
    <div className={className} role="group" aria-label="Tune Reel recommendations">
      {REEL_FEEDBACK_ACTIONS.map((action) => (
        <button
          type="button"
          key={action.id}
          className={buttonClassName}
          data-reel-feedback={action.id}
          onClick={() => onFeedback(action.id)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
