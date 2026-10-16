import type { ChartResult, ChartDiagnostic } from '../public/chart-types.js';
import type { PieSlice, RadialChartSpec, RadialController, RadialDescription, RadialMountOptions, RadialSnapshot, RadialState } from '../public/radial-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { createBrowserPorts } from '../internal/platform/browser.js';
import { reserveInstance, type IdReservation } from '../internal/platform/id.js';
import { createRevisionScheduler, type RevisionScheduler, type RevisionToken } from '../internal/lifecycle/scheduler.js';
import { createSvgWriter, type SceneWriter, type PreparedScene } from '../internal/scene/svg-writer.js';
import { createTextMeasurer, type TextMeasurer } from '../internal/layout/text.js';
import { shellFrame, type ShellFrame } from '../internal/layout/frame.js';
import { emptyLayers, frame, type Layers } from '../internal/axes/scene.js';
import { createShell, shellIds, applyShell, type Shell } from '../internal/chart/shell.js';
import { cleanup, removeOwnedNode } from '../internal/chart/cleanup.js';
import { resolvePalette, assignment, type Palette, type ResolvedFont } from '../internal/chart/presentation.js';
import { createLegendView, type LegendView, type LegendItem } from '../internal/legend/view.js';
import { createSemanticView, type SemanticView } from '../internal/accessibility/view.js';
import { detailText, type TooltipModel, type TooltipRow } from '../internal/tooltip/model.js';
import { createTooltipView, allowedRect, unsupportedPortalMapping, type TooltipView } from '../internal/tooltip/view.js';
import { placeTooltip, type Rect, type PlacementResult } from '../internal/tooltip/place.js';
import { attachCartesianInteraction } from '../internal/interaction/cartesian.js';
import { validateRadial, validateRadialOptions } from './validate.js';
import { normalizeRadial, pickRadial, type RadialSlice } from './math.js';
import { projectRadial, radialFocusAnchor, type RadialProjection } from './geometry.js';
import { describeRadialData, sliceShareText } from './describe.js';
import { radialScene, radialFocusScene } from './scene.js';
import { createRadialTable } from './table.js';

type Target<T> = RadialSlice<PieSlice<T>>;
type Input<T> = Readonly<{ spec: RadialChartSpec<T>; state: RadialState }>;
type Computed<T> = Readonly<{ shell: ShellFrame; palette: Palette; font: ResolvedFont; projection: RadialProjection<T>; description: RadialDescription; layers: Layers; legend: readonly LegendItem[]; headers: ReadonlyMap<string, string>; status: string }>;
type MainCandidate<T> = Readonly<{ input: Input<T>; computed: Computed<T>; scene: PreparedScene | null }>;
type DetailJob<T> = Readonly<{ revision: number; generation: number; sequence: number; stage: 'intent' | 'measure'; target: Target<T> | null; detail: boolean; sample?: Readonly<{ x: number; y: number }> }>;
type DetailCandidate<T> = Readonly<{ job: DetailJob<T>; target: Target<T> | null; scene: PreparedScene; model: TooltipModel | null; bounds: Rect; placement: PlacementResult | null }>;
function invoke<T>(callback: ((value: T) => void) | null, value: T): void { try { callback?.(value); } catch { /* Consumers do not own engine resources. */ } }
function ordered(state: RadialState, ids: readonly string[]): RadialState { const hidden = new Set(state.hiddenSliceIds); return Object.freeze({ hiddenSliceIds: Object.freeze(ids.filter(id => hidden.has(id))) }); }
function changed(a: RadialState, b: RadialState): boolean { const hidden = new Set(b.hiddenSliceIds); return a.hiddenSliceIds.length !== hidden.size || a.hiddenSliceIds.some(id => !hidden.has(id)); }

