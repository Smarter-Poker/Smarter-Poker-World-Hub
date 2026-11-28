import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  HAND_VISION_ANTHROPIC_MODEL,
  anthropicResponseText,
  buildAnthropicRequest,
  normalizeImagePayload,
  parseHandJson,
  selectHandVisionProvider,
} from '../src/lib/ai/handVision.mjs';

test('Claude is the primary hand-vision provider and OpenAI the fallback', () => {
  assert.equal(selectHandVisionProvider({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' }), 'anthropic');
  assert.equal(selectHandVisionProvider({ OPENAI_API_KEY: 'o' }), 'openai');
  assert.equal(selectHandVisionProvider({}), null);
});

test('image payloads normalise from data URLs and bare base64', () => {
  assert.deepEqual(normalizeImagePayload('data:image/png;base64,AAA='), {
    mediaType: 'image/png',
    data: 'AAA=',
    dataUrl: 'data:image/png;base64,AAA=',
  });
  assert.equal(normalizeImagePayload('data:image/jpg;base64,BBB').mediaType, 'image/jpeg');
  assert.deepEqual(normalizeImagePayload('CCC'), {
    mediaType: 'image/jpeg',
    data: 'CCC',
    dataUrl: 'data:image/jpeg;base64,CCC',
  });
});

test('the Anthropic request carries the screenshot as a base64 image block', () => {
  const body = buildAnthropicRequest('data:image/webp;base64,DDD');
  assert.equal(body.model, HAND_VISION_ANTHROPIC_MODEL);
  assert.equal(body.temperature, 0);
  const [image, text] = body.messages[0].content;
  assert.deepEqual(image, { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'DDD' } });
  assert.equal(text.type, 'text');
  assert.match(text.text, /output ONLY valid JSON/);
});

test('Anthropic response text joins only the text blocks', () => {
  assert.equal(anthropicResponseText({ content: [{ type: 'text', text: ' {"a":1}' }, { type: 'tool_use' }] }), '{"a":1}');
  assert.equal(anthropicResponseText({}), '');
});

test('hand JSON parses bare, fenced and prose-wrapped replies', () => {
  const bare = parseHandJson('{"heroCards":"Ah Kd"}', 7);
  assert.deepEqual(bare, { heroCards: 'Ah Kd', raw: 'Parsed via AI Vision from screenshot.', id: 'hand_ai_7' });
  assert.equal(parseHandJson('```json\n{"id":"h1","heroCards":"As Ks"}\n```').id, 'h1');
  assert.equal(parseHandJson('Here is the hand: {"id":"h2"} done').id, 'h2');
  assert.equal(parseHandJson('no json here'), null);
  assert.equal(parseHandJson('[1,2]'), null);
  assert.equal(parseHandJson('{broken'), null);
});

test('the endpoint routes through the shared provider helpers', () => {
  const source = readFileSync(new URL('../pages/api/jarvis/vision-hand-parse.js', import.meta.url), 'utf8');
  assert.match(source, /selectHandVisionProvider\(process\.env\)/);
  assert.match(source, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(source, /parseHandJson\(content\)/);
  assert.doesNotMatch(source, /process\.env\.OPENAI_API_KEY \? new OpenAI/, 'no module-level OpenAI-only client');
});
