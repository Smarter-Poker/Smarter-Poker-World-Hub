# Internal Links Reach A Page (2026-11-28)

The post-deploy Live SEO Contract (`scripts/ci/check-live-seo-contract.mjs`) failed on production after #3264 with three internal links that did not land on a page. None came from that change; the crawl's sample happened to include them. Each is fixed where the link is made.

## What changed

- **Training footer "Play".** It pointed at `/hub/training/play-mode`, a server redirect shim into `/hub/training/arena/cash-001?level=1`, so every tap and every crawl paid a 307 hop. The World footer and menu now link the destination. The shim stays for old bookmarks; `e2e/020-hamburger.spec.ts` follows the new href.
- **Rules glossary chips.** `pages/rules/[slug].js` printed `/glossary/<slug>` for every `relatedTerms` entry. Four terms the glossary never defined (`club-arena`, `side-pot`, `all-in`, `push-fold`) produced six dead links across six rulings. `getStaticProps` now filters through `glossaryLinksFor(..., readGlossaryTerms())`, the same resolver the lessons use, so a chip appears exactly when its page exists.
- **Series state directory.** Series pages linked `/hub/poker-near-me/in/<state>` from the state code alone. That page answers 404 when the directory lists no rooms in the state (a Missouri series hit it). `getServerSideProps` now asks the same directory lookup the state page uses and sets `stateDirectoryPath` only when that state has rooms; any failure means no link.

## Guard

`__tests__/an-internal-link-reaches-a-page.law.test.mjs` fails if a World footer or menu item points at a page that only redirects, if rules render `relatedTerms` unfiltered, or if the series page builds the state link without checking the directory. `/hub/marketplace` is the one recorded exception: it is the Marketplace world's address, answered by a permanent 308 in `next.config.js`, and the footer route matrix requires the physical page.

## Follow-up: the series breadcrumb

Checking a Missouri series on production after #3277 showed the visible link was gone but the page's BreadcrumbList structured data still cited `/hub/poker-near-me/in/mo` (404). `seriesSchema` in `src/lib/poker-near-me/seriesSeo.mjs` now uses the same server-confirmed `stateDirectoryPath`, and skips the state crumb when the directory has no rooms. The law test covers both cases.
