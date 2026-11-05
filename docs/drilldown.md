# Drilldown navigation

`@neural-charts/core/drilldown` owns bounded graph validation, original-datum destination lookup, navigation history, saved visibility/viewports and stale-generation rejection. It imports no renderer, Angular, native component, browser or platform API. The entry ships ESM and strict TypeScript declarations using ES2022 alone.

The host owns chart-data validation, resolved presentation options, source identity adaptation, semantic keys, rendering, controls, accessibility announcements and output events. Preparing a graph does not plan or render inactive charts.

## Prepare and navigate

```ts
import {
  ownDrilldownGraph,
  createDrilldownState,
  drilldownGeneration,
  drilldownDestination,
  enterDrilldown,
  backDrilldown,
  type DrilldownData,
} from '@neural-charts/core/drilldown';

const data = {
  rootId: 'overview',
  nodes: [
    {id: 'overview', data: {type: 'pie', data: [{id: 'north', value: 40}]}},
    {id: 'detail', data: {
      type: 'column',
      series: [{id: 'sales', data: [{id: 'q1', y: 0}]}],
    }},
  ],
  links: [{
    fromNodeId: 'overview',
    datumId: {seriesId: 'north', pointId: 'north'},
    toNodeId: 'detail',
  }],
} as const satisfies DrilldownData;

const prepared = ownDrilldownGraph(data, {
  semantics: {detail: 'categories:q1;units:sales;stacking:none'},
});
if (prepared.status === 'invalid') {
  throw new Error(prepared.error.diagnostic.message);
}

let state = createDrilldownState(prepared.value);
const selection = {
  ...drilldownGeneration(state),
  datumId: {seriesId: 'north', pointId: 'north'},
};
const destination = drilldownDestination(state, selection);
// Selection/tooltip display alone does not navigate.
// Call enterDrilldown only from an explicit host action.
if (destination !== undefined) state = enterDrilldown(state, selection);
state = backDrilldown(state);
```

The example demonstrates the navigation payload and original identities. Supply and validate the complete chart data required by your renderer separately. `data` preserves its exact inferred payload union; it never widens to `any`. `DrilldownState<G>` also preserves additional host graph fields when the host extends a prepared graph.

## Payloads and original source identities

`DrilldownData<D>` contains `rootId`, `nodes: readonly {id, data: D}[]` and `links: readonly {fromNodeId, datumId, toNodeId}[]`. A datum ID always contains both `seriesId` and `pointId`; labels, array indices and projected coordinates are not identities. Zero values remain selectable.

Without an adapter, each node payload is an identity descriptor with `type` equal to `column`, `pie`, `donut`, `treemap`, `sunburst`, `treegraph` or `organization`. Extra chart-data fields are retained; this module validates the identity structure needed by outgoing links, not their numerical chart content.

For a different payload shape, supply a stable `source: DrilldownSourceAdapter<D>` function. It returns a renderer-independent `DrilldownSource` descriptor. Core still validates the returned plain records, bounds and actual outgoing datum membership; a boolean validation bypass is not supported.

```ts
import {ownDrilldownGraph, type DrilldownSourceAdapter} from '@neural-charts/core/drilldown';

interface Payload {
  readonly rows: readonly {readonly id: string; readonly value: number}[];
}
const source: DrilldownSourceAdapter<Payload> = payload => ({
  type: 'column',
  series: [{id: 'rows', data: payload.rows}],
});
const prepared = ownDrilldownGraph({
  rootId: 'root',
  nodes: [{id: 'root', data: {rows: [{id: 'first', value: 0}]}}],
  links: [],
}, {source});
```

Identity conventions are explicit:

- Columns use the original series ID and original point ID, including horizontal bars.
- Pie/donut segments use their segment ID for both ID fields.
- Treegraph/organization nodes use their declared group ID, or `nodes`, as `seriesId`.
- Treemap/sunburst use the root ID for the root, and each immediate root child's ID for that child and its descendants.

