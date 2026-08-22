export function scoreToLetter(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return '';
  if (n >= 90) return 'A';
  if (n >= 80) return 'B';
  if (n >= 70) return 'C';
  if (n >= 60) return 'D';
  return 'F';
}
