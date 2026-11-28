/**
 * #SMARTERDESIGN image header for every Poker Near Me destination
 * (Dan, 2026-11-27: "POKER NEAR ME ... NEEDS THE SAME #SMARTERDESIGN UPGRADE TO
 * EVERY SINGLE PAGE, SUBPAGE, BUTTON AND EVERYTHING ELSE").
 *
 * One steel rim, a page-specific seal in the circular chrome frame, the live
 * page title in solid white and a realistic scene on the right, with the one
 * painted chrome "?" in the upper-right corner (BankrollImageHeader owns that
 * geometry, so this file never positions the icon by hand).
 *
 * Every destination has its own seal and scene under
 * public/images/smarterdesign/headers/pnm-<key>-{seal,scene}.webp. The
 * explanations that used to sit in the page body as subtitles live behind the
 * "?" here instead, so the page opens on the controls and the data.
 */
import BankrollImageHeader from '../bankroll/BankrollImageHeader';
import { requestPageTutorial } from '../../tutorials';

export const PNM_HEADERS = Object.freeze({
  lobby: {
    title: 'Poker Near Me',
    help: [
      'Find live poker rooms, casinos, card rooms, home games and tournaments near you.',
      'Search a city, venue, tour or series, or turn on your location to sort everything by distance. Choose a destination below to open it.',
      'Public Venues counts every listed room. Live Count shows reported cash tables only when a room publishes them, so a room that does not report reads Not Reported instead of zero.',
    ],
  },
  venues: {
    title: 'Poker Rooms',
    help: [
      'Casinos, card rooms, clubs and home games, sorted by distance when your location is on.',
      'Tap the heart on a room to save it. Check In and Details open the room. Use the map to see what is nearby.',
      'Cash game lists come from each room’s published catalog. A room that does not publish live table counts says so on its card.',
    ],
  },
  'live-games': {
    title: 'Cash Games Near Me',
    help: [
      'Cash games running or listed in rooms near you.',
      'Observed counts come from rooms that report live tables. Modeled counts are labeled Approx. so they are never mistaken for a live report.',
    ],
  },
  map: {
    title: 'Poker Room Map',
    help: [
      'Every mapped poker room on one map. Numbers are groups of nearby rooms: zoom in or tap a group to split it.',
      'Use the location button to centre the map on you. Tap a room to open its details.',
    ],
  },
  saved: {
    title: 'Saved Poker Places',
    help: [
      'The rooms, tours and series you saved with the heart.',
      'Sign in to keep your saved places on every device.',
    ],
  },
  series: {
    title: 'Poker Series',
    help: [
      'Current and upcoming tournament series and festivals, with host venues, dates, buy-ins and guarantees.',
      'Open a series for its full schedule. Save it to find it again in Saved.',
    ],
  },
  tours: {
    title: 'Poker Tours',
    help: [
      'Traveling poker tours and circuits with their upcoming stops and host venues.',
      'Open a tour for its schedule, or follow it to keep its stops in Saved.',
    ],
  },
  'daily-tournaments': {
    title: 'Daily Tournaments',
    help: [
      'Daily tournaments by day, game, buy-in, guarantee and distance.',
      'Choose a day to change the schedule. The count in the status row is for the day you choose.',
    ],
  },
  'events-calendar': {
    title: 'Events Calendar',
    help: [
      'Tournaments and live events on a calendar, nearest first when your location is on.',
      'Choose a date to see its events, then open an event for its venue and details.',
    ],
  },
  more: {
    title: 'Discovery Tools',
    help: [
      'Plan a road trip, compare rooms, review game trends, set alerts and see what other players are sharing.',
    ],
  },
  roadtrip: {
    title: 'Road Trip Planner',
    help: [
      'Add a start, stops and a destination, then calculate the route to find poker rooms along the way.',
    ],
  },
  alerts: {
    title: 'Tournament Alerts',
    help: [
      'Choose the games, distance and schedule you care about, and get an alert when a matching game or tournament appears near you.',
      'Alerts need notifications enabled for this site in your browser.',
    ],
  },
  'home-games': {
    title: 'Home Games',
    help: [
      'Private home games published by their hosts, by state and city.',
      'Exact addresses stay private: a host shares the location after you request a seat. Use Host A Game to publish your own.',
    ],
  },
  locations: {
    title: 'Poker Rooms By State',
    help: [
      'Browse poker rooms by state and city. Every listing shows when it was last checked.',
    ],
  },
});

const ART = Object.freeze({
  lobby: 'pnm-lobby',
  venues: 'pnm-venues',
  'live-games': 'pnm-live',
  map: 'pnm-map',
  saved: 'pnm-saved',
  series: 'pnm-series',
  tours: 'pnm-tours',
  'daily-tournaments': 'pnm-daily',
  'events-calendar': 'pnm-calendar',
  more: 'pnm-more',
  roadtrip: 'pnm-roadtrip',
  alerts: 'pnm-alerts',
  locations: 'pnm-locations',
  'home-games': 'pnm-homegames',
});

export function pnmHeaderArt(route) {
  return ART[route] || ART.venues;
}

export default function PnmImageHeader({ route = 'venues', title, parent, children, className = 'pnm-sd-header', titleId, heading }) {
  const meta = PNM_HEADERS[route] || PNM_HEADERS.venues;
  const pageTitle = title || meta.title;
  return (
    <BankrollImageHeader
      art={pnmHeaderArt(route)}
      section={'pnm-' + route}
      title={pageTitle}
      titleId={titleId}
      heading={heading}
      parent={parent}
      className={className}
      onTutorial={requestPageTutorial}
      helpContent={meta.help.map((line) => <p key={line}>{line}</p>)}
    >
      {children}
    </BankrollImageHeader>
  );
}
