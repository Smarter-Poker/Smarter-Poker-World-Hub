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
