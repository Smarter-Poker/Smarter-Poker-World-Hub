/**
 * Legacy Quiz Gauntlet Route
 *
 * The former standalone page generated and graded its own browser-side answer
 * bank. Canonical Quiz Gauntlet questions now enter through the signed Training
 * Arena so question identity, grading, feedback, and completion stay on the
 * verified server-authority path.
 * TRAIN-CSS-MOBILE-ADOPT-18, TRAIN-WIRE-FEEDBACK-V2-1, and
 * TRAIN-WIRE-PROGRESS-3 now resolve through that canonical Arena destination;
 * this compatibility route owns no duplicate responsive, feedback, or progress UI.
 */

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/arena/quiz-gauntlet?level=1&source=legacy-quiz-gauntlet',
      permanent: false,
    },
  };
}

export default function LegacyQuizGauntletRedirect() {
  return null;
}
