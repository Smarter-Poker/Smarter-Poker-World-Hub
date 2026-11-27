import { useState } from 'react';
import TriviaBodyIcon from './TriviaBodyIcon';
import TriviaConsoleDialog from './console/TriviaConsoleDialog';

/**
 * Shared #SMARTERDESIGN upper-right circular chrome "?" Help control for
 * Trivia subpages and game pages. Opens an accessible TriviaConsoleDialog.
 */
export default function TriviaHelpButton({
  ariaLabel = 'Poker Trivia Help',
  eyebrow = 'Poker Trivia',
  title = 'How It Works',
  subtitle,
  children,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="tc-help-btn"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <TriviaBodyIcon name="help" style={{ '--trivia-icon-size': '44px' }} />
      </button>
      <TriviaConsoleDialog
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        primaryAction={{ label: 'Close Help', onClick: () => setOpen(false) }}
      >
        <div className="tc-help-body">{children}</div>
      </TriviaConsoleDialog>
    </>
  );
}
