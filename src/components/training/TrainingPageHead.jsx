import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TrainingImageHeader from './TrainingImageHeader';

/**
 * The top of a Training page under #SMARTERDESIGN: the back control in its own
 * row ABOVE the image header (never inside it), then the page's image header.
 * Optional `nav` renders directly under the header (sub-page tabs).
 */
export default function TrainingPageHead({
  slug,
  title,
  help,
  helpContent,
  backHref = '/hub/training',
  backLabel = 'Training',
  onBack,
  note,
  nav,
  children,
}) {
  return (
    <div className="sp-training-head">
      {(backHref || onBack) && (
        <div className="sd-back-row">
          {onBack ? (
            <button type="button" className="sd-button" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden /> {backLabel}
            </button>
          ) : (
            <Link href={backHref} className="sd-button">
              <ArrowLeft size={16} aria-hidden /> {backLabel}
            </Link>
          )}
        </div>
      )}
      <TrainingImageHeader slug={slug} title={title} help={help} helpContent={helpContent}>
        {note && <p className="sp-head-note">{note}</p>}
        {children}
      </TrainingImageHeader>
      {nav}
    </div>
  );
}

const DAILY_FAMILY = [
  ['/hub/training/daily-challenge', 'Hand Of The Day'],
  ['/hub/training/daily-goals', 'Daily Goals Vault'],
  ['/hub/training/challenges', 'Weekly & Monthly Goals'],
  ['/hub/training/achievements', 'Achievements Vault'],
  ['/hub/training/streaks', 'Streaks Vault'],
];

/** The Daily Challenges family tabs, shown under each family page's header. */
export function TrainingDailyNav({ current }) {
  return (
    <nav className="sd-tabs" aria-label="Daily Challenges Subpages">
      {DAILY_FAMILY.map(([href, label]) => (
        <Link key={href} href={href} className="sd-button" aria-current={href === current ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
