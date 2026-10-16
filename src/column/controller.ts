import type { ColumnChartSpec, ColumnController, ColumnMountOptions, ColumnSnapshot } from '../public/column-types.js';
import type { ChartResult, ChartState, ChartDiagnostic } from '../public/chart-types.js';
import type { Domain } from '../internal/math/domain.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { createBrowserPorts } from '../internal/platform/browser.js';
import { reserveInstance, type IdReservation } from '../internal/platform/id.js';
import { createRevisionScheduler, type RevisionScheduler, type RevisionToken } from '../internal/lifecycle/scheduler.js';
import { createSvgWriter, type SceneWriter, type PreparedScene } from '../internal/scene/svg-writer.js';
import { createTextMeasurer, ellipsis, type TextMeasurer } from '../internal/layout/text.js';
import { shellFrame, type ShellFrame } from '../internal/layout/frame.js';
import { emptyLayers, axesScene, referenceScene, frame, type Layers } from '../internal/axes/scene.js';
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
import { projectColumn, pickColumn, navigateColumn, reconcileColumn, type ColumnProjection, type ColumnRect } from './geometry.js';
import { planColumnAxes } from './axes.js';
import { columnScene, columnFocusScene } from './scene.js';

type Input<T> = Readonly<{ data: NormalizedColumn<T>; state: ChartState; domain: Domain | null }>;
type Computed<T> = Readonly<{ shell: ShellFrame; palette: Palette; font: ResolvedFont; axes: AxesPlan | null; projection: ColumnProjection<T> | null; layers: Layers; view: NonNullable<ColumnSnapshot['view']>; status: string; legend: readonly LegendItem[]; tooltipSeries: readonly TooltipSeries[]; table: TableSource }>;
type MainCandidate<T> = Readonly<{ input: Input<T>; value: Computed<T>; scene: PreparedScene | null }>;
type DetailJob<T> = Readonly<{ revision: number; generation: number; sequence: number; stage: 'intent' | 'measure'; target: ColumnRect<T> | null; detail: boolean; sample?: Readonly<{ x: number; y: number }> }>;
type DetailCandidate<T> = Readonly<{ job: DetailJob<T>; target: ColumnRect<T> | null; scene: PreparedScene; model: TooltipModel | null; bounds: Rect; placement: PlacementResult | null }>;
function invoke<T>(fn: ((value:T)=>void)|null, value:T):void { try { fn?.(value); } catch { /* Consumer exceptions do not own engine lifecycle. */ } }

