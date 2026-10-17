import type { ChartResult } from '../../public/chart-types.js';
import type { ExportSnapshot } from './capture.js';
import { createSvgWriter } from '../scene/svg-writer.js';
import { createTextMeasurer, ellipsis } from '../layout/text.js';
import { invalid, ok } from '../diagnostics.js';
import { record, number, text, choice, color, fail, ValidationFailure } from '../data/validation.js';
import type { SvgOptions, SvgImage } from '../../public/export-types.js';
import { utf8Size } from './utf8.js';
import { isolateNumericLabels, NUMERIC_LABEL_CLASS, NUMERIC_AXIS_CLASS } from '../chart/data-label-direction.js';
const NS = 'http://www.w3.org/2000/svg';
/** XML 1.0 cannot losslessly carry arbitrary JS control/surrogate strings. */
function xmlText(value: string): string {
  for (const character of value) { const code = character.codePointAt(0)!; if (code < 32 && code !== 9 && code !== 10 && code !== 13 || code >= 0xd800 && code <= 0xdfff || code === 0xfffe || code === 0xffff) fail('export.text', 'UNREPRESENTABLE_XML_TEXT'); }
  return value;
}
export function snapshotSvg(source: ExportSnapshot, options: SvgOptions = {}): ChartResult<SvgImage> {
  let writer: ReturnType<typeof createSvgWriter> | undefined, measurer: ReturnType<typeof createTextMeasurer> | undefined, host: HTMLDivElement | undefined;
  try {
    const config = record(options, ['width', 'height', 'background', 'idPrefix', 'legend'], [], 'options'), doc = source.document, layout = source.layout;
    if (![layout.width, layout.height].every(value => Number.isFinite(value) && value > 0)) fail('export.size', 'NO_COMMITTED_SIZE');
    const prefix = Object.hasOwn(config, 'idPrefix') ? text(config.idPrefix, 'options.idPrefix', 64) : source.instanceId + '-export'; if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(prefix)) fail('options.idPrefix', 'BAD_INSTANCE_ID');
    const background = Object.hasOwn(config, 'background') ? config.background === 'transparent' ? 'transparent' : color(config.background, 'options.background') : source.palette.surface;
    const showLegend = !Object.hasOwn(config, 'legend') || choice(config.legend, ['all', 'none'], 'options.legend') === 'all';
    const hidden = new Set(source.hiddenLegendIds), legend = showLegend && layout.legendPosition !== 'none' ? source.legend : [], placements: { index: number; x: number; y: number }[] = [];
    let left = 0, row = 0; const legendTop = layout.body.y + layout.body.height + 8, legendWidth = Math.max(1, layout.width - 24);
    for (let i = 0; i < legend.length; i++) { const width = Math.min(legendWidth, legend[i]!.width); if (left && left + width > legendWidth) { row++; left = 0; } placements.push({ index: i, x: source.direction === 'rtl' ? layout.width - 12 - left - width : 12 + left, y: legendTop + row * 32 }); left += width + 8; }
    const viewHeight = Math.max(layout.height, legend.length ? legendTop + (row + 1) * 32 + 8 : layout.height), requestedWidth = Object.hasOwn(config, 'width') ? number(config.width, 'options.width', 1, 16384) : undefined, requestedHeight = Object.hasOwn(config, 'height') ? number(config.height, 'options.height', 1, 16384) : undefined;
    const width = requestedWidth ?? (requestedHeight === undefined ? layout.width : requestedHeight * layout.width / viewHeight), height = requestedHeight ?? (requestedWidth === undefined ? viewHeight : requestedWidth * viewHeight / layout.width);
    if (![width, height, viewHeight].every(value => Number.isFinite(value) && value > 0) || width > 16384 || height > 16384) fail('export.size', 'BAD_EXPORT_SIZE');
    measurer = createTextMeasurer(doc); if (measurer.status === 'invalid') return measurer;
    const metrics = measurer.value, font = source.font, svg = doc.createElementNS(NS, 'svg'), title = doc.createElementNS(NS, 'title'), description = doc.createElementNS(NS, 'desc');
    const attrs = (element: SVGElement, values: Readonly<Record<string, string | number>>) => { for (const [name, value] of Object.entries(values)) element.setAttribute(name, String(value)); };
    attrs(svg, { width, height, viewBox: `0 0 ${layout.width} ${viewHeight}`, role: 'img', 'aria-labelledby': prefix + '-title ' + prefix + '-description', direction: source.direction, 'font-family': font.family });
    title.id = prefix + '-title'; title.textContent = xmlText(source.title); description.id = prefix + '-description'; description.textContent = xmlText([source.description, source.context, source.status, legend.length ? 'Legend: ' + legend.map(item => item.name + (hidden.has(item.id) ? ' (hidden)' : '')).join('; ') : ''].filter(Boolean).join(' ')); svg.append(title, description);
    if (background !== 'transparent') { const rect = doc.createElementNS(NS, 'rect'); attrs(rect, { width: layout.width, height: viewHeight, fill: background }); svg.append(rect); }
    function label(content: string, x: number, y: number, cap: number, size: number, weight: 400 | 600, ink: string, anchor: 'start' | 'middle' | 'end' = 'start', muted = false): void {
      xmlText(content); const text = ellipsis(content, cap, value => metrics.measure(value, { family: font.family, size, weight }, source.direction)); if (!text) return;
      // Center anchoring is independent of SVG's RTL start/end inversion;
      // callers specify a physical edge and the browser still shapes RTL text.
      const advance = metrics.measure(text, { family: font.family, size, weight }, source.direction).width, center = anchor === 'middle' ? x : anchor === 'start' ? x + advance / 2 : x - advance / 2;
      const element = doc.createElementNS(NS, 'text'); attrs(element, { x: center, y, 'font-size': size, 'font-weight': weight, fill: ink, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }); if (muted) element.setAttribute('text-decoration', 'line-through'); element.textContent = text; svg.append(element);
    }
    const textX = source.direction === 'rtl' ? layout.width - 12 : 12, textAnchor = source.direction === 'rtl' ? 'end' : 'start';
    label(source.title, textX, layout.header.y + (layout.compact ? 16 : 10), layout.header.width, 16, 600, source.palette.text, textAnchor);
    if (source.description) label(source.description, textX, layout.header.y + (layout.compact ? 41 : 33), layout.header.width, 12, 400, source.palette.muted, textAnchor);
    for (const [name, layer] of Object.entries(source.frame.layers)) if (name !== 'interaction') for (const command of layer) if (command.kind === 'text') xmlText(command.text);
    if (layout.body.width > 0 && layout.body.height > 0) {
      host = doc.createElement('div'); writer = createSvgWriter(host, prefix + '-geometry'); if (writer.status === 'invalid') return writer;
      const prepared = writer.value.prepare({ ...source.frame, layers: { ...source.frame.layers, interaction: [] } }, new Map()); if (prepared.status === 'invalid') return prepared; const applied = writer.value.apply(prepared.value); if (applied.status === 'invalid') return applied;
      const geometry = host.querySelector('svg'); if (!geometry) fail('export.geometry', 'MISSING_EXPORT_GEOMETRY'); attrs(geometry, { x: layout.body.x, y: layout.body.y, width: layout.body.width, height: layout.body.height, direction: source.direction });
      if (source.frame.layers.labels.some(command => command.classes?.some(value => value === NUMERIC_LABEL_CLASS || value === NUMERIC_AXIS_CLASS))) isolateNumericLabels(geometry);
      for (const element of [geometry, ...geometry.querySelectorAll('*')]) for (const attribute of [...element.attributes]) if (attribute.name.startsWith('data-')) element.removeAttribute(attribute.name);
      svg.append(geometry);
      if (source.status) { const cover = doc.createElementNS(NS, 'rect'); attrs(cover, { x: layout.body.x, y: layout.body.y, width: layout.body.width, height: layout.body.height, fill: source.palette.surface }); svg.append(cover); label(source.status, layout.body.x + layout.body.width / 2, layout.body.y + layout.body.height / 2, Math.max(0, layout.body.width - 40), 13, 400, source.palette.muted, 'middle'); }
    }
    // A static SVG cannot scroll. Preserve every configured legend record and
    // final plot geometry; extra legend rows extend the output viewBox.
    for (const placement of placements) {
      const item = legend[placement.index]!, glyphWidth = item.swatch && item.swatch !== 'line' ? 10 : 16, x = source.direction === 'rtl' ? placement.x + Math.min(legendWidth, item.width) - 6 - glyphWidth / 2 : placement.x + 6 + glyphWidth / 2, y = placement.y + 16, group = doc.createElementNS(NS, 'g'), fullName = doc.createElementNS(NS, 'title'); fullName.textContent = xmlText(item.name); group.append(fullName); attrs(group, { opacity: hidden.has(item.id) ? .5 : 1 });
      if (item.swatch === 'circle') { const circle = doc.createElementNS(NS, 'circle'); attrs(circle, { cx: x, cy: y, r: 5, fill: item.color }); group.append(circle); }
      else if (item.swatch === 'square' || item.swatch === 'diamond') { const rect = doc.createElementNS(NS, 'rect'); attrs(rect, { x: x - 5, y: y - 5, width: 10, height: 10, fill: item.color }); if (item.swatch === 'diamond') rect.setAttribute('transform', `rotate(45 ${x} ${y})`); group.append(rect); }
      else { const line = doc.createElementNS(NS, 'line'); attrs(line, { x1: x - 8, y1: y, x2: x + 8, y2: y, stroke: item.color, 'stroke-width': 2, 'stroke-dasharray': item.dash === 'dashed' ? '6 4' : item.dash === 'dotted' ? '1 4' : '' }); group.append(line); }
      svg.append(group); const width = Math.min(legendWidth, item.width) - glyphWidth - 18; label(item.name, source.direction === 'rtl' ? x - glyphWidth / 2 - 6 : x + glyphWidth / 2 + 6, y, width, 12, 400, source.palette.text, textAnchor, hidden.has(item.id));
    }
    const Serializer = doc.defaultView?.XMLSerializer; if (!Serializer) fail('export.document', 'PLATFORM_UNAVAILABLE', 'LIFECYCLE_ERROR');
    const serialized = new Serializer().serializeToString(svg); if (utf8Size(serialized, 'export.svg') > 32 * 1024 * 1024) fail('export.svg', 'RESOURCE_LIMIT');
    return ok(Object.freeze({ svg: serialized, width, height, revision: source.revision }));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('LIFECYCLE_ERROR', 'EXPORT_SVG_FAILED', 'export.svg'); }
  finally { if (writer?.status === 'ok') writer.value.dispose(); if (measurer?.status === 'ok') measurer.value.destroy(); host?.replaceChildren(); }
}
