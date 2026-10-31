import {
  renderDailyTournamentsMarkdown,
  renderEventsCalendarMarkdown,
  renderPokerToursMarkdown,
  renderPokerSeriesMarkdown,
  renderPokerNearMeMarkdown,
} from '../../src/lib/seo/markdownIngestion.mjs';

const RENDERERS = {
  'daily-tournaments': () => renderDailyTournamentsMarkdown(),
  'events-calendar': () => renderEventsCalendarMarkdown(),
  'poker-tours': () => renderPokerToursMarkdown(),
  'poker-series': () => renderPokerSeriesMarkdown(),
  'venues': () => renderPokerNearMeMarkdown({ canonicalUrl: 'https://smarter.poker/hub/poker-near-me/venues' }),
  'poker-near-me': () => renderPokerNearMeMarkdown({ canonicalUrl: 'https://smarter.poker/hub/poker-near-me' }),
};

export default function handler(req, res) {
  const { slug } = req.query;
  const key = String(slug || '').trim().toLowerCase();
  const render = RENDERERS[key];

  if (!render) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Discovery hub Markdown feed not found');
  }

  const md = render();
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vary', 'Accept');
  return res.status(200).send(md);
}
