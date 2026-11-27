/**
 * smarterHardwareStyles.js — Zero-CSS-Import #SMARTERDESIGN Hardware Style Tokens
 *
 * Mirrors src/components/vip/VipKit.module.css and docs/SMARTER-POKER-DESIGNS.md
 * in plain JS objects so every SEO, AEO, and GEO component can render authentic
 * sharp-cornered machined chrome hardware while remaining 100% loadable in bare
 * Node test harnesses without CSS module loaders.
 */

export const SMARTER_INKS = {
  text: '#f2f7ff',
  silver: '#bdd0e2',
  ice: '#86daff',
  cyan: '#38bdf8',
  line: '#304d6b',
  lineBright: '#4895d9',
  emerald: '#34d399',
};

export const SMARTER_FRAME = {
  position: 'relative',
  boxSizing: 'border-box',
  minWidth: 0,
  borderRadius: 0,
  border: '6px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
  background:
    'radial-gradient(120% 70% at 50% -10%, #1b426e 0%, transparent 62%), linear-gradient(160deg, #15293e 0%, #0a1a2b 44%, #040d18 100%)',
  boxShadow: '0 14px 28px rgba(0, 0, 0, 0.68), 0 0 0 1px #02070d',
  color: '#f2f7ff',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

export const SMARTER_FRAME_ACTIVE = {
  position: 'relative',
  boxSizing: 'border-box',
  minWidth: 0,
  borderRadius: 0,
  border: '6px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-active.webp') 21 / 8px stretch",
  background:
    'radial-gradient(115% 80% at 50% -15%, #1d4e89 0%, #0b2038 50%, #040d18 100%)',
  boxShadow:
    '0 18px 34px rgba(0, 0, 0, 0.74), 0 0 0 1px #02070d, 0 0 24px rgba(45, 157, 255, 0.22)',
  color: '#f2f7ff',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

export const SMARTER_ROW = {
  position: 'relative',
  boxSizing: 'border-box',
  minWidth: 0,
  borderRadius: 0,
  border: '1px solid #2b4663',
  background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
  boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.16), inset 0 -1px 0 rgba(0, 0, 0, 0.7)',
};

export const SMARTER_STAT = {
  position: 'relative',
  boxSizing: 'border-box',
  minWidth: 0,
  borderRadius: 0,
  border: '4px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-stat.webp') 11 / 5px stretch",
  background: 'radial-gradient(110% 80% at 50% 0%, #153f6c 0%, #08192c 52%, #030a13 100%)',
  boxShadow: 'inset 0 3px 10px rgba(0, 0, 0, 0.82)',
};

export const SMARTER_EYEBROW = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 24,
  padding: '2px 10px',
  borderRadius: 0,
  border: '1px solid #3a7fbd',
  background: 'linear-gradient(180deg, #12406f 0%, #082341 100%)',
  boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.45), 0 1px 0 #010509',
  color: '#86daff',
  fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
};

export const SMARTER_BTN_PRIMARY = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 44,
  padding: '0 16px',
  borderRadius: 0,
  border: '1px solid #5bc0ff',
  background: 'linear-gradient(180deg, #1f6feb 0%, #11449e 100%)',
  boxShadow:
    'inset 0 1px 0 rgba(186, 234, 255, 0.58), inset 0 -2px 0 rgba(5, 18, 45, 0.72), 0 4px 12px rgba(17, 68, 158, 0.45)',
  color: '#ffffff',
  fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
  fontSize: 13.5,
  fontWeight: 800,
  letterSpacing: '0.05em',
  textDecoration: 'none',
  cursor: 'pointer',
};

export const SMARTER_BTN_SECONDARY = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 0,
  border: '1px solid #3f5d7b',
  background: 'linear-gradient(180deg, #172b42 0%, #0b1827 100%)',
  boxShadow: 'inset 0 1px 0 rgba(189, 208, 226, 0.26), inset 0 -2px 0 rgba(0, 0, 0, 0.7)',
  color: '#86daff',
  fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textDecoration: 'none',
  cursor: 'pointer',
};
