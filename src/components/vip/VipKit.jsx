import Link from 'next/link';
import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useVipIntroPrompt } from '../../lib/store/useVipIntroOffer';
import { VIP_MONTHLY_PURCHASE_PATH } from '../../lib/store/vipIntroPrompt.mjs';
import {
  phoneOfferCopy,
  phoneVerifyHref,
  readPhoneOfferSkipped,
  rememberPhoneOfferSkipped,
} from '../../lib/store/phoneWelcomeOfferTerms.mjs';
import styles from './VipKit.module.css';
import { SD_HEADER_HELP_ICON } from '../smarterdesign/headerHelp';

/*
 * The VIP offer kit (#SMARTERDESIGN). Every surface that sells or pitches VIP
 * is assembled from these pieces so the family reads as one product:
 *
 *   VipMasthead      seal, live title, crown scene, working help control
 *   VipPricePlate    the price as the largest thing on the surface
 *   VipIntroPrice    VipPricePlate wired to the account-aware monthly price
 *   VipCta/VipGhost  the approved painted action plates with live lettering
 *   VipUpgradePrompt the inline "this needs VIP" block for a page
 *   VipPhoneOfferStep the "verify your phone first" step every VIP or
 *                    Diamond prompt shows to an account that has not yet
 *                    claimed the phone verification reward (Dan, 2026-11-27)
 *   VipDialog        the popup chassis (focus trap, Escape, 44px close)
 *
 * Presentation only. The price wording comes from vipIntroPrompt.mjs and the
 * server decides again at checkout.
 */

export const VIP_SEAL_SRC = '/images/smarterdesign/headers/vip-seal.webp';
export const VIP_CREST_SRC = '/images/smarterdesign/headers/vip-crest.webp';
export const VIP_SCENE_SRC = '/images/smarterdesign/headers/vip-scene.webp';
export const VIP_DIAMOND_MONTH_LINE = 'Or 2,000 Diamonds For 30 Days';

const cx = (...names) => names.filter(Boolean).join(' ');

export function VipSeal({ className = '' }) {
  return (
    <span className={cx(styles.seal, className)} aria-hidden="true">
      <img src={VIP_SEAL_SRC} alt="" width="176" height="176" decoding="async" />
    </span>
  );
}

export function VipMasthead({
  parent = 'Smarter.Poker',
  title,
  titleId,
  heading: Heading = 'h1',
  helpHref,
  helpLabel,
  className = '',
}) {
  return (
    <header className={cx(styles.kit, styles.frame, styles.masthead, className)} data-vip-masthead="">
      <img className={styles.scene} src={VIP_SCENE_SRC} alt="" width="620" height="196" fetchPriority="high" decoding="async" aria-hidden="true" />
      <VipSeal />
      <div className={styles.mastCopy}>
        {parent && <p className={styles.parent}>{parent}</p>}
        <Heading id={titleId} className={styles.title}>{title}</Heading>
      </div>
      {helpHref && (
        <a className="sd-header-help" data-focus-custom="" href={helpHref} aria-label={helpLabel || `${title} Help And Frequently Asked Questions`}>
          <img src={SD_HEADER_HELP_ICON} alt="" width="36" height="37" draggable={false} />
        </a>
      )}
    </header>
  );
}

/**
 * The price readout. `amount` is the figure, `unit` what it buys, `note` the
 * terms under it. `tag` is the small label above (the new member offer).
 */
export function VipPricePlate({ amount, unit, note, tag, verify, compact = false, uniform = false, state, className = '' }) {
  return (
    <div className={cx(styles.kit, styles.price, compact && styles.priceCompact, className)} data-vip-intro-state={state}>
      {tag && <span className={styles.offerTag}>{tag}</span>}
      <div className={cx(styles.amountRow, uniform && styles.amountUniform)}>
        <strong className={styles.amount}>{amount}</strong>
        <span className={styles.unit}>{unit}</span>
      </div>
      {note && <p className={styles.then}>{note}</p>}
      {verify && <p className={styles.verify}>{verify}</p>}
    </div>
  );
}

