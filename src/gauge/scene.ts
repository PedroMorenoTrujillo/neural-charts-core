import type { GaugeChartSpec } from '../public/gauge-types.js';
import type { GaugeProjection } from './geometry.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import type { Layers } from '../internal/axes/scene.js';
import type { TextMeasurer } from '../internal/layout/text.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { ellipsis } from '../internal/layout/text.js';
import { gaugeValue } from './describe.js';
import { NUMERIC_AXIS_CLASS } from '../internal/chart/data-label-direction.js';
export function gaugeScene(spec: GaugeChartSpec, projection: GaugeProjection, palette: Palette, font: ResolvedFont, layers: Layers, measurer: TextMeasurer): void {
  if (projection.tooSmall) return;
  const { frame } = projection, direction = spec.direction ?? 'ltr';
  const path = (key: string, commands: readonly PathCommand[], fill: string) => { if (commands.length) layers.marks.push({ kind: 'path', key, commands, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: fill } } }); };
  path('gauge-track', projection.track, palette.grid);
  for (const band of projection.bands) path('gauge-band:' + band.id, band.commands, band.color);
  path('gauge-value', projection.fill, spec.color ?? palette.series[0]!);
  if (projection.target.length) layers.marks.push({ kind: 'path', key: 'gauge-target', commands: projection.target, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.text }, strokeWidth: 2, dash: [3, 2] } });
  const centerY = projection.readingBaseline;
  const valueFont = { ...font, size: projection.readingFontSize, weight: 600 as const };
  const label = (key: string, value: string, x: number, y: number, width: number, chosenFont: ResolvedFont = font, ink = palette.muted) => {
    if (width < 12) return; const text = ellipsis(value, width, value => measurer.measure(value, chosenFont, direction)); if (!text) return;
    const numeric = key === 'gauge-value-label' || key === 'gauge-minimum' || key === 'gauge-maximum' || key === 'gauge-target-label';
    layers.labels.push({ kind: 'text', key, classes: ['nc-owned-gauge-label', ...(numeric ? [NUMERIC_AXIS_CLASS] : [])], clipKey: 'plot', text, x, y, anchor: 'middle', baseline: 'alphabetic', fontFamily: chosenFont.family, fontSize: chosenFont.size, fontWeight: chosenFont.weight, presentation: { fill: { kind: 'solid', value: ink } } });
  };
  const centerWidth = projection.readingBox.width;
  label('gauge-value-label', gaugeValue(spec), frame.cx, centerY, centerWidth, valueFont, palette.text);
  if (projection.state !== 'within') label('gauge-range-state', projection.state === 'missing' ? 'Value not supplied' : projection.state === 'under' ? 'Below domain' : 'Above domain', frame.cx, centerY + font.size * 1.8, centerWidth);
  const limitY = spec.preset === 'ring' ? frame.cy + frame.radius + font.size * 1.7 : frame.cy + font.size * 1.6;
  const halfWidth = Math.min(projection.plot.width / 2 - 12, frame.radius * .9);
  label('gauge-minimum', 'Min ' + spec.domain[0], frame.cx - frame.radius * .6, limitY, halfWidth);
  label('gauge-maximum', 'Max ' + spec.domain[1], frame.cx + frame.radius * .6, limitY, halfWidth);
  if (spec.target) label('gauge-target-label', (spec.target.label ?? 'Target') + ': ' + spec.target.value + (spec.unit ? ' ' + spec.unit : '') + (projection.targetOutside ? ' (outside domain)' : ''), frame.cx, limitY + font.size * 1.7, projection.plot.width - 24);
}
