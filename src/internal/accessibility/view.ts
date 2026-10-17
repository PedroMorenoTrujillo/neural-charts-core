import type { Shell } from '../chart/shell.js';
import { box, hiddenText } from '../chart/shell.js';
import type { Plot } from '../layout/frame.js';
import type { SemanticModel } from './model.js';
export interface SemanticView { update(model: SemanticModel, plot: Plot, actualNavigation: boolean): void; destroy(): void; }
export function createSemanticView(shell: Shell): SemanticView {
  let owned: Shell | null = shell, row: HTMLDivElement | null = null, cell: HTMLDivElement | null = null, alternate = false;
  return {
    update(model, plot, actualNavigation) {
      if (!owned) return; const grid = owned.grid; box(grid, plot);
      if (model.multiselectable === undefined) grid.removeAttribute('aria-multiselectable'); else grid.setAttribute('aria-multiselectable', String(model.multiselectable));
      if (!model.current || !model.columnCount) {
        grid.removeAttribute('aria-multiselectable');
        grid.setAttribute('role', 'group'); grid.removeAttribute('aria-readonly'); grid.removeAttribute('aria-rowcount'); grid.removeAttribute('aria-colcount'); grid.removeAttribute('aria-activedescendant'); grid.setAttribute('aria-label', model.summary); grid.replaceChildren(); row = null; cell = null; owned.semanticDetail.textContent = model.summary; return;
      }
      grid.setAttribute('role', 'grid'); grid.setAttribute('aria-readonly', 'true'); grid.setAttribute('aria-rowcount', String(model.rowCount)); grid.setAttribute('aria-colcount', String(model.columnCount)); grid.setAttribute('aria-label', 'Chart data');
      if (!row) { row = grid.ownerDocument.createElement('div'); row.setAttribute('role', 'row'); hiddenText(row); grid.append(row); }
      row.setAttribute('aria-rowindex', String(model.current.row)); row.setAttribute('aria-label', model.current.seriesName);
      if (!cell || actualNavigation) {
        alternate = !alternate; const next = grid.ownerDocument.createElement('div'); next.id = alternate ? owned.ids.cellA : owned.ids.cellB; next.setAttribute('role', 'gridcell'); row.append(next); const previous = cell; cell = next; cell.textContent = model.current.text; cell.setAttribute('aria-colindex', String(model.current.column)); grid.setAttribute('aria-activedescendant', cell.id); previous?.remove();
      } else { cell.textContent = model.current.text; cell.setAttribute('aria-colindex', String(model.current.column)); }
      if (model.current.selected === undefined) cell.removeAttribute('aria-selected'); else cell.setAttribute('aria-selected', String(model.current.selected));
      owned.semanticDetail.textContent = model.current.detail;
    },
    destroy() { owned = null; row = null; cell = null; },
  };
}
