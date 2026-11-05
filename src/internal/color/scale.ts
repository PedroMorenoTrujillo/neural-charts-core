import type { ChartResult } from '../../public/chart-types.js';
import { array, record, choice, number, fail } from '../data/validation.js';
import { createLinearScale } from '../math/linear.js';
import { ok } from '../diagnostics.js';
import { rgbToOklab, oklabToRgb, rgbHex, type ColorVector } from './oklab.js';
export type ParsedColor = Readonly<{ rgb: ColorVector; hex: string; lab: ColorVector }>;
export type ParsedColorScale = Readonly<{ type: 'sequential' | 'diverging' | 'threshold'; colors: readonly ParsedColor[]; positions: readonly number[]; domain: readonly number[] | null; boundaries: readonly number[] }>;
export type QuantitativeColorScale = Readonly<{
  type: ParsedColorScale['type']; domain: readonly number[] | null; boundaries: readonly number[]; colors: readonly string[];
  constant: boolean; color(value: number): string; colorAtFraction(fraction: number): string; fraction(value: number): number;
}>;
export function parseColorStop(input: unknown, path: string): ParsedColor {
  let rgb: ColorVector;
  if (typeof input === 'string') {
    if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(input)) fail(path, 'BAD_COLOR_STOP');
    const value = input.length === 4 ? input.slice(1).split('').map(char => char + char).join('') : input.slice(1);
    rgb = [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  } else {
    const value = record(input, ['r', 'g', 'b'], ['r', 'g', 'b'], path), channel = (key: string): number => { const n = number(value[key], path + '.' + key, 0, 255); if (!Number.isInteger(n)) fail(path + '.' + key, 'BAD_COLOR_STOP'); return n; };
    rgb = [channel('r'), channel('g'), channel('b')];
  }
  Object.freeze(rgb); return Object.freeze({ rgb, hex: rgbHex(rgb), lab: Object.freeze(rgbToOklab(rgb)) });
}
function ascending(input: unknown, count: number | null, path: string): readonly number[] {
  const values = array(input, 16, path).map((value, i) => number(value, path + '[' + i + ']'));
  if (count !== null && values.length !== count) fail(path, 'BAD_COLOR_SCALE');
  if (values.some((value, i) => i > 0 && value <= values[i - 1]!)) fail(path, 'BAD_COLOR_SCALE');
  return Object.freeze(values);
}
/** Throws the shared ValidationFailure, to be caught by the owning spec parser. */
export function parseColorScale(input: unknown, path = 'colorScale'): ParsedColorScale {
  const value = record(input, ['type', 'domain', 'colors', 'positions', 'boundaries'], ['type', 'colors'], path), type = choice(value.type, ['sequential', 'diverging', 'threshold'], path + '.type');
  const colors = Object.freeze(array(value.colors, 16, path + '.colors').map((color, i) => parseColorStop(color, path + '.colors[' + i + ']')));
  if (colors.length < 2) fail(path + '.colors', 'BAD_COLOR_SCALE');
  let domain: readonly number[] | null = null, positions: readonly number[] = [], boundaries: readonly number[] = [];
  if (type === 'threshold') {
    if (Object.hasOwn(value, 'domain') || Object.hasOwn(value, 'positions')) fail(path, 'BAD_COLOR_SCALE');
    boundaries = ascending(value.boundaries, colors.length - 1, path + '.boundaries');
  } else {
    if (Object.hasOwn(value, 'boundaries')) fail(path + '.boundaries', 'BAD_COLOR_SCALE');
    if (type === 'diverging' || Object.hasOwn(value, 'domain')) domain = ascending(value.domain, type === 'diverging' ? 3 : 2, path + '.domain');
    if (type === 'diverging' && (colors.length !== 3 || Object.hasOwn(value, 'positions'))) fail(path, 'BAD_COLOR_SCALE');
    positions = type === 'sequential' && Object.hasOwn(value, 'positions') ? ascending(value.positions, colors.length, path + '.positions') : Object.freeze(colors.map((_, i) => i / (colors.length - 1)));
    if (positions[0] !== 0 || positions[positions.length - 1] !== 1) fail(path + '.positions', 'BAD_COLOR_SCALE');
  }
  return Object.freeze({ type, colors, positions, domain, boundaries });
}
const clamp = (value: number) => Math.min(1, Math.max(0, value));
function upperBound(values: readonly number[], value: number): number { let low = 0, high = values.length; while (low < high) { const mid = Math.floor((low + high) / 2); if (value < values[mid]!) high = mid; else low = mid + 1; } return low; }
export function createColorScale(spec: ParsedColorScale, extent: readonly [number, number] | null): ChartResult<QuantitativeColorScale> {
  const domain = spec.type === 'threshold' ? null : spec.domain ?? extent, colors = Object.freeze(spec.colors.map(color => color.hex));
  const constant = spec.type !== 'threshold' && (!domain || domain[0] === domain[domain.length - 1]);
  const firstScale = domain && !constant ? createLinearScale([domain[0]!, domain[1]!], [0, 1], true) : null;
  if (firstScale?.status === 'invalid') return firstScale;
  const lastScale = domain && spec.type === 'diverging' ? createLinearScale([domain[1]!, domain[2]!], [0, 1], true) : null;
  if (lastScale?.status === 'invalid') return lastScale;
  const fraction = (value: number): number => {
    if (!Number.isFinite(value)) throw RangeError('Finite quantitative value required');
    if (spec.type === 'threshold') return (upperBound(spec.boundaries, value) + .5) / colors.length;
    if (constant || !domain) return .5;
    if (spec.type === 'diverging') {
      if (value === domain[1]) return .5;
      return value < domain[1]! ? .5 * (firstScale?.status === 'ok' ? firstScale.value.map(value)! : 0) : .5 + .5 * (lastScale?.status === 'ok' ? lastScale.value.map(value)! : 1);
    }
    return firstScale?.status === 'ok' ? firstScale.value.map(value)! : .5;
  };
  const colorAtFraction = (value: number): string => {
    if (!Number.isFinite(value)) throw RangeError('Finite color fraction required');
    const t = clamp(value);
    if (spec.type === 'threshold') return colors[Math.min(colors.length - 1, Math.floor(t * colors.length))]!;
    const next = upperBound(spec.positions, t), previous = Math.max(0, next - 1);
    if (t === spec.positions[previous] || next >= colors.length) return colors[previous]!;
    const first = spec.colors[previous]!, last = spec.colors[next]!, ratio = (t - spec.positions[previous]!) / (spec.positions[next]! - spec.positions[previous]!);
    return rgbHex(oklabToRgb([first.lab[0] * (1 - ratio) + last.lab[0] * ratio, first.lab[1] * (1 - ratio) + last.lab[1] * ratio, first.lab[2] * (1 - ratio) + last.lab[2] * ratio]));
  };
  const cache = new Map<number, string>();
  const color = (value: number): string => {
    const known = cache.get(value); if (known !== undefined) return known;
    const result = colorAtFraction(fraction(value)); if (cache.size >= 512) cache.clear(); cache.set(value, result); return result;
  };
  return ok(Object.freeze({ type: spec.type, domain: domain ? Object.freeze([...domain]) : null, boundaries: spec.boundaries, colors, constant, color, colorAtFraction, fraction }));
}
