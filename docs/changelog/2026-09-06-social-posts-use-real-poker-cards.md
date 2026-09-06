# Social posts use the Club Arena deck

2026-09-06. The shared social composer now includes a poker hand builder.
Players can select up to six hole cards and five board cards from all 52
cards, edit or clear the selection, and publish cards with text, links,
photos, check-ins, or background video uploads.

The picker and the finished post both render the canonical Club Arena
two-colour deck at `/hub/club-arena/cards/2color`. Posts store small textual
tokens in the existing `content` field, so the feature requires no schema
migration and remains readable when an image cannot load. The renderer tries
WebP, then PNG, then an accessible rank-and-suit text fallback.

The shared renderer is wired into the primary feed card, legacy card, club
pages, public boards, saved posts, stories, and compact trending text. Draft
cards survive a reload and are cleared only after a successful post.

Verification:

- all 52 cards map to unique Club Arena assets;
- hand and board selections round-trip through the stored token format;
- invalid tokens stay harmless text;
- duplicate selection and hand/board limits are pinned;
- both foreground and background publishing paths include the cards;
- TypeScript completed with no errors;
- ESLint completed across 4,009 files with no errors;
- the focused card-picker contract suite passed.
