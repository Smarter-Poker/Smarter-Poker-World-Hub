# Failed series attempts keep their actual identity

Production alert 38919 / World Hub run 34849047697 failed on four status
writes. Three live PokerAtlas discoveries had no database parent yet. The
fourth attempted to update the literal UID `None`: discovery dropped the
database primary ID, and the consumer collapsed missing UIDs together.

The discovery export now retains the actual primary ID. Missing UIDs remain
separate catalog entries and never become guessed source URLs or event keys.
An unresolved scrape writes a confirmed audit record with its original catalog
entry before updating any existing parent. The status update matches both the
primary ID and UID, retains suppression protection, and preserves successful
or manually curated source timestamps. A new discovery without a parent keeps
its failed-attempt evidence without creating unverified parent/event data.
Rejected audit receipts, ambiguous identities and zero-row updates still fail.

Nine focused offline checks exercise export through the actual consumer,
the actual main-loop caller, missing parents, missing UIDs, quarantine, exact
receipts, encoded identities and rejected writes. The existing 48 scraper and
five discovery handoff checks also pass. The new checks run in both Build
Safety and the production scraper startup gate.

This repairs attempt identity and failure recording. It does not establish
that the 175 unresolved sources now produce events or supply missing canonical
UIDs. Those underlying source/data cases and a post-release run remain open.