export function mountRadialChart<T, S extends RadialChartSpec<T>>(host: HTMLElement, spec: S, options: RadialMountOptions<T>, family: 'pie' | 'donut'): ChartResult<RadialController<S>> {
  const parsed = validateRadial<T>(spec, family); if (parsed.status === 'invalid') return parsed;
  const ids = new Set(parsed.value.data.map(point => point.id)), opts = validateRadialOptions<T>(options, ids); if (opts.status === 'invalid') return opts;
  const mode = parsed.value.state?.mode ?? 'internal';
  if (mode === 'controlled' && opts.value.initialState) return invalid('INVALID_CONFIG', 'BAD_STATE', 'options.initialState');
  if (mode === 'controlled' && parsed.value.data.length && parsed.value.legend?.position !== 'none' && !opts.value.onStateChange) return invalid('INVALID_CONFIG', 'MISSING_STATE_HANDLER', 'options.onStateChange');
  const state = ordered(parsed.value.state?.mode === 'controlled' ? parsed.value.state.value : opts.value.initialState ?? { hiddenSliceIds: [] }, [...ids]);
  const data = normalizeRadial(parsed.value.data, new Set(state.hiddenSliceIds)); if (data.status === 'invalid') return data;
  try {
    if (!host || host.nodeType !== 1 || host.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !host.isConnected || !host.ownerDocument.defaultView || host.getRootNode() !== host.ownerDocument) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host');
    return mount<T, S>(host, { spec: parsed.value, state }, opts.value, family);
  } catch { return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
}
function mount<T, S extends RadialChartSpec<T>>(host: HTMLElement | null, initial: Input<T> | null, options: RadialMountOptions<T> | null, family: 'pie' | 'donut'): ChartResult<RadialController<S>> {
  let ownedHost = host, accepted = initial, committed: Input<T> | null = null, computed: Computed<T> | null = null, shell: Shell | null = null;
  let onActivate = options!.onPointActivate ?? null, onState = options!.onStateChange ?? null, onDiagnostic = options!.onDiagnostic ?? null;
  const instanceId = options!.instanceId, mode = initial!.spec.state?.mode ?? 'internal', reservations: IdReservation[] = [];
  let measurer: TextMeasurer | null = null, base: SceneWriter | null = null, overlay: SceneWriter | null = null, legend: LegendView | null = null, semantic: SemanticView | null = null, table: ReturnType<typeof createRadialTable> | null = null, tooltip: TooltipView | null = null;
  let main: RevisionScheduler<Input<T>> | null = null, interaction: RevisionScheduler<DetailJob<T>> | null = null, events: ReturnType<typeof attachCartesianInteraction> | null = null, observer: Readonly<{ disconnect(): void }> | null = null;
  let media: MediaQueryList | null = null, fonts: FontFaceSet | null = null; const fontHolder: { callback: (() => void) | null } = { callback: null };
  let phase: RadialSnapshot['phase'] = 'suspended', size = { width: 0, height: 0 }, revision = 0, committedRevision = 0, generation = 0, sequence = 0;
  let current: Target<T> | null = null, hover: Target<T> | null = null, activeId: string | null = null, activeOrder = 0, gridFocused = false, pinned = false, wanted = false, destroyed = false, suppressFocus = false, inCommit = false, disposeRequested = false;
  function snapshot(): RadialSnapshot { return Object.freeze({ phase, revision, committedRevision, view: phase === 'active' ? computed?.description.view ?? null : null, size: Object.freeze({ ...size }) }); }
  function resources(): void {
    cleanup(() => main?.destroy()); cleanup(() => interaction?.destroy()); main = null; interaction = null;
    cleanup(() => observer?.disconnect()); observer = null; fontHolder.callback = null;
    cleanup(() => fonts?.removeEventListener('loadingdone', fontsChanged)); cleanup(() => fonts?.removeEventListener('loadingerror', fontsChanged)); fonts = null;
    cleanup(() => media?.removeEventListener('change', mediaChanged)); media = null;
    cleanup(() => events?.destroy()); events = null; cleanup(() => legend?.destroy()); legend = null; cleanup(() => semantic?.destroy()); semantic = null; cleanup(() => table?.destroy()); table = null; cleanup(() => tooltip?.destroy()); tooltip = null;
    cleanup(() => base?.dispose()); base = null; cleanup(() => overlay?.dispose()); overlay = null; cleanup(() => measurer?.destroy()); measurer = null;
    accepted = null; committed = null; computed = null; current = null; hover = null; activeId = null; onActivate = null; onState = null; initial = null; options = null; host = null;
  }
  function dispose(): void { resources(); onDiagnostic = null; removeOwnedNode(shell?.root ?? null); shell = null; for (const reservation of reservations.splice(0).reverse()) cleanup(() => reservation.release()); ownedHost = null; disposeRequested = false; }
  function destroy(): void { if (destroyed) return; destroyed = true; phase = 'destroyed'; sequence++; cleanup(() => main?.destroy()); cleanup(() => interaction?.destroy()); if (inCommit) disposeRequested = true; else dispose(); }
  function fault(diagnostic: ChartDiagnostic): void {
    if (destroyed || phase === 'faulted') return; phase = 'faulted'; sequence++; const callback = onDiagnostic, root = shell?.root ?? null, focused = !!root?.contains(root.ownerDocument.activeElement); resources(); onDiagnostic = null;
    if (root) try { root.replaceChildren(); root.removeAttribute('aria-labelledby'); root.removeAttribute('aria-describedby'); root.setAttribute('aria-label', 'Chart unavailable'); root.textContent = 'Chart unavailable. Remount the chart to retry.'; if (focused) root.focus({ preventScroll: true }); } catch { /* Destroy still owns the faulted root. */ }
    invoke(callback, diagnostic);
  }
  function report(diagnostic: ChartDiagnostic): void { if (!destroyed) { if (diagnostic.code === 'LIFECYCLE_ERROR' || diagnostic.code === 'INTERNAL_INVARIANT') fault(diagnostic); else invoke(onDiagnostic, diagnostic); } }
  function submit(reason: 'data' | 'size' | 'paint'): ChartResult<number> {
    if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted' || !accepted || !main) return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller');
    const result = main.submit(accepted, reason, size.width > 0 && size.height > 0); if (result.status === 'ok') { revision = result.value; legend?.disable(true); } return result;
  }
  function fontsChanged(): void { if (!destroyed && phase !== 'faulted') { measurer?.invalidate(); submit('paint'); } }
  function mediaChanged(): void { if (accepted?.spec.theme === 'auto') submit('paint'); }
  function ensureMedia(): void {
    if (!ownedHost) return;
    if (accepted?.spec.theme === 'auto' && !media) { try { media = ownedHost.ownerDocument.defaultView!.matchMedia('(prefers-color-scheme: dark)'); } catch { return; } media.addEventListener('change', mediaChanged); }
    else if (accepted?.spec.theme !== 'auto' && media) { cleanup(() => media?.removeEventListener('change', mediaChanged)); media = null; }
  }
  function compute(input: Input<T>): ChartResult<Computed<T>> {
    if (!ownedHost || !measurer) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host');
    const spec = input.spec, direction = spec.direction ?? 'ltr', font: ResolvedFont = { family: spec.font?.family ?? 'sans-serif', size: spec.font?.size ?? 12, weight: spec.font?.weight ?? 400 }, palette = resolvePalette(ownedHost, spec.theme ?? 'light', media?.matches ?? false);
    const seen = new Set<string>(), duplicates = new Set<string>(); for (const point of spec.data) { if (seen.has(point.label)) duplicates.add(point.label); seen.add(point.label); }
    const names = spec.data.map(point => duplicates.has(point.label) && point.label !== point.id ? point.label + ' (' + point.id + ')' : point.label);
    const layout = shellFrame(size, !!spec.description, names, spec.legend?.position ?? 'bottom', font, direction, measurer), projected = projectRadial(spec, input.state, { x: 0, y: 0, width: layout.body.width, height: layout.body.height }); if (projected.status === 'invalid') return projected;
    const projection = projected.value, description = describeRadialData(spec, input.state, projection.data), layers = emptyLayers();
    const painted = radialScene(projection, spec, description, palette, font, (text, font) => measurer!.measure(text, font, direction), layers); if (painted.status === 'invalid') return painted;
    return ok({ shell: layout, palette, font, projection, description, layers, legend: spec.data.map((point, index) => ({ id: point.id, name: names[index]!, color: point.color ?? palette.series[assignment(point.id).colorIndex]!, dash: 'solid', swatch: 'square', width: layout.legendPosition === 'end' ? 160 : layout.buttonWidths[index]! })), headers: new Map(description.table.rows.map(row => [row.key, row.cells[0]!])), status: description.view === 'ready' && projection.tooSmall ? 'Chart is too small to display slices. Enlarge the chart or view the data table.' : description.status });
  }
  function setCurrent(target: Target<T> | null): void { current = target; if (target) { activeId = target.point.id; activeOrder = target.index; } }
  function reconcile(projection: RadialProjection<T>): Target<T> | null {
    if (activeId && projection.byId.has(activeId)) return projection.byId.get(activeId)!;
    const targets = projection.data.eligible; let low = 0, high = targets.length;
    while (low < high) { const middle = (low + high) >>> 1; if (targets[middle]!.index < activeOrder) low = middle + 1; else high = middle; }
    return targets[Math.min(low, targets.length - 1)] ?? null;
  }
  function tooltipFor(target: Target<T>): TooltipModel {
    const c = computed!, value = target.point.value, share = sliceShareText(value, target.fraction, c.projection.data.positive > 0), total = c.description.total;
    const rows: readonly TooltipRow[] = Object.freeze([{ seriesId: target.point.id, name: 'Value', value, availability: value === null ? 'null' : 'value', color: target.point.color ?? c.palette.series[assignment(target.point.id).colorIndex]!, dash: 'solid' }]);
    return Object.freeze({ revision: committedRevision, seriesId: 'slices', pointId: target.point.id, x: target.point.id, header: c.headers.get(target.point.id)!, displayHeader: c.headers.get(target.point.id)!, rows, isolateText: true, context: share + ' of visible total. ' + (total === null ? 'Total unavailable.' : (c.description.totalIncomplete ? 'Known total: ' : 'Total: ') + total + '.') });
  }
  function semanticUpdate(navigation = false): void {
    if (!semantic || !computed || !committed) return;
    const enabled = computed.description.view === 'ready' && !computed.projection.tooSmall, target = enabled ? current : null, model = target ? tooltipFor(target) : null;
    semantic.update({ rowCount: enabled ? 1 : 0, columnCount: enabled ? computed.projection.data.eligible.length : 0, current: target && model ? { seriesName: 'Slices', row: 1, column: computed.projection.rankById.get(target.point.id)! + 1, text: model.header + '. Value ' + target.point.value + '. ' + model.context, detail: detailText(model, computed.description.context) } : null, summary: computed.status || 'No slices in the displayed chart. Use the data table.' }, { x: 0, y: 0, width: computed.shell.body.width, height: computed.shell.body.height }, navigation);
  }
  function detailFocused(): boolean { return !!shell && shell.detail.contains(shell.root.ownerDocument.activeElement); }
  function invalidate(): void { sequence++; hover = null; pinned = false; wanted = false; events?.pin(false, committedRevision); const previous = suppressFocus; suppressFocus = true; tooltip?.close(true); suppressFocus = previous; overlay?.clear(); }
  function detailJob(stage: 'intent' | 'measure' = 'intent', sample?: Readonly<{ x: number; y: number }>): void {
    if (!interaction || !computed || phase !== 'active' || table?.isOpen() || computed.description.view !== 'ready' || computed.projection.tooSmall) return;
    interaction.submit({ revision: committedRevision, generation, sequence, stage, target: gridFocused || pinned || detailFocused() ? current : hover, detail: wanted, ...(sample ? { sample } : {}) }, 'paint', true);
  }
  function fresh(job: DetailJob<T>): boolean { return !destroyed && phase === 'active' && job.revision === committedRevision && job.generation === generation && job.sequence === sequence && !table?.isOpen(); }
  function matrix(): DOMMatrix | null { const m = shell?.base.querySelector('svg')?.getScreenCTM(); return m && [m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite) && m.a * m.d - m.b * m.c !== 0 ? m : null; }
  function mapped(m: DOMMatrix, x: number, y: number): Readonly<{ x: number; y: number }> { return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }
  function prepareDetail(job: DetailJob<T>, token: RevisionToken): ChartResult<DetailCandidate<T> | null> {
    if (!fresh(job) || !computed || !ownedHost) return ok(null);
    let target = job.target; const m = matrix();
    if (job.sample) { if (gridFocused || pinned || detailFocused()) return ok(null); const local = m ? mapped(m.inverse(), job.sample.x, job.sample.y) : null; target = local ? pickRadial(computed.projection.data, computed.projection.frame, local.x, local.y) : null; }
    const layers = emptyLayers(); if (target) radialFocusScene(computed.projection, target, computed.palette, layers);
    const scene = overlay!.prepare(frame(token.revision, computed.shell.body.width, computed.shell.body.height, layers), new Map()); if (scene.status === 'invalid') return scene;
    const model = target && job.detail && committed!.spec.tooltip?.mode !== 'off' ? tooltipFor(target) : null, bounds = allowedRect(ownedHost); let placement: PlacementResult | null = null;
    if (job.stage === 'measure' && model && target) {
      const measured = tooltip?.measure(), anchor = radialFocusAnchor(computed.projection, target), point = m ? mapped(m, anchor.x, anchor.y) : null;
      placement = !m || !point || unsupportedPortalMapping(ownedHost.ownerDocument) ? { kind: 'docked' } : measured ? placeTooltip({ x: point.x - 4, y: point.y - 4, width: 8, height: 8 }, measured, bounds, committed!.spec.tooltip?.placement ?? 'top', committed!.spec.direction ?? 'ltr', true) : { kind: 'closed' };
    }
    return ok({ job, target, scene: scene.value, model, bounds, placement });
  }
  function commitDetail(value: DetailCandidate<T> | null): ChartResult<void> {
    if (!value || !fresh(value.job) || !computed) return ok(undefined);
    const result = overlay!.apply(value.scene); if (result.status === 'invalid') return result; if (value.job.sample) hover = value.target;
    if (value.model && fresh(value.job)) {
      if (value.job.stage === 'intent') { tooltip!.write(value.model, value.bounds, computed.palette, computed.font, committed!.spec.direction ?? 'ltr'); detailJob('measure'); }
      else if (value.placement && value.target) { const point = radialFocusAnchor(computed.projection, value.target), body = { x: 0, y: 0, width: computed.shell.body.width, height: computed.shell.body.height }; tooltip!.show(value.placement, value.model, { anchor: { x: point.x - 6, y: point.y - 6, width: 12, height: 12 }, plot: body, body }); }
    } else tooltip?.close(); return ok(undefined);
  }
  function closeDetail(): void { invalidate(); gridFocused = !!shell && shell.root.ownerDocument.activeElement === shell.grid; detailJob(); }
  function prepareMain(input: Input<T>, token: RevisionToken): ChartResult<MainCandidate<T>> {
    const result = compute(input); if (result.status === 'invalid') return result; let scene: PreparedScene | null = null;
    if (result.value.shell.body.width > 0 && result.value.shell.body.height > 0) { const prepared = base!.prepare(frame(token.revision, result.value.shell.body.width, result.value.shell.body.height, result.value.layers), new Map()); if (prepared.status === 'invalid') return prepared; scene = prepared.value; }
    return ok({ input, computed: result.value, scene });
  }
  function commitMain(candidate: MainCandidate<T>, token: RevisionToken): ChartResult<void> {
    if (destroyed || !shell || !main?.isCurrent(token)) return ok(undefined); inCommit = true;
    try {
      const previousId = current?.point.id, focused = shell.root.ownerDocument.activeElement as HTMLElement | null, hadFocus = !!focused && shell.root.contains(focused), c = candidate.computed, spec = candidate.input.spec;
      if (candidate.scene) { const result = base!.apply(candidate.scene); if (result.status === 'invalid') return result; } else base!.clear(); if (destroyed) return ok(undefined);
      invalidate(); applyShell(shell, c.shell, c.palette, c.font, spec.direction ?? 'ltr', spec.title, spec.description);
      for (const element of [shell.base, shell.overlay]) { const svg = element.querySelector('svg'); if (svg) { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.setAttribute('direction', spec.direction ?? 'ltr'); svg.style.letterSpacing = '0px'; svg.style.pointerEvents = 'none'; } }
      shell.root.setAttribute('aria-busy', String(c.description.view === 'loading')); shell.status.hidden = !c.status; shell.status.textContent = c.status; const disabled = (spec.status?.kind ?? 'ready') !== 'ready';
      legend!.update(c.legend, { hiddenSeriesIds: candidate.input.state.hiddenSliceIds }, disabled); table!.update({ ...c.description, references: [] }, !disabled); if (destroyed) return ok(undefined);
      committed = candidate.input; computed = c; committedRevision = token.revision; generation++; setCurrent(c.description.view === 'ready' && !c.projection.tooSmall ? reconcile(c.projection) : null); semanticUpdate(previousId !== undefined && current !== null && current.point.id !== previousId);
      if (hadFocus && focused) {
        const valid = focused.isConnected && !focused.closest('[hidden]') && !('disabled' in focused && (focused as HTMLButtonElement).disabled);
        if (valid && shell.root.ownerDocument.activeElement !== focused) focused.focus({ preventScroll: true });
        else if (!valid) { const now = shell.root.ownerDocument.activeElement as HTMLElement | null; if (!now || now === shell.root || !shell.root.contains(now) || now.closest('[hidden]') || 'disabled' in now && (now as HTMLButtonElement).disabled) { suppressFocus = true; (shell.grid.hidden ? shell.root : shell.grid).focus({ preventScroll: true }); suppressFocus = false; } }
      }
      if (destroyed) return ok(undefined); gridFocused = shell.root.ownerDocument.activeElement === shell.grid; if (gridFocused && current) { wanted = true; detailJob(); } return ok(undefined);
    } catch { return invalid('INTERNAL_INVARIANT', 'DOM_WRITE_FAILED', 'controller'); } finally { inCommit = false; if (disposeRequested) dispose(); }
  }
  function accept(input: Input<T>): ChartResult<number> {
    if (size.width > 0 && size.height > 0) { try { const checked = compute(input); if (checked.status === 'invalid') return checked; } catch { return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'layout'); } }
    const previous = accepted; accepted = input; const result = submit('data'); if (result.status === 'invalid') accepted = previous; return result;
  }
  function legendToggle(id: string): void {
    if (!accepted || revision !== committedRevision || (accepted.spec.status?.kind ?? 'ready') !== 'ready') return;
    const hidden = new Set(accepted.state.hiddenSliceIds); if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    const state = ordered({ hiddenSliceIds: [...hidden] }, accepted.spec.data.map(point => point.id));
    if (mode === 'controlled') { invoke(onState, Object.freeze({ state, effect: 'proposal', source: 'legend', revision: committedRevision })); return; }
    const result = accept({ spec: accepted.spec, state }); if (result.status === 'invalid') invoke(onDiagnostic, result.diagnostic); else invoke(onState, Object.freeze({ state, effect: 'accepted', source: 'legend', revision: result.value }));
  }
  function update(spec: S): ChartResult<number> {
    if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted' || !accepted) return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller');
    const parsed = validateRadial<T>(spec, family); if (parsed.status === 'invalid') return parsed; if ((parsed.value.state?.mode ?? 'internal') !== mode) return invalid('INVALID_CONFIG', 'STATE_MODE_CHANGE', 'state.mode');
    if (mode === 'controlled' && parsed.value.data.length && parsed.value.legend?.position !== 'none' && !onState) return invalid('INVALID_CONFIG', 'MISSING_STATE_HANDLER', 'options.onStateChange');
    const next = ordered(parsed.value.state?.mode === 'controlled' ? parsed.value.state.value : accepted.state, parsed.value.data.map(point => point.id)), previous = accepted.state, result = accept({ spec: parsed.value, state: next }); if (result.status === 'invalid') return result;
    try { ensureMedia(); } catch { fault(invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'theme').diagnostic); return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller'); }
    if (mode === 'internal' && changed(previous, next)) invoke(onState, Object.freeze({ state: next, effect: 'accepted', source: 'update', revision: result.value })); return result;
  }
  function activate(target: Target<T>, source: 'pointer' | 'touch' | 'keyboard'): void { invoke(onActivate, Object.freeze({ point: target.point, percentage: target.point.value !== null && (target.point.value === 0 || target.fraction > 0) ? target.fraction * 100 : null, source, revision: committedRevision })); }
  try {
    const ports = createBrowserPorts(ownedHost!); if (ports.status === 'invalid') return ports;
    for (const id of Object.values(shellIds(instanceId))) if (ownedHost!.ownerDocument.getElementById(id)) return invalid('INVALID_CONFIG', 'ID_COLLISION', 'options.instanceId');
    const text = createTextMeasurer(ownedHost!.ownerDocument); if (text.status === 'invalid') return text; measurer = text.value;
    const parent = reserveInstance(ownedHost!, instanceId); if (parent.status === 'invalid') { dispose(); return parent; } reservations.push(parent.value); shell = createShell(ownedHost!, instanceId); shell.title.textContent = accepted!.spec.title; shell.description.textContent = accepted!.spec.description ?? '';
    shell.help.textContent = 'Use Left or Up for the previous slice and Right or Down for the next slice in data order, including right-to-left charts. Home and End move to endpoints. Zero values have no sector but remain available by keyboard and data table. Escape closes detail. Enter or Space activates a slice. Tab leaves the chart.';
    for (const [element, prefix] of [[shell.base, instanceId + '-v'], [shell.overlay, instanceId + '-i']] as const) { const reservation = reserveInstance(element, prefix); if (reservation.status === 'invalid') { dispose(); return reservation; } reservations.push(reservation.value); const writer = createSvgWriter(element, prefix); if (writer.status === 'invalid') { dispose(); return writer; } if (element === shell.base) base = writer.value; else overlay = writer.value; }
    legend = createLegendView(shell.legend, legendToggle); semantic = createSemanticView(shell); tooltip = createTooltipView(shell); table = createRadialTable(shell, closeDetail);
    main = createRevisionScheduler({ clock: ports.value.clock, prepare: prepareMain, commit: commitMain, onDiagnostic: report }); interaction = createRevisionScheduler({ clock: ports.value.clock, prepare: prepareDetail, commit: commitDetail, onDiagnostic: report });
    events = attachCartesianInteraction(shell.body, shell.grid, shell.detail, {
      revision: () => committedRevision, enabled: () => !!computed && computed.description.view === 'ready' && !computed.projection.tooSmall && phase === 'active' && !table?.isOpen(),
      pointer(x, y, intent) {
        if (intent === 'hover') { if (gridFocused || pinned || detailFocused()) return; sequence++; wanted = true; detailJob('intent', { x, y }); return; }
        const m = matrix(); if (!m || !computed || !shell) return; const point = mapped(m.inverse(), x, y), target = pickRadial(computed.projection.data, computed.projection.frame, point.x, point.y);
        sequence++; hover = null; pinned = intent === 'touch' && !!target; events?.pin(pinned, committedRevision); wanted = !!target;
        if (target) { setCurrent(target); suppressFocus = true; shell.grid.focus({ preventScroll: true }); suppressFocus = false; gridFocused = true; semanticUpdate(true); } detailJob(); if (target) activate(target, intent);
      },
      leave() { if (!gridFocused && !pinned && !detailFocused()) { sequence++; hover = null; wanted = false; tooltip?.close(); detailJob(); } },
      focus() { gridFocused = true; if (suppressFocus || !computed) return; if (!current) setCurrent(reconcile(computed.projection)); hover = null; sequence++; wanted = true; semanticUpdate(); detailJob(); },
      blur(next) { gridFocused = false; if (next && shell?.detail.contains(next as Node)) return; if (!pinned) { sequence++; wanted = false; tooltip?.close(); detailJob(); } },
      key(key) {
        if (key === 'Escape') { closeDetail(); return true; } if (!computed || !current || computed.description.view !== 'ready') return false;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') { const handled = key !== 'Enter' || !!onActivate; activate(current, 'keyboard'); return handled; }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return false;
        const targets = computed.projection.data.eligible, rank = computed.projection.rankById.get(current.point.id)!;
        const index = key === 'Home' ? 0 : key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, rank + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1))), next = targets[index]!;
        if (next !== current) { setCurrent(next); hover = null; pinned = false; events?.pin(false, committedRevision); sequence++; wanted = true; semanticUpdate(true); detailJob(); } return true;
      }, closeDetail, reposition() { if (wanted) { sequence++; detailJob(); } },
    });
    fonts = ownedHost!.ownerDocument.fonts ?? null; fontHolder.callback = fontsChanged; fonts?.addEventListener('loadingdone', fontsChanged); fonts?.addEventListener('loadingerror', fontsChanged); if (fonts) { const holder = fontHolder; void fonts.ready.then(() => holder.callback?.(), () => holder.callback?.()); } ensureMedia();
    const submitted = submit('data'); if (submitted.status === 'invalid') { dispose(); return submitted; }
    observer = ports.value.sizeObserver.observe(ownedHost!, next => {
      if (destroyed || phase === 'faulted') return; if (![next.width, next.height].every(Number.isFinite) || next.width < 0 || next.height < 0) { report(invalid('INVALID_NUMBER', 'NONFINITE', 'host.size').diagnostic); return; }
      if (size.width === next.width && size.height === next.height) return; size = { ...next };
      if (size.width <= 0 || size.height <= 0) { phase = 'suspended'; invalidate(); base?.clear(); current = null; computed = null; if (shell) { const focused = shell.root.contains(shell.root.ownerDocument.activeElement); table?.close(false); legend?.disable(true); semantic?.update({ rowCount: 0, columnCount: 0, current: null, summary: 'Chart has no visible size.' }, { x: 0, y: 0, width: 0, height: 0 }, false); shell.root.style.width = `${size.width}px`; shell.root.style.height = `${size.height}px`; shell.status.textContent = 'Chart has no visible size.'; shell.status.hidden = false; if (focused) { suppressFocus = true; shell.root.focus({ preventScroll: true }); suppressFocus = false; } } } else phase = 'active'; submit('size');
    });
    if (destroyed || snapshot().phase === 'faulted') { dispose(); return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
    host = null; initial = null; options = null;
    return ok(Object.freeze({ update, refresh() { if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted') return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller'); measurer?.invalidate(); return submit('paint'); }, getState: () => accepted ? ordered(accepted.state, accepted.spec.data.map(point => point.id)) : Object.freeze({ hiddenSliceIds: Object.freeze([]) }), getSnapshot: snapshot, destroy }));
  } catch { dispose(); return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
}
