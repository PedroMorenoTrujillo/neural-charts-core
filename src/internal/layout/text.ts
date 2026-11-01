import type { ResolvedFont } from '../chart/presentation.js';

export type TextMetrics = Readonly<{ width: number; height: number; baseline: number }>;
export interface TextMeasurer {
  measure(text: string, font: ResolvedFont, direction: 'ltr' | 'rtl'): TextMetrics;
  invalidate(): void;
  destroy(): void;
}
export function ellipsis(text: string, maxWidth: number, measure: (text: string) => TextMetrics): string | null {
  if (maxWidth <= 0) return null;
  if (measure(text).width <= maxWidth) return text;
  if (measure('…').width > maxWidth) return null;
  const points = Array.from(text); let lo = 0, hi = points.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (measure(points.slice(0, mid).join('') + '…').width <= maxWidth) lo = mid; else hi = mid - 1; }
  let final = points.slice(0, lo).join('') + '…';
  while (lo > 0 && measure(final).width > maxWidth) { lo--; final = points.slice(0, lo).join('') + '…'; }
  return measure(final).width <= maxWidth ? final : null;
}
// Only colliding category prefixes use a tail. Peers are the bounded tick candidates,
// never the full data set; measurement and collision selection keep the same passes.
export function categoryEllipsis(text: string, peers: readonly string[], maxWidth: number, measure: (text: string) => TextMetrics): string | null {
  const prefix = ellipsis(text, maxWidth, measure);
  if (!prefix || prefix === text || !peers.some(other => other !== text && ellipsis(other, maxWidth, measure) === prefix)) return prefix;
  const points = Array.from(text); let lo = 0, hi = points.length;
  const tail = (n: number) => '…' + points.slice(points.length - n).join('');
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (measure(tail(mid)).width <= maxWidth) lo = mid; else hi = mid - 1; }
  let candidate = tail(lo);
  while (lo > 0 && measure(candidate).width > maxWidth) candidate = tail(--lo);
  return lo > 0 && measure(candidate).width <= maxWidth ? candidate : prefix;
}
