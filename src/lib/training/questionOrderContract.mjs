import { randomInt } from 'node:crypto';

/**
 * Return a fresh, unpredictably ordered copy of a balanced question batch.
 *
 * Answer-class balancing may inspect the private answer key on the server, but
 * the resulting class sequence must not survive into the signed attempt
 * manifest. `randomInt` keeps that final permutation independent from the
 * action labels and unavailable to the browser.
 */
export function shuffleBalancedQuestionOrder(questions, drawIndex = randomInt) {
  const shuffled = Array.isArray(questions) ? [...questions] : [];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const selected = drawIndex(i + 1);
    if (!Number.isInteger(selected) || selected < 0 || selected > i) {
      throw new RangeError('Question-order index must be an integer inside the remaining range.');
    }
    [shuffled[i], shuffled[selected]] = [shuffled[selected], shuffled[i]];
  }
  return shuffled;
}
