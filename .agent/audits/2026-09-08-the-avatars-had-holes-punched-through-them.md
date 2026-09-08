# The avatars had holes punched through them, and the guard against it never looked

2026-09-08. Dan: _"CHECK ALL THE AVATARS, BUT THEM AGAINST A BLACK BACKGROUND SO
YOU CAN SEE ANY THAT NEED TO BE FIXED, FIND ANY AND ALL DISTORTIONS AND FIX THEM
ALL AS YOU FIND THEM."_

Against the slate the picker uses they look fine. Against black they are not.
`vip_geisha_master` has two black wedges torn out of her white face makeup.
`free_penguin` has holes through its belly, `free_knight` through its armour,
`vip_silent_actor` through his face **and** the front of his shirt,
`free_detective` through the lens of his magnifying glass, `vip_liberty` through
her robe, `free_cyborg` through its chassis, `vip_unicorn` through its muzzle.

A background remover took the subject wherever the subject was close to the
backdrop in colour, so it went for the light-coloured avatars almost without
exception: **86 of the 100 busts and 66 of the 100 gallery tiles**. On the felt
they render as green tears through the character.

## 1. Nothing was watching, in three separate ways

`scripts/check-avatar-integrity.mjs` opens with:

> A background remover punched transparent holes THROUGH 26 of the 100 subjects
> — the eagle's crown, the unicorn's body, the geisha's face. ... All three are
> now repaired. This is what stops them coming back.

It checks that every bust has a gallery tile, that no two tiles are
byte-identical, and that the retired generator still has its guard. **It never
opens an image.** The one fault of the three that lives in the art has had no
detector since the day it was written.

It is also not in any workflow, so it has not run.

And it had gone stale on its own terms: it asks for `${name}.png`, but
`chore/the-avatars-lose-three-quarters-of-their-weight` converted the library to
WebP, so it failed on all 100 avatars. Nobody saw that either, for the same
reason.

## 2. The hard part is telling a hole from a gap

An enclosed transparent region is not automatically damage. The space between a
panther's whiskers is enclosed. So is the space between two spikes of a badger's
fur, the ring inside the angel's halo, and the space between Liberty's raised arm
and her head. Fill those and the whiskers become a web and her arm welds to her
face.

What separates them is **how thick the wall is**. A hole eaten out of a face sits
behind 20-40px of solid subject; a gap between whiskers is behind a strand two or
three pixels wide. So the rule is a breadth-first distance inward from the
outside matte, cut at 5px on a 340px bust and scaled with the image:

| avatar              | deep (fill) | thin (leave) | what the thin ones are |
| ------------------- | ----------- | ------------ | ---------------------- |
| `vip_geisha_master` | 4325        | 5            | nothing                |
| `vip_unicorn`       | 4007        | 82           | mane strands           |
| `vip_liberty`       | 3330        | 45           | crown spikes           |
| `free_knight`       | 1603        | 45           | helmet grille          |
| `free_penguin`      | 834         | 35           | feather tips           |
| `vip_badger`        | 715         | 76           | fur spikes             |
| `vip_phoenix`       | 180         | 98           | flame wisps            |
| `vip_panther`       | 27          | 94           | whiskers               |

panther and phoenix are the proof it works: almost entirely thin, so a rule that
filled every enclosed region would have webbed both.

## 3. Where the rule alone is not enough

It is not enough, and I found that out by making the mistake. Scaled to the whole
library the wall rule filled the inside of the angel's halo — making it a solid
gold disc — and the gap between Liberty's arm and her head.

**Four automatic discriminators were tried and all four mix the two up:**

| measure                    | says fill              | says keep, same number |
| -------------------------- | ---------------------- | ---------------------- |
| wall / sqrt(area)          | knight 0.22            | liberty 0.22           |
| compactness P^2/4piA       | geisha 2.4             | liberty 2.4            |
| soft-rim fraction          | 0.000                  | 0.000 — the whole library was cut with a hard threshold |
| colour under the matte     | cleared by the encoders | cleared by the encoders |

So there is no rule. Every one of the **171 candidate regions** was cropped,
rendered on black and looked at one at a time, and the seventeen that are meant
to show the felt are named in `KEEP_SEE_THROUGH` with what each one is. The guard
reads the same list from the same module, so the two cannot drift apart.

## 4. The repair

Each hole is filled by solving Laplace's equation on it with the surrounding
subject as a fixed boundary — every filled pixel becomes the average of its
neighbours. On a pyramid, because plain Jacobi needs iterations proportional to
the square of a hole's width and the geisha's tear is 70px across. The result is
smooth rather than textured, which is exactly right for what these holes are
eaten out of: flat face makeup, armour, robes, a chest.

