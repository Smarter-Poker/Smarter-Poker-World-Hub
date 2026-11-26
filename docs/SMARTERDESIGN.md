# #SMARTERDESIGN

#SMARTERDESIGN is the Smarter.Poker interface used for the approved Club Arena console, Bankroll Manager, and Toke Tracker.

## Material and hierarchy

Use an ink-navy canvas, a single continuous steel edge, cobalt for the selected control, and an ice-blue highlight. The page title sits inside the product. Keep the existing app header, footer and navigation in their established positions. Give the product its own title and meaningful artwork where available. Reuse a badge once. Remove leaves, diagonal neon slashes, duplicate artwork, overlapping frames and old background images underneath rebuilt panels.

Use title case for interface labels. Preserve usernames, identifiers, real product names, units and conventional acronyms. Use strong condensed type for titles, readable labels for controls, and tabular figures for balances and statistics. Align comparable amounts on the same edge. Give each metric its unit and keep its label beside it, including on narrow phones.

## Image headers

The Cashier header is the visual reference for every #SMARTERDESIGN page image header. Use the following composition inside one continuous steel rim.

- Place a bold, recognizable page icon on the left in a circular chrome frame. Reserve room for the full circle at phone widths.
- Set the page name beside the icon in bold, solid white or silver type. Keep lettering live and selectable, with a uniform fill through the middle of each letter. Keep any existing meaningful club name above the title.
- Transition the dark title area smoothly into a realistic scene on the right. Give each page its own icon, subject and composition. The vault belongs to Cashier. Carry the framing and typography across pages while choosing artwork that identifies each destination.
- Anchor a working question-mark button in the upper-right corner. Give it a page-specific accessible name, visible keyboard focus and at least a 44px touch target. It opens that page’s help, FAQs or tutorial. Keep both the title and the help control clear when the title wraps or the artwork crops.

![Cashier reference showing the circular chip emblem, title, vault scene and help button](../.agent/skills/smarterdesign/references/cashier-header.webp)

The approved lettering treatment for new work is solid white or silver. Preserve the product’s locked global header and footer around the page image header.

## Color

Use white for primary text, silver for secondary text, and ice blue or cyan for emphasis, links and focus. Use signed amounts and semantic green or red for actual gains, losses and errors. Use a text label or symbol alongside color when the distinction matters.

Never use yellow, gold, amber, purple, violet, lavender, pink or magenta text anywhere. Apply the rule to headings, values, links, badges, chart labels, legends, tooltips, input placeholders, disabled controls, print and export previews. Set the color at its source. Leave uploaded photographs and original records intact.

## Controls and responsive layout

Use one frame per surface. Group related information with spacing, dividers and headings. Keep the primary action visible and subordinate secondary actions. Mark selection visually and expose it to assistive technology. Give buttons a visible keyboard focus, pressed and disabled state and a comfortable touch target. Use one simple view with authorized tools available in context.

Allow long lists, ledgers and dialogs to scroll vertically. Keep amounts and actions reachable above the actual footer. Let a long label wrap or move the entire value below its label. Keep avatars in a reserved column when identities are displayed. Make charts fit the viewport and give their numbers readable text equivalents. Respect reduced motion and keep live status quiet between meaningful updates.

Apply the treatment to every control and display in a workflow, including the working form, its close button, selected filters, chart annotations, readouts and empty states. Use a clear, labeled close control with a 44px touch target. Center adjustment dialogs in the viewport and keep fields and dismissal reachable with the keyboard and on small screens.

In Bankroll Manager, open the dashboard on a normal entry. Show the launcher there and place Jarvis Insights at the bottom. Each destination has a Back To Dashboard control. A header Add + opens the existing entry flow wherever the user can create records. Place contextual descriptions, FAQs and tutorials behind the upper-right question mark on the product header. Keep required field labels, form feedback and units visible.

## Interior review on every design change

**Full click-through coverage.** Start at each real entry point in the assigned product. List every mode, tab, linked subpage, drill-down, evidence view, editor, popup, chart, filter, and expanded section it exposes. Follow each path until it reaches its final usable screen. Apply #SMARTERDESIGN to the contents, controls, data, empty states, and return path at every level. Track each destination against an observed interaction and visible result. For role-specific paths, check the authorized experience and record any remaining access or data gap.

Open each affected page, expanded panel and dialog through its normal controls. Review the inside of the workflow as carefully as its header. In a calendar form, group the event details together, give the reminder its own row, and place Save and Cancel together in a reachable footer. In analytics, give period controls, figures, chart, and breakdowns distinct spaces. In a reference tool such as Jarvis, keep the question, submit action, answer, and earlier questions identifiable.

Use a continuous steel rim around each intended surface. Separate information within the surface with headings, consistent gutters and alignment. Fit the frame to its contents. Reserve space for icons and actions, align comparable numbers and units, and let long names or values wrap without covering adjacent content. Use purpose-made, recognizable artwork at a size where its subject is clear. Replace weak, stretched or repeated imagery at the source.

Check the actual page at a narrow phone width and at desktop width. Open the dialog, enter a value, change a filter, expand a section and dismiss it using the available controls. Check applicable populated, empty, loading, error and disabled states. Inspect focus, scrolling, readable chart labels, complete frame edges and the last action above the footer. When an issue recurs in another affected view, fix the owning component or shared layout, then exercise both views. Finish with a review of the rendered interior and its working controls.

## Applying the style in World Hub

Use the source classes in `styles/smarterdesign.css` for mastheads, sections, metrics, tabs and actions. Product components own the layout of their data. The native layout and authentication, financial calculations, persistence, entitlements and navigation remain the source of truth.

Review the actual routes on narrow mobile and desktop. Exercise the normal controls and their visible results. Inspect loading, populated, empty, disabled and error states where supported. Check chart and portal text in the rendered page. Confirm the deployed revision and real signed-in page before reporting a release.
