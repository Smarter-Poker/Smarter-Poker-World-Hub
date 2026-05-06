# Audit: Social Media Feed Render Path (2026-05-06)

## Found
A bug where the feed video tile displayed a black screen with a play button, even when a thumbnail was selected.
Earlier attempts tried to fix this by patching `src/components/social/SmarterPokerStyleCard.jsx` to add `#t=0.001` first-frame fallback.
However, this didn't fix the issue on the social media feed page.

## Lesson
Chunk-busting `SmarterPokerStyleCard.jsx` didn't help because `/hub/social-media` does **not** import `SmarterPokerStyleCard`. 
`pages/hub/social-media/index.js` imports its post-rendering JSX from itself. 
It uses bare `<video>` tags that ignore both `post.thumbnail_url` and the first-frame trick.

## Fixed
Replaced bare `<video>` tags with a conditional `<img>` (when `post.thumbnail_url || post.thumbnailUrl`) vs `<video src={url + '#t=0.001'}>` (fallback) directly in `pages/hub/social-media/index.js`.
This properly renders the thumbnail on `/hub/social-media` single and grid videos.
