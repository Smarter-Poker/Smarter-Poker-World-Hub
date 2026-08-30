import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

import {
  enforceTrainingQuestionContract,
  getDecisionType,
  validateTrainingQuestion,
} from '../src/lib/training/questionContract.mjs';

const require = createRequire(import.meta.url);
const parser = require('@babel/parser');
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('standard poker decisions are served with four meaningful choices', () => {
  const question = enforceTrainingQuestionContract({
    question: 'The Button opens to 2.5 BB. You are in the Small Blind with T♠T♦. What is your best action?',
    scenario: { street: 'preflop', heroPosition: 'SB', villainPosition: 'BTN' },
    options: [
      { id: 'fold', text: 'Fold' },
      { id: 'call', text: 'Call' },
      { id: 'raise', text: '3-Bet To 9 BB', isCorrect: true },
    ],
  });

  assert.equal(question.options.length, 4);
  assert.equal(question.correctAnswer, 'raise');
  assert.match(question.question, /Action folds to the Button, who raises to 2\.5 BB/i);
  assert.doesNotMatch(question.question, /Button opens/i);
  assert.equal(question.questionContract.valid, true, question.questionContract.issues.join('; '));
  assert.ok(question.options.every((option) => !('isCorrect' in option)));
});

test('legitimate bet-size percentages are preserved and generic padding is forbidden', () => {
  const question = enforceTrainingQuestionContract({
    question: 'The Big Blind checks to you on the flop. What is your best action?',
    scenario: { street: 'flop', action: 'The Big Blind checks to you.' },
    options: [
      { id: 'check', text: 'Check', correct: false },
      { id: 'bet33', text: 'Bet 33% Pot', correct: true },
      { id: 'bet67', text: 'Bet 67% Pot', correct: false },
    ],
  });

  assert.deepEqual(question.options.map((option) => option.text), [
    'Check',
    'Bet 33% Pot',
    'Bet 67% Pot',
    'Bet 125% Pot',
  ]);
  assert.ok(question.options.every((option) => !/^Option\s+\d+$/i.test(option.text)));
  assert.equal(validateTrainingQuestion(question).valid, true);
});

test('grouped sizing choices stay mutually exclusive when padded to four', () => {
  const question = enforceTrainingQuestionContract({
    question: 'The Big Blind checks to you on the flop. Which sizing band is best?',
    scenario: { street: 'flop', action: 'The Big Blind checks to you.' },
    correctAnswer: 'grouped_small',
    options: [
      { id: 'check', text: 'Check' },
      { id: 'grouped_small', text: 'Small Bet · Up To 40% Pot' },
      { id: 'grouped_medium', text: 'Medium Bet · 41–80% Pot' },
    ],
    _difficultyApplied: 'standard',
  });

  assert.deepEqual(question.options.map((option) => option.text), [
    'Check',
    'Small Bet · Up To 40% Pot',
    'Medium Bet · 41–80% Pot',
    'Large Bet · 81–100% Pot',
  ]);
  assert.doesNotMatch(question.options.map((option) => option.text).join(' | '), /Bet 33% Pot/);
  assert.equal(validateTrainingQuestion(question).valid, true);
});

test('validation rejects exact sizes mixed with overlapping sizing bands', () => {
  const rawQuestion = {
    question: 'The Big Blind checks to you on the flop. What is your best action?',
    scenario: { street: 'flop', action: 'The Big Blind checks to you.' },
    correctAnswer: 'check',
    options: [
      { id: 'check', text: 'Check' },
      { id: 'bet33', text: 'Bet 33% Pot' },
      { id: 'grouped_small', text: 'Small Bet · Up To 40% Pot' },
      { id: 'grouped_medium', text: 'Medium Bet · 41–80% Pot' },
    ],
  };
  const audit = validateTrainingQuestion(rawQuestion);

  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some((issue) => /overlapping sizing band/i.test(issue)));

  const repaired = enforceTrainingQuestionContract(rawQuestion);
  assert.equal(validateTrainingQuestion(repaired).valid, true);
  assert.equal(repaired.options.length, 4);
  assert.doesNotMatch(repaired.options.map((option) => option.text).join(' | '), /Bet 33% Pot/);
});

