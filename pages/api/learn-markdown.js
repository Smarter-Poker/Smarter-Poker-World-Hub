import { getLesson } from '../../src/content/learn/lessons.js';
import {
  renderLearnIndexMarkdown,
  renderLearnLessonMarkdown,
} from '../../src/lib/seo/markdownIngestion.mjs';

export default function handler(req, res) {
  const { slug } = req.query;

  if (!slug || slug === 'index') {
    const md = renderLearnIndexMarkdown();
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Vary', 'Accept');
    return res.status(200).send(md);
  }

  const lesson = getLesson(String(slug));
  if (!lesson) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(404).send('Strategy lesson not found');
  }

  const md = renderLearnLessonMarkdown(lesson);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Vary', 'Accept');
  return res.status(200).send(md);
}
