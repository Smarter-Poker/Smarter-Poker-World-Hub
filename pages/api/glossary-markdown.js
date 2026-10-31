import { getGlossaryTerm } from '../../src/content/glossary/terms.js';
import {
  renderGlossaryIndexMarkdown,
  renderGlossaryTermMarkdown,
} from '../../src/lib/seo/markdownIngestion.mjs';

export default function handler(req, res) {
  const { slug } = req.query;

  if (!slug || slug === 'index') {
    const md = renderGlossaryIndexMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Vary', 'Accept');
    return res.status(200).send(md);
  }

  const term = getGlossaryTerm(String(slug));
  if (!term) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Glossary term not found');
  }

  const md = renderGlossaryTermMarkdown(term);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vary', 'Accept');
  return res.status(200).send(md);
}
