/**
 * Legacy Quiz Gauntlet Route
 *
 * The former standalone page generated and graded its own browser-side answer
 * bank. Canonical Quiz Gauntlet questions now enter through the signed Training
 * Arena so question identity, grading, feedback, and completion stay on the
 * verified server-authority path.
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
