import type { ChartTheme } from '../../public/chart-types.js';

export type Dash = 'solid' | 'dashed' | 'dotted';
export type ResolvedFont = Readonly<{ family: 'sans-serif' | 'serif' | 'monospace'; size: number; weight: 400 | 500 | 600 | 700 }>;
export type Palette = Readonly<{ surface: string; text: string; muted: string; grid: string; axis: string; focus: string; tooltipSurface: string; tooltipText: string; reference: string; series: readonly string[] }>;
const light: Palette = Object.freeze({ surface: '#ffffff', text: '#17243a', muted: '#526078', grid: '#e6eaf0', axis: '#8490a1', focus: '#174da0', tooltipSurface: '#ffffff', tooltipText: '#17243a', reference: '#626e81', series: Object.freeze(['#255eb8', '#9a3b72', '#26715b', '#925a1e', '#6547a5', '#00747c', '#a23c32', '#5c6573']) });
const dark: Palette = Object.freeze({ surface: '#111927', text: '#edf2fa', muted: '#a9b8ce', grid: '#2b3748', axis: '#7f91a9', focus: '#b6d5ff', tooltipSurface: '#1c2839', tooltipText: '#edf2fa', reference: '#a9b8ce', series: Object.freeze(['#82b4ff', '#ee95c5', '#76ceb0', '#ebbc75', '#b9a2ef', '#70d2d9', '#ef9b90', '#bdc7d3']) });
export function assignment(id: string): Readonly<{ colorIndex: number; dash: Dash }> {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return Object.freeze({ colorIndex: hash % 8, dash: (['solid', 'dashed', 'dotted'] as const)[Math.floor(hash / 8) % 3]! });
}
export function dashPattern(dash: Dash): readonly number[] { return dash === 'solid' ? [] : dash === 'dashed' ? [6, 4] : [1, 4]; }
// Pre-freeze presentation policy: distinct colors use solid strokes; color
// collisions retain deterministic non-color differentiation. Explicit wins.
export function resolveDashes(series: readonly Readonly<{ spec: Readonly<{ id: string; color?: string; dash?: Dash }>; colorIndex: number }>[], hidden: ReadonlySet<string>, palette: Palette): ReadonlyMap<string, Dash> {
  const result = new Map<string, Dash>(), groups = new Map<string, typeof series[number][]>(), styles: readonly Dash[] = ['solid', 'dashed', 'dotted'];
  for (const s of series) {
    result.set(s.spec.id, s.spec.dash ?? 'solid'); if (hidden.has(s.spec.id)) continue;
    const hex = (s.spec.color ?? palette.series[s.colorIndex]!).slice(1).toLowerCase(), color = (hex.length <= 4 ? [...hex].map(c => c + c).join('') : hex).padEnd(8, 'f');
    const group = groups.get(color) ?? []; group.push(s); groups.set(color, group);
  }
  for (const group of groups.values()) if (group.length > 1) {
    const free = styles.filter(d => !group.some(s => s.spec.dash === d)), choices = free.length ? free : styles;
    group.filter(s => !s.spec.dash).sort((a, b) => a.spec.id < b.spec.id ? -1 : a.spec.id > b.spec.id ? 1 : 0).forEach((s, i) => result.set(s.spec.id, choices[i % choices.length]!));
  }
  return result;
}
export function defaultPalette(theme: ChartTheme, prefersDark: boolean): Palette { return theme === 'dark' || theme === 'auto' && prefersDark ? dark : light; }
