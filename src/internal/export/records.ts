import type { ExportRecords } from '../../public/export-types.js';
import type { SeriesPointId } from '../../public/interaction-types.js';
import { datumKey } from '../interaction/selection.js';
/** Raw Cartesian records. Never export opaque consumer `datum` payloads. */
export function cartesianRecords(spec: Readonly<{ series: readonly Readonly<{ id: string; name: string; data: readonly Readonly<{ id: string; x: number | string; y: number | null }>[] }>[]; axes: Readonly<{ x: Readonly<{ kind: string; values?: readonly Readonly<{ id: string; label?: string }>[] }> }> }>, hiddenIds: readonly string[], selection?: readonly SeriesPointId[]): ExportRecords {
  const labels = new Map(spec.axes.x.values?.map(value => [value.id, value.label ?? value.id]) ?? []), hidden = new Set(hiddenIds);
  const selected = selection ? new Set(selection.map(datumKey)) : null;
  return { columns: ['Series ID', 'Series', 'Point ID', 'X', 'Category label', 'Y', 'Visible', ...(selected ? ['Selected'] : [])], rows: spec.series.flatMap(series => series.data.map(point => [series.id, series.name, point.id, point.x, typeof point.x === 'string' ? labels.get(point.x) ?? null : null, point.y, hidden.has(series.id) ? 'false' : 'true', ...(selected ? [String(selected.has(datumKey({ seriesId: series.id, pointId: point.id })))] : [])])) };
}
