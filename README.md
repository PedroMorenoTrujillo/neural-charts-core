# Neural Charts Core

Renderer-independent chart planning and geometry in strict TypeScript. The Core converts source data and a viewport size into a read-only frame that a renderer can paint.

**Version 0.1.0 is experimental.** Public contracts can change before 1.0. Pin the version while integrating a renderer.

Version 0.1.0 replaces the public `kind` discriminator with `type`. This is a breaking contract change from 0.0.24; chart geometry, calculations, source identities and values are unchanged.

## Install

```sh
npm install @neural-charts/core@0.1.0
```

The package ships ESM JavaScript and TypeScript declarations. It has no runtime dependencies, framework peer dependencies, browser globals, native bridges or module initialization side effects. Its declarations compile with `lib: ["ES2022"]`, without DOM types. Development and package verification use Node.js 22 or newer.

## Migrating from 0.0.24

Replace `kind` with `type` in axes, mixed series, waterfall points, colour scales, log scales and public geometry/result discriminators. For example, `axes.x: {kind: 'category', values: [...]}` becomes `axes.x: {type: 'category', values: [...]}`; a mixed series uses `type: 'column'`. Renderers must read `command.type`, `hit.type` and the equivalent returned metadata fields. Legacy-only and dual `kind`/`type` chart configuration is rejected rather than silently translated. Core's top-level chart `family` remains unchanged.

See [the complete discriminator migration](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/type-discriminator-migration.md) for affected result fields and the unchanged mathematical behavior. Update the renderer and its documentation together before installing this version.

## Plan a chart

```ts
import {planChart, type PlanLineSpec, type PlanOptions} from '@neural-charts/core';

const data = {
  family: 'line',
  title: 'Weekly activity',
  axes: {
    x: {
      type: 'category',
      values: [
        {id: 'mon', label: 'Monday'},
        {id: 'tue', label: 'Tuesday'},
        {id: 'wed', label: 'Wednesday'},
      ],
    },
    y: {type: 'linear'},
  },
  series: [{
    id: 'visits',
    name: 'Visits',
    data: [
      {id: 'first', x: 'mon', y: 29},
      {id: 'missing', x: 'tue', y: null},
      {id: 'third', x: 'wed', y: 46},
    ],
  }],
} satisfies PlanLineSpec;

const options = {width: 390, height: 300} satisfies PlanOptions;
const result = planChart(data, options);

if (result.status === 'invalid') {
  // Report the diagnostic to the host; there is no frame to paint.
  const {code, reason, path} = result.diagnostic;
  void [code, reason, path];
} else {
  // Both 'ok' and 'empty' provide a frame.
  const {series, observations, legend} = result.frame;
  void [series, observations, legend];
}
```

`null` means a missing measurement and creates a gap where applicable. Zero remains a measurement. Give series, points and categories stable IDs; keep those IDs when refreshing values so the host can preserve selection and animate updates.

The Core uses `family` as its planning discriminator. A renderer can expose its own developer API, such as Native's `data.type` and grouped `options`, then translate it to this contract. Core planning inputs are not Native component inputs.

## What belongs here

| Core | Renderer and application |
| --- | --- |
| Validation and data normalization | Angular components, signals and change detection |
| Scales, domains, ticks and geometry | SVG, Canvas or native drawing |
| Stacking and statistical derivations | Device fonts, text measurement and label placement policy |
| Visible observations and source identities | Touch, mouse, keyboard and gesture recognition |
| Mathematical viewport transformations | Scroll containers, pinch recognition and fullscreen UI |
| Legend items and projected reference lines | Legend controls, colors, tooltip layout and animation |
| Chart-specific semantic values | Screen reader elements, focus and haptic feedback |

The Core does not mount UI, access a document, measure fonts, register listeners or start animation loops. A `PlanFrame` is a geometry and semantic contract, not an accessible UI by itself. Native and Web integrations need their own rendering, accessibility, interaction and performance tests.

## Public API

Both `@neural-charts/core` and `@neural-charts/core/plan` export `planChart`, `transformPlanViewport`, `prepareWordCloudMeasurements` and their types. Other internal files are not supported imports.

### `planChart(spec: PlanSpec, options: PlanOptions): PlanResult`

Planning is synchronous. Inputs are owned internally so subsequent caller mutations do not mutate a returned frame. Successful frames are frozen. Treat specs and options as immutable application state; replan when relevant data, visibility, domain or dimensions change.

| `PlanOptions` property | Type | Behavior |
| --- | --- | --- |
| `width`, `height` | `number` | Required logical dimensions, each finite and between 64 and 10,000 inclusive. |
| `hiddenSeriesIds` | `readonly string[]` | Series or legend identities to hide. IDs come from the current frame's legend. |
| `stacking` | `'sum' \| 'percent'` | Available for `area`, `column` and `pictorial`. Horizontal columns retain bar orientation. Other families return an invalid result. |
| `viewport` | `PlanViewportConfig` | Enabled axes and optional controlled data-domain window. See viewport example below. |
| `references` | `readonly PlanReference[]` | Named X/Y reference values, projected where supported by the family. Style and label rendering belong to the host. |
| `referenceBands` | `readonly PlanReferenceBand[]` | Up to 32 named intervals in represented axis units; clipped boxes retain their original endpoints. Paint belongs to the host. |
| `scales` | `PlanScales` | Optional base-10 logarithmic X/Y projection for line, scatter and bubble. Original values stay unchanged; known log coordinates, domains and decorations must be positive. |
| `hierarchy` | `PlanHierarchyLayoutOptions` | Horizontal or vertical layout for treegraph and organization. Keeps original topology and a physical XY viewport. |

Unknown top-level planning options are rejected. Chart-specific validators also reject unsupported shapes and invalid values. TypeScript types help at build time; inspect the result for untrusted or remote data at runtime.

`PlanResult` is a discriminated union:

```ts
type PlanResult =
  | Readonly<{status: 'ok' | 'empty'; frame: PlanFrame}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
```

An empty result still supplies dimensions, family and legend state. It is useful when all series are hidden or no usable observations remain. Inspect the family-specific roles before replacing the drawing: a Tilemap with only missing measurements can still provide cells in the configured missing color. Explain the absence of measured values without inventing numeric observations. Diagnostics include `code`, `reason`, `message` and `path`; paths identify the offending input or option.

The frame's `schema` is `nc-plan/1`. It contains dimensions, title, description, unit, legend, series geometry, observations, grid and category labels. Depending on the family, it can additionally provide hit regions, annotations, secondary grid, a distribution summary, viewport state or projected references. Paths are structured `PlanCommand` values. Bars, circles and other primitives retain the identities needed to relate painted geometry back to source data.

Use the exported `PlanFrame`, `PlanSeries`, `PlanObservation`, `PlanLegendItem`, `PlanBar`, `PlanCircle`, `PlanHitRegion` and `PlanAnnotation` types in renderer code. See [the complete input and output interfaces](src/public/plan-types.ts) and [public exports](src/plan.ts) for every property and union member.

For relationship diagrams, `series.areaCommands` contains link ribbons and `series.nodeCommands` contains node sectors. Paint ribbons first and solid node sectors/circles afterwards; keep both roles in the same coordinate frame. Do not recover node geometry by splitting a concatenated path. Observations retain their source identities and expose typed `relationship` metadata for node/link details.

Handle every `PlanCommand` variant explicitly: `M`, `L`, `A`, `Q` and `Z`. A `Q` command has the quadratic control point `cx, cy` and endpoint `x, y`. An `A` command uses `radius` on X and optional `radiusY` on Y; when `radiusY` is absent, use `radius` on both axes. Ellipse rotation is zero. Renderers that previously handled only circular `A` commands and straight segments must support these fields before consuming the new relationship frames. Radial ribbons use circular ports and quadratic connectors; arc diagrams use exact elliptical band sides instead of drawing sampled polygon edges.

Relationship hit polygons remain bounded lookup approximations with at most 34 vertices. They retain the same source identities and sampled boundaries, but are not the visible analytic curves. Do not render them as the ribbon or assume subpixel agreement at every viewport size; a broad radial port can differ visibly from its low-resolution hit polygon. Device touch acceptance and any requirement for exact curved-edge hit testing must be verified by the renderer separately. This change does not certify mobile frame time or physical-device behavior.

### Grouped stacks and independent mixed axes

Column series can form adjacent sum/percent stacks with `options.stackGroups`, a strict partition of all original series. Mixed charts can declare `axes.secondaryY` and assign series to `yAxis:'secondary'`, preserving original values and one shared category frame. `frame.stackGroups` and `frame.mixedAxes` carry renderer ownership; these are not overlay shortcuts. See [complete contracts, typed examples, limits and incompatible options](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/composition-contract.md).