**A repair must not change what a file costs.** The two halves of the library are
not encoded alike — the 1024px gallery tiles sit near q82 (geisha_master is
107KB; q92 would make it 130KB) while the busts are nearer q92 (free_geisha@2x is
35KB; q92 gives 28KB). One setting for both either inflates the gallery by a
fifth or throws 8dB away on the art players actually look at. So each file keeps
its own budget: try 92, 86, 82, 78, 74 and take the best that comes in no larger
than the file it replaces.

**208 files, 533,616 bytes smaller than what they replace.**

## 5. What stops it coming back

`__tests__/avatar-art-has-no-punched-holes.test.mjs`, added to CHECK 8 of
`build-safety-gate.yml` so it actually runs. It measures the thing its name
claims, using the same classifier as the repair.

Verified red on the art as it was — `table/vip_geisha_master@2x.webp (4158px)`
and `vip/liberty.webp (2185px)` — and green after.

`scripts/check-avatar-integrity.mjs` keeps the three checks it really performs,
is corrected to ask for WebP, and points at the test rather than claiming a
measurement it does not make. Two detectors for one fault is how they drift apart
and start disagreeing.

## 6. Measured and found sound

Backgrounds and the rest of the avatar library were checked in the same pass and
are fine: all 209 avatar files are transparent cut-outs with no baked-in
backgrounds and no blanks, every one of the 100 characters has all its variants,
and every avatar renders `object-fit: cover` so none is aspect-distorted. The
`portrait/*.webp` set reads clean on black — the "edge brighter than interior"
signal on five of them is rim lighting on the outline, which is how they were
drawn.

`free_rockstar` carries a floating "POKER PRO" badge clipped by the frame edge.
That is an authoring decision rather than damage, and it is left alone.

## 7. Three other things closed in the same pass

**`public/avatars/table/SAMPLE_viking.webp` is deleted.** A 78x125 development
leftover from `scripts/create-sample.js`, backed by no source avatar, referenced
by nothing in `src/` or `pages/`, and shipping in `public/` to every visitor.

**`public/table-skins/club-arena-felt.png` did not match the geometry in the
stylesheet beside it.** `src/styles/club-arena-table.css` positions everything
from `left: 13.3%; top: 8.9%; width: 73.2%; height: 80.3%`, which assumes a
painted table of 565x980 centred on (302.5, 499.5). The PNG painted 517x914
centred on (302.0, 505.5) — 8% too small and 6px low, so anything positioned by
those percentages would have landed inside the painted rail. Resampled onto the
canonical box; it now measures 566x980 centred on (302.5, 499.5). Same fault and
same fix as Club Arena's own skins on the same day.

**And that stylesheet renders nowhere.** `pages/_app.js` imports it, but no
component in `src/` or `pages/` applies a single `ca-table__*` class — one grep
hit, and it is the comment in `_app.js`. 383 lines of CSS and a 477KB PNG ship on
every page load and paint nothing. It is not deleted here: it was written to
replace six divergent table implementations and that is a design call, not a
silent one. The status is now recorded in the file's own header so the next
reader is not misled by it.

## 8. And then I broke the deployment explaining the fix

Deployment `2d79fd9` for #1632 went to ERROR on `main`. Not the cache change —
the comment beside it. `vercel.json` is strict JSON and Vercel validates it
against a schema that allows only `source`, `headers`, `has` and `missing` in a
headers entry, so the `"_comment"` I added to explain why the TTL dropped from 30
days to 1 was an unknown key and the deployment was refused:

    headers[31] should NOT have additional property `_comment`

**Every gate upstream was green, and there was no build log to read.** A
schema-invalid config fails the DEPLOYMENT, before a build starts — so
`npm run build` never ran, no test read the file, and the pre-push hooks read
source rather than config. The only place it appeared was a red row on the
Vercel dashboard, and it was found because Dan looked at it and said so.

**Fixed by #1633, not by me.** Another agent reached the same diagnosis first,
removed the key, and added `__tests__/vercel-json-is-deployable.law.test.mjs`
with the real error message in its header, a key allowlist for headers, rewrites
and crons, shape assertions, and the avatars TTL kept as an assertion — wired
into `prebuild`, so `npm run build` refuses before a deploy can. That is a better
guard than the one I had written, and it already carries the knowledge my
`_comment` was trying to hold.

So my version was deleted rather than added. Two detectors for one fault is how
they drift apart and start disagreeing — the same argument this audit makes in
section 5 about not re-implementing the hole check in
`check-avatar-integrity.mjs`. Applying it to my own work when somebody else got
there first is the only version of that rule that means anything.

What survives from my branch is this record, and the cache change itself, which
was correct and is still on `main`: `max-age=86400, stale-while-revalidate=604800`.

The lesson is narrower than "do not comment JSON". The reasoning wanted to be a
check, not a comment — a comment in a file nothing validates cannot stop the
thing it warns about, and this one could not even survive being written down.