test('numeric overbets remain exact sizing choices when a sparse tree is padded', () => {
  const question = enforceTrainingQuestionContract({
    question: 'The Big Blind checks to you on the river. What is your best action?',
    scenario: { street: 'river', action: 'The Big Blind checks to you.' },
    correctAnswer: 'b182',
    options: [
      { id: 'c', text: 'Check' },
      { id: 'b182', text: 'Overbet 182%' },
      { id: 'b412', text: 'Overbet 412%' },
    ],
  });

  assert.equal(validateTrainingQuestion(question).valid, true);
  assert.deepEqual(question.options.map((option) => option.text), [
    'Check',
    'Overbet 182%',
    'Overbet 412%',
    'Bet 33% Pot',
  ]);
  assert.doesNotMatch(question.options.map((option) => option.text).join(' | '), /Small Bet/);
});

test('only literal Yes/No and Push/Fold decisions may have two choices', () => {
  const yesNo = enforceTrainingQuestionContract({
    question: 'The Button is all-in at 11 BB effective. You hold A♠Q♠. Should you call?',
    scenario: { street: 'preflop', villainPosition: 'BTN', stackDepth: 11, heroHand: 'A♠Q♠' },
    options: [
      { id: 'call', text: 'Call', isCorrect: true },
      { id: 'fold', text: 'Fold' },
    ],
  });
  assert.deepEqual(yesNo.options.map((option) => option.text), ['Yes', 'No']);
  assert.match(yesNo.question, /Action folds to the Button, who raises all-in/i);
  assert.equal(getDecisionType(yesNo), 'yes-no');
  assert.equal(validateTrainingQuestion(yesNo).valid, true);

  const pushFold = enforceTrainingQuestionContract({
    question: 'At 8 BB effective, should you Push or Fold K♥5♣ from Under The Gun?',
    options: [
      { id: 'push', text: 'Push' },
      { id: 'fold', text: 'Fold', isCorrect: true },
    ],
  });
  assert.equal(getDecisionType(pushFold), 'push-fold');
  assert.equal(pushFold.options.length, 2);

  const illegalBinary = enforceTrainingQuestionContract({
    question: 'You face a river bet. What is your best action?',
    scenario: { street: 'river', action: 'The opponent bets 75% pot.' },
    options: [
      { id: 'call', text: 'Call', isCorrect: true },
      { id: 'fold', text: 'Fold' },
    ],
  });
  assert.equal(illegalBinary.options.length, 4);
});

test('choice labels cannot disclose grading', () => {
  const question = enforceTrainingQuestionContract({
    question: 'The Cutoff bets 67% pot into you on the river. What is your best action?',
    scenario: { street: 'river', action: 'The Cutoff bets 67% pot.' },
    correctAnswer: 'fold',
    options: [
      { id: 'fold', text: 'Correct — Fold' },
      { id: 'call', text: 'Call' },
      { id: 'raise', text: 'Raise To 2.5x' },
      { id: 'allin', text: 'Raise All-In' },
    ],
  });

  assert.equal(question.options[0].text, 'Fold');
  assert.equal(validateTrainingQuestion(question).valid, true);
});

test('ordinary strategy prose is not mistaken for a grading label', () => {
  const question = enforceTrainingQuestionContract({
    question: 'After a difficult hand, which reset routine should you use?',
    correctAnswer: 'reset',
    scenario: { isPsychology: true },
    options: [
      { id: 'reset', text: 'Take a breath and refocus on making the best decisions available.' },
      { id: 'chase', text: 'Chase the loss because you believe the earlier read was correct.' },
      { id: 'quit', text: 'End the session immediately without reviewing your state.' },
      { id: 'argue', text: 'Argue in chat until the opponent acknowledges the hand.' },
    ],
  });
  assert.equal(validateTrainingQuestion(question).valid, true);
});

