# Poker Near Me wears one frame, and its pictures are its own

Every Poker Near Me page and sub-page, swept for frames and for images at
375 and 1440 against the live site and then against the working tree.

The surface was half framed. The painted three-slice chassis was on the
cards, the calendar and the tour and series panels, and nothing else: all
fifteen section headings on the stacked discovery page were bare text on
black, six of them over a CSS hairline and nine with no rule at all; the
four directory headings on the location pages were the same; the About
block under the lobby deck, the Recently Viewed strip and the shared page
summary were plain boxes with a one-pixel border. Those now ride the same
painted chassis as everything around them, capped at the master art's own
1000px so the head slice is never stretched into a banner.

The location hero was drawn inside a second frame it did not need. A
selector on a long list of deep-route containers was painting a plain
rectangle at a specificity that beat the console's own `border: 0`, so the
ornate frame sat inside a grey box. The box is gone under the location
hero, the hero's height follows its content, and the dead space under
"Open Live Map" fell from 34 to 16 rows at 375 and from 58 to 24 at 1440.
The crest that holds the top-right of that hero was overlapping the
headline outright at 1280 - measured at minus 17.6px - and now clears it by
81.7px, which turned "Poker Rooms In Chicago, Illinois" from three lines
into two.

The browse chips were a painted ornament stretched across a flexible cell,
so the end caps thinned out and the label floated in the middle of an empty
frame. Three declarations written for the flat row these used to be were
taking the chassis apart: a gap that pushed the three slices apart, an
alignment that let the middle slice shrink while the head and foot stayed at
cell width, and a fixed four-column grid. A chip now fits its label: the
empty painted arm fell 80% on the national index and 68% on a state index.

The lobby's cinematic backdrop was a fixed-width plate in a full-width page,
letterboxed by 180 flat black pixels either side at 1440 and 420 at 1920.
It now spans the viewport, and because the art is wider than the old crop
the holographic table comes further into frame at every step rather than
being stretched. The deck above it did not move by a pixel at any width.

Every venue in the directory was drawing the same picture. The card asked
for two photo columns that are null for every row and fell through to one
shared fallback, so four hundred rooms looked like one room. The card now
carries the room's own mark, seated at its own size in a painted holder -
those files are 54px logos, not photographs, so stretching one across the
photo band would have re-created a regression this code already carries a
note about - and the last-resort plate varies by room type.

Two broken files. `cppt.png` was not an image at all: it was a saved
Wikimedia error page with a .png name, referenced from two components. Both
now point at the valid `cppt.jpg` beside it and the corrupt file is deleted.
And a count that read "1 Venues" eight times on the national index and ten
times on a state index now reads "1 Venue", with "1 Cities" corrected the
same way.

No new artwork was drawn, no string was rewritten, no hue outside black,
blue, teal, silver and white was introduced, and no frame was built out of
borders, radii and shadows where the gate requires painted art.
