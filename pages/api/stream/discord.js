/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET / POST /api/stream/discord
 *  Discord & Slack Command / Webhook Adapter For All 44 Streamer Bot Commands
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wraps any of the 44 Smarter.Poker streamer commands into:
 * 1. Rich Discord Embed JSON (`embeds: [{ title, description, url, color: 54527, fields, footer }]`)
 * 2. Slack Block Kit response (`blocks: [...]`)
 * with direct clickable links to https://smarter.poker/tools/...
 *
 * House style: Title Case, zero em dashes.
 */

import { evaluateStreamCommand, STREAMER_BOT_COMMANDS } from './cmd.js';
import { recordSeoTelemetryEvent } from '../seo/referral-stats.js';

export function buildDiscordAndSlackPayload({ cmd = 'help', q = '', pot = '', bet = '' } = {}) {
  const evaluated = evaluateStreamCommand({ cmd, q, pot, bet });
  const commandMeta =
    STREAMER_BOT_COMMANDS.find((c) => c.command === evaluated.command) ||
    STREAMER_BOT_COMMANDS[0];
  const canonicalUrl = evaluated.canonicalUrl || commandMeta?.canonicalToolUrl || 'https://smarter.poker/tools';
  const markdownUrl = `${canonicalUrl}.md`;

  const embedTitle = `Smarter.Poker ${evaluated.command.toUpperCase()} Solver`;
  const discordEmbed = {
    title: embedTitle,
    description: evaluated.text,
    url: canonicalUrl,
    color: 54527, // #00D4FF cyan
    fields: [
      {
        name: 'Command Executed',
        value: `\`${evaluated.command}${q ? ` ${q}` : ''}\``,
        inline: true,
      },
      {
        name: 'Interactive Calculator',
        value: `[Launch On Smarter.Poker](${canonicalUrl})`,
        inline: true,
      },
      {
        name: 'AI Markdown Mirror',
        value: `[Raw .md Spec](${markdownUrl})`,
        inline: true,
      },
    ],
    footer: {
      text: 'Smarter.Poker Quantitative GTO & Live Poker Engine (52 Calculators • 70 MCP Tools • 44 Commands)',
      icon_url: 'https://smarter.poker/icons/icon-192x192.png',
    },
    timestamp: new Date().toISOString(),
  };

  const slackBlocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: embedTitle,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${evaluated.text}\n\n*<${canonicalUrl}|Open Interactive Calculator On Smarter.Poker>* | *<${markdownUrl}|Raw Markdown (.md)>*`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Command: \`${evaluated.command}${q ? ` ${q}` : ''}\` • Smarter.Poker (52 Calculators • 70 MCP Tools • 44 Commands)`,
        },
      ],
    },
  ];

  return {
    ok: true,
    command: evaluated.command,
    query: q,
    canonicalUrl,
    markdownUrl,
    content: evaluated.text,
    embeds: [discordEmbed],
    blocks: slackBlocks,
    available_commands_count: STREAMER_BOT_COMMANDS.length,
  };
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, POST, HEAD, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let cmd = 'help';
  let q = '';
  let pot = '';
  let bet = '';

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rawText = String(body.command || body.cmd || body.text || body.content || '').trim();
    if (rawText.startsWith('!') || rawText.includes(' ')) {
      const parts = rawText.split(/\s+/);
      cmd = parts[0].replace(/^!/, '');
      q = parts.slice(1).join(' ');
    } else {
      cmd = String(body.cmd || body.command || 'help');
      q = String(body.q || body.query || '');
    }
    pot = String(body.pot || '');
    bet = String(body.bet || '');
  } else {
    cmd = String(req.query?.cmd || req.query?.command || 'help');
    q = String(req.query?.q || req.query?.query || '');
    pot = String(req.query?.pot || '');
    bet = String(req.query?.bet || '');
  }

  const payload = buildDiscordAndSlackPayload({ cmd, q, pot, bet });

  recordSeoTelemetryEvent({
    category: 'streamer_commands',
    item: `discord:${payload.command}`,
    partner: req.headers?.['user-agent'] || '',
    source: 'stream-discord',
    req,
  });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(payload);
}
