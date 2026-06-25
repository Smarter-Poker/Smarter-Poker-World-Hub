function selectionLabel(selection, matchup) {
  if (!selection) return '';
  const parts = selection.split('-');
  return parts.length > 0 ? parts[0].trim() : selection;
}
console.log(selectionLabel("Over", "A @ B"));
console.log(selectionLabel("Nationals Over 4.5", "A @ B"));
