// One navigation per deliberate vertical gesture. Horizontal swipes and wheel
// momentum do not accidentally skip several clips.
export function verticalReelSwipe({ startX, startY, endX, endY, elapsedMs = 300 }) {
  const dy = endY - startY;
  const dx = endX - startX;
  const distance = Math.abs(dy);
  if (!Number.isFinite(dy) || !Number.isFinite(dx) || distance <= Math.abs(dx) * 1.2) return 0;
  const quickFlick = distance >= 28 && elapsedMs > 0 && distance / elapsedMs >= 0.45;
  if (distance < 55 && !quickFlick) return 0;
  return dy < 0 ? 1 : -1;
}

export function createReelWheelGesture() {
  let lastAt = -Infinity;
  let accumulated = 0;
  let consumed = false;
  return (deltaY, at) => {
    if (!Number.isFinite(deltaY) || !Number.isFinite(at)) return 0;
    if (at - lastAt > 180) { accumulated = 0; consumed = false; }
    lastAt = at;
    if (consumed) return 0;
    accumulated += deltaY;
    if (Math.abs(accumulated) < 55) return 0;
    consumed = true;
    return accumulated > 0 ? 1 : -1;
  };
}
