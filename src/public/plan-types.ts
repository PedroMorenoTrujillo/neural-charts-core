import type {PlanContourSpec,PlanContourValue,PlanContourLayout} from './contour-types.js';
import type {PlanTilemapSpec,PlanTilemapValue,PlanTilemapSummary,PlanTilemapLayout} from './tilemap-types.js';
import type {PlanColorAxisFrame} from './color-axis-types.js';
import type {PlanCellPaint} from './cell-types.js';
import type {PlanPictorialSpec,PlanPictorialGlyph,PlanPictorialFill,PlanPictorialValue,PlanPictorialSummary,PlanPictorialLayoutSummary,PlanCompoundPolygonHit} from './pictorial-types.js';
import type {PlanVennSpec,PlanVennValue,PlanVennSummary,PlanVennLayout} from './venn-types.js';
import type {PlanHeatmapSpec,PlanHeatmapValue,PlanHeatmapSummary,PlanHeatmapLayout} from './heatmap-plan-types.js';
import type {PlanWordCloudSpec,PlanWordCloudTextInput,PlanWordCloudTextGlyph,PlanWordCloudSummary,PlanWordCloudLayout} from './wordcloud-types.js';
import type {PlanRelationshipSpec,PlanRelationshipMetadata} from './relationship-types.js';
import type {PlanBulletSpec,PlanBulletValue,PlanBulletSummary,PlanBulletBandGeometry,PlanBulletTargetGeometry} from './bullet-plan-types.js';
import type {PlanVariwideSpec,PlanVariwideValue,PlanVariwideCategoryBand,PlanVariwideSummary} from './variwide-plan-types.js';
import type {PlanXRangeSpec,PlanIntervalValue,PlanIntervalSummary} from './xrange-plan-types.js';
import type {PlanTimelineSpec,PlanTimelineEvent,PlanTimelineSummary} from './timeline-plan-types.js';
import type {AreaChartSpec} from './area-types.js';
import type {SplineChartSpec} from './spline-types.js';
import type {MixedChartSpec} from './mixed-types.js';
import type {LineChartSpec} from './line-types.js';
import type {ColumnChartSpec} from './column-types.js';
import type {ChartDiagnostic} from './chart-types.js';
import type {PieChartSpec,DonutChartSpec} from './radial-types.js';
import type {GaugeChartSpec} from './gauge-types.js';
import type {ScatterChartSpec} from './scatter-types.js';
import type {NumericAxis} from './scatter-types.js';
import type {ChartViewportValue,ChartNumericWindow} from './viewport-types.js';

/** DOM-free planning inputs. Presentation and controller state belong to the host. */
type LineInput<T = LineChartSpec> = T extends LineChartSpec
  ? Pick<T, 'family' | 'title' | 'description' | 'axes' | 'series'> : never;