## Ownership and cache lifetime

Graph inputs, payloads and adapter behavior are immutable snapshots. Use a new input reference for changed nodes/links, new payload references for changed chart data, and a new adapter function if identity adaptation changes. Mutating an existing input in place is outside this contract. Opaque payloads retain their original references; Core does not deep-copy every inactive chart or modify caller objects.

Core owns and freezes node wrappers, links, datum identities, history, view arrays and viewport values. Returned `ReadonlyMap` objects are frozen facades without `set`, `delete` or `clear`; `forEach` receives the same facade, never its backing map. Source indexes are cached weakly by input and adapter identity. Reusing those identities for presentation-only changes does not rescan source points. Changing adapters rebuilds the indexes and invalidates saved views and old generations.

## Saved views and reconciliation

`rememberDrilldownView(state, generation, view)` saves only `hiddenSeriesIds` and an optional `viewport`. The view owns copies of those arrays/windows. It cannot persist selection, a tooltip, a pin or tooltip coordinates. Remembering a view retains the renderer generation.

`DrilldownViewportValue.x` accepts an increasing finite numeric pair or `{firstId, lastId}` category IDs. `y` accepts only an increasing finite numeric pair. Values use original source units.

`restoredDrilldownView(state, nodeId?)` returns a saved view only while that node has the same payload reference and semantic key. The host derives `semantics[nodeId]` from properties that affect the meaning of a viewport: units, axis types/domains/category IDs, reversal, stacking and initial viewport. Titles, colors, legend position and motion preferences normally do not change that key. Use a canonical, stable representation; keys are strings of at most 16,384 characters and may only name declared nodes.

`reconcileDrilldown(state, nextGraph)` retains the surviving ancestor prefix. A relocated descendant is never entered implicitly. It discards incompatible saved views and replaces the generation when the active payload, semantic key, adapter, active destinations or trail changes. Events carrying a previous generation are ignored by destination lookup, entry and view updates. A host should apply the same generation check before forwarding delayed renderer outputs.

## Limits and failure behavior

IDs are nonempty strings of at most 128 characters. A graph permits 1–64 nodes, 0–256 links and at most 16 edges from root to leaf. Every node must be reachable; the root has no parent, each other node has one parent, cycles are rejected, and an original datum has at most one destination. Multiple distinct data points may lead to the same child of the same parent.

Original identity scans preserve existing budgets: columns allow at most 16 series and 10,000 total points; pie/donut allow 16 segments; graph sources allow 128 nodes and 15 explicit groups; hierarchical sources allow 512 nodes with maximum depth 16 for treemap and 8 for sunburst. Only identities required by outgoing links are retained. The navigation layer does not remove a renderer's separate point and geometry budgets.

Preparation returns `{status: 'ok', value}` or `{status: 'invalid', error: {nodeId, diagnostic: {code, reason, path, message}}}`. Unknown graph/options properties, accessors, symbol properties, sparse/custom arrays, ambiguous targets and absent original identities fail closed. Invalid saved views throw before changing state; stale events return the original state unchanged. No source data, history or renderer is modified on failure.

## Public functions

- `ownDrilldownGraph(data, options?)`: validate and prepare immutable source indexes and semantic keys.
- `createDrilldownState(graph)`: start at the configured root.
- `currentDrilldownNode(state)`: get the active original node ID.
- `drilldownGeneration(state)`: capture a token for the active renderer.
- `drilldownDestination(state, selection)`: look up a destination without navigating.
- `enterDrilldown(state, selection)`: explicitly enter the selected direct child.
- `backDrilldown(state)`: return to the immediate ancestor, or retain the root state.
- `rememberDrilldownView(state, generation, view)`: save visibility and original-unit viewport.
- `restoredDrilldownView(state, nodeId?)`: retrieve a compatible saved view.
- `reconcileDrilldown(state, graph)`: reconcile changed sources and invalidate stale outputs.
