/* Four things on the venue page that were wired to nothing. Each is pinned by
   the shape that was actually missing, not by a line number. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const VENUE = read('pages/hub/venues/[id].js');
const REVIEWS = read('src/components/poker/VenueReviews.js');
const HOME_GAMES = read('pages/hub/home-games/near-me.js');
const BANNER = read('src/components/poker-near-me/GeofenceAlertBanner.jsx');

test('the write a review deep link opens the form', () => {
    // ?action=review set showReviewForm, and nothing read it. The rating row on
    // every venue card, the geofence banner and the lobby all link here, so the
    // person landed on a collapsed form every time.
    // This line predates the fix, so on its own it proves nothing. What matters
    // is that the flag it sets now reaches the component below.
    assert.match(VENUE, /action === 'review'[\s\S]{0,200}setShowReviewForm\(true\)/, 'the deep link still sets the flag');
    assert.match(
        VENUE,
        /<VenueReviews[^>]*defaultOpen=\{showReviewForm\}/,
        'and the flag must reach VenueReviews',
    );
    assert.match(REVIEWS, /defaultOpen = false/, 'VenueReviews must accept it');
    // The dependency array is the whole point: the flag arrives after mount, so
    // an effect that never re-runs would reintroduce exactly the bug this fixes.
    assert.match(
        REVIEWS,
        /useEffect\(\(\) => \{\s*if \(defaultOpen\) setShowForm\(true\);\s*\}, \[defaultOpen\]\);/,
        'the effect must depend on defaultOpen, not run once',
    );
});

test('claiming a venue and reporting a game say when they fail', () => {
    // Both caught, logged to console and returned, leaving the form open and
    // full with no word to the person. A 200 carrying success:false did nothing.
    for (const [state, setter] of [['claimError', 'setClaimError'], ['reportError', 'setReportError']]) {
        assert.match(VENUE, new RegExp(`const \\[${state}, ${setter}\\] = useState\\(''\\)`), `${state} must exist`);
        assert.match(VENUE, new RegExp(`${setter}\\(json\\?\\.error`), `${state} must cover success:false`);
        assert.match(VENUE, new RegExp(`\\{${state} && \\(`), `${state} must be rendered, not just held`);
        assert.match(VENUE, new RegExp(`\\{${state}\\}`), `${state} must print its message`);
    }
    for (const state of ['claimError', 'reportError']) {
        // the alert element and the state must be in the same block, not merely
        // both present somewhere in a 3,900 line file
        assert.match(
            VENUE,
            new RegExp(`\\{${state} && \\([\\s\\S]{0,400}role="alert"[\\s\\S]{0,400}\\{${state}\\}`),
            `${state} must render its own alert`,
        );
    }
});

test('a failed attempt does not haunt the next one', () => {
    // The messages were cleared on success only, so failing, cancelling and
    // reopening left the old error sitting there, describing a failure that had
    // not happened yet. VenueReviews already clears its own error on toggle;
    // these two now match it.
    assert.match(
        VENUE,
        /setClaimError\(''\); setShowClaimForm\(true\)/,
        'opening the claim form starts clean',
    );
    assert.match(
        VENUE,
        /setClaimError\(''\); setShowClaimForm\(false\)/,
        'cancelling drops the message with the form',
    );
    assert.match(
        VENUE,
        /setReportError\(''\); setShowReportGame\(!showReportGame\)/,
        'and the report form clears on either toggle direction',
    );
});

test('the venue hero uses the mirrored logo, not the casino server', () => {
    // Reading profile_photo_url first hotlinked the casino even for venues
    // already mirrored into the venue-logos bucket, which is also what trips
    // img-src and blocks CSP enforcement.
    assert.match(VENUE, /src=\{getVenueLogoUrl\(venue\)\}/, 'the hero must use the shared resolver');
    assert.match(VENUE, /import \{ getVenueLogoUrl \}/, 'and import it');
    assert.doesNotMatch(
        VENUE,
        /src=\{venue\.profile_photo_url \|\| venue\.cover_photo_url\}/,
        'the old hotlinking order must not come back',
    );
});

test('a failed home games search does not show the person a parser error', () => {
    // A 5xx HTML body parsed as JSON put "Unexpected token <" on screen. Only
    // the non-JSON case is swallowed: guarding on !res.ok alone also discarded
    // the 400 this endpoint sends for a search that is too long, which is the
    // one failure the person can actually act on.
    assert.match(
        HOME_GAMES,
        /const isJson = \(res\.headers\.get\('content-type'\) \|\| ''\)\.includes\('application\/json'\)/,
        'the guard must key on the content type',
    );
    assert.match(
        HOME_GAMES,
        /if \(!isJson\) throw new Error\('Home games could not be loaded/,
        'and only swallow the non-JSON case',
    );
    assert.match(
        HOME_GAMES,
        /if \(!json\.success\) throw new Error\(json\.error/,
        'the actionable server message must still reach the person',
    );
});

test('the geofence banner close button has a name and a real target', () => {
    assert.match(BANNER, /aria-label="Dismiss"/, 'icon-only button needs an accessible name');
    assert.match(BANNER, /minWidth: 44, minHeight: 44/, 'and must clear the 44px floor');
});
