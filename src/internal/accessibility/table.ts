import type { Shell } from '../chart/shell.js';
import { fullX } from '../tooltip/model.js';
import { datumKey } from '../interaction/selection.js';
import { createDataTableFrame, type DataTableAdapter, type DataTableView, type TableRow } from './table-frame.js';
export type TableSource = Readonly<{ title: string; kind: 'category' | 'linear' | 'time'; labels: ReadonlyMap<string, string>; series: readonly Readonly<{ id: string; name: string; data: readonly Readonly<{ id: string; x: string | number; y: number | null }>[] }>[]; hidden: ReadonlySet<string>; context: string; references: readonly string[] }>;
export type TableView = DataTableView<TableSource>;
const cartesianTable: DataTableAdapter<TableSource> = {
  columns: ['Series', 'X', 'Y', 'Visibility'], notice: 'Cropped observations are retained.',
  selectionKey: id => id.seriesId === undefined ? null : datumKey(id),
  size: source => source.series.reduce((total, series) => total + series.data.length, 0),
  rows(source, first, count) {
    let skipped = first, remaining = count; const rows: TableRow[] = [];
    for (const series of source.series) {
      if (skipped >= series.data.length) { skipped -= series.data.length; continue; }
      for (let i = skipped; i < series.data.length && remaining; i++, remaining--) {
        const point = series.data[i]!;
        rows.push({ key: datumKey({ seriesId: series.id, pointId: point.id }), cells: [series.name, fullX(point.x, source.kind, source.labels), point.y === null ? 'Missing observation' : String(point.y === 0 ? 0 : point.y), source.hidden.has(series.id) ? 'Series hidden' : 'Series visible'] });
      }
      skipped = 0; if (!remaining) break;
    }
    return rows;
  },
};
export function createTableView(shell: Shell, onOpen: () => void): TableView { return createDataTableFrame(shell, onOpen, cartesianTable); }
