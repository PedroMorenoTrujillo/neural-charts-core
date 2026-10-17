/** Quantitative stops are opaque sRGB, independent of CSS/browser parsing.
 * Presentation colors used for themes and series follow their own contract. */
export type ChartColorStop = `#${string}` | Readonly<{ r: number; g: number; b: number }>;
export type ChartColorScale =
  | Readonly<{ kind: 'sequential'; domain?: readonly [number, number]; colors: readonly ChartColorStop[]; positions?: readonly number[] }>
  | Readonly<{ kind: 'diverging'; domain: readonly [number, number, number]; colors: readonly [ChartColorStop, ChartColorStop, ChartColorStop] }>
  | Readonly<{ kind: 'threshold'; boundaries: readonly number[]; colors: readonly ChartColorStop[] }>;
