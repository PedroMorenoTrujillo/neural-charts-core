import type { ChartDiagnostic, ChartResult, ChartState, ChartStateChange } from '../public/chart-types.js';
import type { LineChartSpec, LineMountOptions, LinePointActivation, LineSnapshot } from '../public/line-types.js';
import type { LinePolicy, LineEngineController } from './renderer.js';
import { invalid, ok, notify } from '../internal/diagnostics.js';
import { createBrowserPorts } from '../internal/platform/browser.js';
import { reserveInstance } from '../internal/platform/id.js';
import type { IdReservation } from '../internal/platform/id.js';
import { createRevisionScheduler } from '../internal/lifecycle/scheduler.js';
import type { RevisionScheduler, RevisionToken, DirtyReason } from '../internal/lifecycle/scheduler.js';
import { createSvgWriter } from '../internal/scene/svg-writer.js';
import type { SceneWriter, PreparedScene } from '../internal/scene/svg-writer.js';
import { validateSceneFrame } from '../internal/scene/validate.js';
import { createTextMeasurer, ellipsis } from '../internal/layout/text.js';
import type { TextMeasurer } from '../internal/layout/text.js';
import { shellFrame } from '../internal/layout/frame.js';
import type { ShellFrame } from '../internal/layout/frame.js';
import { planAxes } from '../internal/axes/plan.js';
import type { AxesPlan } from '../internal/axes/plan.js';
import { emptyLayers, axesScene, referenceScene, referenceOutside, frame } from '../internal/axes/scene.js';
import type { Layers } from '../internal/axes/scene.js';
import { createShell, shellIds, applyShell } from '../internal/chart/shell.js';
import { cleanup, removeOwnedNode } from '../internal/chart/cleanup.js';
import type { Shell } from '../internal/chart/shell.js';
import { resolvePalette, resolveDashes } from '../internal/chart/presentation.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
import { orderedState, toggleState, membershipChanged, derivedView } from '../internal/chart/state.js';
import { createLegendView } from '../internal/legend/view.js';
import type { LegendView, LegendItem } from '../internal/legend/view.js';
import { createSemanticView } from '../internal/accessibility/view.js';
import type { SemanticView } from '../internal/accessibility/view.js';
import { semanticPoint } from '../internal/accessibility/model.js';
import { createTableView } from '../internal/accessibility/table.js';
import type { TableView, TableSource } from '../internal/accessibility/table.js';
import { tooltipModel, fullX } from '../internal/tooltip/model.js';
import type { TooltipModel, TooltipSeries } from '../internal/tooltip/model.js';
import { createTooltipView, allowedRect, unsupportedPortalMapping } from '../internal/tooltip/view.js';
import type { TooltipView } from '../internal/tooltip/view.js';
import { placeTooltip } from '../internal/tooltip/place.js';
import type { Rect, PlacementResult } from '../internal/tooltip/place.js';
import { attachLineInteraction } from '../internal/interaction/line.js';
import { validateLine, validateOptions, validateState } from './validate.js';
import { normalizeLine, lineDomains } from './normalize.js';
import type { Domains, NormalizedLine } from './normalize.js';
import { projectLine } from './geometry.js';
import { lineScene } from './scene.js';
import { buildHitIndex, firstTarget, navigate, reconcileTarget, pickPoint } from './hit-index.js';
import type { HitIndex, HitTarget } from './hit-index.js';
import { provideExport } from '../internal/export/capture.js';
import { cartesianRecords } from '../internal/export/records.js';

type Computed<T> = Readonly<{ shell: ShellFrame; palette: Palette; font: ResolvedFont; axes: AxesPlan | null; index: HitIndex<T> | null; layers: Layers; view: NonNullable<LineSnapshot['view']>; statusText: string; legend: readonly LegendItem[]; tooltipSeries: readonly TooltipSeries[]; table: TableSource }>;
type Accepted<T> = Readonly<{ data: NormalizedLine<T>; state: ChartState; domains: Domains; cached?: Readonly<{ epoch: number; width: number; height: number; value: Computed<T> }> }>;
type MainPrepared<T> = Readonly<{ input: Accepted<T>; computed: Computed<T>; scene: PreparedScene | null }>;
type InteractionJob<T> = Readonly<{ main: number; layout: number; sequence: number; stage: 'intent' | 'measure'; target: HitTarget<T> | null; keyboard: boolean; detail: boolean; sample?: Readonly<{ x: number; y: number; intent: 'hover' }> }>;
type InteractionPrepared<T> = Readonly<{ job: InteractionJob<T>; target: HitTarget<T> | null; scene: PreparedScene | null; model: TooltipModel | null; bounds: Rect; placement: PlacementResult | null; noop: boolean }>;
function invoke<T>(callback: ((value: T) => void) | null, value: T): void { try { callback?.(value); } catch { /* Application callbacks cannot break chart lifecycle. */ } }

