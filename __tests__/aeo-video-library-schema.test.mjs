import test from 'node:test';
import assert from 'node:assert/strict';
import { courseSchema, hubProductSchema } from '../src/lib/seo/hubPageSchema.js';

test('courseSchema generates structured Course with Quiz nodes in hasPart', () => {
  const schema = courseSchema({
    path: '/hub/video-library',
    name: 'Smarter.Poker Video Coaching Curriculum & Interactive Pause Quizzes',
    description: 'Video Poker Training with Quizzes',
    courseWorkload: 'PT40H',
    quizzes: [
      {
        name: 'Preflop 3-Bet Pot Decision Pause Quiz',
        description: 'Test Your Decisions When Facing A 3-Bet Out Of Position.',
      },
    ],
  });

  assert.equal(schema['@type'], 'Course');
  assert.equal(schema['@id'], 'https://smarter.poker/hub/video-library#course');
  assert.equal(schema.hasCourseInstance.courseWorkload, 'PT40H');
  assert.ok(Array.isArray(schema.hasPart), 'hasPart should be an array');
  assert.equal(schema.hasPart.length, 1);
  assert.equal(schema.hasPart[0]['@type'], 'Quiz');
  assert.equal(schema.hasPart[0].name, 'Preflop 3-Bet Pot Decision Pause Quiz');
  assert.equal(schema.hasPart[0].learningResourceType, 'Quiz');
  assert.equal(schema.hasPart[0].educationalUse, 'Assessment');
});

test('hubProductSchema connects course and quiz schema for video library', () => {
  const nodes = hubProductSchema({
    path: '/hub/video-library',
    name: 'Smarter.Poker Video Library',
    description: 'Curated Strategy Videos',
    trail: [['Hub', '/hub'], ['Video Library', '/hub/video-library']],
    course: {
      name: 'Smarter.Poker Video Coaching Curriculum & Interactive Pause Quizzes',
      courseWorkload: 'PT40H',
      quizzes: [
        {
          name: 'Interactive Pause Quiz 1',
        },
      ],
    },
  });

  const courseNode = nodes.find((n) => n['@type'] === 'Course');
  assert.ok(courseNode, 'Course node must be included in hubProductSchema output');
  assert.equal(courseNode['@id'], 'https://smarter.poker/hub/video-library#course');
  assert.ok(courseNode.hasPart.some((p) => p['@type'] === 'Quiz'));
});
