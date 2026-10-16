import type { ColumnChartSpec, ColumnMountOptions } from '../public/column-types.js';
import type { ChartDiagnostic, ChartResult, ChartState } from '../public/chart-types.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { selectionBinding } from '../internal/interaction/selection.js';
import { viewportBinding } from '../internal/interaction/viewport.js';
import { ValidationFailure } from '../internal/data/validation.js';

type RecordValue = Record<string, unknown>;
class Rejected { constructor(readonly diagnostic: ChartDiagnostic) {} }
function fail(path: string, reason = 'BAD_COLUMN_SPEC', code: ChartDiagnostic['code'] = 'INVALID_CONFIG'): never { throw new Rejected(invalid(code, reason, path).diagnostic); }
function record(value: unknown, keys: string[], required: string[], path: string): RecordValue {
  if (!value || typeof value !== 'object' || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) fail(path);
  const copy: RecordValue = Object.create(null) as RecordValue;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) fail(path + '.' + String(key));
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d) || d.value === undefined) fail(path + '.' + key);
    copy[key] = d.value;
  }
  for (const key of required) if (!Object.hasOwn(copy, key)) fail(path + '.' + key);
  return copy;
}
function array(value: unknown, cap: number, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(path);
  if (value.length > cap) fail(path, 'RESOURCE_LIMIT');
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')) fail(path);
  }
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) fail(path + '[' + i + ']');
  return value;
}
function text(value: unknown, path: string, cap = 256): string { if (typeof value !== 'string' || !value.length || value.length > cap) fail(path); return value; }
function number(value: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'NONFINITE', 'INVALID_NUMBER');
  if (value < min || value > max) fail(path); return value === 0 ? 0 : value;
}
function choice(value: unknown, choices: readonly unknown[], path: string): void { if (!choices.includes(value)) fail(path); }
function optional(record: RecordValue, key: string, check: (value: unknown, path: string) => unknown, path: string): void { if (Object.hasOwn(record, key)) record[key] = check(record[key], path + '.' + key) ?? record[key]; }
function color(value: unknown, path: string): string { if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) fail(path, 'BAD_COLOR'); return value.toLowerCase(); }
function state(value: unknown, ids: ReadonlySet<string>, path: string): ChartState {
  const s = record(value, ['hiddenSeriesIds'], ['hiddenSeriesIds'], path), seen = new Set<string>();
  const hidden = array(s.hiddenSeriesIds, 16, path + '.hiddenSeriesIds').map((v, i) => { const id = text(v, path + '.hiddenSeriesIds[' + i + ']', 128); if (!ids.has(id) || seen.has(id)) fail(path, 'BAD_STATE'); seen.add(id); return id; });
  return Object.freeze({ hiddenSeriesIds: Object.freeze(hidden) });
}
function checked<V>(work: () => V): ChartResult<V> { try { return ok(work()); } catch (e) { return e instanceof Rejected || e instanceof ValidationFailure ? { status: 'invalid', diagnostic: e.diagnostic } : invalid('INVALID_CONFIG', 'BAD_COLUMN_SPEC', 'spec'); } }
export function validateColumnState(value: unknown, ids: ReadonlySet<string>, path: string): ChartResult<ChartState> { return checked(() => state(value, ids, path)); }
export function validateColumn<T>(value: unknown): ChartResult<ColumnChartSpec<T>> {
  return checked(() => {
    const s = record(value, ['family','title','description','orientation','groupGap','barGap','maxBarWidth','theme','direction','font','axes','series','references','legend','tooltip','state','status','selection','crosshair','motion','viewport'], ['family','title','axes','series'], 'spec');
    choice(s.family, ['column'], 'family'); text(s.title, 'title'); optional(s, 'description', (v,p) => text(v,p,2048), 'spec');
    optional(s,'orientation',(v,p)=>choice(v,['vertical','horizontal'],p),'spec'); optional(s,'theme',(v,p)=>choice(v,['light','dark','auto'],p),'spec'); optional(s,'direction',(v,p)=>choice(v,['ltr','rtl'],p),'spec');
    for (const [key,max] of [['groupGap',.95],['barGap',1],['maxBarWidth',1024]] as const) optional(s,key,(v,p)=>number(v,p,key==='maxBarWidth'?.25:0,max),'spec');
    if(Object.hasOwn(s,'font')) { const f=record(s.font,['family','size','weight'],[],'font'); optional(f,'family',(v,p)=>choice(v,['sans-serif','serif','monospace'],p),'font'); optional(f,'size',(v,p)=>number(v,p,8,32),'font'); optional(f,'weight',(v,p)=>choice(v,[400,500,600,700],p),'font'); s.font=Object.freeze(f); }
    const axes=record(s.axes,['x','y'],['x','y'],'axes');
    const x=record(axes.x,['kind','values','title','grid','ticks','labels'],['kind','values'],'axes.x'); choice(x.kind,['category'],'axes.x.kind');
    const y=record(axes.y,['kind','domain','nice','reversed','title','grid','ticks','labels'],['kind'],'axes.y'); choice(y.kind,['linear'],'axes.y.kind');
    const categories=new Set<string>(); x.values=Object.freeze(array(x.values,10000,'axes.x.values').map((v,i)=>{ const c=record(v,['id','label'],['id'],'axes.x.values['+i+']'); const id=text(c.id,'category.id',128); if(categories.has(id)) fail('axes.x.values['+i+'].id','DUPLICATE_ID'); categories.add(id); optional(c,'label',(v,p)=>text(v,p,2048),'category'); return Object.freeze(c); }));
    for(const [a,p]of [[x,'axes.x'],[y,'axes.y']] as const){ optional(a,'title',text,p); for(const key of ['grid','nice','reversed'])optional(a,key,(v,p)=>choice(v,[true,false],p),p); if(Object.hasOwn(a,'ticks')){const t=record(a.ticks,['targetCount'],[] ,p+'.ticks');optional(t,'targetCount',(v,p)=>{const n=number(v,p,2,12);if(!Number.isInteger(n))fail(p);return n;},p+'.ticks');a.ticks=Object.freeze(t);}if(Object.hasOwn(a,'labels')){const l=record(a.labels,['maxWidth'],[],p+'.labels');optional(l,'maxWidth',(v,p)=>number(v,p,16,256),p+'.labels');a.labels=Object.freeze(l);} }
    if(Object.hasOwn(y,'domain')){const d=array(y.domain,2,'axes.y.domain');if(d.length!==2)fail('axes.y.domain');const low=number(d[0],'axes.y.domain[0]'),high=number(d[1],'axes.y.domain[1]');if(low>=high)fail('axes.y.domain','BAD_DOMAIN','INVALID_DOMAIN');y.domain=Object.freeze([low,high]);}
    s.axes=Object.freeze({x:Object.freeze(x),y:Object.freeze(y)});
    const ids=new Set<string>();let count=0;
    s.series=Object.freeze(array(s.series,16,'series').map((v,i)=>{const p='series['+i+']',series=record(v,['id','name','data','color'],['id','name','data'],p),id=text(series.id,p+'.id',128);text(series.name,p+'.name');if(ids.has(id))fail(p+'.id','DUPLICATE_ID');ids.add(id);optional(series,'color',color,p);const points=new Set<string>(),xs=new Set<string>();series.data=Object.freeze(array(series.data,10000,p+'.data').map((v,k)=>{if(++count>10000)fail('series','RESOURCE_LIMIT');const at=p+'.data['+k+']',d=record(v,['id','x','y','datum'],['id','x','y'],at),pid=text(d.id,at+'.id',128),xid=text(d.x,at+'.x',128);if(points.has(pid)||xs.has(xid))fail(at,'DUPLICATE_ID');if(!categories.has(xid))fail(at+'.x','UNKNOWN_CATEGORY','UNKNOWN_CATEGORY');points.add(pid);xs.add(xid);if(d.y!==null)d.y=number(d.y,at+'.y');return Object.freeze(d);}));return Object.freeze(series);}));
    if(Object.hasOwn(s,'references')){const refs=new Set<string>();s.references=Object.freeze(array(s.references,16,'references').map((v,i)=>{const p='references['+i+']',r=record(v,['id','axis','value','label','color','dash'],['id','axis','value'],p),id=text(r.id,p+'.id',128);if(refs.has(id))fail(p,'DUPLICATE_ID');refs.add(id);choice(r.axis,['y'],p+'.axis');r.value=number(r.value,p+'.value');optional(r,'label',text,p);optional(r,'color',color,p);optional(r,'dash',(v,p)=>choice(v,['solid','dashed','dotted'],p),p);return Object.freeze(r);}));}
    if(Object.hasOwn(s,'legend')){const l=record(s.legend,['position'],[],'legend');optional(l,'position',(v,p)=>choice(v,['bottom','end','none'],p),'legend');s.legend=Object.freeze(l);}
    if(Object.hasOwn(s,'tooltip')){const t=record(s.tooltip,['mode','placement'],[],'tooltip');optional(t,'mode',(v,p)=>choice(v,['point','shared','off'],p),'tooltip');optional(t,'placement',(v,p)=>choice(v,['top','bottom','start','end'],p),'tooltip');s.tooltip=Object.freeze(t);}
    if(Object.hasOwn(s,'status')){const t=record(s.status,['kind','message'],['kind'],'status');choice(t.kind,['ready','loading','empty','error'],'status.kind');optional(t,'message',(v,p)=>text(v,p,2048),'status');if(t.kind==='error'&&!t.message)fail('status.message');if(t.kind==='ready'&&Object.hasOwn(t,'message'))fail('status.message');s.status=Object.freeze(t);}
    if(Object.hasOwn(s,'state')){const t=record(s.state,['mode','value'],['mode'],'state');choice(t.mode,['internal','controlled'],'state.mode');if(t.mode==='controlled')t.value=state(t.value,ids,'state.value');else if(Object.hasOwn(t,'value'))fail('state.value');s.state=Object.freeze(t);}
    if(Object.hasOwn(s,'selection'))s.selection=selectionBinding(s.selection);
    if(Object.hasOwn(s,'crosshair'))choice(s.crosshair,[false,'x','y','xy'],'crosshair');
    if(Object.hasOwn(s,'motion'))choice(s.motion,['none','subtle'],'motion');
    if(Object.hasOwn(s,'viewport'))s.viewport=viewportBinding(s.viewport);
    return Object.freeze(s) as unknown as ColumnChartSpec<T>;
  });
}
export function validateColumnOptions<T>(value: unknown, ids: ReadonlySet<string>): ChartResult<ColumnMountOptions<T>> {
  return checked(()=>{const o=record(value,['instanceId','initialState','onPointActivate','onStateChange','onSelectionChange','onViewportChange','onDiagnostic'],['instanceId'],'options');const id=text(o.instanceId,'options.instanceId',64);if(!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id))fail('options.instanceId','BAD_INSTANCE_ID');for(const key of ['onPointActivate','onStateChange','onSelectionChange','onViewportChange','onDiagnostic'])if(Object.hasOwn(o,key)&&typeof o[key]!=='function')fail('options.'+key);if(Object.hasOwn(o,'initialState'))o.initialState=state(o.initialState,ids,'options.initialState');return Object.freeze(o) as unknown as ColumnMountOptions<T>;});
}