### `transformPlanViewport(state, intent): PlanViewportResult`

Transforms an existing frame's viewport state into a new controlled window. It does not detect gestures or mutate a chart. The renderer turns a pan or pinch into an intent, applies the returned value to its options, and calls `planChart` again.

```ts
import {planChart, transformPlanViewport, type PlanSpec} from '@neural-charts/core';

export function zoomIn(spec: PlanSpec) {
  const result = planChart(spec, {
    width: 390,
    height: 300,
    viewport: {axes: 'x'},
  });
  if (result.status === 'invalid' || !result.frame.viewport) return result;

  const next = transformPlanViewport(result.frame.viewport, {
    type: 'zoom',
    factor: 2,
  });
  if (next.status === 'invalid') return next;

  return planChart(spec, {
    width: 390,
    height: 300,
    viewport: {axes: 'x', value: next.value},
  });
}
```

Supported intents are `zoom` (factor and optional anchor), `pan` (axis deltas), `transform` (combined factor, anchor and deltas), and `reset`. Windows are constrained by the supplied viewport state. X can be numeric, time or categorical where the family supports it; Y windows are numeric where supported.

Anchors are normalized fractions in `[0, 1]`, ordered from the beginning to the end of the displayed domain/window; the default is `0.5`. They are not timestamps or pixel coordinates. Pan deltas are finite fractions of the currently displayed span: positive moves toward larger domain values or later category IDs, and negative toward earlier ones, subject to bounds. For example, a numeric window `[20, 60]` panned by `0.25` becomes `[30, 70]` when the full bounds permit it. The renderer converts finger movement and reversed screen axes to these domain-order fractions. A zoom factor above 1 zooms in; below 1 zooms out. A combined transform applies its pan to the zoomed window. This helper does not implement radial or hierarchy navigation.

### Reference lines

```ts
import type {PlanOptions} from '@neural-charts/core';

const options = {
  width: 390,
  height: 300,
  references: [
    {id: 'target', axis: 'y', value: 40},
    {id: 'milestone', axis: 'x', value: 'wed'},
  ],
} satisfies PlanOptions;
```

A reference has a stable ID, an axis and a value. X accepts a category ID or numeric coordinate; Y accepts a number. Inspect each projected reference's status before painting it. References outside a domain or incompatible with a chart must not be painted as if they were visible. They do not supply colors, text styling or drag handles.

### Reference bands

```ts
import type {PlanReferenceBand} from '@neural-charts/core/plan';

const referenceBands = [
  {id: 'target', axis: 'y', from: 40, to: 60},
  {id: 'campaign', axis: 'x', from: 'mon', to: 'fri'},
] as const satisfies readonly PlanReferenceBand[];
```

Pass these intervals in `PlanOptions.referenceBands`. Render only bands whose
`status` is `visible`, using their clipped `box`. An interval outside the window
is `outside`; an empty or fully hidden source produces `unavailable`. Bands do
not expand domains, add observations or become legend/tooltip targets.

Category endpoints are inclusive source IDs, including a single category.
Numeric and time endpoints must increase. Logical X remains categorical in
horizontal bars. Y bands use the displayed axis units: percent-stacked charts
use percentages, without changing the raw observations. A secondary mixed Y
band explicitly sets `valueAxis: 'secondary'`.

Supported owners are line, area, spline, area spline, column/bar, mixed,
scatter and bubble. Other families reject this option. Colors, opacity and
annotation layout belong to the renderer. See the
[complete contract](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/reference-bands-contract.md)
for limits and incompatible inputs.

### Logarithmic axes

```ts
import {planChart, type PlanLineSpec, type PlanScales} from '@neural-charts/core';

const source = {
  family: 'line', title: 'Orders',
  axes: {x: {type: 'linear'}, y: {type: 'linear'}},
  series: [{id: 'orders', name: 'Orders', data: [
    {id: 'a', x: 1, y: 1}, {id: 'b', x: 2, y: 10}, {id: 'c', x: 3, y: 100},
  ]}],
} as const satisfies PlanLineSpec;
const scales = {y: {type: 'log', base: 10}} as const satisfies PlanScales;
const result = planChart(source, {width: 390, height: 300, scales, viewport: {axes: 'y'}});
```

The numeric input axes still describe original source coordinates. `scales`
changes projection; it never replaces observations with logarithms. Logarithmic
viewport bounds add `type: 'log'` to `PlanViewportAxis`; use
`transformPlanViewport` for multiplicative zoom and pan. Stacking, zero/negative
known log coordinates and unsupported chart families are explicit errors. See
the [logarithmic contract](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/logarithmic-contract.md)
for gaps, clipping, reversed axes, precision and original-unit decorations.

## Supported planning families

The current contract produces 62 frame families. These are planning capabilities; inclusion does not certify a renderer's feature parity or device performance.

| Family | Input | Notes |
| --- | --- | --- |
| Line | `PlanLineSpec` | Ordered XY series, category/numeric/time X, missing-value gaps. |
| Area | `PlanAreaSpec` | Filled series; optional sum or percent stacking. |
| Spline | `PlanSplineSpec` | Smooth outline with gap preservation. |
| Area spline | `PlanAreaSplineSpec` | Smooth outline and fill. |
| Streamgraph | `PlanStreamgraphSpec` | Centered stacked bands. |
| Column / bar | `PlanColumnSpec` | Vertical/horizontal orientation; grouped or stacked. Both use `family: 'column'` input. |
| Lollipop | `PlanLollipopSpec` | Value stems and markers. |
| Dumbbell | `PlanDumbbellSpec` | Linked low/high values. |
| Column pyramid | `PlanColumnPyramidSpec` | Tapered column geometry. |
| Area range / area spline range / column range | `PlanRangeSpec` | Typed low/high observations; discriminate with the family. |
| Box plot | `PlanBoxplotSpec` | Low, Q1, median, Q3, high; source statistics stay explicit. |
| Error bar | `PlanErrorbarSpec` | Low/high uncertainty intervals. |
| Histogram | `PlanHistogramSpec` | Bins derived from source measurements, with distribution summary. |
| Bell curve | `PlanBellcurveSpec` | Normal-density derivation from source measurements. |
| Scatter | `PlanScatterSpec` | Numeric XY observations. |
| Bubble | `PlanBubbleSpec` | Numeric XY and a size dimension. |
| Polygon | `PlanPolygonSpec` | Ordered filled polygon geometry. |
| Vector | `PlanVectorSpec` | Anchored directional values. |
| Wind barb | `PlanWindbarbSpec` | Directional wind glyphs and source magnitude. |
| Pie | `PlanPieSpec` | Scalar parts. |
| Donut | `PlanDonutSpec` | Scalar parts around an inner radius. |
| Variable pie | `PlanVariablePieSpec` | Angular value and variable radius. |
| Item | `PlanItemSpec` | Discrete item representation. |
| Gauge | `PlanGaugeSpec` | Scalar value in an explicit domain. |
| Mixed | `PlanMixedSpec` | Shared-frame composition. Not every family combination is supported. |
| Pareto | `PlanParetoSpec` | Ranked columns and cumulative percentage line. |
| Waterfall | `PlanWaterfallSpec` | Changes and explicit intermediate/final totals. |
| X-range | `PlanXRangeSpec` | Source start/end intervals on named rows, optional completion and grouped/overlapping lanes. |
| Timeline | `PlanTimelineSpec` | Numeric or UTC events with original titles/descriptions and bounded labels. |
| Bullet | `PlanBulletSpec` | Original measures and targets, with qualitative bands as separate decorations. |
| Variwide | `PlanVariwideSpec` | Category widths proportional to original nonnegative Z values, with independent signed Y values. |
| Dependency Wheel | `PlanDependencyWheelSpec` | Weighted directed relationships, including cycles, on radial node ports. |
| Chord | `PlanChordSpec` | Weighted undirected relationships sharing the radial layout engine. |
| Arc Diagram | `PlanArcDiagramSpec` | Original node order with weighted arcs and bounded node sizes. |
| Word Cloud | `PlanWordCloudSpec` | Deterministic bounded packing using actual renderer-supplied text measurements. |
| Pictorial | `PlanPictorialSpec` | Grouped or stacked height bands clipped to original vector silhouettes, including holes. |
| Tilemap | `PlanTilemapSpec` | Integer lattice cells in four actual shapes, with continuous or class-based value colors. |
| Heatmap | `PlanHeatmapSpec` | Sparse category matrices with exact rectangular ownership and a quantitative color axis. |
| Contour | `PlanContourSpec` | Isolines derived from original scalar grids and explicit thresholds. |
| Venn | `PlanVennSpec` | Explicit inclusive measurements for up to three sets; bounded Euler relationships. |
| Radar | `PlanRadarSpec` | Values across named radial dimensions. |
| Polar | `PlanPolarSpec` | Polar series and grid. |
| Wind rose | `PlanWindRoseSpec` | Ordered directions and truly stacked frequency bands, by sum or percentage. |
| Radial bar | `PlanRadialBarSpec` | Concentric progress bands with a common angle scale and exact annular hits. |
| Parallel coordinates | `PlanParallelSpec` | Independent linear dimensions, in Cartesian or polar coordinates; per-axis domains and units. |
| Fan | `PlanFanSpec` | Caller-supplied nested uncertainty intervals and central estimates in one range frame. |
| Regression | `PlanRegressionSpec` | Original XY samples with explicitly derived ordinary least-squares models in one scatter frame. |
| Flame | `PlanFlameSpec` | Original single-thread call intervals, derived stack depth and exclusive duration. |
| Violin | `PlanViolinSpec` | Raw sample groups, compact-kernel density and explicitly derived statistical summaries. |
| Dendrogram | `PlanDendrogramSpec` | Ordered clustering tree with aligned leaves and source merge heights, or explicitly derived topology levels. |
| Funnel | `PlanFunnelSpec` | Stages with width proportional to value. |
| Pyramid | `PlanPyramidSpec` | Ordered stage geometry. |
| Treemap | `PlanTreemapSpec` | Rectangular hierarchy. |
| Sunburst | `PlanSunburstSpec` | Nested radial hierarchy. |
| Tree graph / organization | `PlanTreegraphSpec` / `PlanOrganizationSpec` | Typed hierarchy nodes and links. |
| Network graph | `PlanNetworkgraphSpec` | Nodes and links with bounded layout work. |
| Packed bubble | `PlanPackedBubbleSpec` | Packed scalar values, grouped by series. |
| Sankey | `PlanSankeySpec` | Weighted directed acyclic flows, horizontal or vertical nodes and filled links. |

