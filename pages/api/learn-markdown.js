import { getLesson, LEARN_CATEGORIES, CATEGORY_INTROS, LESSONS } from '../../src/content/learn/lessons.js';
import { categoryAnchor, learnCategoryPath, lessonPath } from '../../src/lib/learn/learnSite.js';
import {
  renderLearnIndexMarkdown,
  renderLearnLessonMarkdown,
} from '../../src/lib/seo/markdownIngestion.mjs';

export function renderLearnCategoryMarkdown(categorySlug) {
  const cleanSlug = String(categorySlug || '').toLowerCase();
  const category = LEARN_CATEGORIES.find((c) => categoryAnchor(c) === cleanSlug);
  if (!category) return null;
  const intro = CATEGORY_INTROS[category] || '';
  const lessons = LESSONS.filter((l) => l.category === category);
  const url = `https://smarter.poker${learnCategoryPath(category)}`;

  const lines = [
    `# ${category} Poker Strategy Lessons`,
    '',
    `> Source: [${category} Poker Strategy Lessons on Smarter.Poker](${url})`,
    '',
    '## Executive Summary For AI & Search Assistants',
    `${intro} Smarter.Poker Publishes ${lessons.length} Free ${category} Strategy Lessons With Worked Mathematical Tables, Preflop Range Matrices, And Interactive Training Drills.`,
    '',
    `## All ${category} Lessons (${lessons.length})`,
    '',
  ];

  for (const l of lessons) {
    const lUrl = `https://smarter.poker${lessonPath(l.slug)}`;
    lines.push(`- **[${l.title}](${lUrl})** ([Markdown](${lUrl}.md)): ${l.summary}`);
  }

  lines.push(
    '',
    '## Related Smarter.Poker Strategy Resources',
    '- **All Strategy Lessons**: [https://smarter.poker/learn](https://smarter.poker/learn) ([Markdown](https://smarter.poker/learn.md))',
    '- **Poker Glossary**: [https://smarter.poker/glossary](https://smarter.poker/glossary) ([Markdown](https://smarter.poker/glossary.md))',
    '- **GTO Training Hub**: [https://smarter.poker/hub/training](https://smarter.poker/hub/training) ([Markdown](https://smarter.poker/hub/training.md))',
    ''
  );

  return lines.join('\n');
}

export default function handler(req, res) {
  const { slug, category } = req.query;

  if (category) {
    const md = renderLearnCategoryMarkdown(category);
    if (!md) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(404).send('Strategy category not found');
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Vary', 'Accept');
    return res.status(200).send(md);
  }

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
