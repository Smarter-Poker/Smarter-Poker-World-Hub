/**
 * Styles for /compare and /compare/<slug> (AEO programme section 3.3).
 *
 * Handed to React as raw HTML (see inline-css-is-never-escaped.law), so the
 * quotes and ">" selectors below reach the browser intact.
 *
 * A comparison table never becomes a sideways scroller (the World Hub has no
 * "slide to see"): under 760px each row stacks into a card and every cell
 * prints its own column label from data-label.
 */
export const COMPARE_CSS = `
.cmp-page { min-height: 100vh; background: linear-gradient(180deg, #0a0a12 0%, #050510 100%); color: #e6ecf5; font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif; }
.cmp-article { max-width: 1040px; margin: 0 auto; padding: 48px 16px 64px; }
.cmp-crumbs { font-size: 13px; color: #8a97ad; margin: 0 0 16px; }
.cmp-crumbs a { color: #9fd8ff; text-decoration: none; }
.cmp-h1 { font-family: var(--font-orbitron), sans-serif; font-size: clamp(24px, 4vw, 36px); font-weight: 700; line-height: 1.25; color: #ffffff; margin: 0 0 16px; letter-spacing: 0.5px; }
.cmp-h2 { font-family: var(--font-orbitron), sans-serif; font-size: clamp(17px, 2.4vw, 21px); font-weight: 600; color: #ffffff; margin: 36px 0 12px; letter-spacing: 0.5px; }
.cmp-h3 { font-size: 16px; font-weight: 600; color: #ffffff; margin: 20px 0 6px; }
.cmp-lead { font-size: 17px; line-height: 1.7; color: #d4ddea; margin: 0 0 12px; }
.cmp-body { font-size: 15px; line-height: 1.7; color: #b8c4d6; margin: 0 0 10px; }
.cmp-checked { font-size: 13px; color: #7fd1a8; margin: 0 0 20px; font-weight: 600; }
.cmp-disclosure { font-size: 14px; line-height: 1.6; color: #e6ecf5; background: rgba(0, 198, 255, 0.08); border: 1px solid rgba(0, 198, 255, 0.25); border-radius: 10px; padding: 12px 14px; margin: 16px 0 8px; }
.cmp-list { margin: 0 0 10px; padding-left: 20px; }
.cmp-list li { font-size: 15px; line-height: 1.65; color: #b8c4d6; margin: 0 0 8px; }
.cmp-steps { margin: 0 0 10px; padding-left: 22px; }
.cmp-steps li { font-size: 15px; line-height: 1.65; color: #c7d2e2; margin: 0 0 10px; }
.cmp-link { color: #9fd8ff; text-decoration: underline; }
.cmp-table-wrap { margin: 20px 0 8px; }
.cmp-table { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5; }
.cmp-table caption { text-align: left; font-size: 13px; color: #8a97ad; padding: 0 0 8px; }
.cmp-table th, .cmp-table td { border: 1px solid rgba(255, 255, 255, 0.12); padding: 10px; vertical-align: top; text-align: left; }
.cmp-table thead th { background: rgba(0, 198, 255, 0.1); color: #ffffff; font-weight: 600; }
.cmp-table tbody th { color: #ffffff; font-weight: 600; background: rgba(255, 255, 255, 0.03); }
.cmp-table td { color: #c7d2e2; }
.cmp-own th[scope="row"] { color: #00c6ff; }
.cmp-unknown { color: #7f8ca3; font-style: italic; }
.cmp-sources { margin: 0; padding-left: 20px; }
.cmp-sources li { font-size: 13px; line-height: 1.6; color: #8a97ad; margin: 0 0 4px; overflow-wrap: anywhere; }
.cmp-sources a { color: #9fd8ff; }
.cmp-related { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); margin: 0; padding: 0; list-style: none; }
.cmp-related li { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(0, 198, 255, 0.18); border-radius: 12px; padding: 12px 14px; }
.cmp-related a { color: #00c6ff; font-weight: 600; text-decoration: none; }
.cmp-related p { font-size: 13px; line-height: 1.5; color: #b8c4d6; margin: 6px 0 0; }
.cmp-faq dt { font-weight: 600; color: #ffffff; margin: 14px 0 4px; font-size: 15px; }
.cmp-faq dd { margin: 0; font-size: 15px; line-height: 1.65; color: #b8c4d6; }
.cmp-compliance { font-size: 12px; line-height: 1.6; color: #7f8ca3; margin: 32px 0 0; }
@media (max-width: 760px) {
  .cmp-table, .cmp-table tbody, .cmp-table tr, .cmp-table th, .cmp-table td { display: block; width: 100%; box-sizing: border-box; }
  .cmp-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .cmp-table tr { margin: 0 0 14px; border: 1px solid rgba(0, 198, 255, 0.2); border-radius: 10px; overflow: hidden; }
  .cmp-table th, .cmp-table td { border: none; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .cmp-table td::before { content: attr(data-label); display: block; font-size: 12px; font-weight: 600; color: #8a97ad; margin: 0 0 2px; }
}
`;
