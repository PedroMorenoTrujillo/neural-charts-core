# Neural Charts Core

Renderer-independent chart planning and geometry in strict TypeScript. The Core converts source data and a viewport size into a read-only frame that a renderer can paint.

**Version 0.0.8 is experimental.** Public contracts can change before 1.0. Pin the version while integrating a renderer.

Version 0.0.5 reduces repeated work in defensive input copying while preserving validation, ownership and chart geometry. Public data and planning contracts are unchanged.

## Install

```sh
npm install @neural-charts/core@0.0.8
```

The package ships ESM JavaScript and TypeScript declarations. It has no runtime dependencies, framework peer dependencies, browser globals, native bridges or module initialization side effects. Its declarations compile with `lib: ["ES2022"]`, without DOM types. Development and package verification use Node.js 22 or newer.

## Plan a chart

```ts
import {planChart, type PlanLineSpec, type PlanOptions} from '@neural-charts/core';

const data = {
  family: 'line',
  title: 'Weekly activity',
  axes: {
    x: {
      kind: 'category',
      values: [
        {id: 'mon', label: 'Monday'},
        {id: 'tue', label: 'Tuesday'},
        {id: 'wed', label: 'Wednesday'},
      ],
    },
    y: {kind: 'linear'},
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
| `stacking` | `'sum' \| 'percent'` | Available for `area` and `column`. Horizontal columns retain bar orientation. Other families return an invalid result. |
| `viewport` | `PlanViewportConfig` | Enabled axes and optional controlled data-domain window. See viewport example below. |
| `references` | `readonly PlanReference[]` | Named X/Y reference values, projected where supported by the family. Style and label rendering belong to the host. |

Unknown top-level planning options are rejected. Chart-specific validators also reject unsupported shapes and invalid values. TypeScript types help at build time; inspect the result for untrusted or remote data at runtime.

`PlanResult` is a discriminated union:

```ts
type PlanResult =
  | Readonly<{status: 'ok' | 'empty'; frame: PlanFrame}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
```

An empty result still supplies dimensions, family and legend state. It is useful when all series are hidden or no usable observations remain. Render an explicit empty state rather than inventing values. Diagnostics include `code`, `reason`, `message` and `path`; paths identify the offending input or option.

The frame's `schema` is `nc-plan/1`. It contains dimensions, title, description, unit, legend, series geometry, observations, grid and category labels. Depending on the family, it can additionally provide hit regions, annotations, secondary grid, a distribution summary, viewport state or projected references. Paths are structured `PlanCommand` values. Bars, circles and other primitives retain the identities needed to relate painted geometry back to source data.

Use the exported `PlanFrame`, `PlanSeries`, `PlanObservation`, `PlanLegendItem`, `PlanBar`, `PlanCircle`, `PlanHitRegion` and `PlanAnnotation` types in renderer code. See [the complete input and output interfaces](src/public/plan-types.ts) and [public exports](src/plan.ts) for every property and union member.

For relationship diagrams, `series.areaCommands` contains link ribbons and `series.nodeCommands` contains node sectors. Paint ribbons first and solid node sectors/circles afterwards; keep both roles in the same coordinate frame. Do not recover node geometry by splitting a concatenated path. Observations retain their source identities and expose typed `relationship` metadata for node/link details.

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
    kind: 'zoom',
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

## Supported planning families

The current contract produces 49 frame families. These are planning capabilities; inclusion does not certify a renderer's feature parity or device performance.

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
| Radar | `PlanRadarSpec` | Values across named radial dimensions. |
| Polar | `PlanPolarSpec` | Polar series and grid. |
| Funnel | `PlanFunnelSpec` | Stages with width proportional to value. |
| Pyramid | `PlanPyramidSpec` | Ordered stage geometry. |
| Treemap | `PlanTreemapSpec` | Rectangular hierarchy. |
| Sunburst | `PlanSunburstSpec` | Nested radial hierarchy. |
| Tree graph / organization | `PlanTreegraphSpec` / `PlanOrganizationSpec` | Typed hierarchy nodes and links. |
| Network graph | `PlanNetworkgraphSpec` | Nodes and links with bounded layout work. |
| Packed bubble | `PlanPackedBubbleSpec` | Packed scalar values, grouped by series. |
| Sankey | `PlanSankeySpec` | Weighted directed acyclic flows, horizontal or vertical nodes and filled links. |

Each input is a strict discriminated interface. Do not build a single object containing every family's properties or use casts to force an unsupported combination. Scalar parts, measured XY series, ranges, directional values and hierarchy nodes have different data semantics.

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
  const nodes = result.frame.observations.filter(point => point.relationship?.kind === 'node');
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

```ts
import {planChart, type PlanBulletSpec} from '@neural-charts/core';

const data = {
  family: 'bullet', title: 'Service coverage', orientation: 'horizontal',
  axes: {
    x: {kind: 'category', values: [{id: 'support', label: 'Support'}]},
    y: {kind: 'linear', domain: [0, 100], unit: '%'},
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
    x: {kind: 'category', values: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}]},
    y: {kind: 'linear', domain: [-10, 10]},
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

Variwide accepts one series and up to 64 categories/points. `z` controls width and must be nonnegative or `null`; `y` controls signed height. Zero width, unknown width, a missing category point and geometry below drawing precision have explicit states in `categoryBands`. Unknown widths set `variwideLayout.incomplete`; a chart without positive known width reports `no-positive-width`. Only numeric Y zoom/pan and Y reference lines are supported. X zoom, multiple series and stacking are rejected.

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
    x: {kind: 'time'},
    y: {kind: 'category', values: [{id: 'north', label: 'North'}]},
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
  axes: {x: {kind: 'time'}},
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

- Sum/percent stacking is an explicit option for area and column inputs. Streamgraph has its own stacking model. Other families do not inherit stacking simply because they paint a path.
- Mixed planning uses the supported series composition in `PlanMixedSpec`. Independent arbitrary multi-axis composition and arbitrary radial/Cartesian overlays are not part of this release. Pareto supplies its own cumulative scale.
- A frame's observations describe the planned visible geometry. Preserve the original data separately for full-resolution inspection, exports and domain changes.
- No Core-side universal point downsampling is promised. A host must set a display budget appropriate to its device and viewport, preserve important extremes/gaps, and expose original values when aggregating. Do not silently replace data with demo values.
- Text labels are planning hints; final font metrics, truncation, collision handling and accessible full values belong to the renderer. Core does not measure Canvas or native fonts.
- Tooltip pinning, animation, collision avoidance, shared-tooltip composition, haptics, scrolling and selection persistence are renderer/controller responsibilities.
- Heatmap is not exposed by the public planning API in this release. Maps, Gantt and 3D are outside this package's current planning surface.

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

## License

[MIT](LICENSE), copyright 2026 Pedro Moreno Trujillo.
