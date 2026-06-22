# MLB Props — phantom ELITE bug + stale presentation + MLB-wide UI (2026-06-22)

## TL;DR
User reported a contradiction: a "Stale Slate — Not Actionable" banner sitting on
the highest Bet Scores ever (99/98/97 ELITE). Diagnosed (subagent + live DB) as a
**wrong-side price pairing** bug, fixed it on the hub, reframed stale slates as
graded results, and applied a platform-wide MLB font bump (~+30%) + Title-Case
pass. Engine-side root causes handed off.

## Root cause (the phantom scores)
`pred_props.best_price`/`best_lines` store **only the best OVER price** (engine
`daily_predict.py` ~1430-1441). The hub API inferred the side and, for UNDER recs,
paired the under win-prob with the OVER price → fabricated EV. Andrew Vaughn HRR
under: 55.6% priced against a +115 OVER line → "99 ELITE / +19.5%"; engine said
NO BET; it lost. Top-15 by edge went 5-6 (45%). The "+115 best vs -123 MKT" the
user saw were opposite sides.

## Hub fixes (shipped)
`pages/api/mlb/props.ts`
- Side-correct price: real over price for overs; for unders the no-vig **fair
  under price + a ~2.3pt vig** (honest, slightly-conservative) instead of the
  over price. `best_book`/`best_lines` nulled for unders. New `price_estimated`.
- Stale/closed slate: returns `is_stale`, `result`, `pnl`, and a graded `results`
  recap computed over the engine's **actual bets** (`rec="BET…"`) — not all 1000
  priced props (which had inflated the recap to +997u).

`pages/hub/MLB-ANALYTICS/props.tsx`
- On a closed slate: WON/LOST/PUSH result badges replace Bet Score badges, the
  header shows Record/Units, and the banner reads "Last Graded Slate · Results".
- Odds display the side-correct line; estimated under prices labelled "EST".

## UI pass (all MLB pages)
- Fonts bumped ~+30% across all 17 MLB pages + MLB components (text-[Npx],
  named sizes, fixed leading). Scripted, esbuild-verified.
- Capitalization → Title Case: `uppercase`→`capitalize`, all-caps JSX text and
  `label=` values title-cased; props page also covers formatProp/FILTERS/result
  text. (Some per-page helper-derived labels may still need a follow-up sweep.)

## Verified
- Live (prod `ef032b0e`): official_date 2026-06-20, `is_stale:true`, result
  badges, top board now honest plus-money OVERS (97/93/90) not phantom unders.
- esbuild transpile clean on all 24 changed files.

## Handed off (engine — cannot fix from hub)
`.agent/handoffs/2026-06-22-mlb-engine-under-prices-and-odds-pipeline.md`:
(1) store best UNDER price/lines so unders can be scored on real prices;
(2) the odds pipeline has not priced 6-21/6-22 (0 priced rows) — that outage is
why the page is stale at all.
