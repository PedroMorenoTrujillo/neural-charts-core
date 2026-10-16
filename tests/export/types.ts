import { exportSvg, exportCsv, exportPng, exportDataCsv } from '../../src/export.js';
import type { ExportRecords, SvgImage, PngImage } from '../../src/export.js';
import { createScatterChart } from '../../src/scatter.js';
declare const host: HTMLElement;
const result = createScatterChart(host, { family: 'scatter', title: 'XY', axes: { x: { kind: 'linear' }, y: { kind: 'linear' } }, series: [] }, { instanceId: 'typed-export' });
if (result.status === 'ok') {
  const svg = exportSvg(result.value, { width: 1200, background: 'transparent', idPrefix: 'my-file' });
  if (svg.status === 'ok') { const image: SvgImage = svg.value; void image; }
  exportCsv(result.value, { delimiter: ';', spreadsheetSafe: true });
  void exportPng(result.value, { pixelRatio: 2, signal: new AbortController().signal }).then(png => { if (png.status === 'ok') { const image: PngImage = png.value; void image; } });
  // @ts-expect-error SVG takes no external resource URL.
  exportSvg(result.value, { url: 'https://example.invalid' });
  // @ts-expect-error JPEG is not a PNG encoding option.
  exportPng(result.value, { format: 'jpeg' });
}
const records: ExportRecords = { columns: ['ID', 'Value'], rows: [['one', -2], ['two', null]] };
exportDataCsv(records, { bom: true });
// @ts-expect-error Opaque objects are not exported cells.
exportDataCsv({ columns: ['Private'], rows: [[{ secret: true }]] });
// @ts-expect-error Export needs a registered live controller, not a DOM node.
exportSvg(host);
// @ts-expect-error Export records are immutable.
records.rows.push(['bad', 0]);
