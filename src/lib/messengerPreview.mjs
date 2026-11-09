/*
 * ONE LINE OF PLAIN TEXT FOR A CONVERSATION PREVIEW (2026-10-17).
 *
 * The conversation list printed the newest message raw: a markdown report
 * read "**BUG REPORT**" with its asterisks, and pictographs pasted into a
 * message sat in the list. The preview is a summary, not the message, so it
 * is plain words: markdown markers are removed, pictographs and their
 * variation selectors are removed, and the two system payloads read as what
 * they are. The message itself is never changed.
 */
import { parseMessageMedia, mediaPreviewLabel } from './messenger/messageMedia.mjs';
import { isLiveInvite } from './messenger/liveInvite.mjs';
import { isCallReceipt, describeCallReceipt } from './messenger/callReceipt.mjs';

const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const MARKDOWN_MARKERS = /(\*\*|__|~~|`+)/gu;
const LINE_MARKERS = /^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?=\S))/gmu;
const LINK = /\[([^\]]+)\]\((?:[^)]+)\)/gu;


export function messengerPreviewText(value, maxLength = 35) {
  let text = String(value ?? '');
  if (isLiveInvite(text)) return 'Live Stream Invite';
  if (isCallReceipt(text)) return describeCallReceipt(text);
  const media = parseMessageMedia(text);
  if (media) {
    const label = mediaPreviewLabel(media.kind);
    if (!media.caption) return label;
    text = `${label}: ${media.caption}`;
  }
  text = text
    .replace(LINK, '$1')
    .replace(LINE_MARKERS, '')
    .replace(MARKDOWN_MARKERS, '')
    .replace(PICTOGRAPHS, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}
