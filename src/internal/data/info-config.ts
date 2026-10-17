import type { ChartStatus } from '../../public/chart-types.js';
import { record, text, number, choice, optional, fail, type RecordValue } from './validation.js';
/** Shared strict presentation fields for single-dataset information charts.
 * Only mutates a freshly descriptor-validated private record, never input. */
export function infoConfig(spec: RecordValue): void {
  spec.title = text(spec.title, 'title');
  optional(spec, 'description', (value, path) => text(value, path, 4096, true), 'spec');
  optional(spec, 'theme', (value, path) => choice(value, ['light', 'dark', 'auto'], path), 'spec');
  optional(spec, 'direction', (value, path) => choice(value, ['ltr', 'rtl'], path), 'spec');
  optional(spec, 'labels', (value, path) => choice(value, ['auto', 'off'], path), 'spec');
  optional(spec, 'font', (value, path) => { const font = record(value, ['family', 'size', 'weight'], [], path); optional(font, 'family', (value, path) => choice(value, ['sans-serif', 'serif', 'monospace'], path), path); optional(font, 'size', (value, path) => number(value, path, 8, 32), path); optional(font, 'weight', (value, path) => choice(value, [400, 500, 600, 700], path), path); return Object.freeze(font); }, 'spec');
  optional(spec, 'legend', (value, path) => { const legend = record(value, ['position'], [], path); optional(legend, 'position', (value, path) => choice(value, ['bottom', 'end', 'none'], path), path); return Object.freeze(legend); }, 'spec');
  optional(spec, 'tooltip', (value, path) => { const tooltip = record(value, ['mode', 'placement'], [], path); optional(tooltip, 'mode', (value, path) => choice(value, ['point', 'off'], path), path); optional(tooltip, 'placement', (value, path) => choice(value, ['top', 'bottom', 'start', 'end'], path), path); return Object.freeze(tooltip); }, 'spec');
  optional(spec, 'status', (value, path): ChartStatus => {
    const status = record(value, ['kind', 'message'], ['kind'], path), kind = choice(status.kind, ['ready', 'loading', 'empty', 'error'], path + '.kind');
    if (kind === 'ready') { if (Object.hasOwn(status, 'message')) fail(path); return Object.freeze({ kind }); }
    const message = Object.hasOwn(status, 'message') ? text(status.message, path + '.message', 2048) : undefined;
    if (kind === 'error') { if (message === undefined) fail(path + '.message'); return Object.freeze({ kind, message }); }
    return Object.freeze({ kind, ...(message === undefined ? {} : { message }) });
  }, 'spec');
  optional(spec, 'motion', (value, path) => choice(value, ['none', 'subtle'], path), 'spec');
  optional(spec, 'crosshair', (value, path) => value === false ? false : choice(value, ['x', 'y', 'xy'], path), 'spec');
}
