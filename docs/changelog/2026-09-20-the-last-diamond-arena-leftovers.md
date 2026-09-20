# The last Diamond Arena leftovers

The Diamond Arena stopped being a World Hub destination of its own when it became a selection inside Poker Arena at `/hub/club-arena`. Four things in this repository had not been told, and each of them was quietly wrong rather than obviously broken.

`public/images/footers/world-hub/footer-diamond-arena-v2.png` was an orphan: 917KB of build input with zero references anywhere in the tree, confirmed with `git grep` before it was deleted.

`src/lib/liveHelp/jarvisKnowledgeBase.md` described the Diamond Arena on line 13 as "Competitive multiplayer poker tournaments". Line 319 of the same file already said the true thing, that the Diamond Arena is a selection inside Poker Arena at `/hub/club-arena`, so the knowledge base contradicted itself and the assistant could answer from either half. Line 13 now says what line 319 says.

`src/lib/liveHelp/knowledgeInjection.ts` keyed its `diamond_arena` category on `tournament|competitive|multiplayer`. Those are ordinary Poker Arena words, so an ordinary question about tournaments was categorised as Diamond Arena, and the switch in `getRelevantKnowledge` had no case for that category at all. The asker therefore received no knowledge whatsoever, which is worse than receiving the wrong knowledge because nothing about the answer shows that anything was missed. The category is now keyed on the arena itself, the three generic words route to `club_arena` where the Poker Arena knowledge lives, and `diamond_arena` gained a knowledge case describing the diamonds-only club, its automatic membership, its absence of unions and agents, and the fact that it has no route of its own.

`e2e/06-smoke.spec.ts` listed `diamond-arena` among the hub routes it checks. That list asserts only that a route answers with a status under 500, and `/hub/diamond-arena` answers 404, which is under 500, so the test passed on every run while proving nothing. There is no page file for the route and production returns 404. The route is out of that list and has an assertion of its own that pins the exact 404 and checks that `/hub/club-arena` answers, which is the difference between proving the route is retired and proving nothing at all.

`Smarter-Poker/Smarter-Poker-Diamond-Arena` was checked with `gh repo view` and is neither archived nor deleted: it is a live public repository. It therefore stays in the ESTATE lists in `scripts/ci/check-main-is-green.mjs` and `scripts/ci/check-prs-can-actually-merge.mjs`, and removing it would have blinded both watchdogs to a repository that still exists.

Both of those scripts were run locally against the real estate with a token. Each exits 1 and reports conditions that predate this change: fifty workflows silently red on main with no issue naming them, and thirteen open pull requests whose required checks cannot exist. Neither reports any failure to reach the Diamond Arena repository, which is the independent confirmation that it is still there.
