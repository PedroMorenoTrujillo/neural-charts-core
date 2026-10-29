import type { ColumnChartSpec, ColumnMountOptions, ColumnSnapshot } from '../public/column-types.js';
import type { ColumnPolicy, ColumnEngineController } from './renderer.js';
import { columnDataLabels } from './labels.js';
import type { ChartCategoryWindow, ChartViewportValue, ChartViewportChange } from '../public/viewport-types.js';
import { fullViewportBounds } from '../internal/interaction/viewport-bounds.js';
import { prepareViewport, requestViewport as proposeViewport, sameViewport, viewportCategoryWindow, type Viewport } from '../internal/interaction/viewport.js';
import { cartesianViewportContext, withViewportAxes, withViewportDomains } from '../internal/interaction/viewport-axes.js';
import type { ChartResult, ChartState, ChartDiagnostic } from '../public/chart-types.js';
import type { Domain } from '../internal/math/domain.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { createBrowserPorts } from '../internal/platform/browser.js';
import { reserveInstance, type IdReservation } from '../internal/platform/id.js';
import { createBrowserMotion, paintLayerMotion, type LayerMotion } from '../internal/lifecycle/motion.js';
import { viewportShell, createViewportView, type ViewportView, type ViewportViewState } from '../internal/interaction/viewport-view.js';
import { createRevisionScheduler, type RevisionScheduler, type RevisionToken, type DirtyReason } from '../internal/lifecycle/scheduler.js';
import { createSvgWriter, type SceneWriter, type PreparedScene } from '../internal/scene/svg-writer.js';
import { createTextMeasurer, ellipsis, type TextMeasurer } from '../internal/layout/text.js';
import { shellFrame, type ShellFrame } from '../internal/layout/frame.js';
import { emptyLayers, axesScene, referenceScene, frame, type Layers } from '../internal/axes/scene.js';
import { drawReferenceBands, referenceBandContext } from '../internal/axes/reference-band-view.js';
import type { AxesPlan } from '../internal/axes/plan.js';
import { createShell, shellIds, applyShell, type Shell } from '../internal/chart/shell.js';
import { cleanup, removeOwnedNode } from '../internal/chart/cleanup.js';
import { resolvePalette, resolveDashes, type Palette, type ResolvedFont } from '../internal/chart/presentation.js';
import { orderedState, toggleState, membershipChanged, derivedView } from '../internal/chart/state.js';
import { createLegendView, type LegendView, type LegendItem } from '../internal/legend/view.js';
import { createSemanticView, type SemanticView } from '../internal/accessibility/view.js';
import { semanticPoint } from '../internal/accessibility/model.js';
import { createTableView, type TableView, type TableSource } from '../internal/accessibility/table.js';
import { tooltipModel, type TooltipModel, type TooltipSeries } from '../internal/tooltip/model.js';
import { createTooltipView, allowedRect, unsupportedPortalMapping, type TooltipView } from '../internal/tooltip/view.js';
import { placeTooltip, type Rect, type PlacementResult } from '../internal/tooltip/place.js';
import { attachCartesianInteraction } from '../internal/interaction/cartesian.js';
import { validateColumn, validateColumnOptions, validateColumnState } from './validate.js';
import { normalizeColumn, columnDomain, type NormalizedColumn } from './normalize.js';
import { projectColumn, pickColumn, navigateColumn, reconcileColumn, columnDockBody, type ColumnProjection, type ColumnRect } from './geometry.js';
import { planColumnAxes } from './axes.js';
import { columnScene, columnFocusScene, columnReferenceCaption } from './scene.js';
import { provideExport } from '../internal/export/capture.js';
import { cartesianRecords } from '../internal/export/records.js';
import type { SeriesPointId, ChartSelectionChange } from '../public/interaction-types.js';
import { prepareSelection, replaceSelection, toggleSelection, selectionChanged, type Selection } from '../internal/interaction/selection.js';
import { seriesIdentities } from '../internal/interaction/identities.js';
import { selectionScene, crosshairScene } from '../internal/interaction/decoration.js';
import { columnKey } from './normalize.js';
import { sameSelectionInput } from '../internal/interaction/selection-frame.js';

type Input<T> = Readonly<{ data: NormalizedColumn<T>; state: ChartState; domain: Domain | null; viewport: Viewport | null; selection: Selection<SeriesPointId> | null; known: ReadonlyMap<string, SeriesPointId> | null }>;
type Computed<T> = Readonly<{ shell: ShellFrame; palette: Palette; font: ResolvedFont; axes: AxesPlan | null; projection: ColumnProjection<T> | null; layers: Layers; view: NonNullable<ColumnSnapshot['view']>; status: string; legend: readonly LegendItem[]; tooltipSeries: readonly TooltipSeries[]; table: TableSource }>;
type MainCandidate<T> = Readonly<{ input: Input<T>; value: Computed<T>; scene: PreparedScene | null; animate: boolean | 'continue' }>;
type DetailJob<T> = Readonly<{ revision: number; generation: number; sequence: number; stage: 'intent' | 'measure'; target: ColumnRect<T> | null; detail: boolean; sample?: Readonly<{ x: number; y: number }> }>;
type DetailCandidate<T> = Readonly<{ job: DetailJob<T>; target: ColumnRect<T> | null; scene: PreparedScene; model: TooltipModel | null; bounds: Rect; placement: PlacementResult | null }>;
function invoke<T>(fn: ((value:T)=>void)|null, value:T):void { try { fn?.(value); } catch { /* Consumer exceptions do not own engine lifecycle. */ } }
function viewportFor<T>(data: NormalizedColumn<T>, automatic: Domain | null, policy: ColumnPolicy<T> | null | undefined, previous: Viewport | null = null): ChartResult<Viewport | null> {
  if (!data.spec.viewport) return ok(null);
  const domain = policy ? policy.domain : columnDomain;
  const bounds = fullViewportBounds(data, data.series.map(series => series.spec.id), hiddenSeriesIds => { const value = domain(data, { hiddenSeriesIds }); return value.status === 'invalid' ? value : ok({ x: null, y: value.value }); }); if (bounds.status === 'invalid') return bounds;
  const context = cartesianViewportContext(data.spec.axes, bounds.value, { x: null, y: automatic }); if (context.status === 'invalid') return context;
  return prepareViewport(data.spec.viewport, context.value, previous);
}

