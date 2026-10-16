import type { ChartDiagnostic, ChartResult, ChartTheme, ChartStatus, ChartDataTable } from '../../public/chart-types.js';
import type { ShellFrame } from '../layout/frame.js';
import type { TextMeasurer } from '../layout/text.js';
import type { Palette, ResolvedFont } from './presentation.js';
import type { AxesPlan } from '../axes/plan.js';
import type { Layers } from '../axes/scene.js';
import type { LegendItem } from '../legend/view.js';
import type { TooltipModel } from '../tooltip/model.js';
import type { Rect } from '../tooltip/place.js';
import type { Shell } from './shell.js';
import type { DataTableView } from '../accessibility/table-frame.js';

/** Private strategy contract: shared resource/DOM lifecycle, family-owned math. */
export type FamilySpec<State> = Readonly<{
  title: string; description?: string; theme?: ChartTheme; direction?: 'ltr' | 'rtl';
  font?: Readonly<{ family?: 'sans-serif' | 'serif' | 'monospace'; size?: number; weight?: 400 | 500 | 600 | 700 }>;
  legend?: Readonly<{ position?: 'bottom' | 'end' | 'none' }>;
  tooltip?: Readonly<{ mode?: string; placement?: 'top' | 'bottom' | 'start' | 'end' }>;
  status?: ChartStatus; state?: Readonly<{ mode: 'internal' }> | Readonly<{ mode: 'controlled'; value: State }>;
}>;
export type FamilyView = 'ready' | 'loading' | 'empty' | 'error' | 'no-visible-slices' | 'no-visible-series';
export type FamilyDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: FamilyView; status: string; context: string; table: ChartDataTable }>;
export type FamilyStateChange<State> = Readonly<{ state: State; effect: 'proposal' | 'accepted'; source: 'legend' | 'update'; revision: number }>;
export type FamilyOptions<State, Activation> = Readonly<{ instanceId: string; initialState?: State; onPointActivate?: (event: Activation) => void; onStateChange?: (event: FamilyStateChange<State>) => void; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type FamilySnapshot = Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; revision: number; committedRevision: number; view: FamilyView | null; size: Readonly<{ width: number; height: number }> }>;
export interface FamilyController<S, State, View extends FamilyView = FamilyView> { update(spec: S): ChartResult<number>; refresh(): ChartResult<number>; getState(): State; getSnapshot(): FamilySnapshot & Readonly<{ view: View | null }>; destroy(): void; }
export type FamilyComputed<P, D extends FamilyDescription> = Readonly<{ shell: ShellFrame; palette: Palette; font: ResolvedFont; projection: P; description: D; layers: Layers; legend: readonly LegendItem[]; status: string; axes?: AxesPlan }>;
export type FamilyTableSource<D> = D & Readonly<{ references: readonly string[] }>;
export type FamilyPolicy<S extends FamilySpec<State>, State, P, Target, D extends FamilyDescription, Activation> = Readonly<{
  parse(input: unknown): ChartResult<S>;
  options(input: unknown, ids: ReadonlySet<string>): ChartResult<FamilyOptions<State, Activation>>;
  validateData(spec: S, state: State): ChartResult<unknown>;
  ids(spec: S): readonly string[];
  hidden(state: State): readonly string[];
  state(hidden: readonly string[]): State;
  names(spec: S): readonly string[];
  compute(spec: S, state: State, shell: ShellFrame, palette: Palette, font: ResolvedFont, measurer: TextMeasurer): ChartResult<FamilyComputed<P, D>>;
  enabled(value: FamilyComputed<P, D>): boolean;
  identity(target: Target): string;
  order(target: Target): number;
  reconcile(projection: P, id: string | null, order: number): Target | null;
  pick(projection: P, x: number, y: number): Target | null;
  navigate(projection: P, target: Target, key: string, control: boolean): Target | null;
  tooltip(value: FamilyComputed<P, D>, target: Target, revision: number): TooltipModel;
  semantic(value: FamilyComputed<P, D>, target: Target): Readonly<{ seriesName: string; row: number; column: number; text: string; detail: string }>;
  dimensions(projection: P): Readonly<{ rows: number; columns: number }>;
  focus(projection: P, target: Target, palette: Palette, layers: Layers): void;
  anchor(projection: P, target: Target): Readonly<{ x: number; y: number }>;
  detailBounds(value: FamilyComputed<P, D>): Readonly<{ plot: Rect; body: Rect }>;
  activate(target: Target, source: 'pointer' | 'touch' | 'keyboard', revision: number): Activation;
  table(shell: Shell, onOpen: () => void): DataTableView<FamilyTableSource<D>>;
  help: string;
}>;
