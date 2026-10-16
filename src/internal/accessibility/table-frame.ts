import type { Shell } from '../chart/shell.js';
import { subscriptions } from '../chart/cleanup.js';
import type { ChartDatumId } from '../../public/chart-types.js';
export type TableMetadata = Readonly<{ title: string; context: string; references: readonly string[] }>;
export type TableRow = Readonly<{ key: string; cells: readonly string[] }>;
export type DataTableAdapter<S> = Readonly<{ columns: readonly string[]; notice: string; rowHeaders?: boolean; selectionKey(id: ChartDatumId): string | null; size(source: S): number; rows(source: S, first: number, count: number): readonly TableRow[] }>;
export interface DataTableView<S> { update(source: S, available: boolean, selected?: readonly ChartDatumId[] | null): void; updateSelection(selected: readonly ChartDatumId[] | null): void; open(): void; close(returnFocus?: boolean): void; isOpen(): boolean; destroy(): void; }
export function createDataTableFrame<S extends TableMetadata>(shell: Shell, onOpen: () => void, adapter: DataTableAdapter<S>): DataTableView<S> {
  let owned: Shell | null = shell, source: S | null = null, available = false, opened = false, page = 0, callback: (() => void) | null = onOpen;
  let heading: HTMLHeadingElement | null = null;
  // Derived presentation only; the controller remains the selection owner.
  let selected: ReadonlySet<string> | null = null;
  const selectionCells = new Map<string, HTMLTableCellElement>();
  const selectionKeys = (ids: readonly ChartDatumId[] | null): ReadonlySet<string> | null => ids === null ? null : new Set(ids.map(id => adapter.selectionKey(id)).filter((key): key is string => key !== null));
  const render = (pageAction: string | null = null): void => {
    if (!owned || !source || !opened) return;
    selectionCells.clear();
    const document = owned.root.ownerDocument, total = adapter.size(source), pages = Math.max(1, Math.ceil(total / 100)); page = Math.min(page, pages - 1);
    const pane = owned.table, title = document.createElement('h2'), controls = document.createElement('div'), close = document.createElement('button'), previous = document.createElement('button'), next = document.createElement('button'), announcement = document.createElement('div'), table = document.createElement('table'), caption = document.createElement('caption'), thead = document.createElement('thead'), headRow = document.createElement('tr'), tbody = document.createElement('tbody');
    title.textContent = source.title + ' — data'; title.tabIndex = -1; title.style.margin = '0 0 8px'; title.style.fontSize = '1.17em'; heading = title;
    close.type = previous.type = next.type = 'button'; close.textContent = 'Close data table'; previous.textContent = 'Previous page'; next.textContent = 'Next page'; close.dataset.ncTableAction = 'close'; previous.dataset.ncTableAction = 'previous'; next.dataset.ncTableAction = 'next'; previous.disabled = page === 0; next.disabled = page === pages - 1;
    controls.append(close, previous, next); announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); announcement.textContent = `Page ${page + 1} of ${pages}. ${total ? page * 100 + 1 : 0}–${Math.min(total, (page + 1) * 100)} of ${total} provided observations.`;
    caption.textContent = `${source.context} ${adapter.notice} ${announcement.textContent}`;
    for (const name of [...adapter.columns, ...(selected ? ['Selected'] : [])]) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = name; th.style.textAlign = 'start'; if (selected) th.style.minWidth = headRow.children.length ? '4em' : '6em'; headRow.append(th); }
    thead.append(headRow); table.append(caption, thead, tbody); table.style.width = '100%'; table.style.borderCollapse = 'collapse'; table.style.font = 'inherit'; table.style.color = 'inherit';
    let context: HTMLParagraphElement | null = null;
    if (selected) {
      // Keep numeric/identity columns readable; the existing owned pane supplies
      // bounded horizontal scrolling rather than compressing every word.
      table.style.minWidth = '28em'; caption.textContent = 'Original observations'; caption.style.textAlign = 'start';
      context = document.createElement('p'); context.id = owned.ids.table + '-context'; context.textContent = source.context + ' ' + adapter.notice; context.style.margin = '8px 0'; context.style.lineHeight = '1.4'; table.setAttribute('aria-describedby', context.id);
      title.id = owned.ids.table + '-heading'; pane.tabIndex = 0; pane.setAttribute('role', 'region'); pane.setAttribute('aria-labelledby', title.id);
    } else { pane.removeAttribute('tabindex'); pane.removeAttribute('role'); pane.removeAttribute('aria-labelledby'); }
    for (const record of adapter.rows(source, page * 100, 100)) {
      const values = record.cells;
      const row = document.createElement('tr');
      for (let index = 0; index < values.length; index++) {
        const rowHeader = adapter.rowHeaders && index === 0, cell = rowHeader ? document.createElement('th') : document.createElement('td');
        if (rowHeader) { cell.scope = 'row'; cell.style.fontWeight = 'inherit'; cell.style.textAlign = 'start'; }
        cell.textContent = values[index]!; cell.style.overflowWrap = 'anywhere'; cell.style.padding = '4px'; row.append(cell);
        if (selected) cell.style.minWidth = index ? '4em' : '6em';
      }
      if (selected) { const cell = document.createElement('td'); cell.textContent = String(selected.has(record.key)); cell.style.padding = '4px'; cell.style.minWidth = '4em'; row.append(cell); selectionCells.set(record.key, cell); }
      tbody.append(row);
    }
    const references = document.createElement('ul'); for (const value of source.references) { const li = document.createElement('li'); li.textContent = value; references.append(li); }
    const focused = document.activeElement as HTMLElement | null, action = pageAction ?? focused?.dataset.ncTableAction, hadFocus = !!pageAction || pane.contains(focused);
    pane.replaceChildren(title, controls, announcement, ...(context ? [context] : []), table, references);
    if (selected && pane.scrollWidth > pane.clientWidth) announcement.textContent += ' Scroll horizontally to view all columns.';
    if (action && hadFocus) {
      const button = action === 'previous' ? previous : action === 'next' ? next : close;
      if (!button.disabled) button.focus({ preventScroll: true }); else heading.focus({ preventScroll: true });
    } else if (hadFocus) heading.focus({ preventScroll: true });
  };
  const close = (returnFocus = true): void => {
    if (!owned || !opened) return;
    if (returnFocus) owned.tableToggle.focus({ preventScroll: true });
    opened = false; page = 0; owned.table.hidden = true; owned.table.replaceChildren(); heading = null; selectionCells.clear();
    owned.base.style.visibility = ''; owned.overlay.style.visibility = ''; owned.grid.hidden = false; owned.grid.tabIndex = 0; owned.tableToggle.setAttribute('aria-expanded', 'false');
  };
  const open = (): void => {
    if (!owned || !available || opened) return; callback?.(); opened = true; page = 0; owned.table.hidden = false; owned.base.style.visibility = 'hidden'; owned.overlay.style.visibility = 'hidden'; owned.grid.hidden = true; owned.grid.tabIndex = -1; owned.tableToggle.setAttribute('aria-expanded', 'true'); render(); heading?.focus({ preventScroll: true });
  };
  const toggle = (): void => { if (opened) close(); else open(); };
  const click = (event: Event): void => {
    const element = (event.target as HTMLElement | null)?.closest('button'), action = element?.dataset.ncTableAction;
    if (!owned?.table.contains(element ?? null) || element?.disabled) return;
    if (action === 'close') close(); else if (action === 'previous' || action === 'next') { page += action === 'next' ? 1 : -1; render(action); }
  };
  const key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (owned && selected && event.target === owned.table && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && owned.table.scrollWidth > owned.table.clientWidth) {
      const before = owned.table.scrollLeft;
      owned.table.scrollLeft += (event.key === 'ArrowLeft' ? -1 : 1) * Math.max(32, owned.table.clientWidth / 2);
      if (owned.table.scrollLeft !== before) event.preventDefault();
    }
  };
  const listeners = subscriptions();
  try { listeners.add(shell.tableToggle, 'click', toggle); listeners.add(shell.table, 'click', click); listeners.add(shell.table, 'keydown', key as EventListener); }
  catch (error) { owned = null; callback = null; throw error; }
  return {
    update(next, enabled, ids = null) { if (!owned) return; source = next; selected = selectionKeys(ids); available = enabled; if (!enabled) close(false); owned.tableToggle.hidden = !enabled; if (opened) render(); },
    updateSelection(ids) { if (!owned) return; const next = selectionKeys(ids), changedColumns = (selected === null) !== (next === null); selected = next; if (changedColumns) render(); else for (const [key, cell] of selectionCells) { const value = String(selected?.has(key) ?? false); if (cell.textContent !== value) cell.textContent = value; } },
    open, close, isOpen: () => opened,
    destroy() { owned = null; source = null; callback = null; heading = null; selected = null; selectionCells.clear(); opened = false; listeners.clear(); },
  };
}
