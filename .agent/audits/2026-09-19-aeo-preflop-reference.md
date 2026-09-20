# The Charts Were Not On The Chart Page

2026-09-19. AEO phase 3, preflop reference content.

## What Was Measured

`/hub/preflop-charts` served 112 words to a crawler: its summary block and
nothing else. The range lab draws the charts after mount, so the one
question the page exists to answer, what a position opens, was written
nowhere a reader without JavaScript could find it.

The corpus was never behind a fetch. `src/config/solverRanges.js` is bundled
with the app and `/api/training/preflop-ranges` reads it straight out of the
module. "What does under the gun open in six handed cash?" is a question an
engine is asked and can only answer from a page that says so in words.

```
before   112 words
after  1,783 words
```

Six opening ranges, four big blind defending spots and three four betting
spots, with every mixed hand and its frequency.

## Two Numbers, Not One

A mixed range has two honest sizes and they are far apart:

```
position   by frequency   reaches
UTG                 8.4      13.6
MP                 10.9      17.3
HJ                 13.2      20.5
CO                 16.8      24.9
BTN                25.2      40.0
SB                 20.7      33.0
```

The first counts every hand at the rate it is actually played. The second
counts any hand the range touches at all. Publishing one of them and calling
it "the range" would be wrong about half the time, so the page prints both
and says which is which.

## A Discrepancy Worth Knowing About

The inline comments in `src/config/solverRanges.js` quote a third set of
numbers, higher again than either:

```
position   comment says   reaches   by frequency
UTG               ~15.5      13.6            8.4
MP                  ~19      17.3           10.9
HJ                  ~22      20.5           13.2
CO                  ~27      24.9           16.8
BTN                 ~48      40.0           25.2
SB                  ~42      33.0           20.7
```

They track the reach measure and sit consistently above it. They read like
intent rather than measurement: a note of the range that was meant to be
authored, kept beside the range that was.

Nothing on the page quotes them. They are worth a look at the source,
because a teaching file whose comments disagree with its data will
eventually teach the comment.

## Provenance

The corpus is an authored six handed cash reference at one hundred big
blinds. It is not a solver export and carries no solve tree or checksum;
`/api/training/preflop-ranges` states exactly that in its own disclosure.
The page now states it too. A page that prints ranges without that sentence
claims more than the data supports.