const VERIFY_LINE = 'Verify Your Email Or Phone To Unlock The $1 First Month';

/** Plate props for one of the three monthly price answers. */
export function vipIntroPlateProps(state) {
  if (state === 'intro') {
    return { amount: '$1', unit: 'First Month', note: 'Then $20/Month. Cancel Anytime.', tag: 'New Member Offer', uniform: true };
  }
  if (state === 'verify') {
    return { amount: '$20', unit: '/Month', note: 'Cancel Anytime.', verify: VERIFY_LINE };
  }
  return { amount: '$20', unit: '/Month', note: 'Cancel Anytime.' };
}

/** The monthly price this account will pay, read from the status route. */
export function VipIntroPrice({ accountId = null, enabled = true, compact = false, className = '' }) {
  const { state } = useVipIntroPrompt(accountId, { enabled });
  return <VipPricePlate {...vipIntroPlateProps(state)} state={state} compact={compact} className={className} />;
}

const Plate = forwardRef(function Plate({ variant, href, sub, onClick, children, className = '', ...rest }, ref) {
  const names = cx(variant === 'ghost' ? styles.ghost : styles.cta, className);
  const body = (
    <>
      <span>{children}</span>
      {sub && <span className={styles.ctaSub}>{sub}</span>}
    </>
  );
  if (href) {
    return <Link ref={ref} href={href} className={names} onClick={onClick} {...rest}>{body}</Link>;
  }
  return <button ref={ref} type="button" className={names} onClick={onClick} {...rest}>{body}</button>;
});

export const VipCta = forwardRef(function VipCta(props, ref) {
  return <Plate ref={ref} variant="cta" {...props} />;
});

export const VipGhost = forwardRef(function VipGhost(props, ref) {
  return <Plate ref={ref} variant="ghost" {...props} />;
});

/** One tap to the monthly VIP purchase page, worded for this account. */
export function VipMonthlyCta({ accountId = null, enabled = true, onNavigate, className = '' }) {
  const { state, copy } = useVipIntroPrompt(accountId, { enabled });
  return (
    <VipCta
      href={VIP_MONTHLY_PURCHASE_PATH}
      onClick={onNavigate}
      className={className}
      data-vip-upgrade="monthly"
      data-vip-intro-state={state}
      sub={state === 'intro' ? 'Then $20/Month. Cancel Anytime.' : 'Cancel Anytime.'}
    >
      {copy.cta}
    </VipCta>
  );
}

export const VIP_DIAMOND_ICON_SRC = '/images/diamond-icon.png';

function sessionStore() {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch (_) { return null; }
}

function currentHubPath() {
  if (typeof window === 'undefined') return null;
  try {
    const { pathname, search, hash } = window.location;
    return `${pathname}${search}${hash}`;
  } catch (_) {
    return null;
  }
}

/**
 * Whether a VIP or Diamond prompt must show the phone verification step first
 * (Dan, 2026-11-27: "if they haven't used the free one, they should be
 * prompted to do that first, or skip and sign up").
 *
 * `show` is true only when the server said this account is eligible (has not
 * verified a phone, has not had the free month, is not VIP) and the member
 * has not tapped Skip this session. Unknown is never eligible, so an error
 * shows the existing prompt.
 */
export function usePhoneOfferStep(accountId = null, { enabled = true } = {}) {
  const { phoneOffer, accountId: resolvedId } = useVipIntroPrompt(accountId, { enabled });
  const [skipped, setSkipped] = useState(false);
  useEffect(() => {
    setSkipped(readPhoneOfferSkipped(sessionStore(), resolvedId));
  }, [resolvedId]);
  const skip = useCallback(() => {
    rememberPhoneOfferSkipped(sessionStore(), resolvedId);
    setSkipped(true);
  }, [resolvedId]);
  const eligible = Boolean(enabled && resolvedId && phoneOffer?.eligible === true);
  return { show: eligible && !skipped, offer: phoneOffer, skip, accountId: resolvedId };
}

