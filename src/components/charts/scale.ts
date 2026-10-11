/** A "nice" step (1, 2 or 5 × 10ⁿ) so axis labels are round numbers. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * power;
}

/** Round tick values covering [min, max] with about `count` intervals. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) {
    // Flat or empty data: give the axis some room around the single value.
    const pad = Math.abs(max) > 0 ? Math.abs(max) * 0.1 : 1;
    return niceTicks(min - (min === 0 ? 0 : pad), max + pad, count);
  }
  const step = niceStep((max - min) / count);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Maps a value in [d0, d1] to [r0, r1]. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Path for a bar with rounded top corners, anchored flat on the baseline. */
export function barPath(x: number, y: number, w: number, baseline: number, radius = 4): string {
  const h = baseline - y;
  if (h <= 0 || w <= 0) return '';
  const r = Math.min(radius, w / 2, h);
  return `M${x},${baseline}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${baseline}Z`;
}