Each input is a strict discriminated interface. Do not build a single object containing every family's properties or use casts to force an unsupported combination. Scalar parts, measured XY series, ranges, directional values and hierarchy nodes have different data semantics.

### Pictorial: filled silhouette heights

Pictorial fills an original vector silhouette to the height represented by each value. Grouped series have separate silhouettes; sum and percent stacks divide one silhouette into actual contiguous bands. The filled geometry respects holes. Height proportion does not claim area proportion or the physical volume of a bottle-like shape.

```ts
import {planChart, type PlanPictorialSpec} from '@neural-charts/core/plan';

const workItems = {
  family: 'pictorial',
  title: 'Work items',
  axes: {
    x: {type: 'category', values: [
      {id: 'design', label: 'Design'},
      {id: 'development', label: 'Development'},
    ]},
    y: {type: 'linear', unit: 'items'},
  },
  series: [
    {id: 'done', name: 'Done', data: [
      {id: 'design-done', x: 'design', y: 6},
      {id: 'development-done', x: 'development', y: 3},
    ]},
    {id: 'remaining', name: 'Remaining', data: [
      {id: 'design-remaining', x: 'design', y: 4},
      {id: 'development-remaining', x: 'development', y: 7},
    ]},
  ],
  pictorial: {shape: {type: 'preset', name: 'person'}, gap: 8, background: true},
} satisfies PlanPictorialSpec;

const grouped = planChart(workItems, {width: 320, height: 320});
const absoluteStack = planChart(workItems, {width: 320, height: 320, stacking: 'sum'});
const percentageStack = planChart(workItems, {width: 320, height: 320, stacking: 'percent'});

for (const result of [grouped, absoluteStack, percentageStack]) {
  if (result.status === 'invalid') throw new Error(result.diagnostic.reason);
}
```

An explicit `axes.y.domain: [0, capacity]` is the single capacity authority for grouped or absolute stacks. Without it, capacity comes from the original maximum value or category sum and stays fixed when series are hidden. Percent mode rejects an explicit raw domain. It retains original values and exposes percentages separately; unknown or absent members make the known-subset percentage incomplete. Zero has no fabricated colored area, and `null` stays unknown. Positive values too small to produce distinct geometry remain positive with a `noInk` decision. A bounded sum-only floating-point residue is exposed as `capacityRoundoff`; true excess and individual values above capacity still reject.

Presets are `person`, `bottle` and `heart`. A custom shape is a normalized conforming triangular mesh, with at most 192 vertices and 64 non-overlapping triangles. The source accepts at most eight series, 32 categories and 64 original points. These are hard bounds, not a promise that the densest combination is readable or fast on every phone. No SVG/XML parser, external icon URL or platform clipping API is involved. The [Pictorial contract](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/pictorial-contract.md) describes mesh validation and complete source/geometry properties.

Render `pictorialGlyphs` backgrounds separately from `pictorialFills` in the real data series. Glyph identities are typed category/series objects; they are not source point IDs. `compoundPolygon` is an additional public hit-region variant: test the actual filled pieces so a hole never becomes a clickable bounding box. Renderers must handle this union member explicitly before consuming the new geometry. Original values, missing members, totals, capacity and completeness remain available in `pictorialData` and `pictorialLayout`. Initial Pictorial planning rejects viewport zoom, references, negative values and unrelated shapes per series. It does not supply shared-X groups, so hosts must keep that tooltip mode unavailable.

### Tilemap: shaped lattice cells

Tilemap projects original integer X/Y positions into a fitted lattice. The color represents the original measured value; cell position is not a second numeric measurement. Shapes are actual hexagons, circles, diamonds or squares.

```ts
import {planChart, type PlanTilemapSpec} from '@neural-charts/core/plan';

const latency = {
  family: 'tilemap',
  title: 'Service latency',
  unit: 'ms',
  tileShape: 'hexagon',
  series: [{id: 'services', name: 'Latency', data: [
    {id: 'a', x: 0, y: 0, name: 'Service A', value: 0},
    {id: 'b', x: 1, y: 0, name: 'Service B', value: 24},
    {id: 'c', x: 2, y: 0, name: 'Service C', value: null},
  ]}],
  colorAxis: {
    type: 'continuous',
    stops: [{at: 0, color: '#DCE8FA'}, {at: 1, color: '#2F6FD4'}],
    missingColor: '#E5E7EB',
  },
} satisfies PlanTilemapSpec;

const tiles = planChart(latency, {width: 390, height: 320});
if (tiles.status === 'invalid') throw new Error(tiles.diagnostic.reason);
const {cells} = tiles.frame.series[0]!;
void cells;
```

The single source series accepts at most 2,048 cells. `series.cells` contains projected paint and actual polygon/circle geometry. Numeric observations preserve source IDs, lattice coordinates and values; a missing value can retain its missing-color cell but does not become a numeric observation or hit target. Known zero remains selectable. `tilemapData` records the original data and visibility decisions, and `tilemapLayout` distinguishes no source, all missing, all hidden, no visible ink and ready states.

Continuous color domains derive from all original known values and remain stable when visibility changes. An explicit domain clamps color mapping without rewriting source values. A `classes` color axis uses named half-open intervals and an explicit `unclassifiedColor`; a value outside every class stays a known, selectable value. The host paints the `colorAxis` legend and supplies accessible source values. Tilemap does not support axes, references, stacking or viewport zoom. See the [Tilemap contract](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/tilemap-contract.md) for limits, spacing and complete types.

### Word Cloud: measured text

Word Cloud needs actual text measurements from its renderer. Core never estimates text width from character counts and never accesses fonts, browser APIs or native views. Prepare the bounded measurement requests, measure them with the same resolved font and logical units used for drawing, then pass the measurements into the final plan.

