/** Color with alpha. Accepts #rgb or #rrggbb. Other CSS colors come back unchanged (alpha ignored). */
export function hexA(color: string, a: number): string {
  let c = color.trim();
  if (c.startsWith('#')) {
    if (c.length === 4) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    const n = parseInt(c.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
  }
  return c;
}
