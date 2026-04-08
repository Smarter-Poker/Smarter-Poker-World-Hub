# Add New Poker Series to Database and Build Venue Cards

## Goal Description
The user wants to insert all newly discovered poker series from `data/master_poker_series_list.json` into the Supabase database and generate a venue card UI component for each new series. The final deliverable includes:
- A complete list of the newly added series.
- A reusable, premium‑styled venue card component that adhers to the **Futuristic Metal UI System** and the **UniversalHeader** standards.
- Integration of the new cards into the appropriate pages (e.g., Poker Near Me, Commander, etc.).

## User Review Required
> [!IMPORTANT]
> 1. **Database Access** – Please confirm that the Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`) is available in the environment. If not, provide the necessary credentials.
> 2. **Venue Card Design** – Confirm the required fields to display on each card (e.g., series name, date, venue, buy‑in, image). Do you want to use the existing `VenueCard` component as a base, or create a new specialized component?
> 3. **Insertion Scope** – Should we insert *all* entries from the master list, or only those not already present in the `poker_series` table?
> 4. **Deployment** – After changes, should we run the `/deploy` workflow automatically, or wait for your manual approval?

## Proposed Changes
---
### Database Insertion
- **[MODIFY]** Use Supabase MCP to query existing `poker_series` IDs.
- **[NEW]** Script `scripts/ingest_new_series.py` that:
  1. Loads `master_poker_series_list.json`.
  2. Computes the set difference with existing DB IDs.
  3. Performs batch upserts via Supabase RPC (`upsert`).
  4. Logs inserted IDs to `data/ingest_new_series.log`.

### UI Component
- **[NEW]** `src/components/poker-near-me/NewSeriesVenueCard.jsx` – a premium card component:
  - Uses the **Futuristic Metal UI System** (metal frames, neon accents).
  - Displays series name, date, venue, buy‑in, and a thumbnail.
  - Includes hover micro‑animations and a “Add to Calendar” button.
- **[MODIFY]** Update `src/pages/hub/poker-near-me-lobby.js` to import and render the new card for series where `is_new` flag is true.
- **[MODIFY]** Add CSS variables to `src/styles/theme.css` for the new card styling.

### Integration & SEO
- Ensure each card includes proper `aria-label`s and schema.org `Event` markup.
- Update meta tags on the Poker Near Me page to reflect the increased number of series.

## Open Questions
> [!WARNING]
> - **Batch Size**: How many rows should we upsert per request to avoid rate limits? (Default: 100)
> - **Image Assets**: Do you have a source for series thumbnail images, or should we generate placeholders via `generate_image`?
> - **Testing**: Should we run the `/perf-audit` workflow after deployment to verify Core Web Vitals?

## Verification Plan
### Automated Tests
- Run a Supabase query to verify the count of rows after insertion matches `total_series` in the master list.
- Use Playwright (`/playwright-testing` workflow) to render the Poker Near Me page and capture screenshots of the new cards.

### Manual Verification
- Ask the user to review the generated list of new series and the UI on a staging environment.
- Verify that the venue cards appear with the intended design and interactions.
