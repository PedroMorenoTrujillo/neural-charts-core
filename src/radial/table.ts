import type { RadialDescription } from '../public/radial-types.js';
import type { Shell } from '../internal/chart/shell.js';
import { createDataTableFrame, type DataTableAdapter, type DataTableView } from '../internal/accessibility/table-frame.js';
type RadialTableSource = RadialDescription & Readonly<{ references: readonly string[] }>;
const radialTable: DataTableAdapter<RadialTableSource> = {
  columns: ['Slice', 'Value', 'Visible share', 'Visibility'], notice: 'All provided slices are retained.', rowHeaders: true,
  size: source => source.table.rows.length,
  rows: (source, first, count) => source.table.rows.slice(first, first + count).map(row => row.cells),
};
export function createRadialTable(shell: Shell, onOpen: () => void): DataTableView<RadialTableSource> { return createDataTableFrame(shell, onOpen, radialTable); }
