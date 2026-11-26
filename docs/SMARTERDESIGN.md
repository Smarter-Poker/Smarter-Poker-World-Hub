# #SMARTERDESIGN

#SMARTERDESIGN is the Smarter.Poker interface used for the approved Club Arena console, Bankroll Manager, and Toke Tracker.

## Material and hierarchy

Use an ink-navy canvas, a single continuous steel edge, cobalt for the selected control, and an ice-blue highlight. The page title sits inside the product. Keep the existing app header, footer and navigation in their established positions. Give the product its own title and meaningful artwork where available. Reuse a badge once. Remove leaves, diagonal neon slashes, duplicate artwork, overlapping frames and old background images underneath rebuilt panels.

Use title case for interface labels. Preserve usernames, identifiers, real product names, units and conventional acronyms. Use strong condensed type for titles, readable labels for controls, and tabular figures for balances and statistics. Align comparable amounts on the same edge. Give each metric its unit and keep its label beside it, including on narrow phones.

## Color

Use white for primary text, silver for secondary text, and ice blue or cyan for emphasis, links and focus. Use signed amounts and semantic green or red for actual gains, losses and errors. Use a text label or symbol alongside color when the distinction matters.

Never use yellow, gold, amber, purple, violet, lavender, pink or magenta text anywhere. Apply the rule to headings, values, links, badges, chart labels, legends, tooltips, input placeholders, disabled controls, print and export previews. Set the color at its source. Leave uploaded photographs and original records intact.

## Controls and responsive layout

Use one frame per surface. Group related information with spacing, dividers and headings. Keep the primary action visible and subordinate secondary actions. Mark selection visually and expose it to assistive technology. Give buttons a visible keyboard focus, pressed and disabled state and a comfortable touch target. Use one simple view with authorized tools available in context.

Allow long lists, ledgers and dialogs to scroll vertically. Keep amounts and actions reachable above the actual footer. Let a long label wrap or move the entire value below its label. Keep avatars in a reserved column when identities are displayed. Make charts fit the viewport and give their numbers readable text equivalents. Respect reduced motion and keep live status quiet between meaningful updates.

## Applying the style in World Hub

Use the source classes in `styles/smarterdesign.css` for mastheads, sections, metrics, tabs and actions. Product components own the layout of their data. The native layout and authentication, financial calculations, persistence, entitlements and navigation remain the source of truth.

Review the actual routes on narrow mobile and desktop. Exercise the normal controls and their visible results. Inspect loading, populated, empty, disabled and error states where supported. Check chart and portal text in the rendered page. Confirm the deployed revision and real signed-in page before reporting a release.
