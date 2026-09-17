import { useId } from 'react';
import Link from 'next/link';
import styles from './MarketplaceConsole.module.css';
import { useMarketplaceConsoleFitText } from './useMarketplaceConsoleFitText';

const PAGE_WIDTH = 1000;
const PAGE_HEAD_HEIGHT = 348;
const PAGE_ACTION_FOOT_HEIGHT = 277;

const PAGE_ZONES = Object.freeze({
  eyebrow: { x: 100, y: 128, width: 540, height: 34 },
  title: { x: 100, y: 166, width: 540, height: 86 },
  titleWithStatus: { x: 100, y: 166, width: 470, height: 86 },
  summary: { x: 102, y: 262, width: 540, height: 42 },
  status: { x: 673, y: 190, width: 197, height: 54 },
  secondaryAction: { x: 100, y: 46, width: 381, height: 129 },
  primaryAction: { x: 520, y: 46, width: 381, height: 129 },
});

function joinClasses(...classes) {
  return classes.filter(Boolean).join(' ');
}

function zoneStyle(zone, canvasWidth, canvasHeight) {
  return {
    left: `${(zone.x / canvasWidth) * 100}%`,
    top: `${(zone.y / canvasHeight) * 100}%`,
    width: `${(zone.width / canvasWidth) * 100}%`,
    height: `${(zone.height / canvasHeight) * 100}%`,
  };
}

function inkClass(ink) {
  const classes = {
    blue: styles.inkBlue,
    muted: styles.inkMuted,
    red: styles.inkRed,
    silver: styles.inkSilver,
    white: styles.inkWhite,
  };
  return classes[ink] || classes.silver;
}

function isInternalHref(href) {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
}

