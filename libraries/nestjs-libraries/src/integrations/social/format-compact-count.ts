/** Compact display for large counts (e.g. 2500 → "2.5k", 100000 → "100k"). */
export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0';
  }
  const n = Math.floor(value);
  if (n < 1000) {
    return n.toLocaleString();
  }
  if (n < 1_000_000) {
    const k = n / 1000;
    const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace(/\.0$/, '');
    return `${text}k`;
  }
  const m = n / 1_000_000;
  const rounded = m >= 100 ? Math.round(m) : Math.round(m * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(/\.0$/, '');
  return `${text}M`;
}