export function createColumnChart<T=unknown,S=ColumnChartSpec<T>>(host: HTMLElement, spec: S, options: ColumnMountOptions<T>, policy?:ColumnPolicy<T>): ChartResult<ColumnEngineController<T,S>> {
  const validated=policy?policy.parse(spec):validateColumn<T>(spec);if(validated.status==='invalid')return validated;
  const data=normalizeColumn(validated.value), ids=new Set(data.series.map(s=>s.spec.id)), opts=validateColumnOptions<T>(options,ids);if(opts.status==='invalid')return opts;
  const mode=data.spec.state?.mode??'internal';
  if(mode==='controlled'&&opts.value.initialState)return invalid('INVALID_CONFIG','BAD_STATE','options.initialState');
  if(mode==='controlled'&&data.series.length&&data.spec.legend?.position!=='none'&&!opts.value.onStateChange)return invalid('INVALID_CONFIG','MISSING_STATE_HANDLER','options.onStateChange');
  const state=validateColumnState(data.spec.state?.mode==='controlled'?data.spec.state.value:opts.value.initialState??{hiddenSeriesIds:[]},ids,'state');if(state.status==='invalid')return state;
  const ordered=orderedState(state.value,[...ids]),domain=policy?policy.domain(data,ordered):columnDomain(data,ordered);if(domain.status==='invalid')return domain;
  const known=data.spec.selection?seriesIdentities(data.spec):null,selected=known?prepareSelection(data.spec.selection,known):ok(null);if(selected.status==='invalid')return selected;
  if(selected.value?.mode==='controlled'&&!opts.value.onSelectionChange)return invalid('INVALID_CONFIG','MISSING_SELECTION_HANDLER','options.onSelectionChange');
  const viewport=viewportFor(data,domain.value,policy);if(viewport.status==='invalid')return viewport;
  if(viewport.value?.settings.mode==='controlled'&&!opts.value.onViewportChange)return invalid('INVALID_CONFIG','MISSING_VIEWPORT_HANDLER','options.onViewportChange');
  try {
    if(!host||host.nodeType!==1||host.namespaceURI!=='http://www.w3.org/1999/xhtml'||!host.isConnected||!host.ownerDocument.defaultView||host.getRootNode()!==host.ownerDocument)return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');
    return mount<T,S>(host,{data,state:ordered,domain:domain.value,viewport:viewport.value,selection:selected.value,known},opts.value,policy??null);
  } catch { return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host'); }
}
function mount<T,S>(host:HTMLElement|null, initial:Input<T>|null, options:ColumnMountOptions<T>|null, policy:ColumnPolicy<T>|null):ChartResult<ColumnEngineController<T,S>> {
  let ownedHost=host,accepted=initial,committed:Input<T>|null=null,computed:Computed<T>|null=null,shell:Shell|null=null;
  let onActivate=options!.onPointActivate??null,onState=options!.onStateChange??null,onDiagnostic=options!.onDiagnostic??null;
  let onSelectionChange=options!.onSelectionChange??null;
  let onViewportChange=options!.onViewportChange??null;
  let motion:LayerMotion|null=null;
  let viewportView:ViewportView|null=null;
  function viewportViewState():ViewportViewState|null {
    const model=committed?.viewport,axes=computed?.axes,spec=committed?.data.spec;
    return phase==='active'&&model&&axes&&spec&&!main?.getSnapshot().pending?{model,plot:axes.plot,domains:{x:axes.x.domain,y:axes.y.domain},horizontal:spec.orientation==='horizontal',xReversed:false,yReversed:!!spec.axes.y.reversed,enabled:(spec.status?.kind??'ready')==='ready'&&!axes.tooSmall}:null;
  }
  const instanceId=options!.instanceId,mode=initial!.data.spec.state?.mode??'internal',reservations:IdReservation[]=[];
  let measurer:TextMeasurer|null=null,base:SceneWriter|null=null,overlay:SceneWriter|null=null,legend:LegendView|null=null,semantic:SemanticView|null=null,table:TableView|null=null,tooltip:TooltipView|null=null;
  let main:RevisionScheduler<Input<T>>|null=null,interaction:RevisionScheduler<DetailJob<T>>|null=null,events:ReturnType<typeof attachCartesianInteraction>|null=null,observer:Readonly<{disconnect():void}>|null=null;
  let media:MediaQueryList|null=null,fonts:FontFaceSet|null=null;const fontHolder:{callback:(()=>void)|null}={callback:null};
  let phase:ColumnSnapshot['phase']='suspended',size={width:0,height:0},revision=0,committedRevision=0,generation=0,sequence=0;
  let releaseExport:(()=>void)|null=null;
  let current:ColumnRect<T>|null=null,hover:ColumnRect<T>|null=null,gridFocused=false,pinned=false,wanted=false,destroyed=false,suppressFocus=false,inCommit=false,disposeRequested=false;
  function snapshot():ColumnSnapshot { return Object.freeze({phase,revision,committedRevision,view:phase==='active'?computed?.view??null:null,size:Object.freeze({...size})}); }
  function resources():void {
    cleanup(()=>viewportView?.destroy());viewportView=null;
    cleanup(()=>releaseExport?.());releaseExport=null;
    cleanup(()=>main?.destroy());cleanup(()=>interaction?.destroy());main=null;interaction=null;cleanup(()=>motion?.destroy());motion=null;
    cleanup(()=>observer?.disconnect());observer=null;fontHolder.callback=null;
    cleanup(()=>fonts?.removeEventListener('loadingdone',fontsChanged));cleanup(()=>fonts?.removeEventListener('loadingerror',fontsChanged));fonts=null;
    cleanup(()=>media?.removeEventListener('change',mediaChanged));media=null;
    cleanup(()=>events?.destroy());events=null;cleanup(()=>legend?.destroy());legend=null;cleanup(()=>semantic?.destroy());semantic=null;cleanup(()=>table?.destroy());table=null;cleanup(()=>tooltip?.destroy());tooltip=null;
    cleanup(()=>base?.dispose());base=null;cleanup(()=>overlay?.dispose());overlay=null;cleanup(()=>measurer?.destroy());measurer=null;
    accepted=null;committed=null;computed=null;current=null;hover=null;onActivate=null;onState=null;onSelectionChange=null;onViewportChange=null;initial=null;options=null;host=null;policy=null;
  }
  function dispose():void { resources();onDiagnostic=null;removeOwnedNode(shell?.root??null);shell=null;for(const r of reservations.splice(0).reverse())cleanup(()=>r.release());ownedHost=null;disposeRequested=false; }
  function destroy():void { if(destroyed)return;destroyed=true;phase='destroyed';sequence++;cleanup(()=>main?.destroy());cleanup(()=>interaction?.destroy());if(inCommit)disposeRequested=true;else dispose(); }
  function fault(diagnostic:ChartDiagnostic):void {
    if(destroyed||phase==='faulted')return;phase='faulted';sequence++;const callback=onDiagnostic,root=shell?.root??null,focused=!!root?.contains(root.ownerDocument.activeElement);resources();onDiagnostic=null;
    if(root)try{root.replaceChildren();root.removeAttribute('aria-labelledby');root.removeAttribute('aria-describedby');root.setAttribute('aria-label','Chart unavailable');root.textContent='Chart unavailable. Remount the chart to retry.';if(focused)root.focus({preventScroll:true});}catch{/* Preserve faulted owner for destroy. */}
    invoke(callback,diagnostic);
  }
  function report(diagnostic:ChartDiagnostic):void { if(destroyed)return;if(diagnostic.code==='LIFECYCLE_ERROR'||diagnostic.code==='INTERNAL_INVARIANT')fault(diagnostic);else invoke(onDiagnostic,diagnostic); }
  function submit(reason:'data'|'size'|'paint'):ChartResult<number> {
    if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','controller');if(phase==='faulted'||!accepted||!main)return invalid('LIFECYCLE_ERROR','FAULTED','controller');
    if(size.width>0&&size.height>0)viewportView?.invalidate();else viewportView?.suspend();
    const result=main.submit(accepted,reason,size.width>0&&size.height>0);if(result.status==='ok'){revision=result.value;legend?.disable(true);}return result;
  }
  function fontsChanged():void { if(destroyed||phase==='faulted')return;measurer?.invalidate();submit('paint'); }
  function mediaChanged():void { if(accepted?.data.spec.theme==='auto')submit('paint'); }
  function ensureMedia():void {
    if(!ownedHost)return;
    if(accepted?.data.spec.theme==='auto'&&!media){try{media=ownedHost.ownerDocument.defaultView!.matchMedia('(prefers-color-scheme: dark)');}catch{return;}media.addEventListener('change',mediaChanged);}
    else if(accepted?.data.spec.theme!=='auto'&&media){cleanup(()=>media?.removeEventListener('change',mediaChanged));media=null;}
  }
  function compute(input:Input<T>):ChartResult<Computed<T>> {
    if(!ownedHost||!measurer)return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');
    const data=input.data,spec=data.spec,direction=spec.direction??'ltr',font:ResolvedFont={family:spec.font?.family??'sans-serif',size:spec.font?.size??12,weight:spec.font?.weight??400};
    const palette=resolvePalette(ownedHost,spec.theme??'light',media?.matches??false),layout=viewportShell(shellFrame(size,!!spec.description,data.series.map(s=>s.spec.name),spec.legend?.position??'bottom',font,direction,measurer),input.viewport),hidden=new Set(input.state.hiddenSeriesIds),visible=data.series.filter(s=>!hidden.has(s.spec.id));
    const view=derivedView(spec.status?.kind??'ready',data.nonnullCount,visible.reduce((n,s)=>n+s.valid.length,0),data.series.length,hidden.size),layers=emptyLayers(),dashes=resolveDashes(data.series,hidden,palette);
    const referenceCaptionHeight=view==='ready'&&(spec.references?.length??0)>0&&layout.body.width>=48&&layout.body.height>=font.size*1.5+40?Math.ceil(font.size*1.5)+8:0;
    let axes:AxesPlan|null=null,projection:ColumnProjection<T>|null=null;
    if(view==='ready'){
      const scoped=withViewportAxes(spec.axes,input.viewport);if(scoped.status==='invalid')return scoped;
      if(scoped.value.x.kind!=='category'||!scoped.value.x.values||scoped.value.y.kind!=='linear')return invalid('INVALID_CONFIG','BAD_VIEWPORT_AXIS','viewport');
      const windowSpec:ColumnChartSpec<T>={...spec,axes:{x:{...scoped.value.x,kind:'category',values:scoped.value.x.values},y:{...scoped.value.y,kind:'linear'}}};
      const shown=withViewportDomains({x:null,y:input.domain},input.viewport),window=input.viewport?.value.x?viewportCategoryWindow(input.viewport.value.x)??undefined:undefined;
      const planned=planColumnAxes(windowSpec,shown.y,layout.body.width,layout.body.height-referenceCaptionHeight,font,data.labels,measurer,layout.compact);if(planned.status==='invalid')return planned;axes=planned.value;
      const domain=spec.orientation==='horizontal'?axes.x.domain:axes.y.domain;
      if(!axes.tooSmall&&domain){const projected=policy?policy.project(data,input.state,axes.plot,domain,window):projectColumn(data,input.state,axes.plot,domain,window);if(projected.status==='invalid')return projected;projection=projected.value;
        axesScene(axes,spec.orientation==='horizontal'?{...spec.axes.y,grid:spec.axes.y.grid??true}:spec.axes.x,spec.orientation==='horizontal'?{...spec.axes.x,grid:spec.axes.x.grid??false}:spec.axes.y,palette,layers,layout.compact);if(policy)policy.render(projection,palette,layers);else columnScene(projection,palette,layers);
      }
    }
    const horizontal=spec.orientation==='horizontal',refs=spec.references??[],referenceInfo=axes?referenceScene(refs.map(r=>horizontal?{...r,axis:'x' as const}:r),axes,palette,layers,()=>({text:null,width:0,height:0})):[];
    if (axes && spec.referenceBands?.length) { const scoped = withViewportAxes(spec.axes, input.viewport); if (scoped.status === 'invalid') return scoped; const bands = drawReferenceBands(spec.referenceBands, axes, scoped.value, spec.axes, palette, layers, measurer, horizontal); if (bands.status === 'invalid') return bands; }
    const shownDomain=axes?(horizontal?axes.x.domain:axes.y.domain):input.domain;
    const context=[spec.axes.x.title?`Category: ${spec.axes.x.title}.`:'',spec.axes.y.title?`Value: ${spec.axes.y.title}.`:'',shownDomain?`Displayed value domain ${shownDomain[0]} to ${shownDomain[1]}. Baseline zero; rectangles are clipped to this domain.`:'','Categories follow the supplied category order.',policy?.context(data)??'',referenceBandContext(spec.referenceBands,spec.axes)].filter(Boolean).join(' ');
    const references=refs.map(r=>`${r.label??r.id}. Y ${r.value}.${(referenceInfo.find(i=>i.id===r.id)?.outside??(!!shownDomain&&(r.value<shownDomain[0]||r.value>shownDomain[1])))?' Outside displayed domain.':''}`);
    const referenceCaption=referenceCaptionHeight?ellipsis((refs.length===1?'Reference: ':'References: ')+refs.map(r=>(r.label??r.id+' · '+r.value)+(referenceInfo.find(i=>i.id===r.id)?.outside?' (outside domain)':'')).join(' | '),layout.body.width-24,text=>measurer!.measure(text,font,direction)):null;
    columnReferenceCaption(layers,referenceCaption,palette,font,direction,layout.body.width,layout.body.height);
    if(projection&&spec.labels==='auto'){const projected=projection,label=policy?.dataLabel,labeled=columnDataLabels(projected,palette,font,layers,text=>measurer!.measure(text,font,direction),direction==='rtl',label?target=>label(target,projected):undefined);if(labeled.status==='invalid')return labeled;}
    const tableLabels=new Map([...data.labels].map(([id,label])=>[id,data.duplicateLabels.has(label)?`${label} · ${id}`:label]));
    const status=view==='ready'?axes?.tooSmall?'Chart is too small to display bars. Enlarge the chart or view the data table.':projection&&!projection.rects.length?policy?.emptyStatus(projection)??'No bars intersect the displayed domain. View the data table for all observations.':'':spec.status&&'message'in spec.status?spec.status.message??(view==='loading'?'Loading chart data.':'No observations.'):view==='no-visible-series'?'No visible series. Use the legend to show a series.':view==='loading'?'Loading chart data.':view==='error'?'Chart data unavailable.':'No visible observations.';
    return ok({shell:layout,palette,font,axes,projection,layers,view,status,legend:data.series.map((s,i)=>({id:s.spec.id,name:s.spec.name,color:s.spec.color??palette.series[s.colorIndex]!,dash:dashes.get(s.spec.id)!,width:layout.legendPosition==='end'?160:layout.buttonWidths[i]!})),tooltipSeries:visible.map(s=>({id:s.spec.id,name:s.spec.name,color:s.spec.color??palette.series[s.colorIndex]!,dash:dashes.get(s.spec.id)!,byX:s.byX})),table:{title:spec.title,kind:'category',labels:tableLabels,series:spec.series,hidden,context,references}});
  }
  function tooltipFor(target:ColumnRect<T>):TooltipModel { const model=tooltipModel(committedRevision,target.series.spec.id,target.point.id,target.point.x,'category',committed!.data.spec.tooltip?.mode==='shared'?'shared':'point',computed!.tooltipSeries,committed!.data.labels,committed!.data.duplicateLabels);return policy&&computed!.projection?policy.tooltip(target,model,computed!.projection):model; }
  function pick(projection:ColumnProjection<T>,x:number,y:number):ColumnRect<T>|null { return policy?policy.pick(projection,x,y):pickColumn(projection,x,y); }
  function semanticUpdate(navigation=false):void {
    if(!semantic||!computed||!committed)return;const model=current?tooltipFor(current):null,context=[computed.table.context,...computed.table.references].join(' ');
    const selected=committed.selection,basePoint=current&&model?semanticPoint(current.series.spec.name,current.seriesIndex+1,current.categoryIndex+1,model.header,current.point.y!,context,model):null;
    const active=basePoint&&selected&&current?{...basePoint,selected:selected.value.some(id=>id.seriesId===current!.series.spec.id&&id.pointId===current!.point.id),detail:basePoint.detail+' Selection: '+selected.value.length+' observations.'}:basePoint;
    semantic.update({rowCount:computed.projection?.rows.length??0,columnCount:committed.data.spec.axes.x.values.length,current:active,summary:computed.status||'Chart data. No bars in the displayed domain. Use the data table.',...(selected?{multiselectable:selected.kind==='multiple'}:{})},computed.axes?.plot??{x:0,y:0,width:computed.shell.body.width,height:computed.shell.body.height},navigation);
  }
  function paintSelection(layers:Layers,value:Computed<T>,input:Input<T>):void {
    if(!input.selection||!value.projection)return;
    selectionScene(layers,input.selection.value,(id,selected)=>{const target=value.projection!.byId.get(columnKey(id.seriesId,id.pointId));if(target)columnFocusScene(target,value.palette,selected);});
  }
  function select(value:readonly SeriesPointId[],source:'api'|'pointer'|'touch'|'keyboard'):ChartResult<number> {
    if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','controller');
    if(phase!=='active'||!accepted||!committed?.selection||!committed.known)return invalid('LIFECYCLE_ERROR','SELECTION_UNAVAILABLE','selection');
    const pending=!!main?.getSnapshot().pending;if(pending&&(source==='api'||!sameSelectionInput(accepted,committed)))return invalid('LIFECYCLE_ERROR','UPDATE_PENDING','selection');
    const checked=replaceSelection(committed.selection,committed.known,value);if(checked.status==='invalid')return checked;if(!selectionChanged(committed.selection,checked.value))return ok(committedRevision);
    const event:ChartSelectionChange<SeriesPointId>=Object.freeze({selection:checked.value.value,effect:checked.value.mode==='controlled'?'proposal':'accepted',source,revision:committedRevision});
    if(checked.value.mode==='internal'){accepted={...accepted,selection:checked.value};committed={...committed,selection:checked.value};if(pending){const submitted=submit('paint');if(submitted.status==='invalid'){fault(submitted.diagnostic);return submitted;}}try{table?.updateSelection(checked.value.value);sequence++;semanticUpdate();detailJob();}catch{const diagnostic=invalid('INTERNAL_INVARIANT','DOM_WRITE_FAILED','selection').diagnostic;fault(diagnostic);return{status:'invalid',diagnostic};}}
    invoke(onSelectionChange,event);return ok(event.revision);
  }
  function detailFocused():boolean { return !!shell&&shell.detail.contains(shell.root.ownerDocument.activeElement); }
  function invalidate():void { sequence++;hover=null;pinned=false;wanted=false;events?.pin(false,committedRevision);const previous=suppressFocus;suppressFocus=true;tooltip?.close(true);suppressFocus=previous;overlay?.clear(); }
  function detailJob(stage:'intent'|'measure'='intent',sample?:Readonly<{x:number;y:number}>):void {
    if(!interaction||!computed?.projection||phase!=='active'||table?.isOpen())return;
    interaction.submit({revision:committedRevision,generation,sequence,stage,target:gridFocused||pinned||detailFocused()?current:hover,detail:wanted,...(sample?{sample}:{})},'paint',true);
  }
  function fresh(job:DetailJob<T>):boolean { return !destroyed&&phase==='active'&&job.revision===committedRevision&&job.generation===generation&&job.sequence===sequence&&!table?.isOpen(); }
  function matrix():DOMMatrix|null { const m=shell?.base.querySelector('svg')?.getScreenCTM();return m&&[m.a,m.b,m.c,m.d,m.e,m.f].every(Number.isFinite)&&m.a*m.d-m.b*m.c!==0?m:null; }
  function mapped(m:DOMMatrix,x:number,y:number):Readonly<{x:number;y:number}> { return{x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}; }
  function prepareDetail(job:DetailJob<T>,token:RevisionToken):ChartResult<DetailCandidate<T>|null> {
    if(!fresh(job)||!computed?.projection||!ownedHost)return ok(null);
    let target=job.target;const m=matrix();
    if(job.sample){if(gridFocused||pinned||detailFocused())return ok(null);const local=m?mapped(m.inverse(),job.sample.x,job.sample.y):null;target=local?pick(computed.projection,local.x,local.y):null;}
    const layers=emptyLayers();paintSelection(layers,computed,committed!);if(target){crosshairScene(layers,committed!.data.spec.crosshair,computed.projection.plot,target.anchor,computed.palette,computed.projection.horizontal);columnFocusScene(target,computed.palette,layers);}
    const scene=overlay!.prepare(frame(token.revision,computed.shell.body.width,computed.shell.body.height,layers,computed.axes??undefined),new Map());if(scene.status==='invalid')return scene;
    const model=target&&job.detail&&committed!.data.spec.tooltip?.mode!=='off'?tooltipFor(target):null,bounds=allowedRect(committed!.viewport ? shell!.body : ownedHost);let placement:PlacementResult|null=null;
    if(job.stage==='measure'&&model){
      const measured=tooltip?.measure(),r=target!,zeroTarget=r.width===0||r.height===0,px=r.width===0?4:0,py=r.height===0?4:0;
      // An observed zero still has a visible focus cue. A degenerate rectangle
      // has zero intersection area and cannot protect that cue from a tooltip.
      const corners=m?[[r.x-px,r.y-py],[r.x+r.width+px,r.y-py],[r.x-px,r.y+r.height+py],[r.x+r.width+px,r.y+r.height+py]].map(([x,y])=>mapped(m,x!,y!)):null;
      const anchor=corners?{x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),width:Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),height:Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))}:null;
      placement=!m||!anchor||unsupportedPortalMapping(ownedHost.ownerDocument)?{kind:'docked'}:measured?placeTooltip(anchor,measured,bounds,committed!.data.spec.tooltip?.placement??'top',committed!.data.spec.direction??'ltr',!!policy||zeroTarget):{kind:'closed'};
    }
    return ok({job,target,scene:scene.value,model,bounds,placement});
  }
  function commitDetail(value:DetailCandidate<T>|null):ChartResult<void> {
    if(!value||!fresh(value.job)||!computed)return ok(undefined);const applied=overlay!.apply(value.scene);if(applied.status==='invalid')return applied;
    if(value.job.sample)hover=value.target;
    if(value.model&&fresh(value.job)){if(value.job.stage==='intent'){tooltip!.write(value.model,value.bounds,computed.palette,computed.font,committed!.data.spec.direction??'ltr');detailJob('measure');}else if(value.placement&&value.target){const body=columnDockBody({x:0,y:0,width:computed.shell.body.width,height:computed.shell.body.height},value.target,computed.projection!.horizontal,committed!.data.spec.direction??'ltr'),p=computed.axes!.plot,x=Math.max(p.x,body.x),plot={...p,x,width:Math.max(0,Math.min(p.x+p.width,body.x+body.width)-x)};tooltip!.show(value.placement,value.model,{anchor:{x:value.target.x-2,y:value.target.y-2,width:Math.max(4,value.target.width+4),height:Math.max(4,value.target.height+4)},plot,body});}}else tooltip?.close();
    return ok(undefined);
  }
  function closeDetail():void { invalidate();gridFocused=!!shell&&shell.root.ownerDocument.activeElement===shell.grid;detailJob(); }
  function prepareMain(input:Input<T>,token:RevisionToken,reasons:ReadonlySet<DirtyReason>):ChartResult<MainCandidate<T>> {
    const c=compute(input);if(c.status==='invalid')return c;let scene:PreparedScene|null=null;
    if(c.value.shell.body.width>0&&c.value.shell.body.height>0){const prepared=base!.prepare(frame(token.revision,c.value.shell.body.width,c.value.shell.body.height,c.value.layers,c.value.axes??undefined),new Map());if(prepared.status==='invalid')return prepared;scene=prepared.value;}
    return ok({input,value:c.value,scene,animate: reasons.has('data') ? true : reasons.has('size') ? false : 'continue'});
  }
  function commitMain(candidate:MainCandidate<T>,token:RevisionToken):ChartResult<void> {
    if(destroyed||!shell||!main?.isCurrent(token))return ok(undefined);inCommit=true;
    try {
      const old=current,focused=shell.root.ownerDocument.activeElement as HTMLElement|null,hadFocus=!!focused&&shell.root.contains(focused),c=candidate.value,spec=candidate.input.data.spec;
      if(candidate.scene){const applied=base!.apply(candidate.scene);if(applied.status==='invalid')return applied;}else base!.clear();if(destroyed)return ok(undefined);
      invalidate();applyShell(shell,c.shell,c.palette,c.font,spec.direction??'ltr',spec.title,spec.description);
      for(const element of [shell.base,shell.overlay]){const svg=element.querySelector('svg');if(svg){svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('direction',spec.direction??'ltr');svg.style.letterSpacing='0px';svg.style.pointerEvents='none';}}
      shell.root.setAttribute('aria-busy',String(c.view==='loading'));shell.status.hidden=!c.status;shell.status.textContent=c.status;shell.status.style.backgroundColor=policy&&c.status?c.palette.surface:'';const disabled=(spec.status?.kind??'ready')!=='ready';legend!.update(c.legend,candidate.input.state,disabled);table!.update(c.table,!disabled,candidate.input.selection?.value??null);if(destroyed)return ok(undefined);
      committed=candidate.input;computed=c;committedRevision=token.revision;generation++;current=c.projection?reconcileColumn(c.projection,old):null;semanticUpdate(!!old&&!!current&&old.key!==current.key);
      viewportView?.update(committed.viewport&&c.axes?{model:committed.viewport,plot:c.axes.plot,domains:{x:c.axes.x.domain,y:c.axes.y.domain},horizontal:spec.orientation==='horizontal',xReversed:false,yReversed:!!spec.axes.y.reversed,enabled:!disabled&&!c.axes.tooSmall}:null);
      if(hadFocus&&focused){
        const valid=focused.isConnected&&!focused.closest('[hidden]')&&!('disabled'in focused&&(focused as HTMLButtonElement).disabled);
        if(valid&&shell.root.ownerDocument.activeElement!==focused)focused.focus({preventScroll:true});
        else if(!valid){
          const now=shell.root.ownerDocument.activeElement as HTMLElement|null;
          // The paginated table may already have focused its replacement heading.
          if(!now||now===shell.root||!shell.root.contains(now)||now.closest('[hidden]')||'disabled'in now&&(now as HTMLButtonElement).disabled){suppressFocus=true;(shell.grid.hidden?shell.root:shell.grid).focus({preventScroll:true});suppressFocus=false;}
        }
      }
      if(destroyed)return ok(undefined);paintLayerMotion(motion,spec.motion,shell.base,c.view==='ready'&&candidate.animate);gridFocused=shell.root.ownerDocument.activeElement===shell.grid;if(gridFocused&&current){wanted=true;detailJob();}else if(committed.selection?.value.length)detailJob();return ok(undefined);
    }catch{return invalid('INTERNAL_INVARIANT','DOM_WRITE_FAILED','controller');}finally{inCommit=false;if(disposeRequested)dispose();}
  }
  function accept(data:NormalizedColumn<T>,state:ChartState,override?:Viewport,reason:'data'|'paint'='data'):ChartResult<number> {
    const domain=policy?policy.domain(data,state):columnDomain(data,state);if(domain.status==='invalid')return domain;
    const known=data.spec.selection?(accepted?.data===data?accepted.known:seriesIdentities(data.spec)):null,selected=known?prepareSelection(data.spec.selection,known,accepted?.selection??null):ok(null);if(selected.status==='invalid')return selected;
    if(selected.value?.mode==='controlled'&&!onSelectionChange)return invalid('INVALID_CONFIG','MISSING_SELECTION_HANDLER','options.onSelectionChange');
    const viewport=override?ok(override):viewportFor(data,domain.value,policy,accepted?.viewport??null);if(viewport.status==='invalid')return viewport;
    if(viewport.value?.settings.mode==='controlled'&&!onViewportChange)return invalid('INVALID_CONFIG','MISSING_VIEWPORT_HANDLER','options.onViewportChange');
    const next={data,state,domain:domain.value,viewport:viewport.value,selection:selected.value,known};
    if(size.width>0&&size.height>0){try{const checked=compute(next);if(checked.status==='invalid')return checked;}catch{return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','layout');}}
    const previous=accepted;accepted=next;const result=submit(reason);if(result.status==='invalid'){accepted=previous;return result;}
    if(!override&&previous?.viewport?.settings.mode==='internal'&&viewport.value?.settings.mode!=='controlled'&&!sameViewport(previous.viewport.value,viewport.value?.value??{}))invoke(onViewportChange,Object.freeze({viewport:(viewport.value?.value??Object.freeze({})) as ChartViewportValue<ChartCategoryWindow>,effect:'accepted',source:'update',revision:result.value}));return result;
  }
  function viewportRequest(value:ChartViewportValue<ChartCategoryWindow>,source:ChartViewportChange['source']='api'):ChartResult<number> {
    if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','controller');
    if(phase!=='active'||!accepted||!committed?.viewport)return invalid('LIFECYCLE_ERROR','VIEWPORT_UNAVAILABLE','viewport');
    if(main?.getSnapshot().pending)return invalid('LIFECYCLE_ERROR','UPDATE_PENDING','viewport');
    const proposed=proposeViewport(committed.viewport,value);if(proposed.status==='invalid')return proposed;
    if(sameViewport(committed.viewport.value,proposed.value.value))return ok(committedRevision);
    if(proposed.value.settings.mode==='controlled'){
      try{const checked=compute({...accepted,viewport:proposed.value});if(checked.status==='invalid')return checked;}catch{return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','layout');}
      invoke(onViewportChange,Object.freeze({viewport:proposed.value.value as ChartViewportValue<ChartCategoryWindow>,effect:'proposal',source,revision:committedRevision}));return ok(committedRevision);
    }
    const applied=accept(accepted.data,accepted.state,proposed.value,'paint');if(applied.status==='invalid')return applied;
    invoke(onViewportChange,Object.freeze({viewport:proposed.value.value as ChartViewportValue<ChartCategoryWindow>,effect:'accepted',source,revision:applied.value}));return applied;
  }
  function legendToggle(id:string):void {
    if(!committed||!accepted||!computed||main?.getSnapshot().pending)return;const next=toggleState(committed.state,id,committed.data.series.map(s=>s.spec.id));
    if(mode==='controlled'){invoke(onState,Object.freeze({state:next,effect:'proposal',source:'legend',revision:committedRevision}));return;}
    const result=accept(accepted.data,next);if(result.status==='invalid')invoke(onDiagnostic,result.diagnostic);else invoke(onState,Object.freeze({state:next,effect:'accepted',source:'legend',revision:result.value}));
  }
  function update(spec:S):ChartResult<number> {
    if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','controller');if(phase==='faulted'||!accepted)return invalid('LIFECYCLE_ERROR','FAULTED','controller');
    const validation=policy?policy.parse(spec):validateColumn<T>(spec);if(validation.status==='invalid')return validation;const data=normalizeColumn(validation.value);if((data.spec.state?.mode??'internal')!==mode)return invalid('INVALID_CONFIG','STATE_MODE_CHANGE','state.mode');
    if(mode==='controlled'&&data.series.length&&data.spec.legend?.position!=='none'&&!onState)return invalid('INVALID_CONFIG','MISSING_STATE_HANDLER','options.onStateChange');
    const state=orderedState(data.spec.state?.mode==='controlled'?data.spec.state.value:accepted.state,data.series.map(s=>s.spec.id)),previous=accepted,result=accept(data,state);if(result.status==='invalid')return result;
    try{ensureMedia();}catch{fault(invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','theme').diagnostic);return invalid('LIFECYCLE_ERROR','FAULTED','controller');}
    if(mode==='internal'&&membershipChanged(previous.state,state))invoke(onState,Object.freeze({state,effect:'accepted',source:'update',revision:result.value}));
    if(previous.selection?.mode==='internal'&&accepted?.selection?.mode!=='controlled'&&selectionChanged(previous.selection,accepted?.selection??null))invoke(onSelectionChange,Object.freeze({selection:accepted?.selection?.value??Object.freeze([]),effect:'accepted',source:'update',revision:result.value}));return result;
  }
  function activate(target:ColumnRect<T>,source:'pointer'|'touch'|'keyboard'):void { if(committed?.selection&&(!main?.getSnapshot().pending||sameSelectionInput(accepted,committed))){const proposed=toggleSelection(committed.selection,{seriesId:target.series.spec.id,pointId:target.point.id}),result=proposed.status==='invalid'?proposed:select(proposed.value,source);if(result.status==='invalid')invoke(onDiagnostic,result.diagnostic);}if(!destroyed)invoke(onActivate,Object.freeze({seriesId:target.series.spec.id,point:target.point,xKind:'category',source,revision:committedRevision})); }
  try {
    const ports=createBrowserPorts(ownedHost!);if(ports.status==='invalid')return ports;motion=createBrowserMotion(ports.value.clock,ownedHost!.ownerDocument.defaultView!,report);for(const id of Object.values(shellIds(instanceId)))if(ownedHost!.ownerDocument.getElementById(id))return invalid('INVALID_CONFIG','ID_COLLISION','options.instanceId');
    const text=createTextMeasurer(ownedHost!.ownerDocument);if(text.status==='invalid')return text;measurer=text.value;
    const parent=reserveInstance(ownedHost!,instanceId);if(parent.status==='invalid'){dispose();return parent;}reservations.push(parent.value);shell=createShell(ownedHost!,instanceId);shell.title.textContent=accepted!.data.spec.title;shell.description.textContent=accepted!.data.spec.description??'';
    viewportView=createViewportView({shell,clock:ports.value.clock,current:viewportViewState,request:(value,source)=>viewportRequest(value as ChartViewportValue<ChartCategoryWindow>,source),begin(){ events?.cancelGesture();motion?.cancel();invalidate();}});
    for(const [element,prefix]of [[shell.base,instanceId+'-v'],[shell.overlay,instanceId+'-i']] as const){const reservation=reserveInstance(element,prefix);if(reservation.status==='invalid'){dispose();return reservation;}reservations.push(reservation.value);const writer=createSvgWriter(element,prefix);if(writer.status==='invalid'){dispose();return writer;}if(element===shell.base)base=writer.value;else overlay=writer.value;}
    legend=createLegendView(shell.legend,legendToggle);semantic=createSemanticView(shell);tooltip=createTooltipView(shell);table=createTableView(shell,closeDetail);
    main=createRevisionScheduler({clock:ports.value.clock,prepare:prepareMain,commit:commitMain,onDiagnostic:report});interaction=createRevisionScheduler({clock:ports.value.clock,prepare:prepareDetail,commit:commitDetail,onDiagnostic:report});
    events=attachCartesianInteraction(shell.body,shell.grid,shell.detail,{
      revision:()=>committedRevision,enabled:()=>!!computed?.projection&&phase==='active'&&!table?.isOpen(),
      pointer(x,y,intent){if(intent==='hover'){if(gridFocused||pinned||detailFocused())return;sequence++;wanted=true;detailJob('intent',{x,y});return;}const m=matrix();if(!m||!computed?.projection||!shell)return;const local=mapped(m.inverse(),x,y),target=pick(computed.projection,local.x,local.y);sequence++;hover=null;pinned=intent==='touch'&&!!target;events?.pin(pinned,committedRevision);wanted=!!target;if(target){current=target;suppressFocus=true;shell.grid.focus({preventScroll:true});suppressFocus=false;gridFocused=true;semanticUpdate(true);}detailJob();if(target)activate(target,intent);},
      leave(){if(!gridFocused&&!pinned&&!detailFocused()){sequence++;hover=null;wanted=false;tooltip?.close();detailJob();}},
      focus(){gridFocused=true;if(suppressFocus||!computed?.projection)return;current??=computed.projection.rects[0]??null;hover=null;sequence++;wanted=true;semanticUpdate();detailJob();},
      blur(next){gridFocused=false;if(next&&shell?.detail.contains(next as Node))return;if(!pinned){sequence++;wanted=false;tooltip?.close();detailJob();}},
      key(key,ctrl){if(key==='Escape'){closeDetail();return true;}if(!computed?.projection||!current)return false;if(key==='Enter'||key===' '||key==='Spacebar'){const handled=key!=='Enter'||!!onActivate||!!committed?.selection;activate(current,'keyboard');return handled;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(key))return false;const next=navigateColumn(computed.projection,current,key,ctrl);if(next!==current){current=next;hover=null;pinned=false;events?.pin(false,committedRevision);sequence++;wanted=true;semanticUpdate(true);detailJob();}return true;},
      closeDetail,reposition(){if(wanted){sequence++;detailJob();}},
    });
    fonts=ownedHost!.ownerDocument.fonts??null;fontHolder.callback=fontsChanged;fonts?.addEventListener('loadingdone',fontsChanged);fonts?.addEventListener('loadingerror',fontsChanged);if(fonts){const holder=fontHolder;void fonts.ready.then(()=>holder.callback?.(),()=>holder.callback?.());}ensureMedia();
    const submitted=submit('data');if(submitted.status==='invalid'){dispose();return submitted;}
    observer=ports.value.sizeObserver.observe(ownedHost!,next=>{if(destroyed||phase==='faulted')return;if(![next.width,next.height].every(Number.isFinite)||next.width<0||next.height<0){report(invalid('INVALID_NUMBER','NONFINITE','host.size').diagnostic);return;}if(size.width===next.width&&size.height===next.height)return;size={...next};if(size.width<=0||size.height<=0){phase='suspended';motion?.cancel();invalidate();base?.clear();current=null;computed=null;if(shell){const focused=shell.root.contains(shell.root.ownerDocument.activeElement);table?.close(false);legend?.disable(true);semantic?.update({rowCount:0,columnCount:0,current:null,summary:'Chart has no visible size.'},{x:0,y:0,width:0,height:0},false);shell.root.style.width=`${size.width}px`;shell.root.style.height=`${size.height}px`;shell.status.textContent='Chart has no visible size.';shell.status.hidden=false;if(focused){suppressFocus=true;shell.root.focus({preventScroll:true});suppressFocus=false;}}}else phase='active';submit('size');});
    if(destroyed||snapshot().phase==='faulted'){dispose();return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');}
    host=null;initial=null;options=null;
    const controller=Object.freeze({update,refresh(){if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','controller');if(phase==='faulted')return invalid('LIFECYCLE_ERROR','FAULTED','controller');measurer?.invalidate();return submit('paint');},getState:()=>accepted?orderedState(accepted.state,accepted.data.series.map(s=>s.spec.id)):Object.freeze({hiddenSeriesIds:Object.freeze([])}),getSelection:()=>accepted?.selection?.value??Object.freeze([]),requestSelection:(value:readonly SeriesPointId[])=>select(value,'api'),getViewport:()=>(accepted?.viewport?.value??null) as ChartViewportValue<ChartCategoryWindow>|null,requestViewport:(value:ChartViewportValue<ChartCategoryWindow>)=>viewportRequest(value),getSnapshot:snapshot,destroy});
    releaseExport=provideExport(controller,()=>{
      if(phase!=='active'||!computed||!committed||!shell)return invalid('LIFECYCLE_ERROR','EXPORT_UNAVAILABLE','controller');
      const c=computed,input=committed,spec=input.data.spec;
      const selected=emptyLayers();paintSelection(selected,c,input);const layers=selected.interaction.length?{...c.layers,labels:[...c.layers.labels,...selected.interaction]}:c.layers;
      return ok({document:shell.root.ownerDocument,instanceId,revision:committedRevision,frame:frame(committedRevision,c.shell.body.width,c.shell.body.height,layers,c.axes??undefined),layout:c.shell,palette:c.palette,font:c.font,direction:spec.direction??'ltr',title:spec.title,description:spec.description??'',context:[c.table.context,...c.table.references].join(' '),status:c.status,legend:c.legend,hiddenLegendIds:input.state.hiddenSeriesIds,records:()=>cartesianRecords(spec,input.state.hiddenSeriesIds,input.selection?.value)});
    });
    return ok(controller);
  }catch{dispose();return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');}
}