function SameSurfaceLink({ href, children, ...props }) {
  if (isInternalHref(href)) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

export function MarketplaceConsoleFittedText({
  as: Element = 'span',
  text,
  className,
  minScale,
  ...props
}) {
  const textRef = useMarketplaceConsoleFitText(text, minScale);

  return (
    <Element className={joinClasses(styles.fittedZone, className)} {...props}>
      <span ref={textRef}>{text}</span>
    </Element>
  );
}

function PaintedActionControl({
  label,
  href,
  disabled = false,
  busy = false,
  onClick,
  ariaLabel,
  className,
  labelClassName,
  minScale = 0.54,
  style,
}) {
  const content = (
    <MarketplaceConsoleFittedText
      text={label}
      minScale={minScale}
      className={joinClasses(styles.actionLabelZone, labelClassName)}
      aria-hidden="true"
    />
  );

  if (href && !disabled) {
    return (
      <SameSurfaceLink
        href={href}
        className={className}
        aria-label={ariaLabel || label}
        aria-busy={busy || undefined}
        onClick={onClick}
        style={style}
      >
        {content}
      </SameSurfaceLink>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel || label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onClick}
      style={style}
    >
      {content}
    </button>
  );
}

function PagePlateAction({ action, zone }) {
  if (!action) return null;

  return (
    <PaintedActionControl
      {...action}
      className={styles.pagePlateAction}
      labelClassName={joinClasses(styles.pagePlateLabel, inkClass(action.ink || 'silver'))}
      minScale={0.46}
      style={zoneStyle(zone, PAGE_WIDTH, PAGE_ACTION_FOOT_HEIGHT)}
    />
  );
}

/**
 * The full Marketplace page chassis. Only the approved spade head is exposed.
 * Live labels are fitted into zones measured against the native master.
 */
export function MarketplacePageConsole({
  as: Element = 'section',
  eyebrow,
  title,
  titleId,
  summary,
  status,
  statusInk = 'blue',
  primaryAction,
  secondaryAction,
  children,
  className,
  ...props
}) {
  const generatedId = useId();
  const resolvedTitleId = titleId || `marketplace-console-${generatedId}`;
  const hasPrimaryAction = Boolean(primaryAction);
  const hasSecondaryAction = Boolean(secondaryAction);
  if (hasPrimaryAction !== hasSecondaryAction) {
    throw new Error('MarketplacePageConsole Requires Two Footer Actions Or None.');
  }
  const hasActions = hasPrimaryAction && hasSecondaryAction;

  return (
    <Element
      className={joinClasses(styles.pageConsole, className)}
      aria-labelledby={resolvedTitleId}
      {...props}
    >
      <div className={styles.pageHead}>
        {eyebrow ? (
          <MarketplaceConsoleFittedText
            text={eyebrow}
            className={joinClasses(styles.pageEyebrow, inkClass('blue'))}
            style={zoneStyle(PAGE_ZONES.eyebrow, PAGE_WIDTH, PAGE_HEAD_HEIGHT)}
          />
        ) : null}
        <MarketplaceConsoleFittedText
          as="h2"
          id={resolvedTitleId}
          text={title}
          minScale={0.42}
          className={joinClasses(styles.pageTitle, inkClass('silver'))}
          style={zoneStyle(
            status ? PAGE_ZONES.titleWithStatus : PAGE_ZONES.title,
            PAGE_WIDTH,
            PAGE_HEAD_HEIGHT
          )}
        />
        {summary ? (
          <MarketplaceConsoleFittedText
            text={summary}
            minScale={0.42}
            className={joinClasses(styles.pageSummary, inkClass('muted'))}
            style={zoneStyle(PAGE_ZONES.summary, PAGE_WIDTH, PAGE_HEAD_HEIGHT)}
          />
        ) : null}
        {status ? (
          <MarketplaceConsoleFittedText
            text={status}
            minScale={0.46}
            className={joinClasses(styles.pageStatus, inkClass(statusInk))}
            style={zoneStyle(PAGE_ZONES.status, PAGE_WIDTH, PAGE_HEAD_HEIGHT)}
          />
        ) : null}
      </div>
      {children === undefined || children === null ? null : (
        <div className={styles.pageBody}>{children}</div>
      )}
      <div className={hasActions ? styles.pageActionFoot : styles.pageFoot}>
        {hasActions ? (
          <>
            <PagePlateAction action={secondaryAction} zone={PAGE_ZONES.secondaryAction} />
            <PagePlateAction action={primaryAction} zone={PAGE_ZONES.primaryAction} />
          </>
        ) : null}
      </div>
    </Element>
  );
}

/** A wide action plate with no borrowed icon or CSS-built shell. */
export function MarketplaceConsoleAction({ className, ink = 'white', ...action }) {
  return (
    <PaintedActionControl
      {...action}
      className={joinClasses(styles.wideAction, className)}
      labelClassName={joinClasses(styles.wideActionLabel, inkClass(ink))}
      minScale={0.5}
    />
  );
}

function NavigationControl({ item }) {
  const label = (
    <MarketplaceConsoleFittedText
      text={item.label}
      minScale={0.5}
      className={joinClasses(styles.navigationLabel, inkClass(item.active ? 'blue' : 'silver'))}
      aria-hidden="true"
    />
  );

  if (item.href && !item.disabled) {
    return (
      <SameSurfaceLink
        href={item.href}
        className={styles.navigationControl}
        aria-label={item.ariaLabel || item.label}
        aria-current={item.active ? 'page' : undefined}
        onClick={item.onClick}
      >
        {label}
      </SameSurfaceLink>
    );
  }

  return (
    <button
      type="button"
      className={styles.navigationControl}
      aria-label={item.ariaLabel || item.label}
      aria-current={item.active ? 'page' : undefined}
      disabled={item.disabled}
      onClick={item.onClick}
    >
      {label}
    </button>
  );
}

/** A single navigation plate for a standalone back or continue action. */
export function MarketplaceConsoleNavigationPlate({
  label = 'Marketplace Navigation',
  item,
  className,
}) {
  return (
    <nav className={joinClasses(styles.navigation, className)} aria-label={label}>
      <NavigationControl item={item} />
    </nav>
  );
}

/** A static utility readout on the approved square shell. */
export function MarketplaceConsoleUtilityCard({
  eyebrow,
  title,
  titleId,
  value,
  detail,
  children,
  className,
}) {
  const generatedId = useId();
  const resolvedTitleId = titleId || `marketplace-utility-${generatedId}`;

  return (
    <article
      className={joinClasses(styles.utilityCard, className)}
      aria-labelledby={resolvedTitleId}
    >
      <div className={styles.utilityWell}>
        {eyebrow ? (
          <MarketplaceConsoleFittedText
            text={eyebrow}
            className={joinClasses(styles.utilityEyebrow, inkClass('blue'))}
          />
        ) : null}
        <MarketplaceConsoleFittedText
          as="h3"
          id={resolvedTitleId}
          text={title}
          minScale={0.44}
          className={joinClasses(styles.utilityTitle, inkClass('silver'))}
        />
        {value ? (
          <MarketplaceConsoleFittedText
            text={value}
            minScale={0.42}
            className={joinClasses(styles.utilityValue, inkClass('white'))}
          />
        ) : null}
        {detail ? <p className={styles.utilityDetail}>{detail}</p> : null}
        {children}
      </div>
    </article>
  );
}

function SharkPanelAction({ action, secondary = false }) {
  if (!action) return null;
  return (
    <PaintedActionControl
      {...action}
      className={joinClasses(styles.sharkAction, secondary && styles.sharkActionSecondary)}
      labelClassName={joinClasses(styles.sharkActionLabel, inkClass('white'))}
      minScale={0.46}
    />
  );
}

/** A sectional content panel cut from the approved shark console family. */
export function MarketplaceConsolePanel({
  title,
  titleId,
  children,
  primaryAction,
  secondaryAction,
  className,
}) {
  const generatedId = useId();
  const resolvedTitleId = titleId || `marketplace-panel-${generatedId}`;

  return (
    <section
      className={joinClasses(styles.sharkPanel, className)}
      aria-labelledby={resolvedTitleId}
    >
      <div className={styles.sharkPanelTop} aria-hidden="true" />
      <div className={styles.sharkPanelBody}>
        <MarketplaceConsoleFittedText
          as="h3"
          id={resolvedTitleId}
          text={title}
          minScale={0.46}
          className={joinClasses(styles.sharkPanelTitle, inkClass('blue'))}
        />
        {children}
        {primaryAction || secondaryAction ? (
          <div className={styles.sharkActions}>
            <SharkPanelAction action={secondaryAction} secondary />
            <SharkPanelAction action={primaryAction} />
          </div>
        ) : null}
      </div>
      <div className={styles.sharkPanelBottom} aria-hidden="true" />
    </section>
  );
}

/** A compact media or fact bay from the shark panel family. */
export function MarketplaceConsoleMediaCard({
  title,
  titleId,
  media,
  mediaLabel,
  caption,
  className,
}) {
  const generatedId = useId();
  const resolvedTitleId = titleId || `marketplace-media-${generatedId}`;

  return (
    <article className={joinClasses(styles.mediaCard, className)} aria-labelledby={resolvedTitleId}>
      <MarketplaceConsoleFittedText
        as="h4"
        id={resolvedTitleId}
        text={title}
        minScale={0.42}
        className={joinClasses(styles.mediaTitle, inkClass('blue'))}
      />
      <div className={styles.mediaWell} aria-label={mediaLabel}>
        {media}
      </div>
      {caption ? (
        <MarketplaceConsoleFittedText
          text={caption}
          minScale={0.4}
          className={joinClasses(styles.mediaCaption, inkClass('silver'))}
        />
      ) : null}
    </article>
  );
}

/** A live status row using the dedicated wallet-row hardware family. */
export function MarketplaceConsoleStatusRow({
  label,
  value,
  detail,
  valueInk = 'white',
  live = false,
  className,
}) {
  return (
    <div
      className={joinClasses(styles.statusRow, className)}
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
    >
      <div className={styles.statusContent}>
        <MarketplaceConsoleFittedText
          text={label}
          minScale={0.46}
          className={joinClasses(styles.statusLabel, inkClass('blue'))}
        />
        <MarketplaceConsoleFittedText
          text={value}
          minScale={0.4}
          className={joinClasses(styles.statusValue, inkClass(valueInk))}
        />
        {detail ? (
          <MarketplaceConsoleFittedText
            text={detail}
            minScale={0.38}
            className={joinClasses(styles.statusDetail, inkClass('muted'))}
          />
        ) : null}
      </div>
    </div>
  );
}

/** The wallet-specific contract keeps balance wording consistent. */
export function MarketplaceConsoleWalletRow({
  amount,
  currency = 'Diamonds',
  detail = 'Available Balance',
  live = true,
  ...props
}) {
  return (
    <MarketplaceConsoleStatusRow
      {...props}
      label={`${currency} Wallet`}
      value={amount}
      detail={detail}
      valueInk="white"
      live={live}
    />
  );
}