export function createLineChart<T = unknown, S = LineChartSpec<T>>(host: HTMLElement, spec: S, options: LineMountOptions<T>, policy?: LinePolicy<T>): ChartResult<LineEngineController<T, S>> {
  const validated = policy ? policy.parse(spec) : validateLine<T>(spec); if (validated.status === 'invalid') return validated;
  const mountOptions = validateOptions<T>(options); if (mountOptions.status === 'invalid') return mountOptions;
  const data = normalizeLine(validated.value), opts = mountOptions.value, mode = data.spec.state?.mode ?? 'internal';
  if (mode === 'controlled' && opts.initialState) return invalid('INVALID_CONFIG', 'BAD_STATE', 'options.initialState');
  if (mode === 'controlled' && data.series.length && data.spec.legend?.position !== 'none' && !opts.onStateChange) return invalid('INVALID_CONFIG', 'MISSING_STATE_HANDLER', 'options.onStateChange');
  const stateResult = validateState(data.spec.state?.mode === 'controlled' ? data.spec.state.value : opts.initialState ?? { hiddenSeriesIds: [] }, new Set(data.series.map(s => s.spec.id)), mode === 'controlled' ? 'state.value' : 'options.initialState');
  if (stateResult.status === 'invalid') return stateResult;
  const state = orderedState(stateResult.value, data.series.map(s => s.spec.id)), domains = lineDomains(data, state); if (domains.status === 'invalid') return domains;
  try {
    if (!host || host.nodeType !== 1 || host.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !host.isConnected || !host.ownerDocument.defaultView || host.getRootNode() !== host.ownerDocument) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host');
    return mount<T, S>(host, { data, state, domains: domains.value }, opts, policy ?? null);
  } catch { return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
}
function mount<T, S>(host: HTMLElement | null, initial: Accepted<T> | null, options: LineMountOptions<T> | null, policy: LinePolicy<T> | null): ChartResult<LineEngineController<T, S>> {
  let ownedHost = host, shell: Shell | null = null, failureRoot: HTMLElement | null = null, accepted = initial, committed: Accepted<T> | null = null, computed: Computed<T> | null = null;
  let onDiagnostic = options!.onDiagnostic ?? null, onStateChange = options!.onStateChange ?? null, onPointActivate = options!.onPointActivate ?? null;
  const instanceId = options!.instanceId, mode = initial!.data.spec.state?.mode ?? 'internal', reservations: IdReservation[] = [];
  let measurer: TextMeasurer | null = null, main: RevisionScheduler<Accepted<T>> | null = null, interaction: RevisionScheduler<InteractionJob<T>> | null = null;
  let baseWriter: SceneWriter | null = null, overlayWriter: SceneWriter | null = null, observer: Readonly<{ disconnect(): void }> | null = null, media: MediaQueryList | null = null;
  let legend: LegendView | null = null, semantic: SemanticView | null = null, table: TableView | null = null, tooltip: TooltipView | null = null, events: ReturnType<typeof attachLineInteraction> | null = null;
  let fontSet: FontFaceSet | null = null; const fontHolder: { callback: (() => void) | null } = { callback: null };
  let phase: LineSnapshot['phase'] = 'suspended', size = { width: 0, height: 0 }, epoch = 0, layoutGeneration = 0, sequence = 0, fontDirty = false, inCommit = false, disposeRequested = false;
  let revision = 0, committedRevision = 0, current: HitTarget<T> | null = null, hover: HitTarget<T> | null = null, gridFocused = false, focusSuppressed = false, pinned = false, detailWanted = false, destroyed = false;
  let lastView: LineSnapshot['view'] = null;
  let releaseExport: (() => void) | null = null;
  const ids = shellIds(instanceId);
  function scalarSnapshot(): LineSnapshot { return Object.freeze({ phase, revision, committedRevision, view: destroyed || phase === 'faulted' || phase === 'suspended' ? null : lastView, size: Object.freeze({ ...size }) }); }
  function resources(): void {
    cleanup(() => releaseExport?.()); releaseExport = null;
    cleanup(() => main?.destroy()); cleanup(() => interaction?.destroy()); main = null; interaction = null;
    cleanup(() => observer?.disconnect()); observer = null;
    fontHolder.callback = null; cleanup(() => fontSet?.removeEventListener('loadingdone', fontsChanged)); cleanup(() => fontSet?.removeEventListener('loadingerror', fontsChanged)); fontSet = null;
    cleanup(() => media?.removeEventListener('change', mediaChanged)); media = null;
    cleanup(() => events?.destroy()); events = null; cleanup(() => legend?.destroy()); legend = null; cleanup(() => semantic?.destroy()); semantic = null; cleanup(() => table?.destroy()); table = null; cleanup(() => tooltip?.destroy()); tooltip = null;
    cleanup(() => baseWriter?.dispose()); cleanup(() => overlayWriter?.dispose()); baseWriter = null; overlayWriter = null;
    cleanup(() => measurer?.destroy()); measurer = null; accepted = null; committed = null; computed = null; current = null; hover = null; onPointActivate = null; onStateChange = null;
    initial = null; options = null; host = null; policy = null;
  }
  function dispose(): void {
    resources(); onDiagnostic = null;
    removeOwnedNode(shell?.root ?? null); removeOwnedNode(failureRoot); shell = null; failureRoot = null;
    for (const reservation of reservations.splice(0).reverse()) cleanup(() => reservation.release()); ownedHost = null; lastView = null; disposeRequested = false;
  }
  function destroy(): void {
    if (destroyed) return; revision = main?.getSnapshot().revision ?? revision; destroyed = true; phase = 'destroyed'; sequence++; cleanup(() => main?.destroy()); cleanup(() => interaction?.destroy());
    if (inCommit) disposeRequested = true; else dispose();
  }
  function fault(diagnostic: ChartDiagnostic): void {
    if (destroyed || phase === 'faulted') return; phase = 'faulted'; sequence++; const callback = onDiagnostic, root = shell?.root ?? null, ownedFocus = !!root?.contains(root.ownerDocument.activeElement);
    resources(); onDiagnostic = null;
    if (root) { try { root.replaceChildren(); root.removeAttribute('aria-labelledby'); root.removeAttribute('aria-describedby'); root.setAttribute('aria-label', 'Chart unavailable'); root.setAttribute('role', 'region'); root.textContent = 'Chart unavailable. Remount the chart to retry.'; if (ownedFocus) root.focus({ preventScroll: true }); } catch { /* No arbitrary DOM rollback is promised. */ } failureRoot = root; }
    shell = null; ownedHost = null; invoke(callback, diagnostic);
  }
  function report(diagnostic: ChartDiagnostic): void {
    if (destroyed) return;
    if (diagnostic.code === 'INTERNAL_INVARIANT' || diagnostic.code === 'LIFECYCLE_ERROR') { fault(diagnostic); return; }
    legend?.disable(committed?.data.spec.status?.kind !== undefined && committed.data.spec.status.kind !== 'ready'); invoke(onDiagnostic, diagnostic);
  }
  function fontsChanged(): void { if (destroyed || phase === 'faulted' || fontDirty) return; fontDirty = true; epoch++; measurer?.invalidate(); submit('paint'); }
  function mediaChanged(): void { if (accepted?.data.spec.theme === 'auto') { epoch++; submit('paint'); } }
  function ensureMedia(): void {
    if (!ownedHost) return;
    if (accepted?.data.spec.theme === 'auto' && !media) { try { media = ownedHost.ownerDocument.defaultView?.matchMedia('(prefers-color-scheme: dark)') ?? null; } catch { return; } media?.addEventListener('change', mediaChanged); }
    else if (accepted?.data.spec.theme !== 'auto' && media) { cleanup(() => media?.removeEventListener('change', mediaChanged)); media = null; }
  }
  function compute(input: Accepted<T>): ChartResult<Computed<T>> {
    if (!ownedHost || !measurer) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host');
    const data = input.data, spec = data.spec, font: ResolvedFont = { family: spec.font?.family ?? 'sans-serif', size: spec.font?.size ?? 12, weight: spec.font?.weight ?? 400 }, direction = spec.direction ?? 'ltr';
    let prefersDark = media?.matches ?? false; if (spec.theme === 'auto' && !media) { try { prefersDark = ownedHost.ownerDocument.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false; } catch { /* Auto falls back to light. */ } }
    const palette = resolvePalette(ownedHost, spec.theme ?? 'light', prefersDark), layout = shellFrame(size, !!spec.description, data.series.map(s => s.spec.name), spec.legend?.position ?? 'bottom', font, direction, measurer), hidden = new Set(input.state.hiddenSeriesIds);
    const visible = data.series.filter(s => !hidden.has(s.spec.id)), view = derivedView(spec.status?.kind ?? 'ready', data.nonnullCount, visible.reduce((n, s) => n + s.valid.length, 0), data.series.length, hidden.size), layers = emptyLayers();
    const dashes = resolveDashes(data.series, hidden, palette);
    let axes: AxesPlan | null = null, index: HitIndex<T> | null = null;
    if (view === 'ready') {
      const plan = planAxes({ x: spec.axes.x, y: spec.axes.y, domains: input.domains, width: layout.body.width, height: layout.body.height, font, direction, labels: data.labels, measurer, compact: layout.compact }); if (plan.status === 'invalid') return plan; axes = plan.value;
      if (!axes.tooSmall && axes.y.domain) {
        const projection = projectLine(data, input.state, axes.plot, axes.x.domain, axes.y.domain, axes); if (projection.status === 'invalid') return projection;
        index = buildHitIndex(projection.value, x => typeof x === 'string' ? data.ranks.get(x)! : x); axesScene(axes, spec.axes.x, spec.axes.y, palette, layers, layout.compact);
        if (policy) { const rendered = policy.render(projection.value, palette, layers, dashes); if (rendered.status === 'invalid') return rendered; }
        else lineScene(projection.value, palette, layers, dashes);
      }
    }
    const referenceInfo = axes ? referenceScene(spec.references ?? [], axes, palette, layers, text => { const rendered = ellipsis(text, Math.max(0, axes!.plot.width - 8), s => measurer!.measure(s, font, direction)), m = measurer!.measure(rendered ?? '', font, direction); return { text: rendered, width: m.width, height: m.height }; }, data.ranks) : [];
    const context = [spec.axes.x.title ? `X: ${spec.axes.x.title}.` : '', spec.axes.y.title ? `Y: ${spec.axes.y.title}.` : '', axes?.x.domain ? `Displayed X domain ${fullX(axes.x.domain[0], spec.axes.x.kind, data.labels)} to ${fullX(axes.x.domain[1], spec.axes.x.kind, data.labels)}.` : '', axes?.y.domain ? `Displayed Y domain ${axes.y.domain[0]} to ${axes.y.domain[1]}.` : ''].filter(Boolean).join(' ');
    const references = (spec.references ?? []).map(r => `${r.label ?? r.id}. ${r.axis.toUpperCase()} ${r.axis === 'x' ? fullX(r.value, spec.axes.x.kind, data.labels) : String(r.value)}.${(referenceInfo.find(info => info.id === r.id)?.outside ?? referenceOutside(r, input.domains, data.ranks)) ? ' Outside displayed domain.' : ''}`);
    const tableSource: TableSource = { title: spec.title, kind: spec.axes.x.kind, labels: data.labels, series: spec.series, hidden, context, references };
    const statusText = view === 'ready' ? axes?.tooSmall ? 'Chart is too small to display points. Enlarge the chart or view the data table.' : '' : spec.status && 'message' in spec.status ? spec.status.message ?? (view === 'loading' ? 'Loading chart data.' : 'No observations.') : view === 'no-visible-series' ? 'No visible series. Use the legend to show a series.' : view === 'loading' ? 'Loading chart data.' : view === 'error' ? 'Chart data unavailable.' : 'No visible observations.';
    const legendItems = data.series.map((s, i) => ({ id: s.spec.id, name: s.spec.name, color: s.spec.color ?? palette.series[s.colorIndex]!, dash: dashes.get(s.spec.id)!, width: layout.legendPosition === 'end' ? 160 : layout.buttonWidths[i]! }));
    const tooltipSeries = visible.map(s => ({ id: s.spec.id, name: s.spec.name, color: s.spec.color ?? palette.series[s.colorIndex]!, dash: dashes.get(s.spec.id)!, byX: s.byX }));
    return ok({ shell: layout, palette, font, axes, index, layers, view, statusText, legend: legendItems, tooltipSeries, table: tableSource });
  }
  function preflight(input: Accepted<T>): ChartResult<Accepted<T>> {
    if (size.width <= 0 || size.height <= 0) return ok(input);
    try {
      const result = compute(input); if (result.status === 'invalid') return result;
      const value = result.value;
      if (value.shell.body.width > 0 && value.shell.body.height > 0) { const checked = validateSceneFrame(frame(1, value.shell.body.width, value.shell.body.height, value.layers, value.axes ?? undefined)); if (checked.status === 'invalid') return checked; }
      return ok({ ...input, cached: { epoch, width: size.width, height: size.height, value } });
    } catch { return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'font', 'Text measurement failed.'); }
  }
  function submit(reason: DirtyReason): ChartResult<number> {
    if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted' || !accepted || !main) return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller');
    const result = main.submit(accepted, reason, size.width > 0 && size.height > 0); if (result.status === 'ok') { revision = result.value; legend?.disable(true); } return result;
  }
  function semanticUpdate(navigation: boolean): void {
    if (!computed || !committed || !shell || !semantic) return;
    const model = current ? tooltipFor(current) : null, context = [...computed.table.references, computed.table.context].join(' ');
    semantic.update({ rowCount: computed.index?.targets.length ?? 0, columnCount: computed.index?.columnCount ?? 0, current: current && model ? semanticPoint(current.series.series.spec.name, current.seriesIndex + 1, computed.index!.columns.get(current.point.point.x)!, model.header, current.point.point.y!, context, model) : null, summary: computed.statusText || 'Chart data. No points in the displayed domain. Use the data table.' }, computed.axes?.plot ?? { x: 0, y: 0, width: computed.shell.body.width, height: computed.shell.body.height }, navigation);
  }
  function tooltipFor(target: HitTarget<T>): TooltipModel {
    return tooltipModel(committedRevision, target.series.series.spec.id, target.point.point.id, target.point.point.x, committed!.data.spec.axes.x.kind, committed!.data.spec.tooltip?.mode === 'shared' ? 'shared' : 'point', computed!.tooltipSeries, committed!.data.labels, committed!.data.duplicateLabels);
  }
  function invalidateInteraction(keepDetail = false): void { sequence++; pinned = false; events?.pin(false, committedRevision); detailWanted = keepDetail; hover = null; const previous = focusSuppressed; focusSuppressed = true; if (!keepDetail) tooltip?.close(true); focusSuppressed = previous; overlayWriter?.clear(); }
  function interactionJob(stage: 'intent' | 'measure' = 'intent', sample?: InteractionJob<T>['sample']): void {
    if (!interaction || !computed?.index || !committed || phase !== 'active' || table?.isOpen()) return;
    const detailFocused = detailOwnsFocus();
    interaction.submit({ main: committedRevision, layout: layoutGeneration, sequence, stage, target: gridFocused || pinned || detailFocused ? current : hover, keyboard: gridFocused || detailFocused, detail: detailWanted, ...(sample ? { sample } : {}) }, 'paint', true);
  }
  function detailOwnsFocus(): boolean { return !!shell && shell.detail.contains(shell.root.ownerDocument.activeElement); }
  function tokenCurrent(job: InteractionJob<T>): boolean { return !destroyed && phase === 'active' && job.main === committedRevision && job.layout === layoutGeneration && job.sequence === sequence && !table?.isOpen(); }
  function matrix(): DOMMatrix | null {
    const svg = shell?.base.querySelector('svg'); if (!svg) return null;
    const m = svg.getScreenCTM(); return m && [m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite) && m.a * m.d - m.b * m.c !== 0 ? m : null;
  }
  function toClient(m: DOMMatrix, x: number, y: number): Readonly<{ x: number; y: number }> { return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }
  function activate(target: HitTarget<T>, source: 'pointer' | 'touch' | 'keyboard'): void {
    if (!committed || !onPointActivate) return;
    const event = { seriesId: target.series.series.spec.id, source, revision: committedRevision, xKind: committed.data.spec.axes.x.kind, point: target.point.point } as LinePointActivation<T>;
    invoke(onPointActivate, Object.freeze(event));
  }
  function prepareInteraction(job: InteractionJob<T>, token: RevisionToken): ChartResult<InteractionPrepared<T>> {
    const empty: InteractionPrepared<T> = { job, target: null, scene: null, model: null, bounds: { x: 0, y: 0, width: 0, height: 0 }, placement: null, noop: true };
    if (!tokenCurrent(job) || !computed?.index || !shell || !ownedHost) return ok(empty);
    let target = job.target; const m = matrix();
    if (job.sample) {
      if (job.sample.intent === 'hover' && (gridFocused || pinned)) return ok(empty);
      if (m) { const inverse = m.inverse(), local = toClient(inverse, job.sample.x, job.sample.y); target = pickPoint(computed.index, local, job.sample, (x, y) => toClient(m, x, y)); } else target = null;
    }
    const layers = emptyLayers(), plan = computed.axes!;
    if (target) layers.interaction.push({ kind: 'circle', key: 'halo', cx: target.point.x, cy: target.point.y, r: 6, clipKey: 'plot', presentation: { fill: { kind: 'solid', value: computed.palette.surface } } }, { kind: 'circle', key: 'ring', cx: target.point.x, cy: target.point.y, r: 4, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: job.keyboard ? computed.palette.focus : target.series.series.spec.color ?? computed.palette.series[target.series.series.colorIndex]! }, strokeWidth: 2 } });
    const scene = overlayWriter!.prepare(frame(token.revision, computed.shell.body.width, computed.shell.body.height, layers, plan), new Map()); if (scene.status === 'invalid') return scene;
    const model = target && job.detail && committed!.data.spec.tooltip?.mode !== 'off' ? tooltipFor(target) : null, bounds = allowedRect(ownedHost);
    let placement: PlacementResult | null = null;
    if (job.stage === 'measure' && model) {
      const measured = tooltip?.measure(), anchor = m ? toClient(m, target!.point.x, target!.point.y) : null;
      placement = !m || !anchor || unsupportedPortalMapping(ownedHost.ownerDocument) ? { kind: 'docked' } : measured ? placeTooltip({ ...anchor, width: 0, height: 0 }, measured, bounds, committed!.data.spec.tooltip?.placement ?? 'top', committed!.data.spec.direction ?? 'ltr') : { kind: 'closed' };
    }
    return ok({ job, target, scene: scene.value, model, bounds, placement, noop: false });
  }
  function commitInteraction(candidate: InteractionPrepared<T>): ChartResult<void> {
    if (candidate.noop || !tokenCurrent(candidate.job) || !computed || !shell) return ok(undefined);
    const result = candidate.scene ? overlayWriter!.apply(candidate.scene) : ok(undefined); if (result.status === 'invalid') { fault(result.diagnostic); return result; }
    const { job, target, model } = candidate;
    if (job.sample) hover = target;
    if (model && tokenCurrent(job)) {
      if (job.stage === 'intent') { tooltip!.write(model, candidate.bounds, computed.palette, computed.font, committed!.data.spec.direction ?? 'ltr'); interactionJob('measure'); }
      else if (candidate.placement && target) tooltip!.show(candidate.placement, model, { anchor: { x: target.point.x - 6, y: target.point.y - 6, width: 12, height: 12 }, plot: computed.axes!.plot, body: { x: 0, y: 0, width: computed.shell.body.width, height: computed.shell.body.height } });
    } else tooltip?.close();
    return ok(undefined);
  }
  function closeDetail(): void { sequence++; detailWanted = false; pinned = false; events?.pin(false, committedRevision); hover = null; const previous = focusSuppressed; focusSuppressed = true; tooltip?.close(true); focusSuppressed = previous; gridFocused = !!shell && shell.root.ownerDocument.activeElement === shell.grid; interactionJob(); }
  function legendToggle(id: string): void {
    if (!committed || !computed || !accepted || main?.getSnapshot().pending || computed.view !== 'ready' && computed.view !== 'empty' && computed.view !== 'no-visible-series') return;
    const next = toggleState(committed.state, id, committed.data.series.map(s => s.spec.id));
    if (mode === 'controlled') { invoke(onStateChange, Object.freeze({ state: next, effect: 'proposal', source: 'legend', revision: committedRevision })); return; }
    const domains = lineDomains(accepted.data, next); if (domains.status === 'invalid') { invoke(onDiagnostic, domains.diagnostic); return; }
    const checked = preflight({ data: accepted.data, state: next, domains: domains.value }); if (checked.status === 'invalid') { invoke(onDiagnostic, checked.diagnostic); return; }
    const previous = accepted; accepted = checked.value; const submitted = submit('data'); if (submitted.status === 'invalid') { accepted = previous; invoke(onDiagnostic, submitted.diagnostic); return; }
    const event: ChartStateChange = { state: next, effect: 'accepted', source: 'legend', revision: submitted.value }; invoke(onStateChange, Object.freeze(event));
  }
  function mainPrepare(input: Accepted<T>, token: RevisionToken): ChartResult<MainPrepared<T>> {
    fontDirty = false;
    const cached = input.cached, result = cached && cached.epoch === epoch && cached.width === size.width && cached.height === size.height ? ok(cached.value) : compute(input);
    if (result.status === 'invalid') return result;
    const c = result.value; let scene: PreparedScene | null = null;
    if (c.shell.body.width > 0 && c.shell.body.height > 0) {
      const sceneFrame = frame(token.revision, c.shell.body.width, c.shell.body.height, c.layers, c.axes ?? undefined), checked = validateSceneFrame(sceneFrame); if (checked.status === 'invalid') return checked;
      const plan = baseWriter!.prepare(checked.value, new Map()); if (plan.status === 'invalid') return plan; scene = plan.value;
    }
    return ok({ input, computed: c, scene });
  }
  function mainCommit(candidate: MainPrepared<T>, token: RevisionToken): ChartResult<void> {
    if (destroyed || !shell || !main?.isCurrent(token)) return ok(undefined);
    inCommit = true;
    try {
      const focused = shell.root.ownerDocument.activeElement as HTMLElement | null, hadFocus = !!focused && shell.root.contains(focused), previous = current, previousKind = committed?.data.spec.axes.x.kind, c = candidate.computed, spec = candidate.input.data.spec;
      if (candidate.scene) { const applied = baseWriter!.apply(candidate.scene); if (applied.status === 'invalid') { fault(applied.diagnostic); return applied; } } else baseWriter!.clear();
      if (destroyed) return ok(undefined);
      const keepDetail = shell.detail.contains(focused) && committed?.data === candidate.input.data && committed?.state === candidate.input.state;
      invalidateInteraction(keepDetail); applyShell(shell, c.shell, c.palette, c.font, spec.direction ?? 'ltr', spec.title, spec.description);
      for (const container of [shell.base, shell.overlay]) { const svg = container.querySelector('svg'); if (svg) { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.setAttribute('direction', spec.direction ?? 'ltr'); svg.style.letterSpacing = '0px'; svg.style.pointerEvents = 'none'; } }
      shell.root.setAttribute('aria-busy', String(c.view === 'loading')); shell.status.hidden = !c.statusText; if (shell.status.textContent !== c.statusText) shell.status.textContent = c.statusText;
      const disabled = (spec.status?.kind ?? 'ready') !== 'ready'; legend!.update(c.legend, candidate.input.state, disabled);
      table!.update(c.table, !disabled);
      if (destroyed) return ok(undefined);
      committed = candidate.input; computed = c; committedRevision = token.revision; lastView = c.view; layoutGeneration++;
      const priorProjection = previous ? c.axes?.mapX(previous.point.point.x) ?? null : null, clamped = priorProjection === null || !c.axes ? null : Math.max(c.axes.plot.x, Math.min(priorProjection, c.axes.plot.x + c.axes.plot.width));
      current = c.index ? reconcileTarget(c.index, previous, previousKind === spec.axes.x.kind, clamped) : null; hover = null;
      if (keepDetail && !current) closeDetail();
      semanticUpdate(!!previous && !!current && (previous.series.series.spec.id !== current.series.series.spec.id || previous.point.point.id !== current.point.point.id));
      if (hadFocus && focused) {
        if (focused.isConnected && !focused.hidden && !('disabled' in focused && (focused as HTMLButtonElement).disabled) && !focused.closest('[hidden]')) { if (shell.root.ownerDocument.activeElement !== focused) focused.focus({ preventScroll: true }); }
        else {
          const now = shell.root.ownerDocument.activeElement as HTMLElement | null;
          // A paged view may have deliberately focused its replacement heading/control.
          if (!now || now === shell.root || !shell.root.contains(now) || now.closest('[hidden]') || 'disabled' in now && (now as HTMLButtonElement).disabled) { focusSuppressed = true; (shell.grid.hidden ? shell.root : shell.grid).focus({ preventScroll: true }); focusSuppressed = false; }
        }
      }
      gridFocused = shell.root.ownerDocument.activeElement === shell.grid; if ((gridFocused || detailOwnsFocus()) && current) interactionJob();
      return ok(undefined);
    } catch { const diagnostic = invalid('INTERNAL_INVARIANT', 'DOM_WRITE_FAILED', 'controller').diagnostic; fault(diagnostic); return { status: 'invalid', diagnostic }; }
    finally { inCommit = false; if (disposeRequested) dispose(); }
  }
  function update(nextSpec: S): ChartResult<number> {
    if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted' || !accepted) return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller');
    const validation = policy ? policy.parse(nextSpec) : validateLine<T>(nextSpec); if (validation.status === 'invalid') return validation;
    const data = normalizeLine(validation.value), nextMode = data.spec.state?.mode ?? 'internal'; if (nextMode !== mode) return invalid('INVALID_CONFIG', 'STATE_MODE_CHANGE', 'state.mode');
    if (mode === 'controlled' && data.series.length && data.spec.legend?.position !== 'none' && !onStateChange) return invalid('INVALID_CONFIG', 'MISSING_STATE_HANDLER', 'options.onStateChange');
    const state = orderedState(data.spec.state?.mode === 'controlled' ? data.spec.state.value : accepted.state, data.series.map(s => s.spec.id)), domains = lineDomains(data, state); if (domains.status === 'invalid') return domains;
    const checked = preflight({ data, state, domains: domains.value }); if (checked.status === 'invalid') return checked;
    const previous = accepted; accepted = checked.value; const result = submit('data'); if (result.status === 'invalid') { accepted = previous; return result; }
    try { ensureMedia(); } catch { fault(invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'theme').diagnostic); return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller'); }
    if (mode === 'internal' && membershipChanged(previous.state, state)) invoke(onStateChange, Object.freeze({ state, effect: 'accepted', source: 'update', revision: result.value }));
    return result;
  }
  try {
    const ports = createBrowserPorts(ownedHost!); if (ports.status === 'invalid') return ports;
    for (const id of Object.values(ids)) if (ownedHost!.ownerDocument.getElementById(id)) return invalid('INVALID_CONFIG', 'ID_COLLISION', 'options.instanceId');
    const text = createTextMeasurer(ownedHost!.ownerDocument); if (text.status === 'invalid') return text; measurer = text.value;
    const parent = reserveInstance(ownedHost!, instanceId); if (parent.status === 'invalid') { dispose(); return parent; } reservations.push(parent.value);
    shell = createShell(ownedHost!, instanceId); shell.title.textContent = accepted!.data.spec.title; shell.description.textContent = accepted!.data.spec.description ?? '';
    for (const [element, prefix] of [[shell.base, instanceId + '-v'], [shell.overlay, instanceId + '-i']] as const) {
      const reservation = reserveInstance(element, prefix); if (reservation.status === 'invalid') { dispose(); return reservation; } reservations.push(reservation.value);
      const writer = createSvgWriter(element, prefix); if (writer.status === 'invalid') { dispose(); return writer; } if (element === shell.base) baseWriter = writer.value; else overlayWriter = writer.value;
    }
    legend = createLegendView(shell.legend, legendToggle); semantic = createSemanticView(shell); tooltip = createTooltipView(shell); table = createTableView(shell, closeDetail);
    main = createRevisionScheduler({ clock: ports.value.clock, prepare: mainPrepare, commit: mainCommit, onDiagnostic: report });
    interaction = createRevisionScheduler({ clock: ports.value.clock, prepare: prepareInteraction, commit: commitInteraction, onDiagnostic: report });
    events = attachLineInteraction(shell.body, shell.grid, shell.detail, {
      revision: () => committedRevision, enabled: () => !!computed?.index && phase === 'active' && !table?.isOpen(),
      pointer(x, y, intent) {
        if (intent === 'hover') { if (gridFocused || pinned || detailOwnsFocus()) return; sequence++; detailWanted = true; interactionJob('intent', { x, y, intent }); return; }
        const m = matrix(); if (!m || !computed?.index || !shell) return;
        const target = pickPoint(computed.index, toClient(m.inverse(), x, y), { x, y }, (px, py) => toClient(m, px, py));
        sequence++; current = target ?? current; hover = null; pinned = intent === 'touch' && !!target; events?.pin(pinned, committedRevision); detailWanted = !!target;
        if (target) { focusSuppressed = true; shell.grid.focus({ preventScroll: true }); focusSuppressed = false; gridFocused = true; semanticUpdate(true); }
        interactionJob(); if (target) activate(target, intent);
      },
      leave() { if (!gridFocused && !pinned && !detailOwnsFocus()) { sequence++; hover = null; detailWanted = false; tooltip?.close(); interactionJob(); } },
      focus() { gridFocused = true; if (focusSuppressed || !computed?.index) return; current ??= firstTarget(computed.index); hover = null; sequence++; detailWanted = true; semanticUpdate(false); interactionJob(); },
      blur(next) { gridFocused = false; if (next && shell?.detail.contains(next as Node)) return; if (!pinned) { sequence++; detailWanted = false; tooltip?.close(); interactionJob(); } },
      key(key, ctrl) {
        if (key === 'Escape') { closeDetail(); return true; }
        if (!computed?.index || !current) return false;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') { const handled = key !== 'Enter' || !!onPointActivate; activate(current, 'keyboard'); return handled; }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return false;
        const next = navigate(computed.index, current, key, ctrl); if (next !== current) { current = next; hover = null; pinned = false; events?.pin(false, committedRevision); sequence++; detailWanted = true; semanticUpdate(true); interactionJob(); } return true;
      },
      closeDetail,
      reposition() { if (detailWanted) { sequence++; interactionJob(); } },
    });
    fontSet = ownedHost!.ownerDocument.fonts ?? null; fontHolder.callback = fontsChanged;
    fontSet?.addEventListener('loadingdone', fontsChanged); fontSet?.addEventListener('loadingerror', fontsChanged);
    if (fontSet) { const holder = fontHolder; void fontSet.ready.then(() => holder.callback?.(), () => holder.callback?.()); }
    ensureMedia();
    const submitted = submit('data'); if (submitted.status === 'invalid') { dispose(); return submitted; }
    observer = ports.value.sizeObserver.observe(ownedHost!, next => {
      if (destroyed || phase === 'faulted') return;
      if (![next.width, next.height].every(Number.isFinite) || next.width < 0 || next.height < 0) { report(invalid('INVALID_NUMBER', 'NONFINITE', 'host.size').diagnostic); return; }
      if (size.width === next.width && size.height === next.height) return; size = { ...next }; epoch++;
      if (size.width <= 0 || size.height <= 0) {
        phase = 'suspended'; invalidateInteraction(); baseWriter?.clear(); lastView = null;
        if (shell) {
          const hadFocus = shell.root.contains(shell.root.ownerDocument.activeElement); table?.close(false); legend?.disable(true);
          semantic?.update({ rowCount: 0, columnCount: 0, current: null, summary: 'Chart has no visible size.' }, { x: 0, y: 0, width: 0, height: 0 }, false);
          shell.root.style.width = `${size.width}px`; shell.root.style.height = `${size.height}px`; shell.status.textContent = 'Chart has no visible size.'; shell.status.hidden = false;
          if (hadFocus) { focusSuppressed = true; shell.root.focus({ preventScroll: true }); focusSuppressed = false; }
        }
        computed = null;
      } else phase = 'active'; submit('size');
    });
    if (scalarSnapshot().phase === 'faulted' || destroyed) { dispose(); return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
    host = null; initial = null; options = null;
    const controller = Object.freeze({ update, refresh() { if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted') return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller'); epoch++; measurer?.invalidate(); return submit('paint'); }, getState: () => accepted ? orderedState(accepted.state, accepted.data.series.map(s => s.spec.id)) : Object.freeze({ hiddenSeriesIds: Object.freeze([]) }), getSnapshot: scalarSnapshot, destroy });
    releaseExport = provideExport(controller, () => {
      if (phase !== 'active' || !computed || !committed || !shell) return invalid('LIFECYCLE_ERROR', 'EXPORT_UNAVAILABLE', 'controller');
      const c = computed, input = committed, spec = input.data.spec;
      return ok({ document: shell.root.ownerDocument, instanceId, revision: committedRevision, frame: frame(committedRevision, c.shell.body.width, c.shell.body.height, c.layers, c.axes ?? undefined), layout: c.shell, palette: c.palette, font: c.font, direction: spec.direction ?? 'ltr', title: spec.title, description: spec.description ?? '', context: [c.table.context, ...c.table.references].join(' '), status: c.statusText, legend: c.legend, hiddenLegendIds: input.state.hiddenSeriesIds, records: () => cartesianRecords(spec, input.state.hiddenSeriesIds) });
    });
    return ok(controller);
  } catch { dispose(); return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
}