/**
 * The phone step's body: the free month on the price plate, the welcome
 * diamonds beside it, "Verify Phone Number" on the blue plate and "Skip" on
 * the ghost plate. `onSkip` reveals whatever the prompt would have shown.
 * `returnPath` is where the verification page sends the member back to.
 */
export function VipPhoneOfferBody({ offer, onSkip, onVerify, returnPath, compact = true }) {
  const words = phoneOfferCopy(offer || {});
  const href = phoneVerifyHref(returnPath === undefined ? currentHubPath() : returnPath);
  return (
    <>
      <div className={cx(styles.kit, styles.price, compact && styles.priceCompact)} data-vip-phone-offer-plate="">
        <span className={styles.offerTag}>{words.tag}</span>
        <div className={cx(styles.amountRow, styles.amountUniform)}>
          <strong className={styles.amount}>{words.amount}</strong>
          <span className={styles.unit}>{words.unit}</span>
        </div>
        {words.bonus && (
          <span className={styles.phoneBonus} data-vip-phone-offer-bonus="">
            <img src={VIP_DIAMOND_ICON_SRC} alt="" width="24" height="24" decoding="async" aria-hidden="true" />
            {words.bonus}
          </span>
        )}
        <p className={styles.then}>{words.note}</p>
      </div>
      <div className={cx(styles.kit, styles.dialogActions)}>
        <VipCta href={href} onClick={onVerify} data-vip-phone-offer="verify">{words.cta}</VipCta>
        <VipGhost onClick={onSkip} data-vip-phone-offer="skip" sub={words.skipSub}>{words.skip}</VipGhost>
      </div>
    </>
  );
}

/** The phone step as a framed inline block, in place of an upgrade prompt. */
export function VipPhoneOfferStep({ offer, onSkip, onVerify, returnPath, heading: Heading = 'h3', className = '' }) {
  const words = phoneOfferCopy(offer || {});
  return (
    <section className={cx(styles.kit, styles.frame, styles.prompt, className)} data-vip-phone-offer-step="">
      <div className={cx(styles.promptHead, styles.promptHeadStacked)}>
        <VipSeal />
        <div>
          <Heading className={styles.promptTitle}>{words.title}</Heading>
          <p className={styles.promptCopy}>{words.copy}</p>
        </div>
      </div>
      <VipPhoneOfferBody offer={offer} onSkip={onSkip} onVerify={onVerify} returnPath={returnPath} />
    </section>
  );
}

/**
 * Wrap any VIP or Diamond prompt: an eligible account sees the phone step
 * first, and Skip reveals `children` exactly as they were.
 */
export function VipPhoneOfferGate({ accountId = null, enabled = true, heading, className = '', returnPath, onVerify, children }) {
  const step = usePhoneOfferStep(accountId, { enabled });
  if (step.show) {
    return (
      <VipPhoneOfferStep
        offer={step.offer}
        onSkip={step.skip}
        onVerify={onVerify}
        returnPath={returnPath}
        heading={heading}
        className={className}
      />
    );
  }
  return children;
}

/**
 * The inline upgrade block a page shows where a feature needs VIP.
 * One rim, the crown seal, what unlocks, the price for this account, one action.
 */
export function VipUpgradePrompt({
  accountId = null,
  enabled = true,
  title = 'Unlock With VIP',
  copy = 'One Membership Across Smarter.Poker And Club Arena.',
  heading: Heading = 'h3',
  onNavigate,
  showDiamondLine = false,
  className = '',
  children,
}) {
  /* An account that has not claimed the phone verification reward sees that
     offer first; Skip shows this prompt unchanged. */
  const phoneStep = usePhoneOfferStep(accountId, { enabled });
  if (phoneStep.show) {
    return (
      <VipPhoneOfferStep
        offer={phoneStep.offer}
        onSkip={phoneStep.skip}
        onVerify={onNavigate}
        heading={Heading}
        className={className}
      />
    );
  }
  return (
    <section className={cx(styles.kit, styles.frame, styles.prompt, className)} data-vip-upgrade-prompt="">
      <div className={cx(styles.promptHead, styles.promptHeadStacked)}>
        <VipSeal />
        <div>
          <Heading className={styles.promptTitle}>{title}</Heading>
          {copy && <p className={styles.promptCopy}>{copy}</p>}
        </div>
      </div>
      <VipIntroPrice accountId={accountId} enabled={enabled} compact />
      {showDiamondLine && <p className={styles.diamondLine}>{VIP_DIAMOND_MONTH_LINE}</p>}
      <VipMonthlyCta accountId={accountId} enabled={enabled} onNavigate={onNavigate} />
      {children}
    </section>
  );
}

