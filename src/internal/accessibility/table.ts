import type { Shell } from '../chart/shell.js';
import { fullX } from '../tooltip/model.js';
import { subscriptions } from '../chart/cleanup.js';
export type TableSource = Readonly<{ title: string; kind: 'category' | 'linear' | 'time'; labels: ReadonlyMap<string, string>; series: readonly Readonly<{ id: string; name: string; data: readonly Readonly<{ x: string | number; y: number | null }>[] }>[]; hidden: ReadonlySet<string>; context: string; references: readonly string[] }>;
export interface TableView { update(source: TableSource, available: boolean): void; open(): void; close(returnFocus?: boolean): void; isOpen(): boolean; destroy(): void; }
export function createTableView(shell: Shell, onOpen: () => void): TableView {
  let owned: Shell | null = shell, source: TableSource | null = null, available = false, opened = false, page = 0, callback: (() => void) | null = onOpen;
  let heading: HTMLHeadingElement | null = null;
  const render = (pageAction: string | null = null): void => {
    if (!owned || !source || !opened) return;
    const document = owned.root.ownerDocument, total = source.series.reduce((n, s) => n + s.data.length, 0), pages = Math.max(1, Math.ceil(total / 100)); page = Math.min(page, pages - 1);
    const pane = owned.table, title = document.createElement('h2'), controls = document.createElement('div'), close = document.createElement('button'), previous = document.createElement('button'), next = document.createElement('button'), announcement = document.createElement('div'), table = document.createElement('table'), caption = document.createElement('caption'), thead = document.createElement('thead'), headRow = document.createElement('tr'), tbody = document.createElement('tbody');
    title.textContent = source.title + ' — data'; title.tabIndex = -1; title.style.margin = '0 0 8px'; title.style.fontSize = '1.17em'; heading = title;
    close.type = previous.type = next.type = 'button'; close.textContent = 'Close data table'; previous.textContent = 'Previous page'; next.textContent = 'Next page'; close.dataset.ncTableAction = 'close'; previous.dataset.ncTableAction = 'previous'; next.dataset.ncTableAction = 'next'; previous.disabled = page === 0; next.disabled = page === pages - 1;
    controls.append(close, previous, next); announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); announcement.textContent = `Page ${page + 1} of ${pages}. ${total ? page * 100 + 1 : 0}–${Math.min(total, (page + 1) * 100)} of ${total} provided observations.`;
    caption.textContent = `${source.context} Cropped observations are retained. ${announcement.textContent}`;
    for (const name of ['Series', 'X', 'Y', 'Visibility']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = name; th.style.textAlign = 'start'; headRow.append(th); }
    thead.append(headRow); table.append(caption, thead, tbody); table.style.width = '100%'; table.style.borderCollapse = 'collapse';
    let skipped = page * 100, remaining = 100;
    for (const series of source.series) {
      if (skipped >= series.data.length) { skipped -= series.data.length; continue; }
      for (let i = skipped; i < series.data.length && remaining; i++, remaining--) {
        const point = series.data[i]!, row = document.createElement('tr');
        for (const value of [series.name, fullX(point.x, source.kind, source.labels), point.y === null ? 'Missing observation' : String(point.y === 0 ? 0 : point.y), source.hidden.has(series.id) ? 'Series hidden' : 'Series visible']) { const cell = document.createElement('td'); cell.textContent = value; cell.style.overflowWrap = 'anywhere'; cell.style.padding = '4px'; row.append(cell); }
        tbody.append(row);
      }
      skipped = 0; if (!remaining) break;
    }
    const references = document.createElement('ul'); for (const value of source.references) { const li = document.createElement('li'); li.textContent = value; references.append(li); }
    const focused = document.activeElement as HTMLElement | null, action = pageAction ?? focused?.dataset.ncTableAction, hadFocus = !!pageAction || pane.contains(focused);
    pane.replaceChildren(title, controls, announcement, table, references);
    if (action && hadFocus) {
      const button = action === 'previous' ? previous : action === 'next' ? next : close;
      if (!button.disabled) button.focus({ preventScroll: true }); else heading.focus({ preventScroll: true });
    } else if (hadFocus) heading.focus({ preventScroll: true });
  };
  const close = (returnFocus = true): void => {
    if (!owned || !opened) return;
    if (returnFocus) owned.tableToggle.focus({ preventScroll: true });
    opened = false; page = 0; owned.table.hidden = true; owned.table.replaceChildren(); heading = null;
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
  const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
  const listeners = subscriptions();
  try { listeners.add(shell.tableToggle, 'click', toggle); listeners.add(shell.table, 'click', click); listeners.add(shell.table, 'keydown', key as EventListener); }
  catch (error) { owned = null; callback = null; throw error; }
  return {
    update(next, enabled) { source = next; available = enabled; if (!owned) return; if (!enabled) close(false); owned.tableToggle.hidden = !enabled; if (opened) render(); },
    open, close, isOpen: () => opened,
    destroy() { owned = null; source = null; callback = null; heading = null; opened = false; listeners.clear(); },
  };
}
