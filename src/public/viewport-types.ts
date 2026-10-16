/** Applied logical data-window constraints. Omitted axes use their full data
 * extent and existing automatic axis presentation. Empty value resets both. */
export type ChartNumericWindow = readonly [number, number];
export type ChartCategoryWindow = Readonly<{ firstId: string; lastId: string }>;
export type ChartAxisWindow = ChartNumericWindow | ChartCategoryWindow;
export type ChartViewportValue<X extends ChartAxisWindow = ChartAxisWindow, Y extends ChartAxisWindow = ChartNumericWindow> = Readonly<{ x?: X; y?: Y }>;
type ViewportInteraction = Readonly<{
  axes: 'x' | 'y' | 'xy';
  gesture?: 'none' | 'pan' | 'zoom';
  wheel?: boolean;
  controls?: boolean;
}>;
export type ChartViewportBinding<X extends ChartAxisWindow = ChartAxisWindow, Y extends ChartAxisWindow = ChartNumericWindow> = false | (ViewportInteraction & (
  | Readonly<{ mode: 'internal'; initial?: ChartViewportValue<X, Y> }>
  | Readonly<{ mode: 'controlled'; value: ChartViewportValue<X, Y> }>
));
export type ChartViewportChange<X extends ChartAxisWindow = ChartAxisWindow, Y extends ChartAxisWindow = ChartNumericWindow> = Readonly<{
  viewport: ChartViewportValue<X, Y>;
  effect: 'proposal' | 'accepted';
  source: 'controls' | 'pointer' | 'wheel' | 'api' | 'update';
  revision: number;
}>;
