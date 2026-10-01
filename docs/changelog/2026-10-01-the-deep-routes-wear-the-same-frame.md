# The deep routes wear the same frame, and nothing on them is amber

The second pass over Poker Near Me, after the first put the painted chassis
on the discovery page and the location pages.

The plain rectangle is gone from the rest of the family. One selector in
`poker-near-me-command-surfaces.css` draws a one-pixel box, a radius and a
large shadow on a list of deep-route containers, and it computes at
specificity 0,3,2 because `:is()` takes the weight of its heaviest argument
and one of them carries a pseudo-class. Every painted surface trying to opt
out was declaring `border: 0 !important` at 0,3,1 and losing. The venue
profile, the tour header and the series header now opt out at 0,4,1. The
shared rule is untouched. On the tour header that box had been drawn hard
against both screen edges at 1440, a full-bleed 1440-wide hairline; the
header is now a painted panel capped at the master's own 1000px.

The venue profile printed its breadcrumbs twice, the second time in a plain
rectangle 83 rows tall on a phone, and its identity header was bare copy in
a one-pixel box sitting directly under the painted chassis. The duplicate is
gone with no link or label lost, and the header matches the deck above it at
every width.

Every venue profile in the catalogue drew the same picture. None of the 478
rows carries a cover photo, so one fallback was the hero on all of them. The
plate now follows the room type, using master art that already ships, which
is the mapping the directory cards took last week.

Two filter banks were still loose. The Tours and Series selects and their
result counts sat on bare black beside a Daily bank that had already been
gathered into one painted well; they are gathered the same way now.

A control is the height of a control. The painted field master is 348 by 114,
and on a phone these selects printed 168 by 118 where 139 by 46 belongs. Two
things were doing it: the cap was missing, and the phone rule hands them
`flex: 1 1 118px`, where a flex basis on the main axis beats an aspect ratio
whatever the width. Capped, centred and sized to content, all six selects on
the route now print at the size their art is drawn for, on the phone and on
the desktop alike.

And the amber is gone from these surfaces. The schema is black, blue, teal,
silver and white; yellow and orange are not used. The cached-data banner and
its retry button, the stale and estimated rungs, the seasonal calendar's tour
legend, the Near Me Now tournament pill, the Daily Tournaments tour pill and
guarantee badge, the review prompt, and the map's WARM heat marker have all
moved into the schema, each set still telling its states apart by weight and
brightness rather than by a hue the brand does not use.
