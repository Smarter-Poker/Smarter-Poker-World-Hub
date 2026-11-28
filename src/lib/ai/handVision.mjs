/**
 * Screenshot-to-hand vision for /api/jarvis/vision-hand-parse.
 *
 * Claude (ANTHROPIC_API_KEY) is the primary provider; OpenAI (OPENAI_API_KEY)
 * is the fallback. The production OpenAI key was found revoked (401) on
 * 2026-11-27, which left this endpoint unusable while a working Anthropic key
 * was already configured.
 */

export const HAND_VISION_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
export const HAND_VISION_OPENAI_MODEL = 'gpt-4o';

export const HAND_VISION_PROMPT = `
You are an expert poker analysis AI. Extract the state of the poker hand from the provided screenshot and output ONLY valid JSON matching this schema:

{
  "id": "hand_12345",
  "stakes": { "sb": 0.5, "bb": 1 },
  "players": [
    { "seat": 1, "name": "Player1", "stack": 100.0 }
  ],
  "heroName": "Hero",
  "heroCards": "Ah Kd",
  "board": ["Ts", "Jc", "2h"],
  "actions": [
    { "player": "Player1", "action": "raises", "amount": 2.5 },
    { "player": "Hero", "action": "calls", "amount": 2.5 }
  ],
  "potSize": 5.5,
  "winner": null
}

Guidelines:
1. "heroCards": Format cards as RankSuit (e.g. As, Kh, Td, 2c). Space separated string.
2. "board": Array of RankSuit strings. Leave empty or omit if preflop.
3. "actions": Detect any visible action logs in chat or visually infer. Actions must be one of: folds, checks, calls, bets, raises, all-in.
4. "heroName": Identify the player whose hole cards are visible (the user playing).
5. Output ONLY the JSON object. Do not include markdown code fences.
`;

const DATA_URL = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.*)$/s;

/** Normalise a raw base64 string or data URL into { mediaType, data, dataUrl }. */
export function normalizeImagePayload(imageBase64) {
  const raw = String(imageBase64 || '').trim();
  const match = raw.match(DATA_URL);
  const mediaType = match ? match[1].replace('image/jpg', 'image/jpeg') : 'image/jpeg';
  const data = match ? match[2] : raw;
  return { mediaType, data, dataUrl: `data:${mediaType};base64,${data}` };
}

/** Pick the configured provider: Claude first, then OpenAI, else none. */
export function selectHandVisionProvider(env = {}) {
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';
  return null;
}

/** Anthropic Messages API request body for one screenshot. */
export function buildAnthropicRequest(imageBase64) {
  const { mediaType, data } = normalizeImagePayload(imageBase64);
  return {
    model: HAND_VISION_ANTHROPIC_MODEL,
    max_tokens: 1000,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: HAND_VISION_PROMPT },
        ],
      },
    ],
  };
}

/** Text of an Anthropic Messages API response. */
export function anthropicResponseText(body) {
  return (Array.isArray(body?.content) ? body.content : [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim();
}

/**
 * Parse the model's reply into a hand. Tolerates a ```json fence or prose
 * around the object. Returns null when no valid JSON object is present.
 */
export function parseHandJson(content, now = Date.now()) {
  let text = String(content || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let hand;
  try {
    hand = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!hand || typeof hand !== 'object' || Array.isArray(hand)) return null;
  if (!hand.raw) hand.raw = 'Parsed via AI Vision from screenshot.';
  if (!hand.id) hand.id = `hand_ai_${now}`;
  return hand;
}