```ts
import {
  planChart,
  prepareWordCloudMeasurements,
  type PlanWordCloudMeasurementRequest,
  type PlanWordCloudSpec,
} from '@neural-charts/core/plan';

const cloudSpec = {
  family: 'wordcloud',
  title: 'Topics',
  words: [
    {id: 'design', text: 'Design', weight: 12},
    {id: 'engineering', text: 'Engineering', weight: 8},
    {id: 'research', text: 'Research', weight: 5},
  ],
  minFontSize: 16,
  maxFontSize: 36,
  rotations: [0, 90],
  seed: 7,
} satisfies PlanWordCloudSpec;

async function planMeasuredCloud(
  measure: (request: PlanWordCloudMeasurementRequest) => Promise<{
    readonly width: number;
    readonly height: number;
  }>,
) {
  const dimensions = {width: 320, height: 240};
  const fontKey = 'resolved-body-font:revision-1';
  const prepared = prepareWordCloudMeasurements(cloudSpec, {...dimensions, fontKey});
  if (prepared.status === 'invalid') throw new Error(prepared.diagnostic.code);
  const measurements = await Promise.all(prepared.preparation.requests.map(async request => ({
    ...request,
    ...await measure(request),
  })));
  return planChart(cloudSpec, {
    ...dimensions,
    wordcloudText: {fontKey, measurements},
  });
}
```

`measure` is supplied by the renderer; the example does not substitute synthetic bounds for real font measurements. `fontKey` is an opaque cache identity for the resolved font, style and accessibility scale. It is not a CSS font declaration. Reject stale asynchronous batches when the source, available space or resolved font changes. Cache measurements locally with a bounded capacity; pointer movement and color changes should not measure text again.

The source accepts up to 2,048 words and selects at most 128 measurement candidates. Packing has a deterministic global budget of 32,768 attempts. Each word keeps its stable ID, original text and weight; unknown, zero, hidden, budget-excluded, inkless and non-fitting words remain distinguishable in `wordcloudData`. Positive words that do not fit are not reported as missing source data. Core does not silently shrink below `minFontSize`.

Render `textGlyphs` directly using their measured logical size, center, rotation and bounds. Use native text nodes or escaped text when serializing SVG; source text must never be interpreted as markup. The final plan requires measurements matching the exact requested ID, text, size and font key. `wordcloudText` is rejected for other families. This family does not support Cartesian axes, references, viewport zoom or stacking.

### Dependency Wheel: directed relationships

```ts
import {planChart, type PlanDependencyWheelSpec} from '@neural-charts/core';

const data = {
  family: 'dependencywheel', title: 'Measured exchanges',
  nodes: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}, {id: 'c', label: 'C'}],
  links: [
    {id: 'a-b', from: 'a', to: 'b', value: 12},
    {id: 'b-c', from: 'b', to: 'c', value: 8},
    {id: 'c-a', from: 'c', to: 'a', value: 4},
  ],
  startAngle: 0, nodeWidth: 14, nodePadding: 2,
} satisfies PlanDependencyWheelSpec;

const result = planChart(data, {width: 390, height: 320});
if (result.status !== 'invalid') {
  const {series, observations} = result.frame;
  // Node sectors and link ribbons can use different paint opacity.
  void series.map(item => [item.nodeCommands, item.areaCommands]);
  void observations.map(point => point.relationship);
}
```

### Chord: undirected relationships

```ts
import {planChart, type PlanChordSpec} from '@neural-charts/core';

const data = {
  family: 'chord', title: 'Shared work',
  nodes: [{id: 'design', label: 'Design'}, {id: 'product', label: 'Product'}, {id: 'support', label: 'Support'}],
  links: [
    {id: 'design-product', from: 'design', to: 'product', value: 18},
    {id: 'product-support', from: 'product', to: 'support', value: 10},
    {id: 'support-design', from: 'support', to: 'design', value: 6},
  ],
} satisfies PlanChordSpec;

const result = planChart(data, {width: 390, height: 320});
if (result.status !== 'invalid') {
  // Use incident totals; these links do not imply incoming/outgoing direction.
  const nodes = result.frame.observations.filter(point => point.relationship?.type === 'node');
  void nodes;
}
```

### Arc Diagram: ordered relationships

```ts
import {planChart, type PlanArcDiagramSpec} from '@neural-charts/core';

const data = {
  family: 'arcdiagram', title: 'Connections along a process',
  nodes: [{id: 'capture', label: 'Capture'}, {id: 'prepare', label: 'Prepare'}, {id: 'review', label: 'Review'}],
  links: [
    {id: 'capture-prepare', from: 'capture', to: 'prepare', value: 14},
    {id: 'prepare-review', from: 'prepare', to: 'review', value: 9},
    {id: 'capture-review', from: 'capture', to: 'review', value: 3},
  ],
  nodeRadius: 6, linkWidth: 12, reversed: false,
} satisfies PlanArcDiagramSpec;

const result = planChart(data, {width: 390, height: 260});
if (result.status !== 'invalid') {
  // Render the supplied effective circles; dense layouts can reduce their radii.
  void result.frame.series.map(series => series.circles);
}
```

These three families accept up to 64 nodes, 256 links and 15 explicit groups plus an implicit default group. Node, link and group IDs have a 128-character limit; node/link IDs must be globally unique. Links reference existing distinct nodes and supply a nonnegative value or `null`. Missing values remain unknown, and zero links do not acquire a fictitious positive ribbon. Subpixel quantities keep exact source values and `relationship.geometryOmitted` metadata for inspection and navigation.

Dependency Wheel preserves direction; Chord and Arc Diagram expose undirected incident totals. Optional groups control visibility from source data and recalculate visible quantities. Unknown or duplicate hidden group IDs are rejected. `startAngle` is measured clockwise from twelve o'clock; sector hit regions use the same bearing convention as the visible geometry. Arc Diagram preserves the supplied node order; `reversed` changes the side on which arcs are drawn. Its `nodeRadius` is a requested maximum (2–24 logical pixels), reduced when necessary to avoid overlapping nodes. Source identities are retained when dense labels or subpixel glyphs cannot be individually read. Axes, Cartesian references, viewport transforms and stacking are unsupported for these initial relationship contracts.

### Bullet measures and targets

Grouped observations share the category's axis coordinate in `group`, while their individual anchors retain the separate bar or target positions. This also holds after hiding a series, reversing the category axis or changing orientation.

```ts
import {planChart, type PlanBulletSpec} from '@neural-charts/core';

const data = {
  family: 'bullet', title: 'Service coverage', orientation: 'horizontal',
  axes: {
    x: {type: 'category', values: [{id: 'support', label: 'Support'}]},
    y: {type: 'linear', domain: [0, 100], unit: '%'},
  },
  series: [{id: 'coverage', name: 'Coverage', data: [
    {id: 'support-coverage', x: 'support', y: 72, target: 80},
  ]}],
  bands: [
    {id: 'low', from: 0, to: 60, label: 'Needs attention'},
    {id: 'expected', from: 60, to: 80, label: 'Expected'},
    {id: 'high', from: 80, to: 100, label: 'High'},
  ],
} satisfies PlanBulletSpec;

const result = planChart(data, {width: 390, height: 260});
if (result.status !== 'invalid') {
  // Paint bands, measures and target lines in the same coordinate frame.
  const {series, observations, bulletBands, bulletTargets, bulletGrid} = result.frame;
  void [series, observations, bulletBands, bulletTargets, bulletGrid];
}
```

Bullet accepts up to 64 categories, 16 series and 1,024 points in total. A missing measure can still have a known target; an omitted target, `null` target and target zero remain distinct. Bands are decorations: they do not create observations, series, legend items or inferred domain values. Provide an explicit numeric domain when qualitative bands must remain in view. Stacking and viewport transforms are rejected; X/Y reference lines use the source axis semantics, including horizontal orientation.

### Variwide widths and values

```ts
import {planChart, type PlanVariwideSpec} from '@neural-charts/core';

const data = {
  family: 'variwide', title: 'Output and share',
  axes: {
    x: {type: 'category', values: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]},
    y: {type: 'linear', domain: [-10, 10]},
  },
  series: [{id: 'output', name: 'Output', data: [
    {id: 'output-a', x: 'a', y: 3, z: 2},
    {id: 'output-b', x: 'b', y: -6, z: 8},
  ]}],
} satisfies PlanVariwideSpec;

const result = planChart(data, {width: 390, height: 300});
if (result.status !== 'invalid') {
  // Read the actual weighted X bands; do not replace them with equal-width slots.
  const {series, categoryBands, variwideData, variwideLayout} = result.frame;
  void [series, categoryBands, variwideData, variwideLayout];
}
```

Variwide accepts one series and up to 64 categories/points. `z` controls width and must be nonnegative or `null`; `y` controls signed height. Zero width, unknown width, a missing category point and geometry below drawing precision have explicit states in `categoryBands`. Unknown widths set `variwideLayout.incomplete`; a chart without positive known width reports `no-positive-width`. Only numeric Y zoom/pan is supported. References accept original category X IDs or numeric Y values. X zoom, multiple series and stacking are rejected.

### Sankey data and constraints

