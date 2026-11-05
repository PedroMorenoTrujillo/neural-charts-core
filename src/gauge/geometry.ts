import type { GaugeChartSpec } from '../public/gauge-types.js';
import type { ChartResult } from '../public/chart-types.js';
import type { Plot } from '../internal/layout/frame.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { createLinearScale } from '../internal/math/linear.js';
import { sectorPath, polar, type RadialFrame } from '../internal/geometry/radial-sector.js';
import { ok, invalid } from '../internal/diagnostics.js';
export type GaugeValueState = 'missing' | 'under' | 'within' | 'over';
export type GaugeProjection = Readonly<{ plot: Plot; frame: RadialFrame; track: readonly PathCommand[]; fill: readonly PathCommand[]; bands: readonly Readonly<{ id: string; color: string; commands: readonly PathCommand[] }>[]; target: readonly PathCommand[]; targetOutside: boolean; visualT: number | null; state: GaugeValueState; anchor: Readonly<{ x: number; y: number }>; readingBox: Plot; readingBaseline: number; readingFontSize: number; tooSmall: boolean; start: number; span: number }>;
export function projectGauge(spec: GaugeChartSpec, plot: Plot, fontSize: number): ChartResult<GaugeProjection> {
  if (![plot.x, plot.y, plot.width, plot.height, plot.x + plot.width, plot.y + plot.height, fontSize].every(Number.isFinite) || plot.width < 0 || plot.height < 0 || fontSize <= 0) return invalid('INVALID_CONFIG', 'BAD_GAUGE_BOUNDS', 'plot');
  const ring = spec.preset === 'ring', padding = Math.max(12, fontSize * 1.5), usableWidth = Math.max(0, plot.width - padding * 2), usableHeight = Math.max(0, plot.height - padding * 2 - fontSize * (spec.target ? 4.3 : 2.5));
  // Reserve the actual band/target extent, not only the foreground radius.
  const radius = Math.min(usableWidth / 2.26, usableHeight / (ring ? 2.26 : 1.13)), height = radius * (ring ? 2.26 : 1.13), top = plot.y + padding + Math.max(0, (usableHeight - height) / 2);
  const frame = Object.freeze({ cx: plot.x + plot.width / 2, cy: top + radius * 1.13, radius, innerRadius: radius * .78 }), start = ring ? 0 : -Math.PI / 2, span = ring ? 2 * Math.PI : Math.PI;
  const scale = createLinearScale(spec.domain, [0, 1], true); if (scale.status === 'invalid') return scale;
  const visualT = spec.value === null ? null : scale.value.map(spec.value), state: GaugeValueState = spec.value === null ? 'missing' : spec.value < spec.domain[0] ? 'under' : spec.value > spec.domain[1] ? 'over' : 'within';
  if (spec.value !== null && visualT === null) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GAUGE', 'value');
  const tooSmall = radius < 16, bands: { id: string; color: string; commands: readonly PathCommand[] }[] = []; let track: readonly PathCommand[] = [], fill: readonly PathCommand[] = [], target: readonly PathCommand[] = [];
  const targetOutside = spec.target !== undefined && (spec.target.value < spec.domain[0] || spec.target.value > spec.domain[1]);
  if (!tooSmall) {
    const background = sectorPath(frame, start, start + span); if (background.status === 'invalid') return background; track = background.value;
    if (visualT !== null && visualT > 0) { const foreground = sectorPath(frame, start, start + span * visualT); if (foreground.status === 'invalid') return foreground; fill = foreground.value; }
    const bandFrame = { ...frame, radius: radius * 1.1, innerRadius: radius * 1.035 };
    for (const band of spec.bands ?? []) { const from = scale.value.map(band.from), to = scale.value.map(band.to); if (from === null || to === null) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GAUGE_BAND', 'bands'); const path = sectorPath(bandFrame, start + from * span, start + to * span); if (path.status === 'invalid') return path; bands.push({ id: band.id, color: band.color, commands: path.value }); }
    if (spec.target && !targetOutside) { const fraction = scale.value.map(spec.target.value); if (fraction === null) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GAUGE_TARGET', 'target'); const angle = start + span * fraction; target = [{ type: 'M', ...polar(frame, radius * .72, angle) }, { type: 'L', ...polar(frame, radius * 1.13, angle) }]; }
  }
  const readingBaseline = ring ? frame.cy : frame.cy - radius * .24, readingFontSize = spec.value === null ? fontSize : Math.max(fontSize, Math.min(fontSize * 2.5, radius * .25)), readingWidth = Math.max(0, Math.min(radius * 1.3, plot.width - 16));
  const readingBox = Object.freeze({ x: frame.cx - readingWidth / 2, y: readingBaseline - readingFontSize * 1.25, width: readingWidth, height: readingFontSize * 1.6 });
  return ok(Object.freeze({ plot, frame, track, fill, bands: Object.freeze(bands.map(band => Object.freeze(band))), target, targetOutside, visualT, state, anchor: Object.freeze({ x: frame.cx, y: readingBaseline - readingFontSize * .3 }), readingBox, readingBaseline, readingFontSize, tooSmall, start, span }));
}
