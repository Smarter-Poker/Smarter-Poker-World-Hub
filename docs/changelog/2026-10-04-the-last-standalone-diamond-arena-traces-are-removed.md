# The last standalone Diamond Arena traces are removed

World Hub half of Phase 12 of the Diamond Arena programme. The standalone
`/hub/diamond-arena` pages (which framed `https://diamond.smarter.poker`) were
already gone; Diamond Arena is now a selection inside Poker Arena at
`/hub/club-arena`. A read-only inventory found seven leftovers. This removes them.

## Removed or corrected

1. `next.config.js` - dropped the `images.remotePatterns` entry for
   `diamond.smarter.poker`, the dead iframe origin. The `*.smarter.poker`
   wildcard still covers any stored image URL. Nothing else in the file changed.
2. `src/world/WorldHub.tsx` - comment said Toke Tracker is injected "after Social
   Media + Diamond Arena"; it now says what the code does (splice at index 2).
   Comment only.
3. `src/config/hamburgerMenus.js` - comment cited "diamond-arena configs
   (?category=vip)", which no longer exist. Comment only.
4. `scripts/inject-seo-round2.mjs` - removed the empty `// Diamond Arena sub-pages` heading.
5. `src/world/components/GlobalSearch.tsx` - removed the separate `'Diamond Arena'`
   entry from the mock result list; `'Poker Arena'` is already there. The list is
   a plain string array, so nothing else needed adapting.
6. `src/lib/geevesKB/trainingAndDiamonds.js` (`ds-3`) - the answer described the
   retired product and its Schedule / History / Leaderboard / Stats / Table
   Settings sub-pages. It now says what `src/lib/liveHelp/knowledgeInjection.ts`
   and `src/lib/liveHelp/jarvisKnowledgeBase.md` say: a selection inside Poker
   Arena at `/hub/club-arena`, played with Diamonds, automatic membership, shared
   Diamond wallet, funded Diamond games not open yet. The three follow-up
   questions asked about buy-in levels, the schedule and a leaderboard, so they
   were replaced too. Entry id, category, keywords and patterns are unchanged.
7. `src/lib/geevesKB/worldHub.js` (`wh-14`) - removed "Diamond Arena - Biggest
   diamond earners" from the leaderboard categories. `pages/hub/leaderboards.js`
   has four tabs (Overall, Check-ins, Reviews, Activity) and no diamond category.
   The rest of the entry is untouched.

## Guard

`__tests__/poker-arena-entry.test.mjs` (run by `prebuild`) now also asserts that
`next.config.js` names no `diamond.smarter.poker` host, that the GlobalSearch mock
list has no standalone Diamond Arena result, that `ds-3` names Poker Arena and
`/hub/club-arena` and none of the retired sub-pages, and that `wh-14` does not
claim a Diamond Arena leaderboard.

## Deliberately left

- `pages/terms.js`, `pages/legal/official-rules.js` - legal copy; an owner decision.
- `src/state/worldStore.ts` - stale-storage guard for browsers that still hold
  the old world id; kept on purpose.
- `scripts/ci/check-main-is-green.mjs`, `scripts/ci/check-prs-can-actually-merge.mjs` -
  repository lists that still name the old GitHub repo; kept while that repo exists.
- `public/cards/diamond-arena.png` - approved artwork, pinned by this same test.
- `pages/investor.js`, everything wallet / store / VIP, every `supabase/migrations`
  file, and `docs` / `.agent` history - out of scope for this phase.

## Noticed, not changed

- `wh-14` still lists other leaderboard categories (Training Accuracy, Trivia,
  Tournament Wins, Social Influence, Bankroll, Toke Tracker) that the leaderboards
  page does not have either. Only the Diamond Arena claim was in scope.
- `ds-1` in `trainingAndDiamonds.js` still lists "Diamond Arena tournament
  buy-ins" under what diamonds buy and offers "What is the Diamond Arena?" as a
  follow-up. It is a Diamond Store entry, so it was left for the store owner.