```ts
import {planChart, type PlanSankeySpec} from '@neural-charts/core';

const data = {
  family: 'sankey',
  title: 'Measured energy flow',
  nodes: [
    {id: 'source', label: 'Source'},
    {id: 'useful', label: 'Useful energy'},
    {id: 'losses', label: 'Losses'},
  ],
  links: [
    {id: 'supply', from: 'source', to: 'useful', value: 80},
    {id: 'loss', from: 'source', to: 'losses', value: 20},
  ],
  orientation: 'horizontal',
} satisfies PlanSankeySpec;

const result = planChart(data, {width: 390, height: 300});
void result;
```

Nodes have stable IDs and labels; links have stable IDs, source/target node IDs and a nonnegative numeric value or `null`. A missing link value stays unknown, rather than becoming a fabricated flow. Node observations report known incoming/outgoing amounts; link observations retain their source and target identities. Zero contributes no flow width.

Sankey is bounded to 128 nodes, 512 links and 16 optional groups. Node and link IDs must be globally unique. Endpoints must exist; cycles and self-links are invalid. `orientation` accepts `horizontal` or `vertical`; `nodeWidth` and `nodePadding` configure layout. Link thickness represents value and joins the corresponding node faces. The planner does not balance inconsistent source measurements or invent an unmeasured remainder.

Geometry that cannot be represented at the projected precision can be omitted. Such observations keep their exact value and identity and expose `sankey.geometryOmitted: true`, without a painted shape or geometric hit region. The host must keep the value available through data inspection and accessible navigation. Very thin ribbons below 0.0002 logical pixels are not widened to fabricate visible flow. Hidden groups recalculate the scale from the remaining visible flows while validation still checks the full input, including hidden values.

Optional groups use the exported `PlanHierarchyGroup` shape and a node's `groupId`. Legend visibility, viewport clipping and semantic hit regions remain part of the shared plan contract. Stacking and Cartesian reference lines are incompatible with Sankey. A renderer must provide readable labels and accessible selection for narrow links; the Core's geometric output does not guarantee an adequate touch target on its own.

### X-range intervals

```ts
import {planChart, type PlanXRangeSpec} from '@neural-charts/core';

const data = {
  family: 'xrange',
  title: 'Service windows',
  axes: {
    x: {type: 'time'},
    y: {type: 'category', values: [{id: 'north', label: 'North'}]},
  },
  series: [{id: 'service', name: 'Service', data: [
    {id: 'inspection', rowId: 'north', start: Date.UTC(2026, 0, 5), end: Date.UTC(2026, 0, 7), completed: 0.5},
  ]}],
  grouping: 'grouped',
} satisfies PlanXRangeSpec;

const result = planChart(data, {width: 390, height: 300});
void result;
```

X-range accepts up to 256 named rows, 16 series and 2,048 intervals in total. `axes.x` is a discriminated `PlanTemporalAxis`: `linear` coordinates can specify a unit and `includeZero`; `time` coordinates are UTC epoch milliseconds and cannot specify either property. Optional domains are numeric pairs; `reversed` and `nice` control direction and tick-domain planning. Rows have independent stable IDs and labels, with optional reversed ordering on Y.

Every interval retains its `id`, `rowId`, original `start` and `end`. Endpoints are numbers or `null`; unknown endpoints yield a missing summary rather than a zero-duration observation. A measured interval requires `end >= start` and a representable duration. Equal endpoints produce a marker at the actual coordinate. `completed` is optional: omit it for a plain interval, use a number in `[0, 1]` for known completion, or `null` for unknown completion. Unknown completion must not be announced as 0%. The full outline and proportional fill share the same source identity.

`grouping` is `grouped` or `overlap`; `rowPadding` is between 0 and 0.9. The frame exposes `intervals` source summaries, including hidden and missing data. Their `visible` property means the series is enabled in the legend, independently of viewport clipping. Their `missing` property means an endpoint is unknown. Observations with geometry additionally expose `interval` with original endpoints, duration, row identity and completion. Preserve the original data in the host for inspection and accessible alternatives.

### Timeline events

```ts
import {planChart, type PlanTimelineSpec} from '@neural-charts/core';

const data = {
  family: 'timeline',
  title: 'Milestones',
  axes: {x: {type: 'time'}},
  series: [{id: 'events', name: 'Events', data: [
    {id: 'opened', x: Date.UTC(2026, 0, 5), title: 'Opened', description: 'Original event description'},
    {id: 'pending', x: null, title: 'Date not yet known'},
  ]}],
  labelPosition: 'alternate',
} satisfies PlanTimelineSpec;

const result = planChart(data, {width: 390, height: 300});
void result;
```

Timeline supports up to 16 series and 2,048 events. An event has a stable ID, numeric coordinate or UTC timestamp, title, and optional description. An unknown coordinate stays `null` in the source summary and creates no fabricated event marker. The frame's `events` summaries preserve hidden/missing items; `visible` tracks legend visibility and `missing` tracks a null coordinate. Planned observations expose `event` with the original coordinate, title and description.

`labelPosition` is `alternate`, `above` or `below`; `labelMaxWidth` is between 24 and 240 logical pixels and `markerRadius` between 0 and 16. At most 128 labels are planned even when more markers are visible. These labels are approximate placement hints; native font metrics, final collision handling and full accessible event text remain renderer responsibilities.

Both temporal families accept X reference lines and X viewport navigation. Y/XY viewport requests, Y references and stacking are incompatible and return diagnostics. Category-row scrolling is a host layout concern. Their structured planning output does not implement project scheduling or task dependencies.

### Current boundaries

- Sum/percent stacking is an explicit option for area and column inputs. Wind rose declares its own radial `stacking` property. Streamgraph has its own stacking model. Other families do not inherit stacking simply because they paint a path.
- Mixed planning uses the supported series composition in `PlanMixedSpec`. Independent arbitrary multi-axis composition and arbitrary radial/Cartesian overlays are not part of this release. Pareto supplies its own cumulative scale.
- A frame's observations describe the planned visible geometry. Preserve the original data separately for full-resolution inspection, exports and domain changes.
- No Core-side universal point downsampling is promised. A host must set a display budget appropriate to its device and viewport, preserve important extremes/gaps, and expose original values when aggregating. Do not silently replace data with demo values.
- Text labels are planning hints; final font metrics, truncation, collision handling and accessible full values belong to the renderer. Core does not measure Canvas or native fonts.
- Tooltip pinning, animation, collision avoidance, shared-tooltip composition, haptics, scrolling and selection persistence are renderer/controller responsibilities.
- Heatmap exposes sparse category matrices through `@neural-charts/core/plan`; see its limits below. Maps, Gantt and 3D are outside this package's current planning surface.

## Performance and integration

Planning runs synchronously and copies/validates its inputs. Avoid calling it on every UI read. Cache a plan by immutable data, options and logical size; paint or move a tooltip without replanning the source. Coalesce high-frequency gesture events in the host. Run expensive work outside interaction-critical paths where the target runtime permits it.

Bound the number of displayed observations and geometry commands. An input that passes mathematical validation is not a promise of acceptable memory use on every phone. Profile the whole integration, including bridge traffic, painting, accessibility elements and animation allocations. Node test timings are not device frame-rate measurements.

For SSR, call the planner with explicit dimensions; it does not measure a host element. Hydration and responsive measurement remain the Web renderer's responsibility. For Native, test the actual JavaScript runtime and rendering bridge on iOS and Android. Keep native APIs out of the Core when adding features.

## Development

```sh
npm ci
npm run build
npm test
npm run check
```

- `build`: emits ESM and declarations with strict TypeScript and ES2022-only libraries.
- `test`: runs finite unit/property tests and family-specific planning regressions. There are no watch processes.
- `check`: also packs the package, installs it into an isolated consumer, type-checks the README examples without DOM types, and checks runtime isolation and the tarball allowlist.

Temporary build/test files live under ignored `work/` and `dist/`. They are excluded from npm. To remove local generated artifacts, delete `work/`, `dist/` and, if no longer needed, `node_modules/`.

When proposing a change, include source-data fixtures, valid/empty/invalid cases, stable identity assertions and boundary cases. Extend the public types and renderer integration together. Keep platform UI behavior in the appropriate adapter. Do not add browser helpers to a shared geometry module.

## Automated Core releases

The GitHub workflow `.github/workflows/publish.yml` owns Core publication only. It does not update Native, publish consumer packages or deploy documentation websites.

