import { useId, useRef } from 'react';
import { X } from 'lucide-react';

import { SD_HEADER_HELP_ICON } from '../smarterdesign/headerHelp';
import styles from './StoreImageHeader.module.css';

/**
 * Every store-* header art ships a phone crop (`${art}-scene-phone.webp`) that
 * the header serves below 601px. Other art (VIP) keeps its single scene.
 */
export const hasPhoneHeaderScene = (art) => typeof art === 'string' && art.startsWith('store-');

/**
 * Help for one store destination: the painted chrome "?" in the upper-right
 * corner of the image header opens a native dialog with the page's steps and
 * FAQs. Escape, the close button and a backdrop click all dismiss it, and focus
 * returns to the trigger.
 */
export function StoreHelp({ title, steps = [], faqs = [], children }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const close = () => dialog.current?.close();
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="sd-header-help"
        data-focus-custom=""
        aria-label={`Help For ${title}`}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => {
          if (dialog.current && !dialog.current.open) dialog.current.showModal();
        }}
      >
        <img src={SD_HEADER_HELP_ICON} alt="" width="36" height="37" draggable={false} />
      </button>
      <dialog
        id={id}
        ref={dialog}
        className={`smarterdesign ${styles.dialog}`}
        aria-labelledby={`${id}-heading`}
        onClose={() => trigger.current?.focus({ preventScroll: true })}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <div className={styles.dialogHeading}>
          <h2 id={`${id}-heading`}>{title} Help</h2>
          <button type="button" className={styles.close} aria-label="Close Help" onClick={close}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.dialogBody}>
          {steps.map((step) => (
            <p key={step}>{step}</p>
          ))}
          {children}
          {faqs.length > 0 && (
            <section aria-label="Frequently Asked Questions">
              <h3>Frequently Asked Questions</h3>
              {faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </section>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * The #SMARTERDESIGN image header for every Diamond Store page, modelled on the
 * Club Arena Cashier header: one steel rim, a circular chrome seal on the left,
 * the live white title beside it, a realistic scene masked in on the right and
 * the shared #SMARTERDESIGN help "?" (.sd-header-help) in the upper-right corner. Back controls never
 * live inside it.
 */
export default function StoreImageHeader({
  art,
  title,
  parent = 'Smarter.Poker Marketplace',
  titleId,
  heading: Heading = 'h1',
  help = {},
  children,
  className = '',
}) {
  const asset = `/images/smarterdesign/headers/${art}`;
  return (
    <header className={`sd-masthead ${styles.header} ${className}`} data-header-art={art}>
      <picture className={styles.scenePicture}>
        {hasPhoneHeaderScene(art) && (
          <source media="(max-width: 600px)" srcSet={`${asset}-scene-phone.webp`} />
        )}
        <img
          className={styles.scene}
          src={`${asset}-scene.webp`}
          alt=""
          width="600"
          height="420"
          fetchpriority="high"
          decoding="async"
          aria-hidden="true"
        />
      </picture>
      <span className={styles.seal} aria-hidden="true">
        <img src={`${asset}-seal.webp`} alt="" width="176" height="176" />
      </span>
      <div className={styles.copy}>
        {parent && <div className={styles.parent}>{parent}</div>}
        <Heading id={titleId} className={styles.title}>
          {title}
        </Heading>
        {children}
      </div>
      <StoreHelp title={title} steps={help.steps} faqs={help.faqs}>
        {help.children}
      </StoreHelp>
    </header>
  );
}
