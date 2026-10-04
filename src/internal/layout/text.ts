import type { Result } from '../diagnostics.js';
import { invalid, ok } from '../diagnostics.js';
import type { ResolvedFont } from '../chart/presentation.js';

export type TextMetrics = Readonly<{ width: number; height: number; baseline: number }>;
export interface TextMeasurer {
  measure(text: string, font: ResolvedFont, direction: 'ltr' | 'rtl'): TextMetrics;
  invalidate(): void;
  destroy(): void;
}
export function createTextMeasurer(document: Document): Result<TextMeasurer> {
  try {
    let canvas: HTMLCanvasElement | null = document.createElement('canvas');
    let context = canvas.getContext('2d');
    if (!context) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host', 'Canvas text measurement is unavailable.');
    let generation = 0; const cache = new Map<string, TextMetrics>();
    return ok({
      measure(text, font, direction) {
        if (!context) throw Error('Text measurer destroyed.');
        const key = JSON.stringify([text, font.family, font.size, font.weight, direction, generation]), cached = cache.get(key);
        if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
        context.font = `${font.weight} ${font.size}px ${font.family}`; context.direction = direction;
        context.letterSpacing = '0px'; context.textBaseline = 'alphabetic';
        const m = context.measureText(text);
        if (!Number.isFinite(m.width) || m.width < 0) throw Error('Text measurement unavailable.');
        const vertical = Number.isFinite(m.actualBoundingBoxAscent) && Number.isFinite(m.actualBoundingBoxDescent) && m.actualBoundingBoxAscent + m.actualBoundingBoxDescent >= 0;
        const height = vertical ? Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1.25 * font.size) : 1.25 * font.size;
        const result = Object.freeze({ width: m.width, height, baseline: vertical ? (height - m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 + m.actualBoundingBoxAscent : .8 * height });
        cache.set(key, result); if (cache.size > 4096) cache.delete(cache.keys().next().value!);
        return result;
      },
      invalidate() { generation++; cache.clear(); },
      destroy() { cache.clear(); context = null; canvas = null; },
    });
  } catch { return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host', 'Canvas text measurement is unavailable.'); }
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
