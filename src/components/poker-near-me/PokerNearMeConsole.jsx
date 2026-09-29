import { useLayoutEffect, useRef } from 'react';

export const PNM_CONSOLE_WIDTH = 1000;
export const PNM_CONSOLE_TOP_HEIGHT = 348;
export const PNM_CONSOLE_PLATES_HEIGHT = 277;
export const PNM_CONSOLE_FOOT_HEIGHT = 72;

export const PNM_CONSOLE_ZONES = Object.freeze({
  eyebrow: { x: 100, y: 128, width: 540, height: 34 },
  title: { x: 100, y: 166, width: 540, height: 86 },
  titleBesidePill: { x: 100, y: 166, width: 470, height: 86 },
  subtitle: { x: 102, y: 262, width: 540, height: 42 },
  pill: { x: 673, y: 190, width: 197, height: 54 },
  plateSecondary: { x: 100, y: 46, width: 381, height: 129 },
  platePrimary: { x: 520, y: 46, width: 381, height: 129 },
});

const PNM_CONSOLE_CRESTS = new Set(['locator', 'spade', 'flat', 'club', 'diamond', 'vip']);
const PNM_CONSOLE_INKS = new Set(['silver', 'white', 'blue', 'green', 'red', 'gold', 'muted']);
const PNM_CONTROL_ICONS = new Set([
  'search', 'location', 'fullscreen', 'back', 'close', 'saved',
  'share', 'phone', 'globe', 'directions', 'calendar', 'home',
  'menu', 'edit', 'event-ticket', 'live-games', 'roadtrip', 'trophy',
  'alert', 'filter', 'community', 'info', 'review', 'more',
]);

function safeVariant(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

export function pnmConsoleZone(zone, canvasWidth, canvasHeight) {
  return {
    left: `${(zone.x / canvasWidth) * 100}%`,
    top: `${(zone.y / canvasHeight) * 100}%`,
    width: `${(zone.width / canvasWidth) * 100}%`,
    height: `${(zone.height / canvasHeight) * 100}%`,
  };
}

/**
 * Fit one live DOM line inside the painted face, including a correction pass
 * after the browser applies glyph hinting and letter-spacing at the new size.
 */
export function usePnmConsoleFitText(text, headroom = 1, minRatio = 0.44) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const textNode = ref.current;
    const face = textNode?.parentElement;
    if (!textNode || !face) return undefined;

    let correctionFrame = 0;
    const fit = () => {
      if (correctionFrame) window.cancelAnimationFrame(correctionFrame);
      textNode.style.setProperty('--pnc-fit', '1');
      const available = face.clientWidth;
      const needed = textNode.scrollWidth * headroom;
      if (!available || !needed) return;

      const estimated = Math.min(1, Math.max(minRatio, available / needed));
      textNode.style.setProperty('--pnc-fit', estimated < 0.995 ? estimated.toFixed(4) : '1');

      correctionFrame = window.requestAnimationFrame(() => {
        correctionFrame = 0;
        const rendered = textNode.getBoundingClientRect().width * headroom;
        if (!rendered || rendered <= available) return;
        const corrected = Math.max(minRatio, estimated * (available / rendered) * 0.995);
        textNode.style.setProperty('--pnc-fit', corrected.toFixed(4));
      });
    };

    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(face);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(fit).catch(() => undefined);
    }

    return () => {
      observer?.disconnect();
      if (correctionFrame) window.cancelAnimationFrame(correctionFrame);
    };
  }, [text, headroom, minRatio]);

  return ref;
}

export function PokerNearMeConsoleText({
  text,
  as: Tag = 'span',
  className = '',
  id,
  style,
  headroom = 1,
  minRatio = 0.44,
}) {
  const fitRef = usePnmConsoleFitText(text, headroom, minRatio);
  return (
    <Tag className={`pnc-zone ${className}`.trim()} id={id} style={style}>
      <span ref={fitRef}>{text}</span>
    </Tag>
  );
}

export function PokerNearMeConsolePlate({
  label,
  zone,
  canvasHeight = PNM_CONSOLE_PLATES_HEIGHT,
  ink = 'silver',
  buttonRef,
  className = '',
  style,
  ...buttonProps
}) {
  const fitRef = usePnmConsoleFitText(label, 1.04, 0.44);
  const safeInk = safeVariant(ink, PNM_CONSOLE_INKS, 'silver');
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`pnc-plate ${className}`.trim()}
      style={{ ...pnmConsoleZone(zone, PNM_CONSOLE_WIDTH, canvasHeight), ...style }}
      {...buttonProps}
    >
      <span className="pnc-plate__face">
        <span className={`pnc-plate__text pnc-ink--${safeInk}`} ref={fitRef}>{label}</span>
      </span>
    </button>
  );
}

