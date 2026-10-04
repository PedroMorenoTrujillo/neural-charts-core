import type { ChartState } from '../../public/chart-types.js';
export function orderedState(state: ChartState, ids: readonly string[]): ChartState {
  const hidden = new Set(state.hiddenSeriesIds); return Object.freeze({ hiddenSeriesIds: Object.freeze(ids.filter(id => hidden.has(id))) });
}
export function toggleState(state: ChartState, id: string, ids: readonly string[]): ChartState {
  const hidden = new Set(state.hiddenSeriesIds); if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
  return orderedState({ hiddenSeriesIds: [...hidden] }, ids);
}
export function membershipChanged(a: ChartState, b: ChartState): boolean { const ids = new Set(a.hiddenSeriesIds); return ids.size !== b.hiddenSeriesIds.length || b.hiddenSeriesIds.some(id => !ids.has(id)); }
export function derivedView(status: 'ready' | 'loading' | 'empty' | 'error', totalNonnull: number, visibleNonnull: number, seriesCount: number, hiddenCount: number): 'ready' | 'loading' | 'empty' | 'error' | 'no-visible-series' {
  if (status !== 'ready') return status;
  if (!seriesCount || !totalNonnull) return 'empty';
  if (hiddenCount === seriesCount) return 'no-visible-series';
  return visibleNonnull ? 'ready' : 'empty';
}
