const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export type NumberStyle = 'short' | 'scientific';

let style: NumberStyle = 'short';

export function setNumberStyle(s: NumberStyle): void {
  style = s;
}

export function getNumberStyle(): NumberStyle {
  return style;
}

/** Format a number for display. Small numbers keep decimals, big numbers use suffixes. */
export function fmt(n: number, decimals = 2): string {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a < 1000) {
    if (a === 0) return '0';
    if (a < 10) return sign + trim(a.toFixed(decimals));
    if (a < 100) return sign + trim(a.toFixed(Math.min(decimals, 1)));
    return sign + Math.floor(a).toString();
  }
  const exp = Math.floor(Math.log10(a));
  if (style === 'scientific' || exp >= SUFFIXES.length * 3) {
    const m = a / 10 ** exp;
    return `${sign}${m.toFixed(2)}e${exp}`;
  }
  const tier = Math.floor(exp / 3);
  const scaled = a / 10 ** (tier * 3);
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return `${sign}${scaled.toFixed(digits)}${SUFFIXES[tier]}`;
}

/** Whole numbers: no decimals below 1000. */
export function fmtInt(n: number): string {
  return Math.abs(n) < 1000 ? Math.floor(n).toString() : fmt(n);
}

export function fmtTime(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function fmtPct(fraction: number): string {
  return `${trim((fraction * 100).toFixed(1))}%`;
}

function trim(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
