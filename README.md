# Neural Charts Core

Renderer-independent chart planning and geometry in strict TypeScript. The Core converts source data and a viewport size into a read-only frame that a renderer can paint.

**Version 0.0.2 is experimental.** Public contracts can change before 1.0. Pin the version while integrating a renderer.

## Install

```sh
npm install @neural-charts/core@0.0.2
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

Both `@neural-charts/core` and `@neural-charts/core/plan` export the same two functions and their types. Other internal files are not supported imports.

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

Supported intents are `zoom` (factor and optional anchor), `pan` (axis deltas), `transform` (combined factor, anchor and deltas), and `reset`. Windows are constrained by the supplied viewport state. X can be numeric, time or categorical where the family supports it; Y windows are numeric. Deltas and anchors use the domain contract, not DOM pixels. Do not use this helper for radial or hierarchy zoom: those interactions need a separate family-specific navigation contract.

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

The current contract produces 41 frame families. These are planning capabilities; inclusion does not certify a renderer's feature parity or device performance.

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
