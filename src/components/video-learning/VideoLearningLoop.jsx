import Link from 'next/link';

import styles from './VideoLearningLoop.module.css';

function cleanLabel(value, fallback) {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  return text || fallback;
}

export function buildLearningReason({ reason, source, topic, mode = 'learning' } = {}) {
  if (Array.isArray(reason) && reason.length) return reason.filter(Boolean).join('. ') + '.';
  if (reason) return String(reason).trim();
  const sourceLabel = cleanLabel(source, 'a verified creator');
  const topicLabel = cleanLabel(topic, 'your current study topic');
  if (mode === 'latest') return `Shown in publication order from ${sourceLabel}.`;
  if (mode === 'following') return `Shown because you follow ${sourceLabel}.`;
  if (mode === 'shorts') return `A short lesson connected to ${topicLabel}.`;
  return `Recommended for ${topicLabel}, with source variety from ${sourceLabel}.`;
}

export default function VideoLearningLoop({
  title = 'Turn This Into Practice',
  reason,
  source,
  topic,
  mode,
  resumeLabel,
  saved = false,
  onSave,
  chronologicalHref,
  fullVideoHref,
  relatedLessons = [],
  onOpenLesson,
  onAskGeeves,
  quizHref,
  sandboxHref = '/hub/personal-assistant/sandbox',
  trainingHref = '/hub/training',
  compact = false,
}) {
  const explanation = buildLearningReason({ reason, source, topic, mode });
  const visibleLessons = relatedLessons.filter(Boolean).slice(0, 3);

  return (
    <section className={`${styles.deck}${compact ? ` ${styles.compact}` : ''}`} aria-labelledby="video-learning-loop-title" data-video-learning-loop>
      <div className={styles.headingRow}>
        <div>
          <span className={styles.kicker}>Study Circuit</span>
          <h3 id="video-learning-loop-title">{title}</h3>
        </div>
        {resumeLabel ? <span className={styles.resume}>{resumeLabel}</span> : null}
      </div>

      <div className={styles.reason}>
        <strong>Why This Is Here</strong>
        <p>{explanation}</p>
        {chronologicalHref ? <Link href={chronologicalHref}>View Newest First</Link> : null}
      </div>

      <div className={styles.actions} aria-label="Study actions">
        {onSave ? (
          <button type="button" onClick={onSave} aria-pressed={saved}>
            {saved ? 'In Study List' : 'Add To Study List'}
          </button>
        ) : null}
        {fullVideoHref ? <Link href={fullVideoHref}>Open Full Lesson</Link> : null}
        <button type="button" onClick={onAskGeeves}>Ask Geeves To Explain</button>
        <Link href={quizHref || trainingHref}>Take A Quick Quiz</Link>
        <Link href={sandboxHref}>Practice In Sandbox</Link>
      </div>

      {visibleLessons.length > 0 ? (
        <div className={styles.lessons}>
          <strong>Related Lessons</strong>
          <div>
            {visibleLessons.map((lesson) => onOpenLesson ? (
              <button type="button" key={lesson.id || lesson.videoId} onClick={() => onOpenLesson(lesson)}>
                {lesson.title}
              </button>
            ) : (
              <Link key={lesson.id || lesson.href} href={lesson.href}>{lesson.title}</Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
