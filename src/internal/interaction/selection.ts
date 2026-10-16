import type { ChartDatumId, ChartSelectionBinding } from '../../public/interaction-types.js';
import type { ChartResult } from '../../public/chart-types.js';
import { record, array, text, choice, fail, ValidationFailure } from '../data/validation.js';
import { ok, invalid } from '../diagnostics.js';
export type Selection<Id extends ChartDatumId = ChartDatumId> = Readonly<{ mode: 'internal' | 'controlled'; kind: 'single' | 'multiple'; value: readonly Id[] }>;
/** Length prefixes preserve series scope, separators and embedded NULs. */
export function datumKey(id: ChartDatumId): string { return id.seriesId === undefined ? 'p' + id.pointId.length + ':' + id.pointId : 's' + id.seriesId.length + ':' + id.seriesId + id.pointId.length + ':' + id.pointId; }
export function selectionIndex<Id extends ChartDatumId>(ids: Iterable<Id>): ReadonlyMap<string, Id> {
  const entries = new Map<string, Id>();
  // Identity contracts contain scalar IDs only; own a frozen structural copy.
  for (const id of ids) entries.set(datumKey(id), Object.freeze({ ...id }) as Id);
  return entries;
}
function readList(value: unknown, path: string): readonly ChartDatumId[] {
  const seen = new Set<string>();
  return Object.freeze(array(value, 1000, path).map((input, index) => {
    const at = path + '[' + index + ']', item = record(input, ['pointId', 'seriesId'], ['pointId'], at), pointId = text(item.pointId, at + '.pointId', 128), seriesId = Object.hasOwn(item, 'seriesId') ? text(item.seriesId, at + '.seriesId', 128) : undefined, id = Object.freeze(seriesId === undefined ? { pointId } : { pointId, seriesId }), key = datumKey(id);
    if (seen.has(key)) fail(at, 'DUPLICATE_SELECTION'); seen.add(key); return id;
  }));
}
/** Descriptor-safe public configuration copy. Existence is checked against the
 * actual selectable index at first mount / controlled application, not here. */
export function selectionBinding(value: unknown): ChartSelectionBinding {
  if (value === false) return false;
  const config = record(value, ['mode', 'kind', 'initial', 'value'], ['mode'], 'selection'), mode = choice(config.mode, ['internal', 'controlled'], 'selection.mode'), kind = Object.hasOwn(config, 'kind') ? choice(config.kind, ['single', 'multiple'], 'selection.kind') : 'single';
  if (mode === 'controlled') {
    if (Object.hasOwn(config, 'initial')) fail('selection.initial', 'BAD_SELECTION'); const selected = readList(config.value, 'selection.value');
    if (kind === 'single' && selected.length > 1) fail('selection.value', 'MULTIPLE_SINGLE_SELECTION'); return Object.freeze({ mode, kind, value: selected });
  }
  if (Object.hasOwn(config, 'value')) fail('selection.value', 'BAD_SELECTION');
  const initial = Object.hasOwn(config, 'initial') ? readList(config.initial, 'selection.initial') : undefined;
  if (kind === 'single' && (initial?.length ?? 0) > 1) fail('selection.initial', 'MULTIPLE_SINGLE_SELECTION');
  return Object.freeze({ mode, kind, ...(initial === undefined ? {} : { initial }) });
}
function canonical<Id extends ChartDatumId>(ids: readonly ChartDatumId[], known: ReadonlyMap<string, Id>, path: string): readonly Id[] {
  return Object.freeze(ids.map((id, index) => { const current = known.get(datumKey(id)); if (!current) fail(path + '[' + index + ']', 'UNKNOWN_SELECTION'); return current; }));
}
/** Immutable prepare/accept boundary: an invalid full update cannot mutate the
 * applied owner; internally removed IDs prune, controlled unknown IDs reject. */
export function prepareSelection<Id extends ChartDatumId>(input: unknown, known: ReadonlyMap<string, Id>, previous: Selection<Id> | null = null): ChartResult<Selection<Id> | null> {
  try {
    if (input === undefined || input === false) return ok(null);
    const binding = selectionBinding(input); if (!binding) return ok(null);
    const kind = binding.kind ?? 'single'; let value: readonly Id[];
    if (binding.mode === 'controlled') value = canonical(binding.value, known, 'selection.value');
    else value = previous?.mode === 'internal' ? Object.freeze(previous.value.flatMap(id => { const current = known.get(datumKey(id)); return current ? [current] : []; }).slice(0, kind === 'single' ? 1 : 1000)) : canonical(binding.initial ?? [], known, 'selection.initial');
    return ok(Object.freeze({ mode: binding.mode, kind, value }));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_SELECTION', 'selection'); }
}
/** Pure proposal. Controlled callers keep their previous applied snapshot. */
export function toggleSelection<Id extends ChartDatumId>(current: Selection<Id>, id: Id): ChartResult<readonly Id[]> {
  const key = datumKey(id), exists = current.value.some(value => datumKey(value) === key);
  const copy = Object.freeze({ ...id }) as Id, value = exists ? current.value.filter(value => datumKey(value) !== key) : current.kind === 'single' ? [copy] : [...current.value, copy];
  return value.length > 1000 ? invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'selection.value') : ok(Object.freeze(value));
}
export function replaceSelection<Id extends ChartDatumId>(current: Selection<Id>, known: ReadonlyMap<string, Id>, value: unknown): ChartResult<Selection<Id>> {
  const proposed = prepareSelection({ mode: 'controlled', kind: current.kind, value }, known);
  return proposed.status === 'invalid' ? proposed : proposed.value ? ok(Object.freeze({ ...current, value: proposed.value.value })) : invalid('INVALID_CONFIG', 'BAD_SELECTION', 'selection.value');
}
export function selectionChanged<Id extends ChartDatumId>(a: Selection<Id> | null, b: Selection<Id> | null): boolean {
  const left = a?.value ?? [], right = b?.value ?? []; return left.length !== right.length || left.some((id, index) => datumKey(id) !== datumKey(right[index]!));
}
