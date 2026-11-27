import BankrollImageHeader from '../bankroll/BankrollImageHeader';
import { TRAINING_IMAGE_HEADERS } from '../../data/trainingImageHeaders';

/**
 * The #SMARTERDESIGN image header for a Training page: its own seal and scene,
 * the live title, and the approved chrome "?" opening the page's help.
 * `children` render inside the header (page actions such as Add +); a Back
 * control never does - it goes in an .sd-back-row above the header.
 */
export default function TrainingImageHeader({ slug, title, help, helpContent, faqs, heading, titleId, className, children }) {
  const entry = TRAINING_IMAGE_HEADERS[slug] || {};
  const resolvedTitle = title || entry.title || 'Training';
  return (
    <BankrollImageHeader
      art={slug}
      title={resolvedTitle}
      section={slug}
      heading={heading}
      titleId={titleId}
      faqs={faqs}
      className={['sp-training-image-header', className].filter(Boolean).join(' ')}
      helpContent={helpContent || <p>{help || entry.help}</p>}
    >
      {children}
    </BankrollImageHeader>
  );
}