For a release, update the package version, lockfile and versioned README examples on `main`, then push the matching `v<version>` tag. The workflow checks that the tag matches the package, belongs to the history of `main`, and passes strict tests and the isolated package consumer. It then publishes the verified archive using npm Trusted Publishing with the GitHub environment `npm-release`, checks the registry archive integrity, and records a GitHub release. Re-running an already published version succeeds only if the archive bytes match exactly.

The npm trusted publisher is restricted to this repository, `publish.yml` and `npm-release`. GitHub issues short-lived credentials for each release; no permanent npm token is stored. Running the workflow manually performs verification without publishing. A failed check blocks publication.

## Scalar contour isolines

`PlanContourSpec` accepts one measured rectangular field. `grid.x` and `grid.y` are strictly increasing finite numeric coordinates, each with 2–64 entries. `grid.values` and `grid.ids` have exactly `x.length * y.length` row-major entries, at most 4,096 samples. Each original ID is unique and remains unchanged in `frame.contour.samples`. `null` is unknown and breaks every incident cell; zero remains a measured value.

```ts
import {planChart, type PlanContourSpec} from '@neural-charts/core';

const field = {
  family: 'contour', title: 'Measured temperature',
  axes: {x: {type: 'linear'}, y: {type: 'linear'}},
  grid: {
    id: 'temperature', x: [0, 2], y: [0, 3],
    ids: ['northwest', 'northeast', 'southwest', 'southeast'],
    values: [10, 30, 10, 30], unit: '°C',
  },
  contour: {levels: [{id: 'warm', value: 20}], segmentBudget: 8192},
} as const satisfies PlanContourSpec;
const result = planChart(field, {width: 390, height: 300});
```

Levels have stable unique IDs and 1–8 strictly increasing finite values. Their optional names and colours are presentation metadata. Marching squares uses linear edge interpolation and a bilinear asymptotic decider for ambiguous saddle cells. Exact saddle intersections preserve their four arms. Shared edges are deduplicated; zero-length contacts do not become fake line segments. This version does not implement filled contour bands or smoothing.

The complete isoline calculation has an explicit segment budget, default 8,192 and maximum 32,768, applied before viewport clipping. Exceeding it returns `CONTOUR_SEGMENT_BUDGET`, with no partially truncated frame. A renderer may impose a lower published bound. The frame contains at most one M/L command path per visible level. No DOM, canvas, native runtime or renderer dependency participates in calculation.

Each observation is a **derived isoline segment**, not an original sample. `observation.value` is the requested level. `observation.contour` identifies the grid, level, source cell and four original sample IDs/values; it contains both source interpolated endpoints and plot-local clipped endpoints. Derived IDs stay stable when clipping removes earlier saddle arms. All original samples remain in the frame even when levels are hidden or no crossing exists. `emptyReason` distinguishes hidden levels, unknown cells, no crossings and an outside viewport.

X/Y domains, reversed axes, numeric ticks, references and controlled viewport windows use the shared coordinate model. Reference values are grid coordinates, not scalar thresholds. Clipping happens in source space before projection. Contour frames do not invent circular or polygonal hits; adapters can index the explicit straight segment endpoints with their platform touch tolerance. Tooltips should label the level as interpolated and provide the original corners separately. Keyboard navigation, gesture handling, tooltip placement and reduced-motion animation belong to the adapter.

## Measured Venn and Euler relations

Venn plans accept up to three named sets and explicit inclusive measurements for every nonempty combination. An empty set list with empty data is valid. For two sets provide A, B and A∩B; for three sets provide all seven combinations. Use `0` for a measured empty intersection and `null` for an unknown measurement. Missing combinations are rejected rather than inferred as zero.

```ts
import {planChart, type PlanVennSpec} from '@neural-charts/core/plan';

const sets = {
  family: 'venn',
  title: 'Membership overlap',
  sets: [{id: 'a', label: 'Product A'}, {id: 'b', label: 'Product B'}],
  data: [
    {id: 'total-a', sets: ['a'], value: 100},
    {id: 'total-b', sets: ['b'], value: 80},
    {id: 'both', sets: ['a', 'b'], value: 35},
  ],
} as const satisfies PlanVennSpec;

const result = planChart(sets, {width: 390, height: 300});
if (result.status !== 'invalid') {
  const fitStatus = result.frame.vennLayout?.status;
  const originalMeasurements = result.frame.vennData;
  void {fitStatus, originalMeasurements};
}
```

Singleton circle areas remain proportional to original set measures. Two-set overlap uses exact arc integration and bounded inverse search. For three sets, not every valid set relation is exactly representable by circles: the bounded fit reports `vennLayout.status`, individual area errors and `maxErrorRatio`, relative to the largest visible set. An approximate fit never changes source counts. Negative exclusive memberships and intersections larger than their known parent sets are rejected, including contradictions detectable in otherwise incomplete data.

Unknown visible relations produce no guessed circles. Known counts, zeros, hidden measurements and omitted anchors remain distinguishable in `vennData`, observations and `vennLayout`. Disjoint and contained arrangements also support Euler relations. Adapters select exact circle memberships using the layout's stable `bit` values and each observation's `venn.mask`; they should not replace intersections with a polygon approximation. An omitted label anchor does not erase its original measurement. Font fitting, visual transparency, touches, accessible navigation, legends and tooltips belong to the renderer.

## Sparse heatmaps

Heatmaps reuse the category-band geometry and sparse normalization already owned by the Core. They do not create a dense matrix for coordinates that are absent from the source. The public planning entry supports up to 64 categories per axis and 4,096 original cells. Exceeding these limits returns a diagnostic rather than sampling or dropping source data.

```ts
import {planChart, type PlanHeatmapSpec} from '@neural-charts/core/plan';

const matrix = {
  family: 'heatmap',
  title: 'Measurements',
  axes: {
    x: {type: 'category', values: [{id: 'mon', label: 'Monday'}, {id: 'tue', label: 'Tuesday'}]},
    y: {type: 'category', values: [{id: 'morning', label: 'Morning'}, {id: 'evening', label: 'Evening'}]},
  },
  data: [
    {id: 'first', rowId: 'morning', columnId: 'mon', value: 0},
    {id: 'second', rowId: 'morning', columnId: 'tue', value: -4},
    {id: 'unknown', rowId: 'evening', columnId: 'tue', value: null},
  ],
  gapRatio: 0.04,
  colorAxis: {
    type: 'continuous',
    stops: [{at: 0, color: '#E8F0FE'}, {at: 1, color: '#245DC1'}],
    missingColor: '#CBD5E1',
  },
} as const satisfies PlanHeatmapSpec;

const result = planChart(matrix, {width: 390, height: 300});
if (result.status !== 'invalid') {
  const originalCells = result.frame.heatmapData;
  const density = result.frame.heatmapLayout;
  const quantitativeLegend = result.frame.colorAxis;
  void {originalCells, density, quantitativeLegend};
}
```

Zero and negative values remain selectable observations. An explicit `null` cell uses the missing-value colour but has no invented numeric observation; an absent coordinate creates neither paint nor an observation. `heatmapLayout` reports both counts. Sparse inputs keep their original IDs and positions. Duplicate cell coordinates, duplicate IDs and unknown row/column IDs are rejected.

Each cell has exact rectangular polygon geometry. `heatmapLayout.rows` and `columns` provide exact painted band extents and stable category IDs, allowing an adapter to distinguish gaps, absent coordinates and explicit unknown cells without estimating scales or creating fake observations. Category order can be reversed independently on either axis. The colour domain defaults to the original known source extent, including zero, and stays separate from coordinate categories. Explicit continuous domains clamp only the colour, never the original numeric value. Ordered colour classes retain each original value and class identity. The quantitative colour axis replaces a series visibility legend.

`gapRatio` accepts 0–0.5 and `opacity` accepts 0–1. A transparent matrix retains its source summary with a `noInk` status. Labels are optional rendering roles, limited to 64 sufficiently large cells. Font measurement and final label fit belong to the renderer. This first matrix planning contract does not support numeric axes, stacking, series visibility, viewport zoom/pan or reference lines. Its independent legacy entry remains unchanged.

## Wind rose and radial bars

Wind rose orders directions clockwise from twelve o'clock. Each series supplies nonnegative frequencies at stable category IDs. Annular sectors are adjacent radial stack segments, rather than overlapping polar wedges. Radius is linear in frequency; filled sector area is not the value scale. Up to 32 directions, 16 series and 512 source points are accepted.