/** The approved painted VIP crest (Club Arena top-vip master), as a mark. */
export function VipCrest({ className = '' }) {
  return (
    <span className={cx(styles.crest, className)} aria-hidden="true">
      <img src={VIP_CREST_SRC} alt="" width="168" height="132" decoding="async" />
    </span>
  );
}

/**
 * One plan as one framed panel: crest and name, the price readout, the
 * Diamond route as its own line, what the plan includes, one action.
 */
export function VipPlanPanel({ name, heading: Heading = 'h2', price, diamondLine, perks = [], action, featured = false, className = '' }) {
  return (
    <section className={cx(styles.kit, styles.frame, styles.planPanel, featured && styles.planFeatured, className)}>
      <div className={styles.planHead}>
        <VipCrest />
        <Heading className={styles.planName}>{name}</Heading>
      </div>
      {price}
      {diamondLine && <p className={styles.diamondLine}>{diamondLine}</p>}
      {perks.length > 0 && (
        <ul className={styles.checks}>
          {perks.map((perk) => <li key={perk}>{perk}</li>)}
        </ul>
      )}
      {action}
    </section>
  );
}

/** A framed band of short labelled facts (assurances, terms). */
export function VipFacts({ items, label, className = '' }) {
  return (
    <div className={cx(styles.kit, styles.frame, styles.facts, className)} role="list" aria-label={label}>
      {items.map(({ title, text }) => (
        <div key={title} role="listitem">
          <strong>{title}</strong>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}

/** The lead under a masthead: one line, then the page's two actions. */
export function VipLead({ children, actions }) {
  return (
    <div className={cx(styles.kit, styles.lead)}>
      {children && <p className={styles.leadText}>{children}</p>}
      {actions && <div className={styles.leadActions}>{actions}</div>}
    </div>
  );
}

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The VIP popup chassis: one steel rim, the crown seal beside a live title,
 * a labeled 44px close control, focus kept inside, Escape closes, the page
 * behind does not scroll. `scrim` is the caller's backdrop handlers
 * (useScrimDismiss); without it a press on the backdrop closes.
 */
export function VipDialog({ open, onClose, parent, title, closeLabel = 'Close', scrim, children, className = '' }) {
  const generatedId = useId();
  const titleId = `vip-dialog-${generatedId.replace(/:/g, '')}`;
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const returnFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusables = () => Array.from(dialog?.querySelectorAll(FOCUSABLE) || []);
    const rafId = window.requestAnimationFrame(() => dialog?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const backdropProps = scrim || {
    onPointerDown: (event) => {
      if (event.target === event.currentTarget) onClose?.();
    },
  };

  return (
    <div className={cx(styles.kit, styles.backdrop)} {...backdropProps}>
      <div
        ref={dialogRef}
        className={cx(styles.frame, styles.dialog, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <img className={styles.scene} src={VIP_SCENE_SRC} alt="" width="620" height="196" decoding="async" aria-hidden="true" />
          <VipSeal />
          <div className={styles.mastCopy}>
            {parent && <p className={styles.parent}>{parent}</p>}
            <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel}>
            <span aria-hidden="true">{'✕'}</span>
          </button>
        </div>
        <div className={styles.dialogBody}>{children}</div>
      </div>
    </div>
  );
}

export { styles as vipKitStyles };
