// One visual language for startup installation and notification enrollment.
export const promptPanel = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  background: 'radial-gradient(ellipse at 10% 0%, rgba(0,151,255,0.15), transparent 58%), linear-gradient(145deg, #19222b 0%, #080d13 52%, #101820 100%)',
  color: '#f3f7fc', border: '1px solid #475665', borderRadius: 14,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 #030609, 0 16px 48px rgba(0,0,0,0.65)',
};
export const promptPrimary = {
  minHeight: 44, padding: '11px 16px', borderRadius: 8,
  border: '1px solid #59c6ff',
  background: 'linear-gradient(180deg, #138ed0, #075384)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 3px 12px rgba(0,145,240,0.2)',
  color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
export const promptSecondary = {
  ...promptPrimary, border: '1px solid #465461',
  background: 'linear-gradient(180deg, #26323d, #131c25)',
  color: '#d4dfe9', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
};
export const promptEyebrow = {
  color: '#79cfff', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
  textTransform: 'uppercase', marginBottom: 7,
};
export const promptInteractionCss = `
  [data-startup-prompt] button:focus-visible { outline: 2px solid #8cdaff; outline-offset: 3px; }
  [data-startup-prompt] button:disabled { opacity: 0.55; cursor: wait; }
  @media (prefers-reduced-motion: reduce) { [data-startup-prompt] { animation: none !important; } }
`;