```ts
import {planChart, type PlanWindRoseSpec} from '@neural-charts/core/plan';

const wind = {
  family: 'windrose',
  title: 'Wind frequency',
  axes: {
    x: {type: 'category', values: [{id: 'n', label: 'North'}, {id: 's', label: 'South'}]},
    y: {type: 'linear', title: 'hours'},
  },
  series: [
    {id: 'low', name: 'Low speed', data: [{id: 'low-n', x: 'n', y: 2}, {id: 'low-s', x: 's', y: 4}]},
    {id: 'high', name: 'High speed', data: [{id: 'high-n', x: 'n', y: 6}, {id: 'high-s', x: 's', y: 4}]},
  ],
  stacking: 'sum',
  gapRatio: 0.12,
} as const satisfies PlanWindRoseSpec;

const result = planChart(wind, {width: 390, height: 300});
if (result.status !== 'invalid') {
  const originalFrequency = result.frame.observations[0]?.value;
}
```

`stacking: 'percent'` normalizes each complete direction to 100 while retaining original frequencies in `value`. It requires a known value for every visible series in every direction: absent or `null` measurements return a diagnostic. Sum mode keeps known contributions and marks observations from incomplete directions with `incomplete: true`, omitting their undefined percentages. A zero remains an observation without an invented positive sector. An explicit radial domain must start at zero and contain all visible stack totals. Hiding a series recalculates the stacks and their scale. `gapRatio` accepts 0–0.5.

Radial bars give each source item one concentric band. A common zero-based domain maps values to clockwise angles; a full-domain value closes a complete ring using two arcs per boundary. The source order and automatic source domain remain stable when a ring is hidden. Use an explicit domain for progress comparisons across source updates. Up to 16 original items are accepted; `null` paints no band and zero remains inspectable without a positive arc.

```ts
import {planChart, type PlanRadialBarSpec} from '@neural-charts/core/plan';

const progress = {
  family: 'radialbar',
  title: 'Targets',
  unit: '%',
  domain: [0, 100],
  data: [{id: 'delivery', label: 'Delivery', value: 100}, {id: 'review', label: 'Review', value: 65}],
  innerRadiusRatio: 0.2,
  gapRatio: 0.12,
} as const satisfies PlanRadialBarSpec;

const result = planChart(progress, {width: 390, height: 300});
```

`innerRadiusRatio` accepts 0–0.8; band gaps accept 0–0.5. Domains excluding original values return a diagnostic instead of clipping progress silently. Both families return native-ready circular arc commands, exact annular-sector hit regions and stable observation IDs. They do not accept Cartesian references, viewport zoom/pan or the generic Cartesian stacking option. Rendering, tooltip placement, animation and platform accessibility stay in the adapter.

## Independent-axis parallel coordinates

Parallel coordinates compare records across variables with different units and ranges. Each dimension has its own linear scale. `coordinates: 'polar'` arranges those independent dimensions around a centre; it does not replace their domains with one radar maximum. Cartesian mode needs 2–16 dimensions; polar mode needs 3–16. Both accept up to 16 original records and 256 original points, with one point per record/dimension pair.

```ts
import {planChart, type PlanParallelSpec} from '@neural-charts/core/plan';

const vehicles = {
  family: 'parallel',
  title: 'Vehicle measurements',
  coordinates: 'cartesian',
  axes: [
    {id: 'mass', label: 'Mass', type: 'linear', unit: 'kg', domain: [1000, 2000]},
    {id: 'time', label: 'Acceleration', type: 'linear', unit: 's', domain: [5, 15], reversed: true},
    {id: 'range', label: 'Range', type: 'linear', unit: 'km', domain: [200, 600]},
  ],
  series: [
    {id: 'a', name: 'Vehicle A', data: [
      {id: 'mass-a', axisId: 'mass', value: 1250},
      {id: 'time-a', axisId: 'time', value: 7.5},
      {id: 'range-a', axisId: 'range', value: 450},
    ]},
    {id: 'b', name: 'Vehicle B', data: [
      {id: 'mass-b', axisId: 'mass', value: 1850},
      {id: 'time-b', axisId: 'time', value: 10},
      {id: 'range-b', axisId: 'range', value: null},
    ]},
  ],
} as const satisfies PlanParallelSpec;

const result = planChart(vehicles, {width: 390, height: 300});
if (result.status !== 'invalid') {
  const axes = result.frame.parallel?.axes;
  const valueUnit = result.frame.observations[0]?.parallel?.unit;
}
```

Every axis supports an increasing finite `domain`, `reversed`, `nice` and `ticks.targetCount`. An explicit domain must contain all original known values, including hidden records. Automatic domains use the entire source and therefore remain stable when the legend hides a record. A constant dimension uses the shared constant-domain expansion. A dimension with no known values and no explicit domain has no invented numeric range or ticks.

Zero and negative measurements retain their original values. `null` and omitted dimensions create gaps; paths never bridge a missing dimension. Polar mode joins the last and first dimensions only when both endpoints are known. Unknown dimension IDs and duplicate coordinates within a record return diagnostics. A record with only one known dimension still has its original circular observation target.

`frame.parallel` contains exact axis endpoints, labels, tick positions, domains, units, source counts and grid commands. Each observation has `parallel: {axisId, axisLabel, unit}` and a semantic group keyed by its dimension. Adapters can compose a shared tooltip for one dimension without mixing units or unrelated coordinates. `frame.unit` is empty because no global unit describes all variables. Native text, collision handling and final label density belong to the renderer; Core returns no SVG text or browser measurements.

There is no universal numeric X/Y viewport, Cartesian reference-line system, stacking or logarithmic scale in this parallel-coordinate contract. Those incompatible options return diagnostics. The Cartesian and polar variants share the same source identities and independent-scale mathematics.

## License

[MIT](LICENSE), copyright 2026 Pedro Moreno Trujillo.


### Dendrogram: source distance or derived topology

`PlanDendrogramSpec` accepts `root`, an ordered recursive `PlanDendrogramNode` with `id`, optional `label`, `height` and `children`. For measured clustering, supply a finite nonnegative height on every internal node; a parent cannot be below its children. Leaves have height zero. An optional unit describes the original merge distances. No sorting or clustering of raw samples is performed.

If all internal heights are omitted, the planner derives topology levels from the leaves. Those are explicitly marked `heightMode: 'topology'` and use `levels`, never a fabricated physical distance. Mixed measured and missing internal heights are invalid. A single leaf may explicitly supply zero and a physical unit.

`orientation` is horizontal by default or vertical. Leaves align at height zero even when their depths differ. Orthogonal branches join at the supplied merge height, not equally spaced depths. The bounded input supports 128 nodes, 64 leaves and depth16; IDs are globally unique and child order is preserved. All original nodes remain observations. Leaf labels may be reduced at small sizes without removing their identities or values.

`frame.dendrogram` records orientation, height mode, maximum height, node/leaf counts and unit. Each observation's `dendrogram` role records leaf/cluster type, height mode, source/topology/leaf-zero provenance, leaf count and depth. A zero-height tree has no invented positive numeric axis. There are no visibility-series legends, stacking, reference lines or viewport controls on this owner.

```ts
import {planChart} from '@neural-charts/core/plan';
import type {PlanDendrogramSpec} from '@neural-charts/core/plan';
const clusters = {
  family:'dendrogram', title:'Measured similarity', unit:'distance',
  root:{id:'all',height:10,children:[
    {id:'pair',height:2,children:[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}]},
    {id:'c',label:'Gamma'}
  ]}
} satisfies PlanDendrogramSpec;
const clustered = planChart(clusters,{width:390,height:300});
```


### Flame: original single-thread trace

`PlanFlameSpec` contains `axes.x` (numeric coordinates with an optional unit, or UTC time), and up to2048 original spans in `data`. Each span declares a unique `id`, `label`, finite `start` and `end`, and optional `parentId`. A parent may appear later in the input. Children must be contained by their parent; positive-duration siblings and roots must not overlap. Cycles, unknown parents, reversed/nonfinite intervals and depth above31 are rejected. This represents one synchronous call stack, not concurrent threads or scheduling dependencies.

Source endpoints and inclusive durations remain unchanged. Depth and exclusive duration (inclusive duration minus direct-child durations) are identified in each observation's `flame` role. A zero-duration event remains zero and is selectable; it is not widened into a positive measured duration. `frame.intervals` retains the original source summaries, including spans outside a zoom window. `frame.flame` records maximum depth and root/node counts. Input order determines observation navigation, not cumulative X placement.

`rowPadding` controls depth-row separation from0 to0.9 (default0.08). Numeric/UTC X viewport and compatible X references reuse the interval planner. Visibility legends, stacking and numeric Y zoom are unsupported. Empty traces return an explicit empty state.

