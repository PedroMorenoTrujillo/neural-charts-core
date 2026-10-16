import type { ChartResult, ChartDiagnostic } from '../../public/chart-types.js';
import { invalid, ok } from '../diagnostics.js';
import { createBrowserPorts } from '../platform/browser.js';
import { reserveInstance, type IdReservation } from '../platform/id.js';
import { createRevisionScheduler, type RevisionScheduler, type RevisionToken } from '../lifecycle/scheduler.js';
import { createSvgWriter, type SceneWriter, type PreparedScene } from '../scene/svg-writer.js';
import { createTextMeasurer, type TextMeasurer } from '../layout/text.js';
import { shellFrame, type ShellFrame } from '../layout/frame.js';
import { emptyLayers, frame, type Layers } from '../axes/scene.js';
import { createShell, shellIds, applyShell, type Shell } from '../chart/shell.js';
import { cleanup, removeOwnedNode } from '../chart/cleanup.js';
import { resolvePalette, type Palette, type ResolvedFont } from '../chart/presentation.js';
import { createLegendView, type LegendView, type LegendItem } from '../legend/view.js';
import { createSemanticView, type SemanticView } from '../accessibility/view.js';
import { type TooltipModel } from '../tooltip/model.js';
import { createTooltipView, allowedRect, unsupportedPortalMapping, type TooltipView } from '../tooltip/view.js';
import { placeTooltip, type Rect, type PlacementResult } from '../tooltip/place.js';
import { attachCartesianInteraction } from '../interaction/cartesian.js';
import { provideExport } from '../export/capture.js';

