import type { Dash } from '../chart/presentation.js';
export type TooltipSeries = Readonly<{ id: string; name: string; color: string; dash: Dash; byX: ReadonlyMap<string | number, Readonly<{ y: number | null }>> }>;
export type TooltipRow = Readonly<{ seriesId: string; name: string; value: number | null; availability: 'value' | 'null' | 'absent'; color: string; dash: Dash }>;
export type TooltipModel = Readonly<{ revision: number; seriesId: string; pointId: string; x: string | number; header: string; displayHeader: string; rows: readonly TooltipRow[]; context?: string }>;
export function duplicateCategoryLabels(labels: ReadonlyMap<string, string>): ReadonlySet<string> {
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const label of labels.values()) { if (seen.has(label)) duplicates.add(label); else seen.add(label); }
  return duplicates;
}
export function fullX(x: string | number, kind: 'category' | 'linear' | 'time', labels: ReadonlyMap<string, string>): string {
  if (typeof x === 'string') { const label = labels.get(x) ?? x; return label === x ? x : `${label} (${x})`; }
  return kind === 'time' ? new Date(x).toISOString() : String(x === 0 ? 0 : x);
}
export function tooltipModel(revision: number, seriesId: string, pointId: string, x: string | number, kind: 'category' | 'linear' | 'time', mode: 'point' | 'shared', series: readonly TooltipSeries[], labels: ReadonlyMap<string, string>, duplicateLabels: ReadonlySet<string> = duplicateCategoryLabels(labels)): TooltipModel {
  const rows: TooltipRow[] = [];
  for (const s of series) {
    if (mode === 'point' && s.id !== seriesId) continue;
    const sample = s.byX.get(x);
    rows.push(Object.freeze({ seriesId: s.id, name: s.name, value: sample?.y ?? null, availability: !sample ? 'absent' : sample.y === null ? 'null' : 'value', color: s.color, dash: s.dash }));
  }
  const header = fullX(x, kind, labels), label = typeof x === 'string' ? labels.get(x) ?? x : null;
  return Object.freeze({ revision, seriesId, pointId, x, header, displayHeader: label !== null && !duplicateLabels.has(label) ? label : header, rows: Object.freeze(rows) });
}
export function rowText(row: TooltipRow): string { return `${row.name}: ${row.availability === 'absent' ? 'No sample' : row.availability === 'null' ? 'Missing observation' : String(row.value)}`; }
export function detailText(model: TooltipModel, context: string): string { return [model.header, ...model.rows.map(rowText), model.context, context].filter(Boolean).join('. '); }
