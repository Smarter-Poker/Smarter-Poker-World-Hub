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
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const MARKDOWN_MARKERS = /(\*\*|__|~~|`+)/gu;
const LINE_MARKERS = /^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?=\S))/gmu;
const LINK = /\[([^\]]+)\]\((?:[^)]+)\)/gu;

function callReceipt(raw) {
  try {
    const rd = JSON.parse(raw);
    const kind = rd.type === 'video' ? 'Video Call' : 'Voice Call';
    const st = rd.status || 'completed';
    const status =
      st === 'completed' ? '' : st === 'missed' ? 'Missed ' : st === 'declined' ? 'Declined ' : 'Cancelled ';
    const dur = Number(rd.duration) || 0;
    const time = dur > 0 ? (dur >= 60 ? `, ${Math.floor(dur / 60)}m ${dur % 60}s` : `, ${dur}s`) : '';
    return `${status}${kind}${time}`;
  } catch {
    return 'Call';
  }
}

export function messengerPreviewText(value, maxLength = 35) {
  let text = String(value ?? '');
  if (text.startsWith('[LIVE_INVITE]')) return 'Live Stream Invite';
  if (text.startsWith('[CALL_RECEIPT]')) return callReceipt(text.slice('[CALL_RECEIPT]'.length));
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