```ts
import {planChart} from '@neural-charts/core/plan';
import type {PlanFlameSpec} from '@neural-charts/core/plan';
const trace = {family:'flame',title:'Call trace',axes:{x:{type:'linear',unit:'ms'}},data:[
  {id:'main',label:'Main',start:0,end:100},
  {id:'load',label:'Load',parentId:'main',start:10,end:50},
  {id:'parse',label:'Parse',parentId:'load',start:20,end:40}
]} as const satisfies PlanFlameSpec;
const tracePlan = planChart(trace,{width:390,height:300,viewport:{axes:'x'}});
```

### Violin: raw measurements and an explicit density estimate

`PlanViolinSpec` accepts up to16 ordered `groups` and4096 total original samples. A group has a stable `id`, `label`, optional Core colour, and `samples` containing unique IDs and finite signed values or `null`. Unknown measurements do not become zero. A group with no known sample has no numeric observation or density. The caller retains the original sample IDs; generated observations are explicitly derived group summaries identified by the group ID and `pointId:'summary'`.

The compact Epanechnikov kernel has support one bandwidth either side of a sample. `bandwidth` is an optional positive finite measurement-space width. For nonconstant samples, the automatic rule uses sample standard deviation, the smaller positive IQR/1.34 where available, and the factor2.34×n^-0.2. Constants without an explicit bandwidth remain a zero-spread line/median marker; the planner does not invent a bell curve. Explicit bandwidth can smooth a constant sample as an identified estimate.

`resolution` is32–128 intervals (default64). The polygon has at most256 vertices. Density evaluation skips sorted samples outside the compact support. `normalization` is `width` (equal peak width), `area` (equal probability area), or `count` (area proportional to known sample count); default `width`. Hidden groups retain their source scale/slots and normalization. `gapRatio` is0–0.8, default0.2.

`axes.y` optionally supplies a linear domain, reversal, nice ticks and measurement unit. Explicit domains must contain the complete density support. The existing numeric/category scale owners produce projection and ticks. Unsupported numeric precision/overflow returns a diagnostic, never a corrupted path. `frame.violin` records kernel, normalization, resolution, original group IDs/counts, derived summaries and sampled densities. Tooltip summaries report median/quartiles/extrema/mean, known/missing counts and bandwidth; sampled density coordinates are not original measurements. Numeric viewport, reference lines and stacking are not exposed on this owner.

```ts
import {planChart} from '@neural-charts/core/plan';
import type {PlanViolinSpec} from '@neural-charts/core/plan';
const distributions = {family:'violin',title:'Response time',axes:{y:{type:'linear',unit:'ms'}},groups:[
  {id:'first',label:'First group',samples:[{id:'a',value:10},{id:'b',value:12},{id:'c',value:18}]},
  {id:'second',label:'Second group',samples:[{id:'d',value:8},{id:'e',value:14},{id:'f',value:null}]}
]} as const satisfies PlanViolinSpec;
const violinPlan = planChart(distributions,{width:390,height:300});
```


### Fan: nested uncertainty and a central estimate

`PlanFanSpec` receives caller-supplied estimates and interval bounds. It does not calculate a forecast or invent probabilities. Declare one to six `bands` with stable IDs, labels and strictly increasing `coverage` fractions between zero and one. Each of up to 1,024 `data` points contains an original ID, correlated category/numeric/UTC X coordinate, central `value:number|null` and `intervals` keyed by `bandId`.

Known intervals must contain the known central estimate. Increasing coverage must not narrow any known interval. A null/null pair means unknown; an omitted interval means it is not configured at that coordinate. Half-known pairs, duplicate interval IDs, inverted bounds and non-nested known intervals are rejected. The band ID `center` is reserved for the central drawing series. Zero-width intervals and real zero estimates remain zero.

All intervals and the centre use one existing range-owner category frame and value domain. Wider intervals paint first; the centre is a genuine line in that same frame. Original estimates and original interval endpoints remain separate in the observation's `fan` role. `frame.fan` describes coverage and identities. Numeric/category viewport and reference handling reuse the range owner. Stacking is unsupported. Hiding a drawing series changes visibility, never the supplied bounds or estimates.

```ts
import {planChart} from '@neural-charts/core/plan';
import type {PlanFanSpec} from '@neural-charts/core/plan';
const uncertainty = {
  family:'fan',title:'Supplied uncertainty',
  axes:{x:{type:'linear'},y:{type:'linear'}},
  bands:[{id:'central-50',label:'50%',coverage:0.5},{id:'central-95',label:'95%',coverage:0.95}],
  data:[
    {id:'past',x:0,value:10,intervals:[]},
    {id:'next',x:1,value:12,intervals:[{bandId:'central-50',low:10,high:14},{bandId:'central-95',low:8,high:16}]},
    {id:'later',x:2,value:14,intervals:[{bandId:'central-50',low:11,high:17},{bandId:'central-95',low:6,high:22}]},
  ],
} as const satisfies PlanFanSpec;
const uncertaintyResult = planChart(uncertainty,{width:390,height:300});
```

### Regression: original XY samples and an explicitly derived fit

`PlanRegressionSpec` receives up to eight original scatter series and 4,096 total source rows. Original IDs, coordinates and unknown values remain source data; no predicted value replaces a measurement. Series IDs and point IDs are bounded to 96 characters; names to 190. The source series prefix `ols:` is reserved for the derived drawing series. Source fields are `id`, `name`, optional `color` and `data`; a point contains `id`, `x:number|null` and `y:number|null`.

Ordinary least squares uses only known XY pairs. Its shifted, scaled and compensated covariance avoids raw-square overflow and loss of small differences at large timestamp offsets. The model reports known/missing pair counts, slope, intercept and R². Constant response produces a genuine zero slope and null R² because total response variance is zero. Fewer than two known pairs or constant X preserve the original points and report an unavailable fit. Nonrepresentable coefficients are diagnosed rather than silently becoming zero or infinity.

Source points and the derived straight line share one scatter frame, numeric axes and domains. Fits use only the measured X extent; there is no extrapolation. Cropping clips the line in original coordinates before pixel mapping, including windows containing no original endpoint. Derived endpoint observations are explicitly identified as `regression.type:'fit'`, with their actual estimated X/Y values and a bounded line hit strip. Original samples use `type:'sample'`. Model statistics are stored once in `frame.regression.models`, linked by `modelId`, rather than repeated in every observation. Original and fit visibility are independent; visibility does not change the model's training samples. Stacking is unsupported.

```ts
import {planChart} from '@neural-charts/core/plan';
import type {PlanRegressionSpec} from '@neural-charts/core/plan';
const measured = {
  family:'regression',title:'Measurements and linear fit',
  axes:{x:{type:'linear'},y:{type:'linear'}},
  series:[{id:'measurements',name:'Original measurements',data:[
    {id:'a',x:1,y:3},{id:'b',x:2,y:5},{id:'c',x:3,y:7},{id:'unknown',x:4,y:null},
  ]}],
} as const satisfies PlanRegressionSpec;
const regressionResult = planChart(measured,{width:390,height:300,viewport:{axes:'x',value:{x:[1.2,2.8]}}});
```


### Circular sweeps and original scalar needles

The optional `options.circular` envelope adds a bounded clockwise sweep to pie/donut and a true scalar needle to gauges. Original values, missing data and overflow semantics remain explicit. Wrapped hit regions and a uniform fitting extent are supplied in `frame.circular`; `frame.radialSummary` identifies complete totals versus known subtotals. Needle metadata supports renderer rotation without projecting data on animation frames. See [typed examples, angle limits, missing values, tick density and incompatible options](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/circular-contract.md).

```ts
import {planChart, type PlanPieSpec, type PlanGaugeSpec} from '@neural-charts/core/plan';

const shares = {family:'pie',title:'Original shares',
  data:[{id:'a',label:'A',value:1},{id:'b',label:'B',value:3}],
} as const satisfies PlanPieSpec;
const measurement = {family:'gauge',title:'Original measurement',
  value:72,domain:[0,100],unit:'%',
} as const satisfies PlanGaugeSpec;

const half = planChart(shares, {width:390,height:260,circular:{startAngle:-90,endAngle:90}});
const needle = planChart(measurement, {width:390,height:300,circular:{gaugeStyle:'needle',tickCount:7}});
```

### Coordinated supplied ranges and lines

The mixed planning contract also accepts original line measurements with supplied straight or smooth interval series. A single category frame, original-value scale and viewport coordinate all layers; interval endpoints stay explicit in tooltip data. See [complete typed examples and incompatibilities](https://github.com/PedroMorenoTrujillo/neural-charts-core/blob/main/docs/mixed-ranges-contract.md).
