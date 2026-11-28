/**
 * The one standard for every Video Library help tour.
 *
 * Every Video Library page opens on VideoLibraryWorkspaceHeader, whose chrome
 * "?" walks a step list: `{ id, title, body, target }`. Explanations that used
 * to sit on the page as grey sentences live here instead (Dan, 2026-11-27:
 * "REMOVE ANY AND ALL UN NECESSARY EXPLANATIONS (ADD A QUESTION MARK ICON) IF
 * ITS NEEDED").
 *
 * Rules, enforced by __tests__/video-library-help-steps.test.mjs:
 *   - title and body are Title Case, never empty, no em dash, no emoji, no "$";
 *   - `target` names a `data-tutorial="..."` element rendered on that page (or
 *     by a Video Library component it renders). "a|b" lists alternatives:
 *     PageTutorial spotlights the first one present. null is allowed only for
 *     a step deliberately not tied to an element;
 *   - a step shared by several pages is defined ONCE below and reused, so the
 *     same feature is explained with the same words everywhere.
 */

const step = (id, title, body, target) => Object.freeze({ id, title, body, target });
const freezeSteps = (steps) => Object.freeze(steps);

// Shared steps: the same feature, the same words, on every page that has it.
// A shared step is a function of its target, because the element that shows
// the feature differs per page.
export const SHARED_HELP_STEPS = Object.freeze({
    liveNow: (target = 'live') => step('live', 'Live Now',
        'Featured Channels Streaming Right Now. Checked Shows When Live Status Was Last Confirmed. Live Videos Open On YouTube.', target),
    handTimeline: (target) => step('timeline', 'Hand Timeline',
        'In The Video Player, The Hand Timeline Becomes Available When Playback Starts. Hand Markers Last For This Viewing Session.', target),
    pauseQuiz: (target) => step('pause-quiz', 'What Would You Do?',
        'Pause A Hand, Choose Your Action, Then Watch What Happens. Your Decision, Not A Solver Answer. It Is Available When The Player Reports Its Timeline, And Choices And Notes Last For This Viewing Session.', target),
    newestVideos: (target) => step('videos', 'Newest Videos',
        'The Newest Matching Verified Videos. Load More Brings In The Next Set.', target),
});

const S = SHARED_HELP_STEPS;

// On the index the player only exists once a video is opened, so the timeline
// and quiz steps spotlight the open viewer and otherwise the grid a video is
// opened from.
const INDEX_PLAYER_TARGET = 'viewer|grid';

export const VIDEO_LIBRARY_HELP_STEPS = Object.freeze({
    index: freezeSteps([
        step('welcome', 'Poker Video Library', 'Poker Sessions, Strategy And Live Coverage. Study Complete Sessions, Tournament Coverage And Creator Breakdowns In One Place.', 'mast'),
        step('search', 'Search And Browse', 'Search Every Published Poker Video, Then Use The Chips To Switch Between Cash Games, Tournaments, Reels, Latest, Trending And Your Saved Lists.', 'search'),
        step('filters', 'Game, Stakes And Skill Level', 'Filters Match Published Titles And Tags. Unlabeled Videos Appear In All. With A Filter On, Search Matches Published Titles And Channels.', 'filters'),
        step('upload', 'Upload Poker Clip', 'Share Your Own Poker Clip In Poker Reels. Sign In And Confirm Your Sharing Rights Before Publishing.', 'upload'),
        step('sources', 'Channels', 'Pick A Channel To See Only Its Videos. Show All Channels Lists Every Channel In The Library.', 'sources'),
        step('study', 'Diamond Study Streak', 'Counts Days With Verified Video Watch Diamond Credits. Watch Rewards Use Existing Eligibility And Limits. No Extra Streak Bonus. Earn A Video Watch Reward Each Day To Continue Your Streak.', 'study'),
        S.liveNow('live'),
        S.handTimeline(INDEX_PLAYER_TARGET),
        S.pauseQuiz(INDEX_PLAYER_TARGET),
    ]),
    channels: freezeSteps([
        step('channels', 'Poker Video Channels', 'Explore Verified Poker Channels And Broadcast Archives In The Smarter.Poker Video Library.', 'channel-directory'),
    ]),
    channel: freezeSteps([
        step('channel', 'Verified Channel', 'Every Video Here Comes From This Channel And Passed The Verified Library Checks.', 'channel-identity'),
        step('follow', 'Follow Channel', 'Follow Channels And Choose New Video Notifications. Notifications Appear In Your Smarter.Poker Inbox.', 'channel-follow'),
        S.liveNow('live'),
        S.newestVideos('channel-videos'),
    ]),
    players: freezeSteps([
        step('players', 'Poker Players', 'Explore Videos Naming These Players In Their Published Titles Or Tags.', 'player-directory'),
    ]),
    player: freezeSteps([
        step('player', 'Player Videos', 'Videos Whose Published Titles Or Tags Name This Player. A Mention Does Not Establish Participation Or Results.', 'player-identity'),
        S.newestVideos('player-videos'),
    ]),
    playlist: freezeSteps([
        step('play', 'Play All Or Shuffle', 'Plays Your Playlist In Order Or Shuffled. The Playback Queue Is Saved For This Browser Session Only.', 'playlist-overview'),
        step('order', 'Playlist Order', 'Move A Video Up Or Down To Reorder The Playlist. Each Change Is Saved To Your Profile.', 'playlist-videos'),
    ]),
    owner: freezeSteps([
        step('panel', 'Control Panel', 'Manage Video Sources, Editorial Review, Rights And Delivery.', 'owner-metrics'),
        step('sessions', 'Qualified Study Sessions', 'Qualified Study Sessions Count Verified Learning Events In The Last 24 Hours. Individual Learner Identities Remain Private.', 'owner-metrics'),
        step('tools', 'Owner Tools', 'Open Sources, Editorial Review, Rights Moderation, Native Studio Or Pipeline Controls.', 'owner-tools'),
        step('pipeline', 'Pipeline Status', 'Each Audited Pipeline Switch And Whether It Is Enabled Or Paused.', 'owner-pipeline'),
    ]),
    watch: freezeSteps([
        step('player', 'Video Player', 'The Privacy-Enhanced YouTube Player. Mini-Player Keeps It On Screen While You Scroll, And Autoplay Next Opens The Next Video When This One Ends.', 'watch-player'),
        S.handTimeline('watch-player'),
        S.pauseQuiz('watch-player'),
        step('progress', 'Watch Progress', 'Signed In, Your Watch Progress Saves While You Watch And Verified Watch Time Can Earn A Diamond Reward.', 'watch-title'),
        step('actions', 'Video Actions', 'Share To Your Feed, Queue The Next Video, Save It To Playlists And Training, Or Watch On YouTube.', 'watch-actions'),
        step('more', 'More To Watch', 'More From This Channel And Related Videos Are Picked From The Verified Library.', 'watch-more'),
    ]),
});

// Page source for each tour, relative to the repo root. The help test reads
// these to prove every target is rendered on its page.
export const VIDEO_LIBRARY_HELP_PAGES = Object.freeze({
    index: 'pages/hub/video-library.js',
    channels: 'pages/hub/video-library/channels/index.js',
    channel: 'pages/hub/video-library/channels/[channelId].js',
    players: 'pages/hub/video-library/players/index.js',
    player: 'pages/hub/video-library/players/[playerId].js',
    playlist: 'pages/hub/video-library/playlists/[playlistId].js',
    owner: 'pages/hub/video-library/owner.js',
    watch: 'pages/hub/video-library/watch/[videoId]/[[...slug]].js',
});