/** Static pictograms are painted into their own complete holders. */
export function PokerNearMeConsoleIcon({ name, className = '', ...props }) {
  const safeName = safeVariant(name, PNM_CONTROL_ICONS, 'location');
  return (
    <span
      className={`pnc-icon pnc-icon--${safeName} ${className}`.trim()}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * Compact three-slice chassis for repeatable result cards and information
 * panels. The head, repeating body rail, and closing foot are separate master
 * art boxes so the chrome never stretches, tears, or overlaps at the corners.
 */
export function PokerNearMePanelShell({
  as: Tag = 'article',
  children,
  className = '',
  bodyClassName = '',
  surfaceRef,
  ...surfaceProps
}) {
  return (
    <Tag
      ref={surfaceRef}
      className={`pnc-panel ${className}`.trim()}
      data-pnm-console="painted-panel-v1"
      {...surfaceProps}
    >
      <span className="pnc-panel__head" aria-hidden="true" />
      <div className={`pnc-panel__body ${bodyClassName}`.trim()}>{children}</div>
      <span className="pnc-panel__foot" aria-hidden="true" />
    </Tag>
  );
}

/**
 * Poker Near Me's #ClubArenaConsole chassis. Static rails, wells, crests and
 * plates are painted raster art; only live copy and interactive DOM controls
 * are printed over measured faces.
 */
export default function PokerNearMeConsole({
  eyebrow,
  title,
  titleId,
  titleAs: TitleTag = 'h2',
  subtitle,
  pill,
  pillInk = 'blue',
  crest = 'locator',
  foot,
  plates,
  children,
  className = '',
  as: Tag = 'section',
  surfaceRef,
  ...surfaceProps
}) {
  const safeCrest = safeVariant(crest, PNM_CONSOLE_CRESTS, 'locator');
  const completePlatePair = Boolean(plates?.secondary && plates?.primary);
  const footKind = foot === 'plates' && completePlatePair
    ? 'plates'
    : foot === 'foot'
      ? 'foot'
      : completePlatePair
        ? 'plates'
        : 'foot';
  const titleZone = pill ? PNM_CONSOLE_ZONES.titleBesidePill : PNM_CONSOLE_ZONES.title;

  return (
    <Tag
      ref={surfaceRef}
      className={`pnc pnc--${footKind} pnc--crest-${safeCrest} ${className}`.trim()}
      data-pnm-console="painted-chassis-v1"
      {...surfaceProps}
    >
      <div className="pnc__head">
        {eyebrow ? (
          <PokerNearMeConsoleText
            text={eyebrow}
            className="pnc__eyebrow pnc-ink--blue"
            style={pnmConsoleZone(PNM_CONSOLE_ZONES.eyebrow, PNM_CONSOLE_WIDTH, PNM_CONSOLE_TOP_HEIGHT)}
          />
        ) : null}
        <PokerNearMeConsoleText
          as={TitleTag}
          id={titleId}
          text={title}
          className="pnc__title pnc-ink--silver"
          headroom={1.06}
          minRatio={0.38}
          style={pnmConsoleZone(titleZone, PNM_CONSOLE_WIDTH, PNM_CONSOLE_TOP_HEIGHT)}
        />
        {subtitle ? (
          <PokerNearMeConsoleText
            text={subtitle}
            className="pnc__subtitle pnc-ink--muted"
            style={pnmConsoleZone(PNM_CONSOLE_ZONES.subtitle, PNM_CONSOLE_WIDTH, PNM_CONSOLE_TOP_HEIGHT)}
          />
        ) : null}
        {pill ? (
          <PokerNearMeConsoleText
            text={pill}
            className={`pnc__pill pnc-ink--${pillInk}`}
            headroom={1.06}
            style={pnmConsoleZone(PNM_CONSOLE_ZONES.pill, PNM_CONSOLE_WIDTH, PNM_CONSOLE_TOP_HEIGHT)}
          />
        ) : null}
      </div>
      {children !== undefined && children !== null ? <div className="pnc__body">{children}</div> : null}
      <div className="pnc__foot">
        {footKind === 'plates' && plates?.secondary ? (
          <PokerNearMeConsolePlate zone={PNM_CONSOLE_ZONES.plateSecondary} {...plates.secondary} />
        ) : null}
        {footKind === 'plates' && plates?.primary ? (
          <PokerNearMeConsolePlate zone={PNM_CONSOLE_ZONES.platePrimary} {...plates.primary} />
        ) : null}
      </div>
    </Tag>
  );
}
