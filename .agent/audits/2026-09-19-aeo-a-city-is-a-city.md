# A City Is A City

2026-09-19. AEO phase 3, scraped location data.

## What Was Measured

Across the 225 series in the sitemap, read from `/api/poker/series`:

```
carry a city that is a city        99
carry no city at all               62
carry the venue and the city       64
```

The 64 look like this, with the venue field beside them:

```
venue ''          city 'Wynn Las Vegas Las Vegas'
venue 'Unknown'   city 'Thunder Valley Casino Lincoln'
venue 'Unknown'   city 'Playground Poker Club Kahnawake'
venue ''          city 'Venetian Las Vegas Las Vegas'
```

The scrapers write the venue and the city into the city field, run together,
whenever the source page did not separate them.

Where the venue field is also filled, `cityWithoutVenue` strips it and the
result is right. Where the venue field is empty or says `Unknown`,
`realPlace` returns null, nothing can strip it, and the whole string reaches
the page title, the meta description, the visible location line and
schema.org `addressLocality`. A reader is told a series runs in "Wynn Las
Vegas Las Vegas". An engine is told the same, in a field whose whole purpose
is to be machine-read.

## The Rule Used To Fix It

Only change a value the venue directory can account for.

`data/all-venues.json` holds 658 venues with their names and cities. A city
string is resolved when the directory recognises a venue name on the front
of it, or one of its own cities on the end of it. Anything else is returned
exactly as it arrived.

That cleans 49 of the 64. The remaining 15 split two ways: venues outside
the directory (Calgary, Kahnawake, London) and cities the directory has no
venue in (McAllen, Elyria, Round Rock). Guessing at those would be the same
mistake in the other direction, so they are left alone and stay listed here.

Two of them look like truncated source data rather than concatenated data:
`Charles` and `Lauderdale`, which read like Lake Charles and Fort
Lauderdale. Those are worth a look at the source and are not something this
resolver should invent.

## Where It Runs

Both paths that read a series city, because they do not share one:

- `pages/api/poker/series.js`, in `decodeSeriesPayload`, which is what every
  series page reads through.
- `pages/hub/poker-series.js`, in `getStaticProps`, whose two Supabase
  queries go straight to the tables.
