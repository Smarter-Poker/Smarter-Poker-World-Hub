// TRAIN-CSS-MOBILE-ADOPT-18, TRAIN-WIRE-FEEDBACK-V2-1, and TRAIN-WIRE-PROGRESS-3
// The canonical arena owns responsive play, feedback, and durable progress.
export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/hub/training/arena/quiz-gauntlet?level=1&source=legacy-quiz-gauntlet',
      permanent: false,
    },
  };
}

export default function QuizGauntletRedirect() {
  return null;
}
