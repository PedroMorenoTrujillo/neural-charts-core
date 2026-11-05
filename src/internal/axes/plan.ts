import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
import type { Domain } from '../math/domain.js';
import { selectNumericTicks } from '../math/numeric-ticks.js';
import { createLinearScale } from '../math/linear.js';
import { selectTimeTicks, createTimeScale } from '../math/time.js';
import { createCategoryFrame, createPointScale } from '../math/category.js';
import type { PointScale } from '../math/category.js';
import type { UtcInterval } from '../math/utc.js';
import type { ResolvedFont } from '../chart/presentation.js';
import type { Plot } from '../layout/frame.js';
import type { TextMeasurer } from '../layout/text.js';
import { ellipsis, categoryEllipsis } from '../layout/text.js';

export type AxisInput = Readonly<{ type: 'category' | 'linear' | 'time'; values?: readonly Readonly<{ id: string; label?: string }>[]; domain?: Domain; nice?: boolean; reversed?: boolean; edgeSpacing?: number; title?: string; grid?: boolean; ticks?: Readonly<{ targetCount?: number }>; labels?: Readonly<{ maxWidth?: number }> }>;
export type TickLabel = Readonly<{ value: string | number; full: string; text: string | null; position: number; box: Plot; baseline: number }>;
export type AxisPlan = Readonly<{ domain: Domain | null; ticks: readonly (string | number)[]; labels: readonly TickLabel[]; interval: UtcInterval | null; target: number }>;
export type AxesPlan = Readonly<{ plot: Plot; tooSmall: boolean; x: AxisPlan; y: AxisPlan; mapX(value: string | number): number | null; mapY(value: number): number | null; xTitle: string | null; yTitle: string | null; font: ResolvedFont; direction: 'ltr' | 'rtl' }>;
type TickSelection = Readonly<{ domain: Domain | null; ticks: readonly (string | number)[]; interval: UtcInterval | null }>;
const target = (n: number): number => Math.max(2, Math.min(12, Math.floor(n)));
export function formatAxis(value: string | number, type: AxisInput['type'], interval: UtcInterval | null, labels: ReadonlyMap<string, string>): string {
  if (typeof value === 'string') return labels.get(value) ?? value;
  if (type !== 'time') return String(value === 0 ? 0 : value);
  const iso = new Date(value).toISOString(); if (!interval) return iso;
  const match = /^([+-]?\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(iso)!;
  const year = match[1]!, month = `${year}-${match[2]}`, date = `${month}-${match[3]}`, hour = `${date}T${match[4]}`, minute = `${hour}:${match[5]}`, second = `${minute}:${match[6]}`;
  switch (interval.unit) { case 'year': return year; case 'month': return month; case 'day': case 'week': return date; case 'hour': return hour + 'Z'; case 'minute': return minute + 'Z'; case 'second': return second + 'Z'; case 'millisecond': return iso; }
}
function select(axis: AxisInput, domain: Domain | null, count: number, isY: boolean): Result<TickSelection> {
  if (axis.type === 'category') {
    const values = axis.values ?? [], n = Math.min(count, values.length), ticks: string[] = [];
    for (let i = 0; i < n; i++) ticks.push(values[n === 1 ? 0 : Math.round(i * (values.length - 1) / (n - 1))]!.id);
    return ok({ domain: null, ticks, interval: null });
  }
  if (!domain) return ok({ domain: null, ticks: [], interval: null });
  const result = (axis.type === 'time' ? selectTimeTicks : selectNumericTicks)(domain, { nice: axis.nice ?? (isY && !axis.domain), targetCount: count });
  if (result.status === 'invalid') return result;
  return ok({ domain: result.value.domain, ticks: result.value.ticks, interval: 'interval' in result.value ? result.value.interval : null });
}
type CategoryMapping = (plot: Plot) => Result<PointScale>;
function scales(x: AxisInput, y: AxisInput, sx: TickSelection, sy: TickSelection, plot: Plot, categoryX?: CategoryMapping): Result<Readonly<{ mapX(value: string | number): number | null; mapY(value: number): number | null }>> {
  const categoryY = y.type === 'category' ? createCategoryFrame((y.values ?? []).map(value => value.id), y.reversed ? [plot.y + plot.height, plot.y] : [plot.y, plot.y + plot.height], .5) : null;
  if (categoryY?.status === 'invalid') return categoryY;
  const ys = y.type !== 'category' && sy.domain ? createLinearScale(sy.domain, y.reversed ? [plot.y, plot.y + plot.height] : [plot.y + plot.height, plot.y], false) : null;
  if (ys?.status === 'invalid') return ys;
  const mapY = categoryY?.status === 'ok' ? categoryY.value.centerAt : ys?.status === 'ok' ? ys.value.map : () => null;
  if (x.type === 'category') {
    if (categoryX) { const prepared = categoryX(plot); return prepared.status === 'invalid' ? prepared : ok({ mapX: v => typeof v === 'string' ? prepared.value.center(v) : null, mapY }); }
    const frame = createCategoryFrame((x.values ?? []).map(c => c.id), x.reversed ? [plot.x + plot.width, plot.x] : [plot.x, plot.x + plot.width], x.edgeSpacing ?? .5);
    if (frame.status === 'invalid') return frame;
    const scale = createPointScale(frame.value); return ok({ mapX: v => typeof v === 'string' ? scale.center(v) : null, mapY });
  }
  const xs = sx.domain ? (x.type === 'time' ? createTimeScale : createLinearScale)(sx.domain, x.reversed ? [plot.x + plot.width, plot.x] : [plot.x, plot.x + plot.width], false) : null;
  if (xs?.status === 'invalid') return xs;
  return ok({ mapX: v => typeof v === 'number' && xs?.status === 'ok' ? xs.value.map(v) : null, mapY });
}
function overlap(a: Plot, b: Plot, gap=4): boolean { return a.x - gap < b.x + b.width + gap && a.x + a.width + gap > b.x - gap && a.y - gap < b.y + b.height + gap && a.y + a.height + gap > b.y - gap; }
export function filterLabels(labels: readonly TickLabel[], gap=4): readonly TickLabel[] {
  const accepted: TickLabel[] = [], indices = labels.length > 1 ? [0, labels.length - 1, ...Array.from({ length: labels.length - 2 }, (_, i) => i + 1)] : [0];
  for (const i of indices) { const label = labels[i]; if (label?.text && !accepted.some(other => overlap(label.box, other.box,gap))) accepted.push(label); }
  const set = new Set(accepted); return Object.freeze(labels.map(label => set.has(label) ? label : { ...label, text: null }));
}
export function planAxes(input: Readonly<{ x: AxisInput; y: AxisInput; domains: Readonly<{ x: Domain | null; y: Domain | null }>; width: number; height: number; font: ResolvedFont; direction: 'ltr' | 'rtl'; labels: ReadonlyMap<string, string>; yLabels?: ReadonlyMap<string, string>; measurer: TextMeasurer; compact?: boolean; categoryX?: CategoryMapping }>): Result<AxesPlan> {
  const { x, y, width, height, font, direction, labels, measurer } = input, top = input.compact ? 4 + (y.title ? 16 : 0) : 8 + (y.title ? 20 : 0), provisional: Plot = { x: 56, y: top, width: Math.max(0, width - 64), height: Math.max(0, height - top - 32) };
  const xCount = x.ticks?.targetCount ?? target(provisional.width / 80), yCount = y.ticks?.targetCount ?? target(provisional.height / 48);
  let sx = select(x, input.domains.x, xCount, false), sy = select(y, input.domains.y, yCount, true);
  if (sx.status === 'invalid') return sx; if (sy.status === 'invalid') return sy;
  const measure = (text: string) => measurer.measure(text, font, direction), yCap = Math.min(y.labels?.maxWidth ?? 80, width * .25), xCap = Math.min(x.labels?.maxWidth ?? 96, provisional.width * .5);
  const yNames = y.type === 'category' ? input.yLabels ?? new Map((y.values ?? []).map(value => [value.id, value.label ?? value.id])) : labels;
  const yRanks = new Map((y.values ?? []).map((value, i) => [value.id, i]));
  let yWidth = 0, labelHeight = 1.25 * font.size;
  for (const value of sy.value.ticks) { const text = ellipsis(formatAxis(value, y.type, sy.value.interval, yNames), yCap, measure); if (text) { const m = measure(text); yWidth = Math.max(yWidth, m.width); labelHeight = Math.max(labelHeight, m.height); } }
  for (const value of sx.value.ticks) { const text = ellipsis(formatAxis(value, x.type, sx.value.interval, labels), xCap, measure); if (text) labelHeight = Math.max(labelHeight, measure(text).height); }
  const left = Math.min(width, 18 + yWidth), bottom = Math.min(height, (input.compact ? Math.max(10, Math.ceil(labelHeight / 2 - 4)) : 18) + labelHeight + (x.title ? input.compact ? 26 : 20 : 0));
  const plot: Plot = Object.freeze({ x: left, y: top, width: Math.max(0, width - left - 8), height: Math.max(0, height - top - bottom) });
  const makeLabels = (selection: TickSelection, axis: AxisInput, horizontal: boolean, maps: Readonly<{ mapX(value: string | number): number | null; mapY(value: number): number | null }>): readonly TickLabel[] => {
    const full = selection.ticks.map(v => formatAxis(v, axis.type, selection.interval, horizontal ? labels : yNames)), duplicates = new Set(full.filter((s, i) => full.indexOf(s) !== i));
    return selection.ticks.map((value, i) => {
      const position = horizontal ? maps.mapX(value) : axis.type === 'category' ? maps.mapY(yRanks.get(String(value))!) : typeof value === 'number' ? maps.mapY(value) : null;
      if (position === null || !Number.isFinite(position)) throw Error('Unrepresentable tick.');
      const original = duplicates.has(full[i]!) ? typeof value === 'number' && axis.type === 'time' ? new Date(value).toISOString() : String(value) : full[i]!;
      const cap = horizontal ? Math.min(xCap, 2 * Math.max(0, Math.min(position, width - position))) : Math.min(yCap, yWidth);
      const text = axis.type === 'category' ? categoryEllipsis(original, full, cap, measure) : ellipsis(original, cap, measure), metrics = measure(text ?? '');
      const box = horizontal ? { x: position - metrics.width / 2, y: plot.y + plot.height + 8, width: metrics.width, height: metrics.height } : { x: plot.x - 8 - metrics.width, y: position - metrics.height / 2, width: metrics.width, height: metrics.height };
      return { value, full: original, text: box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height ? text : null, position, box, baseline: metrics.baseline };
    });
  };
  if (plot.width < 48 || plot.height < 32 || y.type !== 'category' && !sy.value.domain || y.type === 'category' && !y.values?.length || x.type !== 'category' && !sx.value.domain) return ok({ plot, tooSmall: true, x: { ...sx.value, labels: [], target: xCount }, y: { ...sy.value, labels: [], target: yCount }, mapX: () => null, mapY: () => null, xTitle: null, yTitle: null, font, direction });
  let maps = scales(x, y, sx.value, sy.value, plot, input.categoryX); if (maps.status === 'invalid') return maps;
  let xl = makeLabels(sx.value, x, true, maps.value), yl = makeLabels(sy.value, y, false, maps.value);
  const collides = (ls: readonly TickLabel[]) => ls.some((a, i) => a.text && ls.slice(i + 1).some(b => b.text && overlap(a.box, b.box)));
  if (xCount > 2 && collides(xl)) { sx = select(x, input.domains.x, xCount - 1, false); if (sx.status === 'invalid') return sx; }
  if (yCount > 2 && collides(yl)) { sy = select(y, input.domains.y, yCount - 1, true); if (sy.status === 'invalid') return sy; }
  maps = scales(x, y, sx.value, sy.value, plot, input.categoryX); if (maps.status === 'invalid') return maps;
  xl = makeLabels(sx.value, x, true, maps.value); yl = makeLabels(sy.value, y, false, maps.value);
  if (![plot.x, plot.y, plot.width, plot.height].every(Number.isFinite)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'axes');
  return ok(Object.freeze({ plot, tooSmall: false, x: { ...sx.value, labels: filterLabels(xl), target: xCount }, y: { ...sy.value, labels: filterLabels(yl), target: yCount }, ...maps.value, xTitle: x.title ? ellipsis(x.title, plot.width, measure) : null, yTitle: y.title ? ellipsis(y.title, width - plot.x - 8, measure) : null, font, direction }));
}
