import type { ChartDatumId, ChartSelectionBinding } from '../../public/interaction-types.js';
import type { ChartDataTable, ChartResult } from '../../public/chart-types.js';
import { ok } from '../diagnostics.js';
import { prepareSelection, datumKey } from './selection.js';
/** SSR uses the applied controlled value or the first internal value. Browser
 * controllers announce their live private owner through the semantic view. */
export function selectionDescription<D extends Readonly<{ context: string; table: ChartDataTable }>, Id extends ChartDatumId>(description: D, binding: ChartSelectionBinding<Id> | undefined, known: ReadonlyMap<string, Id>, rowId: (index: number) => Id): ChartResult<D> {
  const parsed = prepareSelection(binding, known); if (parsed.status === 'invalid') return parsed;
  if (!parsed.value) return ok(description);
  const selected = new Set(parsed.value.value.map(datumKey));
  return ok(Object.freeze({ ...description, context: description.context + ' Selection: ' + selected.size + ' observations.', table: Object.freeze({ columns: Object.freeze([...description.table.columns, 'Selected']), rows: Object.freeze(description.table.rows.map((row, index) => Object.freeze({ ...row, cells: Object.freeze([...row.cells, selected.has(datumKey(rowId(index))) ? 'Selected' : 'Not selected']) }))) }) }));
}