import type { FamilySpec, FamilyDescription, FamilySnapshot, FamilyController, FamilyOptions, FamilyPolicy, FamilyComputed } from './family.js';
type Input<S, State> = Readonly<{ spec: S; state: State }>;
type MainCandidate<S, State, P, D extends FamilyDescription> = Readonly<{ input: Input<S, State>; computed: FamilyComputed<P, D>; scene: PreparedScene | null }>;
type DetailJob<Target> = Readonly<{ revision: number; generation: number; sequence: number; stage: 'intent' | 'measure'; target: Target | null; detail: boolean; sample?: Readonly<{ x: number; y: number }> }>;
type DetailCandidate<Target> = Readonly<{ job: DetailJob<Target>; target: Target | null; scene: PreparedScene; model: TooltipModel | null; bounds: Rect; placement: PlacementResult | null }>;
function invoke<T>(callback: ((value: T) => void) | null, value: T): void { try { callback?.(value); } catch { /* Consumers do not own engine resources. */ } }
export function mountFamily<S extends FamilySpec<State>, State, P, Target, D extends FamilyDescription, Activation>(host: HTMLElement, inputSpec: S, inputOptions: FamilyOptions<State, Activation>, policy: FamilyPolicy<S, State, P, Target, D, Activation>): ChartResult<FamilyController<S, State, D['view']>> {
  const ordered = (state: State, ids: readonly string[]): State => { const hidden = new Set(policy.hidden(state)); return policy.state(ids.filter(id => hidden.has(id))); };
  const parsed = policy.parse(inputSpec); if (parsed.status === 'invalid') return parsed;
  const ids = new Set(policy.ids(parsed.value)), opts = policy.options(inputOptions, ids); if (opts.status === 'invalid') return opts;
  const mode = parsed.value.state?.mode ?? 'internal';
  if (mode === 'controlled' && opts.value.initialState) return invalid('INVALID_CONFIG', 'BAD_STATE', 'options.initialState');
  if (mode === 'controlled' && ids.size && parsed.value.legend?.position !== 'none' && !opts.value.onStateChange) return invalid('INVALID_CONFIG', 'MISSING_STATE_HANDLER', 'options.onStateChange');
  const state = ordered(parsed.value.state?.mode === 'controlled' ? parsed.value.state.value : opts.value.initialState ?? policy.state([]), [...ids]);
  const checked = policy.validateData(parsed.value, state); if (checked.status === 'invalid') return checked;
  try {
    if (!host || host.nodeType !== 1 || host.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !host.isConnected || !host.ownerDocument.defaultView || host.getRootNode() !== host.ownerDocument) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host');
    return mount(host, { spec: parsed.value, state }, opts.value, policy);
  } catch { return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
}
function mount<S extends FamilySpec<State>, State, P, Target, D extends FamilyDescription, Activation>(host: HTMLElement | null, initial: Input<S, State> | null, options: FamilyOptions<State, Activation> | null, policy: FamilyPolicy<S, State, P, Target, D, Activation>): ChartResult<FamilyController<S, State, D['view']>> {
  const ordered = (state: State, ids: readonly string[]): State => { const hidden = new Set(policy.hidden(state)); return policy.state(ids.filter(id => hidden.has(id))); };
  const changed = (a: State, b: State): boolean => { const hidden = new Set(policy.hidden(b)); return policy.hidden(a).length !== hidden.size || policy.hidden(a).some(id => !hidden.has(id)); };
  let ownedHost = host, accepted = initial, committed: Input<S, State> | null = null, computed: FamilyComputed<P, D> | null = null, shell: Shell | null = null;
  let onActivate = options!.onPointActivate ?? null, onState = options!.onStateChange ?? null, onDiagnostic = options!.onDiagnostic ?? null;
  const instanceId = options!.instanceId, mode = initial!.spec.state?.mode ?? 'internal', reservations: IdReservation[] = [];
  let measurer: TextMeasurer | null = null, base: SceneWriter | null = null, overlay: SceneWriter | null = null, legend: LegendView | null = null, semantic: SemanticView | null = null, table: ReturnType<typeof policy.table> | null = null, tooltip: TooltipView | null = null;
  let main: RevisionScheduler<Input<S, State>> | null = null, interaction: RevisionScheduler<DetailJob<Target>> | null = null, events: ReturnType<typeof attachCartesianInteraction> | null = null, observer: Readonly<{ disconnect(): void }> | null = null;
  let media: MediaQueryList | null = null, fonts: FontFaceSet | null = null; const fontHolder: { callback: (() => void) | null } = { callback: null };
  let phase: FamilySnapshot['phase'] = 'suspended', size = { width: 0, height: 0 }, revision = 0, committedRevision = 0, generation = 0, sequence = 0;
  let releaseExport: (() => void) | null = null;
  let current: Target | null = null, hover: Target | null = null, activeId: string | null = null, activeOrder = 0, gridFocused = false, pinned = false, wanted = false, destroyed = false, suppressFocus = false, inCommit = false, disposeRequested = false;
  function snapshot(): FamilySnapshot & Readonly<{ view: D['view'] | null }> { return Object.freeze({ phase, revision, committedRevision, view: phase === 'active' ? computed?.description.view ?? null : null, size: Object.freeze({ ...size }) }); }
  function resources(): void {
    cleanup(() => releaseExport?.()); releaseExport = null;
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
  function compute(input: Input<S, State>): ChartResult<FamilyComputed<P, D>> {
    if (!ownedHost || !measurer) return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host');
    const spec = input.spec, direction = spec.direction ?? 'ltr', font: ResolvedFont = { family: spec.font?.family ?? 'sans-serif', size: spec.font?.size ?? 12, weight: spec.font?.weight ?? 400 }, palette = resolvePalette(ownedHost, spec.theme ?? 'light', media?.matches ?? false);
    const layout = shellFrame(size, !!spec.description, policy.names(spec), spec.legend?.position ?? 'bottom', font, direction, measurer);
    return policy.compute(spec, input.state, layout, palette, font, measurer);
  }
  function setCurrent(target: Target | null): void { current = target; if (target) { activeId = policy.identity(target); activeOrder = policy.order(target); } }
  function reconcile(projection: P): Target | null { return policy.reconcile(projection, activeId, activeOrder); }
  function semanticUpdate(navigation = false): void {
    if (!semantic || !computed || !committed) return;
    const enabled = policy.enabled(computed), target = enabled ? current : null, dimensions = policy.dimensions(computed.projection);
    semantic.update({ rowCount: enabled ? dimensions.rows : 0, columnCount: enabled ? dimensions.columns : 0, current: target ? policy.semantic(computed, target) : null, summary: computed.status || 'No observations in the displayed chart. Use the data table.' }, { x: 0, y: 0, width: computed.shell.body.width, height: computed.shell.body.height }, navigation);
  }
  function detailFocused(): boolean { return !!shell && shell.detail.contains(shell.root.ownerDocument.activeElement); }
  function invalidate(): void { sequence++; hover = null; pinned = false; wanted = false; events?.pin(false, committedRevision); const previous = suppressFocus; suppressFocus = true; tooltip?.close(true); suppressFocus = previous; overlay?.clear(); }
  function detailJob(stage: 'intent' | 'measure' = 'intent', sample?: Readonly<{ x: number; y: number }>): void {
    if (!interaction || !computed || phase !== 'active' || table?.isOpen() || !policy.enabled(computed)) return;
    interaction.submit({ revision: committedRevision, generation, sequence, stage, target: gridFocused || pinned || detailFocused() ? current : hover, detail: wanted, ...(sample ? { sample } : {}) }, 'paint', true);
  }
  function fresh(job: DetailJob<Target>): boolean { return !destroyed && phase === 'active' && job.revision === committedRevision && job.generation === generation && job.sequence === sequence && !table?.isOpen(); }
  function matrix(): DOMMatrix | null { const m = shell?.base.querySelector('svg')?.getScreenCTM(); return m && [m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite) && m.a * m.d - m.b * m.c !== 0 ? m : null; }
  function mapped(m: DOMMatrix, x: number, y: number): Readonly<{ x: number; y: number }> { return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }
  function prepareDetail(job: DetailJob<Target>, token: RevisionToken): ChartResult<DetailCandidate<Target> | null> {
    if (!fresh(job) || !computed || !ownedHost) return ok(null);
    let target = job.target; const m = matrix();
    if (job.sample) { if (gridFocused || pinned || detailFocused()) return ok(null); const local = m ? mapped(m.inverse(), job.sample.x, job.sample.y) : null; target = local ? policy.pick(computed.projection, local.x, local.y) : null; }
    const layers = emptyLayers(); if (target) policy.focus(computed.projection, target, computed.palette, layers);
    const scene = overlay!.prepare(frame(token.revision, computed.shell.body.width, computed.shell.body.height, layers, computed.axes), new Map()); if (scene.status === 'invalid') return scene;
    const model = target && job.detail && committed!.spec.tooltip?.mode !== 'off' ? policy.tooltip(computed, target, committedRevision) : null, bounds = allowedRect(ownedHost); let placement: PlacementResult | null = null;
    if (job.stage === 'measure' && model && target) {
      const measured = tooltip?.measure(), anchor = policy.anchor(computed.projection, target), point = m ? mapped(m, anchor.x, anchor.y) : null;
      placement = !m || !point || unsupportedPortalMapping(ownedHost.ownerDocument) ? { kind: 'docked' } : measured ? placeTooltip({ x: point.x - 4, y: point.y - 4, width: 8, height: 8 }, measured, bounds, committed!.spec.tooltip?.placement ?? 'top', committed!.spec.direction ?? 'ltr', true) : { kind: 'closed' };
    }
    return ok({ job, target, scene: scene.value, model, bounds, placement });
  }
  function commitDetail(value: DetailCandidate<Target> | null): ChartResult<void> {
    if (!value || !fresh(value.job) || !computed) return ok(undefined);
    const result = overlay!.apply(value.scene); if (result.status === 'invalid') return result; if (value.job.sample) hover = value.target;
    if (value.model && fresh(value.job)) {
      if (value.job.stage === 'intent') { tooltip!.write(value.model, value.bounds, computed.palette, computed.font, committed!.spec.direction ?? 'ltr'); detailJob('measure'); }
      else if (value.placement && value.target) { const point = policy.anchor(computed.projection, value.target); tooltip!.show(value.placement, value.model, { anchor: { x: point.x - 6, y: point.y - 6, width: 12, height: 12 }, ...policy.detailBounds(computed) }); }
    } else tooltip?.close(); return ok(undefined);
  }
  function closeDetail(): void { invalidate(); gridFocused = !!shell && shell.root.ownerDocument.activeElement === shell.grid; detailJob(); }
  function prepareMain(input: Input<S, State>, token: RevisionToken): ChartResult<MainCandidate<S, State, P, D>> {
    const result = compute(input); if (result.status === 'invalid') return result; let scene: PreparedScene | null = null;
    if (result.value.shell.body.width > 0 && result.value.shell.body.height > 0) { const prepared = base!.prepare(frame(token.revision, result.value.shell.body.width, result.value.shell.body.height, result.value.layers, result.value.axes), new Map()); if (prepared.status === 'invalid') return prepared; scene = prepared.value; }
    return ok({ input, computed: result.value, scene });
  }
  function commitMain(candidate: MainCandidate<S, State, P, D>, token: RevisionToken): ChartResult<void> {
    if (destroyed || !shell || !main?.isCurrent(token)) return ok(undefined); inCommit = true;
    try {
      const previousId = current === null ? undefined : policy.identity(current), focused = shell.root.ownerDocument.activeElement as HTMLElement | null, hadFocus = !!focused && shell.root.contains(focused), c = candidate.computed, spec = candidate.input.spec;
      if (candidate.scene) { const result = base!.apply(candidate.scene); if (result.status === 'invalid') return result; } else base!.clear(); if (destroyed) return ok(undefined);
      invalidate(); applyShell(shell, c.shell, c.palette, c.font, spec.direction ?? 'ltr', spec.title, spec.description);
      for (const element of [shell.base, shell.overlay]) { const svg = element.querySelector('svg'); if (svg) { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.setAttribute('direction', spec.direction ?? 'ltr'); svg.style.letterSpacing = '0px'; svg.style.pointerEvents = 'none'; } }
      shell.root.setAttribute('aria-busy', String(c.description.view === 'loading')); shell.status.hidden = !c.status; shell.status.textContent = c.status; const disabled = (spec.status?.kind ?? 'ready') !== 'ready';
      legend!.update(c.legend, { hiddenSeriesIds: policy.hidden(candidate.input.state) }, disabled); table!.update({ ...c.description, references: [] }, !disabled); if (destroyed) return ok(undefined);
      committed = candidate.input; computed = c; committedRevision = token.revision; generation++; setCurrent(policy.enabled(c) ? reconcile(c.projection) : null); semanticUpdate(previousId !== undefined && current !== null && policy.identity(current) !== previousId);
      if (hadFocus && focused) {
        const valid = focused.isConnected && !focused.closest('[hidden]') && !('disabled' in focused && (focused as HTMLButtonElement).disabled);
        if (valid && shell.root.ownerDocument.activeElement !== focused) focused.focus({ preventScroll: true });
        else if (!valid) { const now = shell.root.ownerDocument.activeElement as HTMLElement | null; if (!now || now === shell.root || !shell.root.contains(now) || now.closest('[hidden]') || 'disabled' in now && (now as HTMLButtonElement).disabled) { suppressFocus = true; (shell.grid.hidden ? shell.root : shell.grid).focus({ preventScroll: true }); suppressFocus = false; } }
      }
      if (destroyed) return ok(undefined); gridFocused = shell.root.ownerDocument.activeElement === shell.grid; if (gridFocused && current) { wanted = true; detailJob(); } return ok(undefined);
    } catch { return invalid('INTERNAL_INVARIANT', 'DOM_WRITE_FAILED', 'controller'); } finally { inCommit = false; if (disposeRequested) dispose(); }
  }
  function accept(input: Input<S, State>): ChartResult<number> {
    if (size.width > 0 && size.height > 0) { try { const checked = compute(input); if (checked.status === 'invalid') return checked; } catch { return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'layout'); } }
    const previous = accepted; accepted = input; const result = submit('data'); if (result.status === 'invalid') accepted = previous; return result;
  }
  function legendToggle(id: string): void {
    if (!accepted || revision !== committedRevision || (accepted.spec.status?.kind ?? 'ready') !== 'ready') return;
    const hidden = new Set(policy.hidden(accepted.state)); if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    const state = ordered(policy.state([...hidden]), policy.ids(accepted.spec));
    if (mode === 'controlled') { invoke(onState, Object.freeze({ state, effect: 'proposal', source: 'legend', revision: committedRevision })); return; }
    const result = accept({ spec: accepted.spec, state }); if (result.status === 'invalid') invoke(onDiagnostic, result.diagnostic); else invoke(onState, Object.freeze({ state, effect: 'accepted', source: 'legend', revision: result.value }));
  }
  function update(spec: S): ChartResult<number> {
    if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted' || !accepted) return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller');
    const parsed = policy.parse(spec); if (parsed.status === 'invalid') return parsed; if ((parsed.value.state?.mode ?? 'internal') !== mode) return invalid('INVALID_CONFIG', 'STATE_MODE_CHANGE', 'state.mode');
    if (mode === 'controlled' && policy.ids(parsed.value).length && parsed.value.legend?.position !== 'none' && !onState) return invalid('INVALID_CONFIG', 'MISSING_STATE_HANDLER', 'options.onStateChange');
    const validated = policy.validateData(parsed.value, parsed.value.state?.mode === 'controlled' ? parsed.value.state.value : ordered(accepted.state, policy.ids(parsed.value))); if (validated.status === 'invalid') return validated;
    const next = ordered(parsed.value.state?.mode === 'controlled' ? parsed.value.state.value : accepted.state, policy.ids(parsed.value)), previous = accepted.state, result = accept({ spec: parsed.value, state: next }); if (result.status === 'invalid') return result;
    try { ensureMedia(); } catch { fault(invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'theme').diagnostic); return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller'); }
    if (mode === 'internal' && changed(previous, next)) invoke(onState, Object.freeze({ state: next, effect: 'accepted', source: 'update', revision: result.value })); return result;
  }
  function activate(target: Target, source: 'pointer' | 'touch' | 'keyboard'): void { invoke(onActivate, policy.activate(target, source, committedRevision)); }
  try {
    const ports = createBrowserPorts(ownedHost!); if (ports.status === 'invalid') return ports;
    for (const id of Object.values(shellIds(instanceId))) if (ownedHost!.ownerDocument.getElementById(id)) return invalid('INVALID_CONFIG', 'ID_COLLISION', 'options.instanceId');
    const text = createTextMeasurer(ownedHost!.ownerDocument); if (text.status === 'invalid') return text; measurer = text.value;
    const parent = reserveInstance(ownedHost!, instanceId); if (parent.status === 'invalid') { dispose(); return parent; } reservations.push(parent.value); shell = createShell(ownedHost!, instanceId); shell.title.textContent = accepted!.spec.title; shell.description.textContent = accepted!.spec.description ?? '';
    shell.help.textContent = policy.help;
    for (const [element, prefix] of [[shell.base, instanceId + '-v'], [shell.overlay, instanceId + '-i']] as const) { const reservation = reserveInstance(element, prefix); if (reservation.status === 'invalid') { dispose(); return reservation; } reservations.push(reservation.value); const writer = createSvgWriter(element, prefix); if (writer.status === 'invalid') { dispose(); return writer; } if (element === shell.base) base = writer.value; else overlay = writer.value; }
    legend = createLegendView(shell.legend, legendToggle); semantic = createSemanticView(shell); tooltip = createTooltipView(shell); table = policy.table(shell, closeDetail);
    main = createRevisionScheduler({ clock: ports.value.clock, prepare: prepareMain, commit: commitMain, onDiagnostic: report }); interaction = createRevisionScheduler({ clock: ports.value.clock, prepare: prepareDetail, commit: commitDetail, onDiagnostic: report });
    events = attachCartesianInteraction(shell.body, shell.grid, shell.detail, {
      revision: () => committedRevision, enabled: () => !!computed && policy.enabled(computed) && phase === 'active' && !table?.isOpen(),
      pointer(x, y, intent) {
        if (intent === 'hover') { if (gridFocused || pinned || detailFocused()) return; sequence++; wanted = true; detailJob('intent', { x, y }); return; }
        const m = matrix(); if (!m || !computed || !shell) return; const point = mapped(m.inverse(), x, y), target = policy.pick(computed.projection, point.x, point.y);
        sequence++; hover = null; pinned = intent === 'touch' && !!target; events?.pin(pinned, committedRevision); wanted = !!target;
        if (target) { setCurrent(target); suppressFocus = true; shell.grid.focus({ preventScroll: true }); suppressFocus = false; gridFocused = true; semanticUpdate(true); } detailJob(); if (target) activate(target, intent);
      },
      leave() { if (!gridFocused && !pinned && !detailFocused()) { sequence++; hover = null; wanted = false; tooltip?.close(); detailJob(); } },
      focus() { gridFocused = true; if (suppressFocus || !computed) return; if (!current) setCurrent(reconcile(computed.projection)); hover = null; sequence++; wanted = true; semanticUpdate(); detailJob(); },
      blur(next) { gridFocused = false; if (next && shell?.detail.contains(next as Node)) return; if (!pinned) { sequence++; wanted = false; tooltip?.close(); detailJob(); } },
      key(key, control) {
        if (key === 'Escape') { closeDetail(); return true; } if (!computed || !current || computed.description.view !== 'ready') return false;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') { const handled = key !== 'Enter' || !!onActivate; activate(current, 'keyboard'); return handled; }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return false;
        const next = policy.navigate(computed.projection, current, key, control);
        if (next !== null && next !== current) { setCurrent(next); hover = null; pinned = false; events?.pin(false, committedRevision); sequence++; wanted = true; semanticUpdate(true); detailJob(); } return true;
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
    const controller = Object.freeze({ update, refresh() { if (destroyed) return invalid('LIFECYCLE_ERROR', 'DESTROYED', 'controller'); if (phase === 'faulted') return invalid('LIFECYCLE_ERROR', 'FAULTED', 'controller'); measurer?.invalidate(); return submit('paint'); }, getState: () => accepted ? ordered(accepted.state, policy.ids(accepted.spec)) : policy.state([]), getSnapshot: snapshot, destroy });
    releaseExport = provideExport(controller, () => {
      if (phase !== 'active' || !computed || !committed || !shell) return invalid('LIFECYCLE_ERROR', 'EXPORT_UNAVAILABLE', 'controller');
      const c = computed, input = committed, spec = input.spec;
      return ok({ document: shell.root.ownerDocument, instanceId, revision: committedRevision, frame: frame(committedRevision, c.shell.body.width, c.shell.body.height, c.layers, c.axes), layout: c.shell, palette: c.palette, font: c.font, direction: spec.direction ?? 'ltr', title: spec.title, description: spec.description ?? '', context: c.description.context, status: c.status, legend: c.legend, hiddenLegendIds: policy.hidden(input.state), records: () => policy.exportRecords(spec, input.state, c) });
    });
    return ok(controller);
  } catch { dispose(); return invalid('LIFECYCLE_ERROR', 'PLATFORM_UNAVAILABLE', 'host'); }
}