const propertyName = (property) => property?.key?.name || property?.key?.value;
const literalValue = (node) => {
  if (node?.type === 'StringLiteral' || node?.type === 'NumericLiteral') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((part) => part.value.cooked).join('');
  }
  return null;
};

function walkFiles(root, output = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, output);
    else if (/\.(?:js|jsx|mjs)$/.test(entry.name) && !/\.backup\./.test(entry.name)) output.push(fullPath);
  }
  return output;
}

function authoredQuestionViolations() {
  const roots = ['pages/hub/training', 'src/components/training', 'src/games'];
  const violations = [];

  const inspectNode = (node, file) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectExpression') {
      const properties = node.properties.filter((property) => property.type === 'ObjectProperty');
      const fields = Object.fromEntries(properties.map((property) => [propertyName(property), property.value]));
      const answerKey = ['options', 'answers', 'choices'].find((key) => fields[key]?.type === 'ArrayExpression');
      if (answerKey) {
        const answers = fields[answerKey].elements.filter(Boolean);
        const authoredText = ['question', 'q', 'prompt', 'situation', 'scenario', 'title', 'description', 'action']
          .map((key) => literalValue(fields[key]))
          .filter(Boolean);
        const prompt = authoredText[0] || '';
        const hasGrading = fields.correct || fields.correctAnswer || fields.explanation
          || answers.some((answer) => answer.type === 'ObjectExpression'
            && answer.properties.some((property) => ['correct', 'isCorrect'].includes(propertyName(property))));
        if (prompt || hasGrading) {
          const texts = answers.map((answer) => {
            if (answer.type === 'StringLiteral') return answer.value;
            if (answer.type !== 'ObjectExpression') return '';
            const answerFields = Object.fromEntries(answer.properties
              .filter((property) => property.type === 'ObjectProperty')
              .map((property) => [propertyName(property), property.value]));
            return literalValue(answerFields.text)
              || literalValue(answerFields.label)
              || literalValue(answerFields.value)
              || literalValue(answerFields.action)
              || '';
          });
          const normalized = texts.map((text) => String(text).toLowerCase().replace(/[^a-z]/g, ''));
          const yesNo = answers.length === 2 && normalized.includes('yes') && normalized.includes('no');
          const pushFold = answers.length === 2
            && normalized.some((text) => /push|shove|allin/.test(text))
            && normalized.some((text) => /fold/.test(text));
          const transitionOnly = answers.length === 1 && normalized[0] === 'continue';
          if (answers.length !== 4 && !yesNo && !pushFold && !transitionOnly) {
            violations.push(`${path.relative(repoRoot, file)}:${node.loc?.start.line} has ${answers.length} choices`);
          }
          if (authoredText.some((text) => /\b(?:Button|BTN|Small Blind|SB|Big Blind|BB|Cutoff|CO|Hijack|HJ|Under The Gun|UTG|Middle Position|MP)\s+opens\b/i.test(text))) {
            violations.push(`${path.relative(repoRoot, file)}:${node.loc?.start.line} uses ambiguous “position opens” wording`);
          }
        }
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => inspectNode(child, file));
      else if (value && typeof value === 'object' && value.type) inspectNode(value, file);
    }
  };

  for (const root of roots) {
    for (const file of walkFiles(path.join(repoRoot, root))) {
      const ast = parser.parse(fs.readFileSync(file, 'utf8'), {
        sourceType: 'unambiguous',
        plugins: ['jsx', 'dynamicImport', 'optionalChaining', 'nullishCoalescingOperator'],
      });
      inspectNode(ast, file);
    }
  }
  return violations;
}

test('all authored Training Hub questions obey the answer-count contract', () => {
  assert.deepEqual(authoredQuestionViolations(), []);
});

