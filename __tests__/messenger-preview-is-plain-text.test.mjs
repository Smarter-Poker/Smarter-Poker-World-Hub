import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { messengerPreviewText } from '../src/lib/messengerPreview.mjs';

test('a conversation preview is plain words: no markdown markers, no pictographs', () => {
  assert.equal(messengerPreviewText('**BUG REPORT** table froze'), 'BUG REPORT table froze');
  assert.equal(messengerPreviewText('\u{1F6A8} alert'), 'alert');
  assert.equal(messengerPreviewText('✏️ edited'), 'edited');
  assert.equal(messengerPreviewText('# Title\n> quoted [link](https://x.y)'), 'Title quoted link');
});

test('system payloads read as what they are', () => {
  assert.equal(messengerPreviewText('[LIVE_INVITE]abc'), 'Live Stream Invite');
  assert.equal(
    messengerPreviewText('[CALL_RECEIPT]{"type":"video","status":"missed"}'),
    'Missed Video Call'
  );
  assert.equal(messengerPreviewText('[CALL_RECEIPT]{"type":"voice","duration":75}'), 'Voice Call, 1m 15s');
});

test('long previews are cut on a word edge with an ellipsis', () => {
  assert.equal(messengerPreviewText('a'.repeat(40)), `${'a'.repeat(35)}...`);
});

test('the list and the dock both print through it', () => {
  const item = readFileSync('src/components/messenger/ConversationItem.js', 'utf8');
  const dock = readFileSync('src/components/messenger/dock/MessengerDock.jsx', 'utf8');
  assert.match(item, /messengerPreviewText\(lastMsg \|\| ''\)/);
  assert.match(dock, /messengerPreviewText\(conversation\.last_message_preview, 60\)/);
});
