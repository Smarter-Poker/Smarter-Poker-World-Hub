import { useId } from 'react';

// The owner's exact approved artwork is the source. SVG viewports select its
// illustrations and chrome without rescaling one axis or baking UI text into
// controls. The separate card edit changes only the requested card faces.
export const APPROVED_LANDING_SPRITE = '/images/personal-assistant/approved-layout-sprite.webp';
const CARDS = '/images/personal-assistant/approved-card-edit-sprite.webp';

const ART = {
  review: [89, 220, 489, 238],
  sandbox: [89, 490, 507, 164],
  leaks: [89, 681, 391, 94],
  log: [137, 797, 153, 113],
  coaching: [666, 792, 123, 119],
  settings: [955, 155, 35, 35],
  target: [604, 330, 34, 34],
  check: [940, 708, 38, 38],
};

export function ApprovedIllustration({ kind, className, label }) {
  const box = ART[kind];
  return (
    <svg
      className={className}
      viewBox={box.join(' ')}
      preserveAspectRatio="xMidYMid meet"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      data-approved-illustration={kind}
    >
      <image href={kind === 'sandbox' || kind === 'leaks' ? CARDS : APPROVED_LANDING_SPRITE} width="1249" height="1061" />
    </svg>
  );
}

const FRAMES = {
  review: [78, 207, 1100, 262, 10],
  sandbox: [78, 478, 1100, 185, 10],
  leaks: [78, 670, 1100, 117, 9],
  title: [361, 144, 430, 54, 6],
  settings: [938, 148, 252, 47, 6],
  primaryButton: [586, 371, 537, 74, 9],
  secondaryButton: [599, 573, 533, 67, 9],
};

export function ApprovedChrome({ kind, className }) {
  const id = useId();
  const [x, y, width, height, rim] = FRAMES[kind];
  const corner = Math.min(kind === 'title' ? 28 : kind === 'settings' ? 20 : 22, Math.floor(height / 2));
  // Nine-slice framing keeps the approved corners and rim thickness intact
  // when a phone turns the horizontal row into a taller stacked panel.
  const pieces = [
    [0, 0, corner, corner, { left: 0, top: 0, width: corner, height: corner }],
    [width - corner, 0, corner, corner, { right: 0, top: 0, width: corner, height: corner }],
    [0, height - corner, corner, corner, { left: 0, bottom: 0, width: corner, height: corner }],
    [width - corner, height - corner, corner, corner, { right: 0, bottom: 0, width: corner, height: corner }],
    [corner, 0, width - 2 * corner, rim, { left: corner, right: corner, top: 0, height: rim, width: `calc(100% - ${2 * corner}px)` }],
    [corner, height - rim, width - 2 * corner, rim, { left: corner, right: corner, bottom: 0, height: rim, width: `calc(100% - ${2 * corner}px)` }],
    [0, corner, rim, height - 2 * corner, { left: 0, top: corner, bottom: corner, width: rim, height: `calc(100% - ${2 * corner}px)` }],
    [width - rim, corner, rim, height - 2 * corner, { right: 0, top: corner, bottom: corner, width: rim, height: `calc(100% - ${2 * corner}px)` }],
  ];
  return (
    <span className={className} aria-hidden="true" data-approved-chrome={kind}>
      {pieces.map(([left, top, pieceWidth, pieceHeight, style], index) => (
        <svg key={index} style={{ position: 'absolute', ...style }} viewBox={`${left} ${top} ${pieceWidth} ${pieceHeight}`} preserveAspectRatio="none" focusable="false">
          <defs>
            <mask id={`${id}-${index}`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
              <rect width={width} height={height} fill="white" />
              {kind === 'title' ? (
                <path d="M 25 7 H 405 L 420 27 L 405 47 H 25 L 10 27 Z" fill="black" />
              ) : (
                <rect x={rim} y={rim} width={width - rim * 2} height={height - rim * 2} rx={kind === 'settings' ? 16 : 11} fill="black" />
              )}
            </mask>
          </defs>
          <image href={APPROVED_LANDING_SPRITE} x={-x} y={-y} width="1249" height="1061" mask={`url(#${id}-${index})`} />
        </svg>
      ))}
    </span>
  );
}

export function ApprovedTitleLight({ className }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 800 45" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><clipPath id={id}><rect width="215" height="45" /><rect x="645" width="145" height="45" /></clipPath></defs>
      <image href={APPROVED_LANDING_SPRITE} x="-147" y="-151" width="1249" height="1061" clipPath={`url(#${id})`} />
    </svg>
  );
}