test('feedback remains until an explicit Next click', () => {
  const table = read('src/components/training/games/UniversalDynamicTable.jsx');
  const arena = read('src/components/training/GodModeArena.jsx');
  const setup = read('src/components/training/SessionSetupModal.jsx');

  assert.doesNotMatch(table, /AutoAdvanceIndicator|autoAdvanceTotal|swipeTouchRef|Study Mode/);
  assert.doesNotMatch(table, /showFeedback\s*&&\s*\(key\s*===\s*['"] ['"]\s*\|\|\s*key\s*===\s*['"]Enter['"]\)/);
  assert.doesNotMatch(arena, /if\s*\(showFeedback\s*&&\s*e\.key\s*===\s*['"] ['"]\)/);
  assert.match(setup, /feedbackRule:\s*['"]every['"]/);
  assert.match(setup, /autoAdvanceUI:\s*['"]off['"]/);
  assert.match(table, /Next Question →/);
  assert.match(table, /This Screen Will Stay Open Until You Click Next/);

  const manualDrills = [
    ['src/games/MixedStrategyGame.js', /setTimeout\(nextRound/, /NEXT HAND →/],
    ['src/games/PatternRecognitionGame.js', /setTimeout\([^)]*nextRound/, /Next Question →/],
    ['src/games/PressureCookerGame.js', /setTimeout\([\s\S]{0,200}nextHand/, /Next Hand →/],
    ['src/games/SpeedDrillGame.js', /setTimeout\([\s\S]{0,200}nextHand/, /Next Hand →/],
    ['pages/hub/training/spot-trainer.js', /autoNextTimer|Next spot in/, /This Result Will Stay Open Until You Click Next/],
    ['pages/hub/training/quiz-gauntlet.js', /setTimeout\([\s\S]{0,200}setQIdx/, /Next Question →/],
  ];
  for (const [file, forbidden, required] of manualDrills) {
    const source = read(file);
    assert.doesNotMatch(source, forbidden, `${file} must not advance its scored result on a timer`);
    assert.match(source, required, `${file} must expose an explicit Next control`);
  }

  assert.match(read('src/games/PatternRecognitionGame.js'), /\['fold', 'call', 'raise', 'mixed'\]/);
  assert.match(read('src/games/PressureCookerGame.js'), /action: 'allin'/);
  assert.match(read('src/games/SpeedDrillGame.js'), /action: 'allin'/);
  const blindDefense = read('pages/hub/training/blind-defense.js');
  assert.match(blindDefense, /arena\/cash-003\?level=1/);
  assert.doesNotMatch(blindDefense, /Math\.random|save-session|session-complete/);
  assert.match(read('pages/hub/training/quiz-gauntlet.js'), /q\.options\.map/);

  const positionQuiz = read('src/components/training/PositionAwarenessQuiz.jsx');
  assert.match(positionQuiz, /sp-command-verdict/);
  assert.match(positionQuiz, /Your Answer/);
  assert.match(positionQuiz, /Correct Answer/);
  assert.match(positionQuiz, /This Result Will Stay Open Until You Click Next/);
  assert.match(positionQuiz, /Next Question →/);
  assert.doesNotMatch(positionQuiz, /setTimeout/);

  const demo = read('pages/training-table-demo.js');
  const clubTable = read('src/components/poker/TrainingGameTable.jsx');
  assert.doesNotMatch(demo, /Button opens|Player To Your Right Bets/i);
  assert.match(demo, /Action Folds To The Cutoff, Who Raises To 2\.5 BB/);
  assert.match(clubTable, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(clubTable, /actionLabels\.allIn/);
  assert.match(clubTable, /sp-club-mobile-decision[\s\S]{0,240}<p>\{questionText\}<\/p>/);
  assert.doesNotMatch(clubTable, /max-height:700px[\s\S]{0,500}sp-club-mobile-decision\{display:none\}/);
  assert.match(clubTable, /This Result Will Stay Open Until You Click Next/);
  assert.match(clubTable, /Next Question →/);
});
