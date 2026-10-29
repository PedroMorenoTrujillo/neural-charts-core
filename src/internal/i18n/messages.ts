import type { Result } from '../diagnostics.js';
import { ok, invalid } from '../diagnostics.js';
import { record, text, number, fail, ValidationFailure } from '../data/validation.js';
import type { FormattedText } from './format.js';
import type { ChartMessages, ChartMessageKey } from '../../public/text-types.js';

// Engine-owned text only. Consumer names/titles/labels are never lookup keys.
// Private until every applicable presentation port has an explicit mapping.
export const defaultMessages = Object.freeze({
  chartData: 'Chart data', pointDetails: 'Point details', viewDataTable: 'View data table', dataTable: 'Data table',
  closeDataTable: 'Close data table', previousPage: 'Previous page', nextPage: 'Next page',
  dataHeading: '{title} — data', originalObservations: 'Original observations',
  pageAnnouncement: 'Page {page} of {pages}. {first}–{last} of {total} provided observations.',
  croppedRetained: 'Cropped observations are retained.', scrollHorizontally: 'Scroll horizontally to view all columns.',
  keyboardCartesian: 'Use Left and Right to move through observations in data order, including in right-to-left charts. Up and Down move between series. Home and End move to series endpoints; Control with Home or End moves to chart endpoints. Escape closes detail. Tab leaves the chart. Enter or Space activates a point when available.',
  missingObservation: 'Missing observation', noSample: 'No sample', noData: 'No data', loadingData: 'Loading data',
  noVisibleSeries: 'No visible series', noVisibleSlices: 'No visible slices', seriesVisible: 'Series visible', seriesHidden: 'Series hidden',
  series: 'Series', x: 'X', y: 'Y', value: 'Value', visibility: 'Visibility', selected: 'Selected',
  slice: 'Slice', visibleShare: 'Visible share', row: 'Row', column: 'Column', observation: 'Observation',
  node: 'Node', path: 'Path', total: 'Total', knownTotal: 'Known total', percentage: 'Percentage', originalValue: 'Original value',
  reference: 'Reference: {label}', referenceRange: '{label}. {axis} from {from} to {to}', referenceInclusive: ', inclusive',
  referenceRanges: 'Reference ranges: {ranges}. Ranges are clipped to the displayed domain; these are the original endpoints.',
  outsideDomain: 'Outside displayed domain', outsideRange: 'Outside range',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetZoom: 'Reset zoom', panLeft: 'Pan left', panRight: 'Pan right', panUp: 'Pan up', panDown: 'Pan down',
  selectionSummary: 'Selection: {count} observations.', viewportSummary: 'Applied viewport {extent}. Table retains all original observations.',
  viewportAxis: '{axis}: {from} through {to}',
} satisfies Required<ChartMessages>);
export type MessageKey = ChartMessageKey;
export type MessageContext = Readonly<{ message(key: unknown, args?: unknown): Result<string> }>;
type Descriptor = Readonly<{ template: string; slots: readonly string[] }>;
const marker = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
function descriptor(input: unknown, path: string): Descriptor {
  const template = text(input, path, 2048);
  if (!template.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(template)) fail(path, 'BAD_MESSAGE_TEXT');
  for (let i = 0; i < template.length; i++) {
    const code = template.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = template.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail(path, 'BAD_MESSAGE_TEXT'); }
    else if (code >= 0xdc00 && code <= 0xdfff) fail(path, 'BAD_MESSAGE_TEXT');
  }
  if (/[{}]/.test(template.replace(marker, ''))) fail(path, 'BAD_MESSAGE_TEMPLATE');
  const slots = [...new Set([...template.matchAll(marker)].map(match => match[1]!))];
  return Object.freeze({ template, slots: Object.freeze(slots) });
}
const keys = Object.freeze(Object.keys(defaultMessages) as MessageKey[]);
const defaults = Object.freeze(Object.fromEntries(keys.map(key => [key, descriptor(defaultMessages[key], key)])) as Record<MessageKey, Descriptor>);

export function createMessageContext(input: unknown = {}, formatCount?: (value: number) => Result<FormattedText>): Result<MessageContext> {
  try {
    const source = record(input, keys, [], 'messages'), overrides: Partial<Record<MessageKey, Descriptor>> = {};
    for (const key of Object.keys(source) as MessageKey[]) {
      const candidate = descriptor(source[key], 'messages.' + key), required = defaults[key].slots;
      if (candidate.slots.length !== required.length || required.some(slot => !candidate.slots.includes(slot))) fail('messages.' + key, 'MESSAGE_SLOTS_MISMATCH');
      overrides[key] = candidate;
    }
    Object.freeze(overrides);
    return ok(Object.freeze({ message(key: unknown, inputArgs: unknown = {}): Result<string> {
      try {
        if (typeof key !== 'string' || !Object.hasOwn(defaults, key)) fail('messages.key', 'UNKNOWN_MESSAGE');
        const known = key as MessageKey, entry = overrides[known] ?? defaults[known];
        const args = record(inputArgs, entry.slots, entry.slots, 'messages.args'), values = new Map<string, string>();
        for (const slot of entry.slots) {
          const value = args[slot];
          if (typeof value === 'number') {
            const finite = number(value, 'messages.args.' + slot), formatted = formatCount?.(finite);
            if (formatted?.status === 'invalid') return formatted;
            values.set(slot, formatted?.value.text ?? String(finite));
          } else values.set(slot, text(value, 'messages.args.' + slot, 16384, true));
        }
        // Callback replacement keeps $, braces and HTML-looking consumer text
        // literal, with no recursive substitution or expression evaluation.
        const output = entry.template.replace(marker, (_all, slot: string) => values.get(slot)!);
        if (output.length > 32768) fail('messages', 'MESSAGE_SIZE_LIMIT');
        return ok(output);
      } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_MESSAGE_ARGUMENTS', 'messages'); }
    } }));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_MESSAGES', 'messages'); }
}
