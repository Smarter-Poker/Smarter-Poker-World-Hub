import { getComparePage } from '../../src/content/compare/pages.js';
import {
  renderCompareIndexMarkdown,
  renderComparePageMarkdown,
} from '../../src/lib/seo/markdownIngestion.mjs';

export default function handler(req, res) {
  const { slug } = req.query;

  if (!slug || slug === 'index') {
    const md = renderCompareIndexMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Vary', 'Accept');
    return res.status(200).send(md);
  }

  const page = getComparePage(String(slug));
  if (!page) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Comparison page not found');
  }

  const md = renderComparePageMarkdown(page);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vary', 'Accept');
  return res.status(200).send(md);
}
