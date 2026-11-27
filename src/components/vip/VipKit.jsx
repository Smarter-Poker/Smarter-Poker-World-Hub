import Link from 'next/link';
import { forwardRef, useEffect, useId, useRef } from 'react';
import { useVipIntroPrompt } from '../../lib/store/useVipIntroOffer';
import { VIP_MONTHLY_PURCHASE_PATH } from '../../lib/store/vipIntroPrompt.mjs';
import styles from './VipKit.module.css';
import { HELP_ICON_SRC } from '../bankroll/BankrollHelp';

/*
 * The VIP offer kit (#SMARTERDESIGN). Every surface that sells or pitches VIP
 * is assembled from these pieces so the family reads as one product:
 *
 *   VipMasthead      seal, live title, crown scene, working help control
 *   VipPricePlate    the price as the largest thing on the surface
 *   VipIntroPrice    VipPricePlate wired to the account-aware monthly price
 *   VipCta/VipGhost  the approved painted action plates with live lettering
 *   VipUpgradePrompt the inline "this needs VIP" block for a page
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
        <a className={styles.help} href={helpHref} aria-label={helpLabel || `${title} Help And Frequently Asked Questions`}>
          <img className={styles.helpIcon} src={HELP_ICON_SRC} alt="" width="118" height="120" decoding="async" />
        </a>
      )}
    </header>
  );
}

/**
 * The price readout. `amount` is the figure, `unit` what it buys, `note` the
 * terms under it. `tag` is the small label above (the new member offer).
 */
export function VipPricePlate({ amount, unit, note, tag, verify, compact = false, state, className = '' }) {
  return (
    <div className={cx(styles.kit, styles.price, compact && styles.priceCompact, className)} data-vip-intro-state={state}>
      {tag && <span className={styles.offerTag}>{tag}</span>}
      <div className={styles.amountRow}>
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
    return { amount: '$1', unit: 'First Month', note: 'Then $20/Month. Cancel Anytime.', tag: 'New Member Offer' };
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
  return (
    <section className={cx(styles.kit, styles.frame, styles.prompt, className)} data-vip-upgrade-prompt="">
      <div className={styles.promptHead}>
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