export type PlanLineSpec = LineInput;
/** Weighted acyclic flows. Node/link IDs are unique across the whole diagram. */
export interface PlanSankeyNode {readonly id:string;readonly label:string;readonly groupId?:string;}
export interface PlanSankeyLink {readonly id:string;readonly from:string;readonly to:string;readonly value:number|null;}
export interface PlanSankeySpec {
  readonly family:'sankey';readonly title:string;readonly description?:string;
  readonly nodes:readonly PlanSankeyNode[];readonly links:readonly PlanSankeyLink[];
  readonly groups?:readonly PlanHierarchyGroup[];
  readonly orientation?:'horizontal'|'vertical';readonly nodeWidth?:number;readonly nodePadding?:number;
}
type OrderedInput<T>=T extends {family:unknown;title:string;description?:string;axes:unknown;series:unknown}?Pick<T,'family'|'title'|'description'|'axes'|'series'>:never;
export type PlanAreaSpec=OrderedInput<AreaChartSpec>;
export type PlanSplineSpec=OrderedInput<SplineChartSpec>;
export type PlanAreaSplineSpec=PlanSplineSpec extends infer T?T extends {family:'spline'}?Omit<T,'family'>&Readonly<{family:'areaspline'}>:never:never;
export type PlanStreamgraphSpec=PlanAreaSpec extends infer T?T extends {series:readonly(infer S)[]}?Omit<T,'family'|'series'>&Readonly<{family:'streamgraph';series:readonly Pick<S,Extract<keyof S,'id'|'name'|'color'|'data'>>[]}>:never:never;
export interface PlanRangePoint<TX=string|number>{readonly id:string;readonly x:TX;readonly low:number|null;readonly high:number|null;}
export interface PlanRangeSeries<TX=string|number>{readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanRangePoint<TX>[];}
type RangeInput<F extends 'arearange'|'areasplinerange'|'columnrange'>=PlanLineSpec extends infer T?T extends {axes:infer A;series:readonly {data:readonly {x:infer X}[]}[]}?Readonly<{family:F;title:string;description?:string;axes:A;series:readonly PlanRangeSeries<X>[]}> & (F extends 'columnrange'?Readonly<{groupGap?:number;barGap?:number;maxBarWidth?:number}>:Readonly<{groupGap?:never;barGap?:never;maxBarWidth?:never}>):never:never;
export type PlanRangeSpec=RangeInput<'arearange'>|RangeInput<'areasplinerange'>|RangeInput<'columnrange'>;
export interface PlanBoxplotPoint<TX=string|number>{readonly id:string;readonly x:TX;readonly minimum:number|null;readonly q1:number|null;readonly median:number|null;readonly q3:number|null;readonly maximum:number|null;}
export interface PlanBoxplotSeries<TX=string|number>{readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanBoxplotPoint<TX>[];}
export type PlanErrorbarPoint<TX=string|number>=PlanRangePoint<TX>;
export type PlanErrorbarSeries<TX=string|number>=PlanRangeSeries<TX>;
type StatisticalRangeInput<F extends 'boxplot'|'errorbar'>=PlanLineSpec extends infer T?T extends {axes:infer A;series:readonly {data:readonly {x:infer X}[]}[]}?Readonly<{family:F;title:string;description?:string;axes:A;series:F extends 'boxplot'?readonly PlanBoxplotSeries<X>[]:readonly PlanErrorbarSeries<X>[];groupGap?:number;barGap?:number;maxBarWidth?:number}> & (F extends 'boxplot'?Readonly<{whiskerWidth?:number;capWidth?:never}>:Readonly<{capWidth?:number;whiskerWidth?:never}>):never:never;
export type PlanBoxplotSpec=StatisticalRangeInput<'boxplot'>;
export type PlanErrorbarSpec=StatisticalRangeInput<'errorbar'>;
type ScalarComparisonInput<F extends 'lollipop'|'columnpyramid'>=PlanLineSpec extends infer T?T extends {axes:infer A;series:readonly(infer S)[]}?Readonly<{family:F;title:string;description?:string;axes:A;series:readonly Pick<S,Extract<keyof S,'id'|'name'|'color'|'data'>>[];groupGap?:number;barGap?:number;maxBarWidth?:number}>&(F extends 'lollipop'?Readonly<{markerRadius?:number}>:Readonly<{markerRadius?:never}>):never:never;
export type PlanLollipopSpec=ScalarComparisonInput<'lollipop'>;
export type PlanColumnPyramidSpec=ScalarComparisonInput<'columnpyramid'>;
export type PlanDumbbellSpec=RangeInput<'columnrange'> extends infer T?T extends {family:'columnrange'}?Omit<T,'family'>&Readonly<{family:'dumbbell';markerRadius?:number}>:never:never;
export interface PlanVariablePiePoint{readonly id:string;readonly label:string;readonly value:number;readonly z:number;readonly color?:string;}
export interface PlanVariablePieSpec{readonly family:'variablepie';readonly title:string;readonly description?:string;readonly data:readonly PlanVariablePiePoint[];readonly zDomain?:readonly[number,number];readonly minRadiusRatio?:number;readonly radiusScale?:'area'|'radius';}
export interface PlanItemPoint{readonly id:string;readonly label:string;readonly value:number;readonly color?:string;}
export interface PlanItemSpec{readonly family:'item';readonly title:string;readonly description?:string;readonly data:readonly PlanItemPoint[];readonly columns?:number;}
type PolygonInput=PlanLineSpec extends infer T?T extends {axes:infer A;series:readonly {data:readonly {x:infer X}[]}[]}?X extends number?Readonly<{family:'polygon';title:string;description?:string;axes:A;series:readonly Readonly<{id:string;name:string;color?:string;data:readonly Readonly<{id:string;x:number;y:number}>[]}>[]}>:never:never:never;
export type PlanPolygonSpec=PolygonInput;
export interface PlanSunburstSpec{readonly family:'sunburst';readonly title:string;readonly description?:string;readonly root:PlanTreemapNode;}
export interface PlanHierarchyNode{readonly id:string;readonly label:string;readonly groupId?:string;}
export interface PlanHierarchyLink{readonly id:string;readonly from:string;readonly to:string;}
export interface PlanHierarchyGroup{readonly id:string;readonly label:string;}
interface NodeGraphInput<F extends 'treegraph'|'organization'|'networkgraph'>{readonly family:F;readonly title:string;readonly description?:string;readonly nodes:readonly PlanHierarchyNode[];readonly links:readonly PlanHierarchyLink[];readonly groups?:readonly PlanHierarchyGroup[];}
export type PlanTreegraphSpec=NodeGraphInput<'treegraph'>;
export type PlanOrganizationSpec=NodeGraphInput<'organization'>;
export type PlanNodeGraphSpec=PlanTreegraphSpec|PlanOrganizationSpec;
export type PlanNetworkgraphSpec=NodeGraphInput<'networkgraph'>;
export interface PlanPackedBubblePoint{readonly id:string;readonly label?:string;readonly value:number|null;}
export interface PlanPackedBubbleSeries{readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanPackedBubblePoint[];}
export interface PlanPackedBubbleSpec{readonly family:'packedbubble';readonly title:string;readonly description?:string;readonly series:readonly PlanPackedBubbleSeries[];readonly splitSeries?:boolean;}
export interface PlanHistogramSpec{readonly family:'histogram';readonly title:string;readonly description?:string;readonly samples:readonly number[];readonly binCount?:number;}
export interface PlanBellcurveSpec{readonly family:'bellcurve';readonly title:string;readonly description?:string;readonly samples:readonly number[];readonly intervals?:number;readonly standardDeviations?:number;}
export interface PlanDistributionSummary{readonly derived:true;readonly sampleCount:number;readonly mean?:number;readonly sampleStandardDeviation?:number;}
export type PlanMixedSpec=Pick<MixedChartSpec,'family'|'title'|'description'|'axes'|'series'|'groupGap'|'barGap'|'maxBarWidth'>;
export type PlanTreemapNode=Readonly<{id:string;label?:string}>&(Readonly<{value:number|null;children?:never}>|Readonly<{children:readonly PlanTreemapNode[];value?:never}>);
export interface PlanTreemapSpec {readonly family:'treemap';readonly title:string;readonly description?:string;readonly root:PlanTreemapNode;}
export type PlanScatterSpec=Pick<ScatterChartSpec,'family'|'title'|'description'|'axes'>&{readonly series:readonly Pick<ScatterChartSpec['series'][number],'id'|'name'|'color'|'data'>[]};
export type PlanColumnSpec = Pick<ColumnChartSpec, 'family' | 'title' | 'description' | 'axes' | 'series' | 'orientation' | 'groupGap' | 'barGap' | 'maxBarWidth'>;
export type PlanWaterfallPoint=Readonly<{id:string;x:string}>&(Readonly<{kind:'delta';value:number}>|Readonly<{kind:'subtotal'|'total';value?:never}>);
export interface PlanWaterfallSeries {readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanWaterfallPoint[];}
export type PlanWaterfallSpec=Omit<PlanColumnSpec,'family'|'series'|'orientation'|'barGap'>&Readonly<{family:'waterfall';series:readonly [PlanWaterfallSeries];startValue?:number}>;
export interface PlanFunnelPoint {readonly id:string;readonly label:string;readonly value:number;readonly color?:string;}
export interface PlanFunnelSpec {readonly family:'funnel';readonly title:string;readonly description?:string;readonly data:readonly PlanFunnelPoint[];readonly neckWidth?:number;readonly neckHeight?:number;readonly reversed?:boolean;}
export interface PlanPyramidSpec {readonly family:'pyramid';readonly title:string;readonly description?:string;readonly data:readonly PlanFunnelPoint[];readonly reversed?:boolean;}
export interface PlanParetoSpec {readonly family:'pareto';readonly title:string;readonly description?:string;readonly data:readonly Readonly<{id:string;label:string;value:number}>[];}
export interface PlanRadarSeries {readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly Readonly<{id:string;x:string;y:number|null}>[];}
export interface PlanRadarSpec {readonly family:'radar';readonly title:string;readonly description?:string;readonly axes:Readonly<{x:Readonly<{kind:'category';values:readonly Readonly<{id:string;label?:string}>[];title?:string}>;y:Readonly<{kind:'linear';domain?:readonly[number,number];title?:string;nice?:boolean;ticks?:Readonly<{targetCount?:number}>}>}>;readonly series:readonly PlanRadarSeries[];}
export interface PlanPolarSpec {readonly family:'polar';readonly title:string;readonly description?:string;readonly data:PlanPieSpec['data'];readonly domain?:readonly[number,number];readonly radiusScale?:'linear'|'area';}
export interface PlanPolarGrid {readonly cx:number;readonly cy:number;readonly radius:number;readonly rings:readonly Readonly<{radius:number;label:string;commands?:readonly PlanCommand[]}>[];readonly spokes:readonly Readonly<{id:string;x:number;y:number;label:string}>[];}
export type PlanPieSpec = Pick<PieChartSpec,'family'|'title'|'description'|'data'>;
export type PlanDonutSpec = Pick<DonutChartSpec,'family'|'title'|'description'|'data'|'holeRatio'>;
export type PlanGaugeSpec = Pick<GaugeChartSpec,'family'|'title'|'description'|'value'|'domain'|'preset'|'unit'|'color'|'bands'|'target'>;
export interface PlanBubblePoint {readonly id:string;readonly x:number|null;readonly y:number|null;readonly z:number;readonly label?:string;}
export interface PlanBubbleSeries {readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanBubblePoint[];}
export interface PlanBubbleSpec {
  readonly family:'bubble';readonly title:string;readonly description?:string;
  readonly axes:Readonly<{x:NumericAxis;y:NumericAxis}>;
  readonly series:readonly PlanBubbleSeries[];
}
export interface PlanVectorPoint {readonly id:string;readonly x:number|null;readonly y:number|null;readonly dx:number|null;readonly dy:number|null;}
export interface PlanWindbarbPoint {readonly id:string;readonly x:number|null;readonly value:number|null;readonly direction:number|null;}
export interface PlanDirectionalSeries<P> {readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly P[];}
export interface PlanVectorSpec {readonly family:'vector';readonly title:string;readonly description?:string;readonly unit?:string;readonly axes:Readonly<{x:NumericAxis;y:NumericAxis}>;readonly series:readonly PlanDirectionalSeries<PlanVectorPoint>[];}
export interface PlanWindbarbSpec {readonly family:'windbarb';readonly title:string;readonly description?:string;readonly axes:Readonly<{x:NumericAxis;y:NumericAxis}>;readonly series:readonly PlanDirectionalSeries<PlanWindbarbPoint>[];}
import type {PlanWindRoseSpec,PlanRadialBarSpec} from './circular-bar-plan-types.js';
export type {PlanWindRoseSpec,PlanRadialBarSpec} from './circular-bar-plan-types.js';
import type {PlanParallelSpec,PlanParallelValue,PlanParallelLayout} from './parallel-plan-types.js';
export type {PlanParallelSpec,PlanParallelAxis,PlanParallelPoint,PlanParallelSeries,PlanParallelValue,PlanParallelAxisFrame,PlanParallelLayout} from './parallel-plan-types.js';
import type {PlanDendrogramSpec,PlanDendrogramValue,PlanDendrogramLayout} from './dendrogram-plan-types.js';
export type {PlanDendrogramSpec,PlanDendrogramNode,PlanDendrogramValue,PlanDendrogramLayout} from './dendrogram-plan-types.js';
export type PlanSpec = PlanDendrogramSpec | PlanParallelSpec | PlanWindRoseSpec | PlanRadialBarSpec | PlanHeatmapSpec | PlanVennSpec | PlanContourSpec | PlanTilemapSpec | PlanPictorialSpec | PlanWordCloudSpec | PlanRelationshipSpec | PlanBulletSpec | PlanVariwideSpec | PlanXRangeSpec | PlanTimelineSpec | PlanSankeySpec | PlanVectorSpec | PlanWindbarbSpec | PlanNetworkgraphSpec | PlanPackedBubbleSpec | PlanSunburstSpec | PlanNodeGraphSpec | PlanVariablePieSpec | PlanItemSpec | PlanPolygonSpec | PlanLollipopSpec | PlanDumbbellSpec | PlanColumnPyramidSpec | PlanBoxplotSpec | PlanErrorbarSpec | PlanStreamgraphSpec | PlanRangeSpec | PlanHistogramSpec | PlanBellcurveSpec | PlanAreaSplineSpec | PlanFunnelSpec | PlanPyramidSpec | PlanParetoSpec | PlanRadarSpec | PlanPolarSpec | PlanWaterfallSpec | PlanTreemapSpec | PlanMixedSpec | PlanAreaSpec | PlanSplineSpec | PlanScatterSpec | PlanLineSpec | PlanColumnSpec | PlanPieSpec | PlanDonutSpec | PlanGaugeSpec | PlanBubbleSpec;
export interface PlanOptions {
  /** Renderer-only measured-text port, supported by WordCloud. */
  readonly wordcloudText?:PlanWordCloudTextInput;
  readonly width: number;
  readonly height: number;
  readonly hiddenSeriesIds?: readonly string[];
  /** Stacking for area or column data; horizontal columns remain bars. */
  readonly stacking?:'sum'|'percent';
  readonly viewport?:PlanViewportConfig;
  readonly references?:readonly PlanReference[];
}
export type PlanReference=Readonly<{id:string;axis:'x';value:string|number}>|Readonly<{id:string;axis:'y';value:number}>;
export type PlanProjectedReference=Readonly<{id:string;axis:'x'|'y'}>&(
  Readonly<{status:'visible';line:Readonly<{x1:number;y1:number;x2:number;y2:number}>}>
  |Readonly<{status:'outside'|'unavailable';line?:never}>
);
export type PlanViewportValue=ChartViewportValue;
export interface PlanViewportConfig {readonly axes:'x'|'y'|'xy';readonly value?:PlanViewportValue;}
export type PlanViewportAxis=Readonly<{kind:'category';ids:readonly string[];edgeSpacing:number}>|Readonly<{kind:'linear'|'time';domain:ChartNumericWindow|null;limits?:Readonly<{minSpan:number}>}>;
/** Closed, host-neutral state. No internal scale, callback or DOM reference escapes. */
export interface PlanViewportState {
  readonly axes:'x'|'y'|'xy';readonly value:PlanViewportValue;
  readonly bounds:Readonly<{x:PlanViewportAxis;y:PlanViewportAxis}>;
  readonly displayed:Readonly<{x:ChartNumericWindow|null;y:ChartNumericWindow|null}>;
  readonly reversed:Readonly<{x:boolean;y:boolean}>;
  /** Projected data rectangle, for host gesture coordinates; not a value scale. */
  readonly plot?:Readonly<{x:number;y:number;width:number;height:number}>;
}
export type PlanViewportIntent=Readonly<{kind:'zoom';factor:number;anchor?:Readonly<{x?:number;y?:number}>}>
  |Readonly<{kind:'pan';delta:Readonly<{x?:number;y?:number}>}>
  |Readonly<{kind:'transform';factor:number;anchor?:Readonly<{x?:number;y?:number}>;delta?:Readonly<{x?:number;y?:number}>}>
  |Readonly<{kind:'reset'}>;