export function createColumnChart<T=unknown>(host: HTMLElement, spec: ColumnChartSpec<T>, options: ColumnMountOptions<T>): ChartResult<ColumnController<T>> {
  const validated=validateColumn<T>(spec);if(validated.status==='invalid')return validated;
  const data=normalizeColumn(validated.value), ids=new Set(data.series.map(s=>s.spec.id)), opts=validateColumnOptions<T>(options,ids);if(opts.status==='invalid')return opts;
  const mode=data.spec.state?.mode??'internal';
  if(mode==='controlled'&&opts.value.initialState)return invalid('INVALID_CONFIG','BAD_STATE','options.initialState');
  if(mode==='controlled'&&data.series.length&&data.spec.legend?.position!=='none'&&!opts.value.onStateChange)return invalid('INVALID_CONFIG','MISSING_STATE_HANDLER','options.onStateChange');
  const state=validateColumnState(data.spec.state?.mode==='controlled'?data.spec.state.value:opts.value.initialState??{hiddenSeriesIds:[]},ids,'state');if(state.status==='invalid')return state;
  const ordered=orderedState(state.value,[...ids]),domain=columnDomain(data,ordered);if(domain.status==='invalid')return domain;
  try {
    if(!host||host.nodeType!==1||host.namespaceURI!=='http://www.w3.org/1999/xhtml'||!host.isConnected||!host.ownerDocument.defaultView||host.getRootNode()!==host.ownerDocument)return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');
    return mount(host,{data,state:ordered,domain:domain.value},opts.value);
  } catch { return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host'); }
}
function mount<T>(host:HTMLElement|null, initial:Input<T>|null, options:ColumnMountOptions<T>|null):ChartResult<ColumnController<T>> {
  let ownedHost=host,accepted=initial,committed:Input<T>|null=null,computed:Computed<T>|null=null,shell:Shell|null=null;
  let onActivate=options!.onPointActivate??null,onState=options!.onStateChange??null,onDiagnostic=options!.onDiagnostic??null;
  const instanceId=options!.instanceId,mode=initial!.data.spec.state?.mode??'internal',reservations:IdReservation[]=[];
  let measurer:TextMeasurer|null=null,base:SceneWriter|null=null,overlay:SceneWriter|null=null,legend:LegendView|null=null,semantic:SemanticView|null=null,table:TableView|null=null,tooltip:TooltipView|null=null;
  let main:RevisionScheduler<Input<T>>|null=null,interaction:RevisionScheduler<DetailJob<T>>|null=null,events:ReturnType<typeof attachCartesianInteraction>|null=null,observer:Readonly<{disconnect():void}>|null=null;
  let media:MediaQueryList|null=null,fonts:FontFaceSet|null=null;const fontHolder:{callback:(()=>void)|null}={callback:null};
  let phase:ColumnSnapshot['phase']='suspended',size={width:0,height:0},revision=0,committedRevision=0,generation=0,sequence=0;
  let current:ColumnRect<T>|null=null,hover:ColumnRect<T>|null=null,gridFocused=false,pinned=false,wanted=false,destroyed=false,suppressFocus=false,inCommit=false,disposeRequested=false;
  function snapshot():ColumnSnapshot { return Object.freeze({phase,revision,committedRevision,view:phase==='active'?computed?.view??null:null,size:Object.freeze({...size})}); }
  function resources():void {
    cleanup(()=>main?.destroy());cleanup(()=>interaction?.destroy());main=null;interaction=null;
    cleanup(()=>observer?.disconnect());observer=null;fontHolder.callback=null;
    cleanup(()=>fonts?.removeEventListener('loadingdone',fontsChanged));cleanup(()=>fonts?.removeEventListener('loadingerror',fontsChanged));fonts=null;
    cleanup(()=>media?.removeEventListener('change',mediaChanged));media=null;
    cleanup(()=>events?.destroy());events=null;cleanup(()=>legend?.destroy());legend=null;cleanup(()=>semantic?.destroy());semantic=null;cleanup(()=>table?.destroy());table=null;cleanup(()=>tooltip?.destroy());tooltip=null;
    cleanup(()=>base?.dispose());base=null;cleanup(()=>overlay?.dispose());overlay=null;cleanup(()=>measurer?.destroy());measurer=null;
    accepted=null;committed=null;computed=null;current=null;hover=null;onActivate=null;onState=null;initial=null;options=null;host=null;
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
    const palette=resolvePalette(ownedHost,spec.theme??'light',media?.matches??false),layout=shellFrame(size,!!spec.description,data.series.map(s=>s.spec.name),spec.legend?.position??'bottom',font,direction,measurer),hidden=new Set(input.state.hiddenSeriesIds),visible=data.series.filter(s=>!hidden.has(s.spec.id));
    const view=derivedView(spec.status?.kind??'ready',data.nonnullCount,visible.reduce((n,s)=>n+s.valid.length,0),data.series.length,hidden.size),layers=emptyLayers(),dashes=resolveDashes(data.series,hidden,palette);
    let axes:AxesPlan|null=null,projection:ColumnProjection<T>|null=null;
    if(view==='ready'){
      const planned=planColumnAxes(spec,input.domain,layout.body.width,layout.body.height,font,data.labels,measurer,layout.compact);if(planned.status==='invalid')return planned;axes=planned.value;
      const domain=spec.orientation==='horizontal'?axes.x.domain:axes.y.domain;
      if(!axes.tooSmall&&domain){const projected=projectColumn(data,input.state,axes.plot,domain);if(projected.status==='invalid')return projected;projection=projected.value;
        axesScene(axes,spec.orientation==='horizontal'?{...spec.axes.y,grid:spec.axes.y.grid??true}:spec.axes.x,spec.orientation==='horizontal'?{...spec.axes.x,grid:spec.axes.x.grid??false}:spec.axes.y,palette,layers,layout.compact);columnScene(projection,palette,layers);
      }
    }
    const horizontal=spec.orientation==='horizontal',refs=spec.references??[],referenceInfo=axes?referenceScene(refs.map(r=>horizontal?{...r,axis:'x' as const}:r),axes,palette,layers,text=>{const rendered=ellipsis(text,Math.max(0,axes!.plot.width-8),s=>measurer!.measure(s,font,direction)),m=measurer!.measure(rendered??'',font,direction);return{text:rendered,width:m.width,height:m.height};}):[];
    const shownDomain=axes?(horizontal?axes.x.domain:axes.y.domain):input.domain;
    const context=[spec.axes.x.title?`Category: ${spec.axes.x.title}.`:'',spec.axes.y.title?`Value: ${spec.axes.y.title}.`:'',shownDomain?`Displayed value domain ${shownDomain[0]} to ${shownDomain[1]}. Baseline zero; rectangles are clipped to this domain.`:'','Categories follow the supplied category order.'].filter(Boolean).join(' ');
    const references=refs.map(r=>`${r.label??r.id}. Y ${r.value}.${(referenceInfo.find(i=>i.id===r.id)?.outside??(!!shownDomain&&(r.value<shownDomain[0]||r.value>shownDomain[1])))?' Outside displayed domain.':''}`);
    const tableLabels=new Map([...data.labels].map(([id,label])=>[id,data.duplicateLabels.has(label)?`${label} · ${id}`:label]));
    const status=view==='ready'?axes?.tooSmall?'Chart is too small to display bars. Enlarge the chart or view the data table.':projection&&!projection.rects.length?'No bars intersect the displayed domain. View the data table for all observations.':'':spec.status&&'message'in spec.status?spec.status.message??(view==='loading'?'Loading chart data.':'No observations.'):view==='no-visible-series'?'No visible series. Use the legend to show a series.':view==='loading'?'Loading chart data.':view==='error'?'Chart data unavailable.':'No visible observations.';
    return ok({shell:layout,palette,font,axes,projection,layers,view,status,legend:data.series.map((s,i)=>({id:s.spec.id,name:s.spec.name,color:s.spec.color??palette.series[s.colorIndex]!,dash:dashes.get(s.spec.id)!,width:layout.legendPosition==='end'?160:layout.buttonWidths[i]!})),tooltipSeries:visible.map(s=>({id:s.spec.id,name:s.spec.name,color:s.spec.color??palette.series[s.colorIndex]!,dash:dashes.get(s.spec.id)!,byX:s.byX})),table:{title:spec.title,kind:'category',labels:tableLabels,series:spec.series,hidden,context,references}});
  }
  function tooltipFor(target:ColumnRect<T>):TooltipModel { return tooltipModel(committedRevision,target.series.spec.id,target.point.id,target.point.x,'category',committed!.data.spec.tooltip?.mode==='shared'?'shared':'point',computed!.tooltipSeries,committed!.data.labels,committed!.data.duplicateLabels); }
  function semanticUpdate(navigation=false):void {
    if(!semantic||!computed||!committed)return;const model=current?tooltipFor(current):null,context=[computed.table.context,...computed.table.references].join(' ');
    semantic.update({rowCount:computed.projection?.rows.length??0,columnCount:committed.data.spec.axes.x.values.length,current:current&&model?semanticPoint(current.series.spec.name,current.seriesIndex+1,current.categoryIndex+1,model.header,current.point.y!,context,model):null,summary:computed.status||'Chart data. No bars in the displayed domain. Use the data table.'},computed.axes?.plot??{x:0,y:0,width:computed.shell.body.width,height:computed.shell.body.height},navigation);
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
    if(job.sample){if(gridFocused||pinned||detailFocused())return ok(null);const local=m?mapped(m.inverse(),job.sample.x,job.sample.y):null;target=local?pickColumn(computed.projection,local.x,local.y):null;}
    const layers=emptyLayers();if(target)columnFocusScene(target,computed.palette,layers);
    const scene=overlay!.prepare(frame(token.revision,computed.shell.body.width,computed.shell.body.height,layers,computed.axes??undefined),new Map());if(scene.status==='invalid')return scene;
    const model=target&&job.detail&&committed!.data.spec.tooltip?.mode!=='off'?tooltipFor(target):null,bounds=allowedRect(ownedHost);let placement:PlacementResult|null=null;
    if(job.stage==='measure'&&model){
      const measured=tooltip?.measure(),r=target!;
      const corners=m?[[r.x,r.y],[r.x+r.width,r.y],[r.x,r.y+r.height],[r.x+r.width,r.y+r.height]].map(([x,y])=>mapped(m,x!,y!)):null;
      const anchor=corners?{x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),width:Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),height:Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))}:null;
      placement=!m||!anchor||unsupportedPortalMapping(ownedHost.ownerDocument)?{kind:'docked'}:measured?placeTooltip(anchor,measured,bounds,committed!.data.spec.tooltip?.placement??'top',committed!.data.spec.direction??'ltr'):{kind:'closed'};
    }
    return ok({job,target,scene:scene.value,model,bounds,placement});
  }
  function commitDetail(value:DetailCandidate<T>|null):ChartResult<void> {
    if(!value||!fresh(value.job)||!computed)return ok(undefined);const applied=overlay!.apply(value.scene);if(applied.status==='invalid')return applied;
    if(value.job.sample)hover=value.target;
    if(value.model&&fresh(value.job)){if(value.job.stage==='intent'){tooltip!.write(value.model,value.bounds,computed.palette,computed.font,committed!.data.spec.direction??'ltr');detailJob('measure');}else if(value.placement&&value.target)tooltip!.show(value.placement,value.model,{anchor:{x:value.target.x-2,y:value.target.y-2,width:Math.max(4,value.target.width+4),height:Math.max(4,value.target.height+4)},plot:computed.axes!.plot,body:{x:0,y:0,width:computed.shell.body.width,height:computed.shell.body.height}});}else tooltip?.close();
    return ok(undefined);
  }
  function closeDetail():void { invalidate();gridFocused=!!shell&&shell.root.ownerDocument.activeElement===shell.grid;detailJob(); }
  function prepareMain(input:Input<T>,token:RevisionToken):ChartResult<MainCandidate<T>> {
    const c=compute(input);if(c.status==='invalid')return c;let scene:PreparedScene|null=null;
    if(c.value.shell.body.width>0&&c.value.shell.body.height>0){const prepared=base!.prepare(frame(token.revision,c.value.shell.body.width,c.value.shell.body.height,c.value.layers,c.value.axes??undefined),new Map());if(prepared.status==='invalid')return prepared;scene=prepared.value;}
    return ok({input,value:c.value,scene});
  }
  function commitMain(candidate:MainCandidate<T>,token:RevisionToken):ChartResult<void> {
    if(destroyed||!shell||!main?.isCurrent(token))return ok(undefined);inCommit=true;
    try {
      const old=current,focused=shell.root.ownerDocument.activeElement as HTMLElement|null,hadFocus=!!focused&&shell.root.contains(focused),c=candidate.value,spec=candidate.input.data.spec;
      if(candidate.scene){const applied=base!.apply(candidate.scene);if(applied.status==='invalid')return applied;}else base!.clear();if(destroyed)return ok(undefined);
      invalidate();applyShell(shell,c.shell,c.palette,c.font,spec.direction??'ltr',spec.title,spec.description);
      for(const element of [shell.base,shell.overlay]){const svg=element.querySelector('svg');if(svg){svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('direction',spec.direction??'ltr');svg.style.letterSpacing='0px';svg.style.pointerEvents='none';}}
      shell.root.setAttribute('aria-busy',String(c.view==='loading'));shell.status.hidden=!c.status;shell.status.textContent=c.status;const disabled=(spec.status?.kind??'ready')!=='ready';legend!.update(c.legend,candidate.input.state,disabled);table!.update(c.table,!disabled);if(destroyed)return ok(undefined);
      committed=candidate.input;computed=c;committedRevision=token.revision;generation++;current=c.projection?reconcileColumn(c.projection,old):null;semanticUpdate(!!old&&!!current&&old.key!==current.key);
      if(hadFocus&&focused){
        const valid=focused.isConnected&&!focused.closest('[hidden]')&&!('disabled'in focused&&(focused as HTMLButtonElement).disabled);
        if(valid&&shell.root.ownerDocument.activeElement!==focused)focused.focus({preventScroll:true});
        else if(!valid){
          const now=shell.root.ownerDocument.activeElement as HTMLElement|null;
          // The paginated table may already have focused its replacement heading.
          if(!now||now===shell.root||!shell.root.contains(now)||now.closest('[hidden]')||'disabled'in now&&(now as HTMLButtonElement).disabled){suppressFocus=true;(shell.grid.hidden?shell.root:shell.grid).focus({preventScroll:true});suppressFocus=false;}
        }
      }
      if(destroyed)return ok(undefined);gridFocused=shell.root.ownerDocument.activeElement===shell.grid;if(gridFocused&&current){wanted=true;detailJob();}return ok(undefined);
    }catch{return invalid('INTERNAL_INVARIANT','DOM_WRITE_FAILED','controller');}finally{inCommit=false;if(disposeRequested)dispose();}
  }
  function accept(data:NormalizedColumn<T>,state:ChartState):ChartResult<number> {
    const domain=columnDomain(data,state);if(domain.status==='invalid')return domain;const next={data,state,domain:domain.value};
    if(size.width>0&&size.height>0){try{const checked=compute(next);if(checked.status==='invalid')return checked;}catch{return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','layout');}}
    const previous=accepted;accepted=next;const result=submit('data');if(result.status==='invalid')accepted=previous;return result;
  }
  function legendToggle(id:string):void {
    if(!committed||!accepted||!computed||main?.getSnapshot().pending)return;const next=toggleState(committed.state,id,committed.data.series.map(s=>s.spec.id));
    if(mode==='controlled'){invoke(onState,Object.freeze({state:next,effect:'proposal',source:'legend',revision:committedRevision}));return;}
    const result=accept(accepted.data,next);if(result.status==='invalid')invoke(onDiagnostic,result.diagnostic);else invoke(onState,Object.freeze({state:next,effect:'accepted',source:'legend',revision:result.value}));
  }
  function update(spec:ColumnChartSpec<T>):ChartResult<number> {
    if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','controller');if(phase==='faulted'||!accepted)return invalid('LIFECYCLE_ERROR','FAULTED','controller');
    const validation=validateColumn<T>(spec);if(validation.status==='invalid')return validation;const data=normalizeColumn(validation.value);if((data.spec.state?.mode??'internal')!==mode)return invalid('INVALID_CONFIG','STATE_MODE_CHANGE','state.mode');
    if(mode==='controlled'&&data.series.length&&data.spec.legend?.position!=='none'&&!onState)return invalid('INVALID_CONFIG','MISSING_STATE_HANDLER','options.onStateChange');
    const state=orderedState(data.spec.state?.mode==='controlled'?data.spec.state.value:accepted.state,data.series.map(s=>s.spec.id)),previous=accepted.state,result=accept(data,state);if(result.status==='invalid')return result;
    try{ensureMedia();}catch{fault(invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','theme').diagnostic);return invalid('LIFECYCLE_ERROR','FAULTED','controller');}
    if(mode==='internal'&&membershipChanged(previous,state))invoke(onState,Object.freeze({state,effect:'accepted',source:'update',revision:result.value}));return result;
  }
  function activate(target:ColumnRect<T>,source:'pointer'|'touch'|'keyboard'):void { invoke(onActivate,Object.freeze({seriesId:target.series.spec.id,point:target.point,xKind:'category',source,revision:committedRevision})); }
  try {
    const ports=createBrowserPorts(ownedHost!);if(ports.status==='invalid')return ports;for(const id of Object.values(shellIds(instanceId)))if(ownedHost!.ownerDocument.getElementById(id))return invalid('INVALID_CONFIG','ID_COLLISION','options.instanceId');
    const text=createTextMeasurer(ownedHost!.ownerDocument);if(text.status==='invalid')return text;measurer=text.value;
    const parent=reserveInstance(ownedHost!,instanceId);if(parent.status==='invalid'){dispose();return parent;}reservations.push(parent.value);shell=createShell(ownedHost!,instanceId);shell.title.textContent=accepted!.data.spec.title;shell.description.textContent=accepted!.data.spec.description??'';
    for(const [element,prefix]of [[shell.base,instanceId+'-v'],[shell.overlay,instanceId+'-i']] as const){const reservation=reserveInstance(element,prefix);if(reservation.status==='invalid'){dispose();return reservation;}reservations.push(reservation.value);const writer=createSvgWriter(element,prefix);if(writer.status==='invalid'){dispose();return writer;}if(element===shell.base)base=writer.value;else overlay=writer.value;}
    legend=createLegendView(shell.legend,legendToggle);semantic=createSemanticView(shell);tooltip=createTooltipView(shell);table=createTableView(shell,closeDetail);
    main=createRevisionScheduler({clock:ports.value.clock,prepare:prepareMain,commit:commitMain,onDiagnostic:report});interaction=createRevisionScheduler({clock:ports.value.clock,prepare:prepareDetail,commit:commitDetail,onDiagnostic:report});
    events=attachCartesianInteraction(shell.body,shell.grid,shell.detail,{
      revision:()=>committedRevision,enabled:()=>!!computed?.projection&&phase==='active'&&!table?.isOpen(),
      pointer(x,y,intent){if(intent==='hover'){if(gridFocused||pinned||detailFocused())return;sequence++;wanted=true;detailJob('intent',{x,y});return;}const m=matrix();if(!m||!computed?.projection||!shell)return;const local=mapped(m.inverse(),x,y),target=pickColumn(computed.projection,local.x,local.y);sequence++;hover=null;pinned=intent==='touch'&&!!target;events?.pin(pinned,committedRevision);wanted=!!target;if(target){current=target;suppressFocus=true;shell.grid.focus({preventScroll:true});suppressFocus=false;gridFocused=true;semanticUpdate(true);}detailJob();if(target)activate(target,intent);},
      leave(){if(!gridFocused&&!pinned&&!detailFocused()){sequence++;hover=null;wanted=false;tooltip?.close();detailJob();}},
      focus(){gridFocused=true;if(suppressFocus||!computed?.projection)return;current??=computed.projection.rects[0]??null;hover=null;sequence++;wanted=true;semanticUpdate();detailJob();},
      blur(next){gridFocused=false;if(next&&shell?.detail.contains(next as Node))return;if(!pinned){sequence++;wanted=false;tooltip?.close();detailJob();}},
      key(key,ctrl){if(key==='Escape'){closeDetail();return true;}if(!computed?.projection||!current)return false;if(key==='Enter'||key===' '||key==='Spacebar'){const handled=key!=='Enter'||!!onActivate;activate(current,'keyboard');return handled;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(key))return false;const next=navigateColumn(computed.projection,current,key,ctrl);if(next!==current){current=next;hover=null;pinned=false;events?.pin(false,committedRevision);sequence++;wanted=true;semanticUpdate(true);detailJob();}return true;},
      closeDetail,reposition(){if(wanted){sequence++;detailJob();}},
    });
    fonts=ownedHost!.ownerDocument.fonts??null;fontHolder.callback=fontsChanged;fonts?.addEventListener('loadingdone',fontsChanged);fonts?.addEventListener('loadingerror',fontsChanged);if(fonts){const holder=fontHolder;void fonts.ready.then(()=>holder.callback?.(),()=>holder.callback?.());}ensureMedia();
    const submitted=submit('data');if(submitted.status==='invalid'){dispose();return submitted;}
    observer=ports.value.sizeObserver.observe(ownedHost!,next=>{if(destroyed||phase==='faulted')return;if(![next.width,next.height].every(Number.isFinite)||next.width<0||next.height<0){report(invalid('INVALID_NUMBER','NONFINITE','host.size').diagnostic);return;}if(size.width===next.width&&size.height===next.height)return;size={...next};if(size.width<=0||size.height<=0){phase='suspended';invalidate();base?.clear();current=null;computed=null;if(shell){const focused=shell.root.contains(shell.root.ownerDocument.activeElement);table?.close(false);legend?.disable(true);semantic?.update({rowCount:0,columnCount:0,current:null,summary:'Chart has no visible size.'},{x:0,y:0,width:0,height:0},false);shell.root.style.width=`${size.width}px`;shell.root.style.height=`${size.height}px`;shell.status.textContent='Chart has no visible size.';shell.status.hidden=false;if(focused){suppressFocus=true;shell.root.focus({preventScroll:true});suppressFocus=false;}}}else phase='active';submit('size');});
    if(destroyed||snapshot().phase==='faulted'){dispose();return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');}
    host=null;initial=null;options=null;
    return ok(Object.freeze({update,refresh(){if(destroyed)return invalid('LIFECYCLE_ERROR','DESTROYED','controller');if(phase==='faulted')return invalid('LIFECYCLE_ERROR','FAULTED','controller');measurer?.invalidate();return submit('paint');},getState:()=>accepted?orderedState(accepted.state,accepted.data.series.map(s=>s.spec.id)):Object.freeze({hiddenSeriesIds:Object.freeze([])}),getSnapshot:snapshot,destroy}));
  }catch{dispose();return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','host');}
}
