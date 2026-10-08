import type { Palette, ResolvedFont } from './presentation.js';
import type { ShellFrame, Plot } from '../layout/frame.js';
import { removeOwnedNode } from './cleanup.js';

export type Shell = Readonly<{ root: HTMLDivElement; header: HTMLDivElement; title: HTMLDivElement; description: HTMLDivElement; tableToggle: HTMLButtonElement; body: HTMLDivElement; base: HTMLDivElement; overlay: HTMLDivElement; grid: HTMLDivElement; help: HTMLDivElement; semanticDetail: HTMLDivElement; status: HTMLDivElement; legend: HTMLDivElement; detail: HTMLDivElement; table: HTMLDivElement; style: HTMLStyleElement; ids: Readonly<Record<'title' | 'description' | 'help' | 'grid' | 'cellA' | 'cellB' | 'detail' | 'status' | 'table', string>> }>;
export function shellIds(prefix: string): Shell['ids'] { const id = `nc-${prefix}-`; return { title: id + 'title', description: id + 'description', help: id + 'help', grid: id + 'grid', cellA: id + 'cell-a', cellB: id + 'cell-b', detail: id + 'detail', status: id + 'status', table: id + 'table' }; }
export function hiddenText(element: HTMLElement): void { Object.assign(element.style, { position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '-1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: '0' }); }
export function box(element: HTMLElement, rect: Plot): void { Object.assign(element.style, { position: 'absolute', left: `${rect.x}px`, top: `${rect.y}px`, width: `${Math.max(0, rect.width)}px`, height: `${Math.max(0, rect.height)}px`, boxSizing: 'border-box' }); }
export function createShell(host: HTMLElement, prefix: string): Shell {
  const doc = host.ownerDocument, ids = shellIds(prefix), div = () => doc.createElement('div'), root = div(), header = div(), title = div(), description = div(), body = div(), base = div(), overlay = div(), grid = div(), help = div(), semanticDetail = div(), status = div(), legend = div(), detail = div(), table = div(), tableToggle = doc.createElement('button'), style = doc.createElement('style');
  root.dataset.ncRoot = prefix; root.setAttribute('role', 'region'); root.tabIndex = -1; root.setAttribute('aria-labelledby', ids.title); root.setAttribute('aria-describedby', `${ids.description} ${ids.help}`);
  Object.assign(root.style, { position: 'relative', minWidth: '0', overflow: 'hidden', boxSizing: 'border-box', textAlign: 'start', isolation: 'isolate' });
  title.id = ids.title; description.id = ids.description; help.id = ids.help; grid.id = ids.grid; semanticDetail.id = ids.detail; status.id = ids.status; table.id = ids.table;
  grid.tabIndex = 0; grid.dataset.ncGrid = ''; grid.setAttribute('aria-describedby', `${ids.help} ${ids.detail}`); grid.setAttribute('aria-label', 'Chart data');
  grid.style.background = 'transparent'; grid.style.outlineOffset = '-2px'; hiddenText(help); hiddenText(semanticDetail);
  help.textContent = 'Use Left and Right to move through observations in data order, including in right-to-left charts. Up and Down move between series. Home and End move to series endpoints; Control with Home or End moves to chart endpoints. Escape closes detail. Tab leaves the chart. Enter or Space activates a point when available.';
  status.dataset.ncStatus = ''; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); Object.assign(status.style, { overflow: 'auto', padding: '20px', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' });
  detail.hidden = true; detail.dataset.ncDetail = ''; detail.setAttribute('role', 'region'); detail.setAttribute('aria-label', 'Point details'); detail.tabIndex = 0; Object.assign(detail.style, { position: 'absolute', insetInlineEnd: '0', insetBlockEnd: '0', width: '280px', maxWidth: '100%', maxHeight: '100%', overflow: 'auto', overflowWrap: 'anywhere', padding: '10px 12px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid', zIndex: '3' });
  table.hidden = true; table.dataset.ncTable = ''; Object.assign(table.style, { position: 'absolute', inset: '0', overflow: 'auto', padding: '12px', boxSizing: 'border-box', zIndex: '4' });
  tableToggle.type = 'button'; tableToggle.textContent = 'View data table'; tableToggle.setAttribute('aria-label', 'View data table'); tableToggle.setAttribute('aria-controls', ids.table); tableToggle.setAttribute('aria-expanded', 'false');
  tableToggle.dataset.ncTableToggle = '';
  Object.assign(tableToggle.style, { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: '0', fontSize: '12px', cursor: 'pointer' });
  for (const element of [base, overlay]) { Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' }); element.setAttribute('aria-hidden', 'true'); }
  for (const element of [title, description]) Object.assign(element.style, { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
  Object.assign(title.style, { fontSize: '16px', fontWeight: '600', lineHeight: '20px' }); Object.assign(description.style, { fontSize: '12px', fontWeight: '400', lineHeight: '18px', marginTop: '4px' });
  Object.assign(legend.style, { overflow: 'auto', display: 'flex', alignContent: 'start', alignItems: 'start', gap: '8px', rowGap: '0px' });
  // Scoped rules provide native focus and high-contrast cues without changing host styles.
  const scope = `[data-nc-root="${prefix}"]`;
  style.textContent = `${scope} button{background:transparent;color:inherit;border:1px solid transparent;border-radius:3px;font-family:inherit;padding:4px 6px;}${scope} [data-nc-table-toggle]{color:var(--nc-owned-muted);}${scope} [data-nc-series][aria-pressed="false"]{color:var(--nc-owned-muted);}${scope} [data-nc-series][aria-pressed="false"] span:last-child{text-decoration:line-through;}${scope} button:active{background:var(--nc-owned-soft);}${scope} button:disabled{cursor:default;}${scope} [data-nc-status]:not([hidden]){display:flex;align-items:center;justify-content:center;text-align:center;}${scope} [data-nc-grid]:focus{outline:2px solid var(--nc-owned-focus);}${scope} button:focus-visible,${scope} [data-nc-detail]:focus-visible{outline:2px solid var(--nc-owned-focus);outline-offset:-2px;background:var(--nc-owned-soft);}@media(hover:hover){${scope} button:not(:disabled):hover{background:var(--nc-owned-soft);color:var(--nc-owned-text);}}@media(forced-colors:active){${scope} [data-nc-grid]:focus,${scope} button:focus-visible,${scope} [data-nc-detail]:focus-visible{outline:2px solid Highlight;}${scope} button{border:1px solid ButtonText;background:ButtonFace;color:ButtonText;}${scope} [data-nc-status]{color:CanvasText;}[data-nc-tooltip-owner="${prefix}"]{border-color:CanvasText!important;box-shadow:none!important;}}`;
  try { header.append(title, description, tableToggle); body.append(base, overlay, grid, status, detail, table); root.append(style, header, body, legend, help, semanticDetail); host.append(root); }
  catch (error) { removeOwnedNode(root); throw error; }
  return { root, header, title, description, tableToggle, body, base, overlay, grid, help, semanticDetail, status, legend, detail, table, style, ids };
}
export function applyShell(shell: Shell, frame: ShellFrame, palette: Palette, font: ResolvedFont, direction: 'ltr' | 'rtl', title: string, description: string | undefined): void {
  shell.root.style.width = `${frame.width}px`; shell.root.style.height = `${frame.height}px`; shell.root.style.backgroundColor = palette.surface; shell.root.style.color = palette.text; shell.root.style.fontFamily = font.family; shell.root.style.fontSize = `${font.size}px`; shell.root.style.setProperty('--nc-owned-focus', palette.focus); shell.root.style.setProperty('--nc-owned-muted', palette.muted); shell.root.style.setProperty('--nc-owned-text', palette.text); shell.root.style.setProperty('--nc-owned-soft', palette.grid); shell.root.dir = direction;
  box(shell.header, frame.header); box(shell.body, frame.body); box(shell.legend, frame.legend);
  box(shell.title, { x: direction === 'rtl' ? frame.tableWidth + 8 : 0, y: frame.compact ? 6 : 0, width: frame.textWidth, height: 20 });
  box(shell.description, { x: frame.compact ? 0 : direction === 'rtl' ? frame.tableWidth + 8 : 0, y: frame.compact ? 32 : 20, width: frame.compact ? frame.header.width : frame.textWidth, height: frame.compact ? 18 : 22 });
  shell.description.style.marginTop = frame.compact ? '0' : '4px';
  box(shell.tableToggle, { x: direction === 'rtl' ? 0 : Math.max(0, frame.header.width - frame.tableWidth), y: 0, width: frame.tableWidth, height: 32 });
  shell.tableToggle.textContent = frame.compact ? 'Data table' : 'View data table';
  shell.title.textContent = title; shell.description.textContent = description ?? ''; shell.description.hidden = !description;
  shell.description.style.color = palette.muted; shell.status.style.color = palette.muted;
  shell.legend.style.flexDirection = frame.legendPosition === 'end' ? 'column' : 'row'; shell.legend.style.flexWrap = frame.legendPosition === 'end' ? 'nowrap' : 'wrap'; shell.legend.hidden = frame.legendPosition === 'none'; shell.legend.style.display = shell.legend.hidden ? 'none' : 'flex';
  shell.detail.style.backgroundColor = palette.surface; shell.table.style.backgroundColor = palette.surface;
  shell.detail.style.borderColor = palette.grid;
  for (const element of [shell.tableToggle, shell.legend]) element.style.fontFamily = font.family;
  shell.legend.style.color = palette.text;
  box(shell.status, { x: 0, y: 0, width: frame.body.width, height: frame.body.height });
}