export type PlanViewportResult=Readonly<{status:'ok';value:PlanViewportValue}>|Readonly<{status:'invalid';diagnostic:ChartDiagnostic}>;
export type PlanCommand =
  | Readonly<{kind:'M'|'L';x:number;y:number}>
  /** Axis-aligned ellipse; omission of radiusY preserves the circular radius. */
  | Readonly<{kind:'A';radius:number;radiusY?:number;largeArc:0|1;sweep:0|1;x:number;y:number}>
  /** Quadratic Bézier in plot-local logical coordinates. */
  | Readonly<{kind:'Q';cx:number;cy:number;x:number;y:number}>
  | Readonly<{kind:'Z'}>;
export interface PlanBar {readonly pointId?:string;readonly x:number;readonly y:number;readonly width:number;readonly height:number;}
export interface PlanCircle {readonly pointId?:string;readonly cx:number;readonly cy:number;readonly radius:number;}
export type PlanHitRegion = Readonly<{kind:'polygon';vertices:readonly Readonly<{x:number;y:number}>[]}> | Readonly<{kind:'circle';cx:number;cy:number;radius:number}>
  | Readonly<{kind:'sector';cx:number;cy:number;radius:number;innerRadius:number;start:number;end:number}>
  | PlanCompoundPolygonHit;
