import type { ChartTheme } from '../../public/chart-types.js';

export type Dash = 'solid' | 'dashed' | 'dotted';
export type ResolvedFont = Readonly<{ family: 'sans-serif' | 'serif' | 'monospace'; size: number; weight: 400 | 500 | 600 | 700 }>;
export type Palette = Readonly<{ surface: string; text: string; muted: string; grid: string; axis: string; focus: string; tooltipSurface: string; tooltipText: string; reference: string; series: readonly string[] }>;
const light: Palette = Object.freeze({ surface: '#ffffff', text: '#17243a', muted: '#526078', grid: '#dde2eb', axis: '#697586', focus: '#174da0', tooltipSurface: '#17243a', tooltipText: '#ffffff', reference: '#685934', series: Object.freeze(['#255eb8', '#9a3b72', '#26715b', '#925a1e', '#6547a5', '#00747c', '#a23c32', '#5c6573']) });
const dark: Palette = Object.freeze({ surface: '#111927', text: '#edf2fa', muted: '#b6c2d5', grid: '#394353', axis: '#a5b1c4', focus: '#b6d5ff', tooltipSurface: '#edf2fa', tooltipText: '#17243a', reference: '#d9c28b', series: Object.freeze(['#82b4ff', '#ee95c5', '#76ceb0', '#ebbc75', '#b9a2ef', '#70d2d9', '#ef9b90', '#bdc7d3']) });
export function assignment(id: string): Readonly<{ colorIndex: number; dash: Dash }> {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return Object.freeze({ colorIndex: hash % 8, dash: (['solid', 'dashed', 'dotted'] as const)[Math.floor(hash / 8) % 3]! });
}
export function dashPattern(dash: Dash): readonly number[] { return dash === 'solid' ? [] : dash === 'dashed' ? [6, 4] : [1, 4]; }
export function defaultPalette(theme: ChartTheme, prefersDark: boolean): Palette { return theme === 'dark' || theme === 'auto' && prefersDark ? dark : light; }
export function resolvePalette(host: HTMLElement, theme: ChartTheme, prefersDark: boolean): Palette {
  const base = defaultPalette(theme, prefersDark), style = host.ownerDocument.defaultView?.getComputedStyle(host);
  const read = (name: string, fallback: string): string => { const v = style?.getPropertyValue(name).trim(); return v && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(v) ? v.toLowerCase() : fallback; };
  return Object.freeze({ surface: read('--nc-surface', base.surface), text: read('--nc-text', base.text), muted: read('--nc-muted', base.muted), grid: read('--nc-grid', base.grid), axis: read('--nc-axis', base.axis), focus: read('--nc-focus', base.focus), tooltipSurface: read('--nc-tooltip-surface', base.tooltipSurface), tooltipText: read('--nc-tooltip-text', base.tooltipText), reference: read('--nc-reference', base.reference), series: Object.freeze(base.series.map((v, i) => read(`--nc-series-${i}`, v))) });
}
