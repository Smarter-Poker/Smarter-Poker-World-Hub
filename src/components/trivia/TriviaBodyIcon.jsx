/** Custom dimensional artwork from the approved Poker Trivia mobile design. */
const ICON_CELLS = Object.freeze({
  play: [0, 0],
  diamonds: [1, 0],
  streak: [2, 0],
  study: [3, 0],
  search: [0, 1],
  leaderboards: [1, 1],
  stats: [2, 1],
  achievements: [3, 1],
  settings: [0, 2],
  duel: [1, 2],
  help: [2, 2],
  strategy: [3, 2],
});

export default function TriviaBodyIcon({ name, className = '', style }) {
  const cell = ICON_CELLS[name];
  if (!cell) return null;

  return (
    <span
      aria-hidden="true"
      className={className}
      data-trivia-icon={name}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        width: 'var(--trivia-icon-size, 2rem)',
        height: 'var(--trivia-icon-size, 2rem)',
        verticalAlign: 'middle',
        backgroundImage: 'url(/images/trivia/approved-chrome/ui-icons.webp)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '400% 300%',
        backgroundPosition: `${(cell[0] * 100) / 3}% ${cell[1] * 50}%`,
        ...style,
      }}
    />
  );
}