export interface PlanAnnotation {readonly x:number;readonly y:number;readonly text:string;readonly role:'value'|'label';readonly box?:Readonly<{width:number;height:number;seriesId:string}>;readonly stackTotal?:Readonly<{value:number;sign:'positive'|'negative';percentage?:true}>;}
export interface PlanSeries {
  readonly cells?:readonly PlanCellPaint[];
  readonly pictorialFills?:readonly PlanPictorialFill[];
  readonly textGlyphs?:readonly PlanWordCloudTextGlyph[];
  readonly id:string; readonly name:string; readonly color:string;
  readonly commands?:readonly PlanCommand[];
  readonly areaCommands?:readonly PlanCommand[];
  /** Solid relationship nodes, separate from translucent ribbon areas. */
  readonly nodeCommands?:readonly PlanCommand[];
  readonly bars?:readonly PlanBar[];
  readonly circles?:readonly PlanCircle[];
  readonly fill?:boolean;
}
export interface PlanLegendItem {readonly id:string;readonly name:string;readonly color:string;readonly visible:boolean;}
export interface PlanObservation {
  readonly dendrogram?:PlanDendrogramValue;
  readonly parallel?:PlanParallelValue;
  readonly heatmap?:PlanHeatmapValue;
  readonly venn?:PlanVennValue;
  readonly contour?:PlanContourValue;
  readonly tilemap?:PlanTilemapValue;
  readonly pictorial?:PlanPictorialValue;
  readonly interval?:PlanIntervalValue;
  readonly event?:PlanTimelineEvent;
  readonly relationship?:PlanRelationshipMetadata;
  readonly bullet?:PlanBulletValue;
  readonly variwide?:PlanVariwideValue;
  readonly sankey?:(Readonly<{kind:'node';incoming:number;outgoing:number}>|Readonly<{kind:'link';from:string;to:string;fromLabel:string;toLabel:string}>)&Readonly<{geometryOmitted?:true}>;
  readonly vector?:Readonly<{dx:number;dy:number}>;
  readonly wind?:Readonly<{direction:number|null}>;
  readonly yValue?:number;
  readonly node?:Readonly<{incoming:number;outgoing:number}>&(Readonly<{depth:number;directed?:true}>|Readonly<{directed:false;depth?:never}>);
  readonly stem?:Readonly<{x:number;startY:number;endY:number}>;
  readonly minimumValue?:number;readonly q1Value?:number;readonly medianValue?:number;readonly q3Value?:number;readonly maximumValue?:number;
  readonly lowValue?:number;readonly highValue?:number;
  readonly valueUnit?:'%';
  readonly id:Readonly<{seriesId:string;pointId:string}>;
  readonly label:string;readonly seriesName:string;readonly value:number;
  readonly x:number;readonly y:number;readonly color:string;
  readonly group?:Readonly<{key:string;label:string;coordinate:number}>;
  readonly hit?:PlanHitRegion;
  readonly percentage?:number;readonly xValue?:number;readonly sizeValue?:number;
  readonly subtotal?:boolean;readonly incomplete?:boolean;
  readonly computedKind?:'subtotal'|'total';
}
export interface PlanFrame {
  readonly heatmapData?:readonly PlanHeatmapSummary[];
  readonly heatmapLayout?:PlanHeatmapLayout;
  readonly vennData?:readonly PlanVennSummary[];
  readonly vennLayout?:PlanVennLayout;
  readonly contour?:PlanContourLayout;
  readonly colorAxis?:PlanColorAxisFrame;
  readonly tilemapData?:readonly PlanTilemapSummary[];
  readonly tilemapLayout?:PlanTilemapLayout;
  readonly pictorialGlyphs?:readonly PlanPictorialGlyph[];
  readonly pictorialData?:readonly PlanPictorialSummary[];
  readonly pictorialLayout?:PlanPictorialLayoutSummary;
  readonly wordcloudData?:readonly PlanWordCloudSummary[];
  readonly wordcloudLayout?:PlanWordCloudLayout;
  readonly bulletData?:readonly PlanBulletSummary[];
  readonly bulletBands?:readonly PlanBulletBandGeometry[];
  readonly bulletTargets?:readonly PlanBulletTargetGeometry[];
  readonly bulletOrientation?:'horizontal'|'vertical';
  readonly bulletGrid?:readonly Readonly<{x1:number;y1:number;x2:number;y2:number}>[];
  readonly categoryBands?:readonly PlanVariwideCategoryBand[];
  readonly variwideData?:readonly PlanVariwideSummary[];
  readonly variwideLayout?:Readonly<{status:'ready'|'no-positive-width';incomplete:boolean}>;
  readonly intervals?:readonly PlanIntervalSummary[];
  readonly events?:readonly PlanTimelineSummary[];
  readonly distribution?:PlanDistributionSummary;
  readonly secondaryGrid?:readonly Readonly<{y:number;label:string}>[];
  readonly schema:'nc-plan/1';
  readonly family:PlanSpec['family']|'bar';
  readonly title:string;readonly description:string;readonly unit:string;
  readonly width:number;readonly height:number;
  readonly legend:readonly PlanLegendItem[];
  readonly series:readonly PlanSeries[];
  readonly observations:readonly PlanObservation[];
  readonly grid:readonly Readonly<{y:number;label:string}>[];
  readonly labels:readonly Readonly<{x:number;label:string}>[];
  readonly yLabels?:readonly Readonly<{id:string;y:number;label:string}>[];
  readonly annotations?:readonly PlanAnnotation[];
  readonly viewport?:PlanViewportState;
  readonly references?:readonly PlanProjectedReference[];
  readonly dendrogram?:PlanDendrogramLayout;
  readonly parallel?:PlanParallelLayout;
  readonly polarGrid?:PlanPolarGrid;
}
export type PlanResult =
  | Readonly<{status:'ok'|'empty';frame:PlanFrame}>
  | Readonly<{status:'invalid';diagnostic:ChartDiagnostic}>;
