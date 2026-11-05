import type {ChartResult} from '../public/chart-types.js';
import {transformLogViewport} from './log-viewport.js';
import type {PlanViewportConfig,PlanViewportState,PlanViewportIntent,PlanViewportResult,PlanViewportAxis,PlanViewportValue} from '../public/plan-types.js';
import type {ChartAxisWindow,ChartNumericWindow} from '../public/viewport-types.js';
import {cartesianViewportContext,withViewportDomains} from '../internal/interaction/viewport-axes.js';
import {prepareViewport,categoryViewportAxis,numericViewportAxis,type Viewport,type ViewportContext} from '../internal/interaction/viewport.js';
import {zoomDisplayedViewport,panDisplayedViewport,type ViewportDomains} from '../internal/interaction/viewport-display.js';
import {invalid,ok} from '../internal/diagnostics.js';
import {ownPlanInput,freezePlan} from './input.js';
import {MAX_PLAN_CATEGORIES} from './capacity.js';
import {createCategoryFrame,createPointScale} from '../internal/math/category.js';
import {createLinearScale} from '../internal/math/linear.js';
import {createTimeScale} from '../internal/math/time.js';
import type {PlanLineSpec} from '../public/plan-types.js';
import type {Domain} from '../internal/math/domain.js';
import type {Plot} from '../internal/layout/frame.js';
import type {AxisInput} from '../internal/axes/plan.js';
import {categoryZoomAnchor,categoryPanFraction} from '../internal/interaction/viewport-category.js';

const numericWindow=(value:ChartAxisWindow):value is ChartNumericWindow=>Array.isArray(value);
function publicValue(value:Viewport['value'],context:ViewportContext):PlanViewportValue{
  if(value.y&&!numericWindow(value.y))throw Error('Unsupported category Y viewport');
  const full=(axis:'x'|'y'):boolean=>{const window=value[axis],bounds=context[axis];if(!window)return true;
    return bounds.type==='category'?!numericWindow(window)&&window.firstId===bounds.ids[0]&&window.lastId===bounds.ids.at(-1):numericWindow(window)&&!!bounds.domain&&window[0]===bounds.domain[0]&&window[1]===bounds.domain[1];};
  return {...(full('x')?{}:{x:value.x!}),...(full('y')?{}:{y:value.y!})};
}

export function preparePlanViewport(axes:Parameters<typeof cartesianViewportContext>[0],domains:ViewportDomains,config:PlanViewportConfig|undefined):ChartResult<Viewport|null>{
  if(config===undefined)return ok(null);
  if(!config||typeof config!=='object'||Object.keys(config).some(key=>!['axes','value'].includes(key)))return invalid('INVALID_CONFIG','BAD_VIEWPORT','options.viewport');
  const context=cartesianViewportContext(axes,domains);if(context.status==='invalid')return context;
  return prepareViewport({mode:'controlled',axes:config.axes,value:config.value??{}},context.value);
}
export function planViewportState(viewport:Viewport|null,displayed:ViewportDomains,axes:Readonly<{x:AxisInput;y:AxisInput}>,plot?:Plot):PlanViewportState|undefined{
  if(!viewport)return undefined;
  const axis=(name:'x'|'y'):PlanViewportAxis=>{const bounds=viewport.context[name];return bounds.type==='category'?{type:'category',ids:bounds.ids,edgeSpacing:axes[name].edgeSpacing??.5}:{type:bounds.type,domain:bounds.domain};};
  return {axes:viewport.settings.axes,value:publicValue(viewport.value,viewport.context),bounds:{x:axis('x'),y:axis('y')},displayed,reversed:{x:axes.x.reversed??false,y:axes.y.reversed??false},...(plot?{plot:{x:plot.x,y:plot.y,width:plot.width,height:plot.height}}:{})};
}
/** Reuse Core scales, preserving off-window neighbours for clipped line edges.
 * Raw points, category ranks and null-separated runs keep their identities. */
export function planLineViewportScales(axes:PlanLineSpec['axes'],plot:Plot,xDomain:Domain|null,yDomain:Domain,viewport:Viewport|null):ChartResult<Readonly<{mapX(value:string|number):number|null;mapY(value:number):number|null}>|undefined>{
  if(!viewport||!viewport.value.x&&!viewport.value.y)return ok(undefined);
  const y=createLinearScale(yDomain,axes.y.reversed?[plot.y,plot.y+plot.height]:[plot.y+plot.height,plot.y],false);if(y.status==='invalid')return y;
  if(axes.x.type!=='category'){
    if(!xDomain)return invalid('INVALID_DOMAIN','BAD_VIEWPORT_AXIS','viewport.x');
    const x=(axes.x.type==='time'?createTimeScale:createLinearScale)(xDomain,[plot.x,plot.x+plot.width],false);if(x.status==='invalid')return x;
    return ok({mapX:value=>typeof value==='number'?x.value.map(value):null,mapY:y.value.map});
  }
  const bounds=viewport.context.x;if(bounds.type!=='category')return invalid('INVALID_CONFIG','BAD_VIEWPORT_AXIS','viewport.x');
  const window=viewport.value.x,first=window&&!Array.isArray(window)?bounds.ranks.get((window as {firstId:string}).firstId):0,last=window&&!Array.isArray(window)?bounds.ranks.get((window as {lastId:string}).lastId):bounds.ids.length-1;
  if(first===undefined||last===undefined||first>last)return invalid('INVALID_CONFIG','BAD_CATEGORY_WINDOW','viewport.x');
  const frame=createCategoryFrame(bounds.ids.slice(first,last+1),[plot.x,plot.x+plot.width],axes.x.edgeSpacing??.5);if(frame.status==='invalid')return frame;
  if(!window){const x=createPointScale(frame.value);return ok({mapX:value=>typeof value==='string'?x.center(value):null,mapY:y.value.map});}
  const range:readonly[number,number]=first===last?[plot.x,plot.x+plot.width]:[frame.value.centerAt(0)!,frame.value.centerAt(last-first)!];
  const x=createLinearScale(first===last?[first-.5,first+.5]:[first,last],range,false);if(x.status==='invalid')return x;
  return ok({mapX:value=>{const rank=typeof value==='string'?bounds.ranks.get(value):undefined;return rank===undefined?null:x.value.map(rank);},mapY:y.value.map});
}
/** Gesture/control transforms reuse the shared viewport mathematics. This does
 * not normalize observations or project geometry; hosts may commit once per gesture. */
export function transformPlanViewport(input:PlanViewportState,intent:PlanViewportIntent):PlanViewportResult{
  try{
    const state=ownPlanInput(input) as PlanViewportState,action=ownPlanInput(intent) as PlanViewportIntent;
    if(!state||!action||Object.keys(state).some(key=>!['axes','value','bounds','displayed','reversed','plot'].includes(key))||!state.bounds||!state.displayed||!state.reversed||Object.keys(state.bounds).some(key=>!['x','y'].includes(key))||Object.keys(state.displayed).some(key=>!['x','y'].includes(key))||Object.keys(state.reversed).some(key=>!['x','y'].includes(key))||typeof state.reversed.x!=='boolean'||typeof state.reversed.y!=='boolean')return invalid('INVALID_CONFIG','BAD_VIEWPORT','viewport');
    if(state.plot!==undefined&&(!state.plot||typeof state.plot!=='object'||Object.keys(state.plot).some(key=>!['x','y','width','height'].includes(key))||!['x','y','width','height'].every(key=>typeof state.plot![key as keyof typeof state.plot]==='number'&&Number.isFinite(state.plot![key as keyof typeof state.plot]))||state.plot.x<0||state.plot.y<0||state.plot.width<=0||state.plot.height<=0))return invalid('INVALID_CONFIG','BAD_VIEWPORT_PLOT','viewport.plot');
    if(state.bounds.x?.type==='log'||state.bounds.y?.type==='log')return freezePlan(transformLogViewport(state,action,transformPlanViewport));
    const read=(name:'x'|'y')=>{const axis=state.bounds[name];if(!axis||typeof axis!=='object')return invalid('INVALID_CONFIG','BAD_VIEWPORT_AXIS','viewport.'+name);
      if(axis.type==='category'){if(Object.keys(axis).some(key=>!['type','ids','edgeSpacing'].includes(key))||!Array.isArray(axis.ids)||axis.ids.length>(name==='x'?MAX_PLAN_CATEGORIES:256)||!Number.isFinite(axis.edgeSpacing)||axis.edgeSpacing<0||axis.edgeSpacing>2)return invalid('INVALID_CONFIG','BAD_VIEWPORT_AXIS','viewport.'+name);return categoryViewportAxis(axis.ids);}
      if(axis.type!=='linear'&&axis.type!=='time'||Object.keys(axis).some(key=>!['type','domain','limits'].includes(key)))return invalid('INVALID_CONFIG','BAD_VIEWPORT_AXIS','viewport.'+name);
      if('limits' in axis&&axis.limits!==undefined&&(!axis.limits||Object.keys(axis.limits).some(key=>key!=='minSpan')||!Number.isFinite(axis.limits.minSpan)||axis.limits.minSpan<=0||!Array.isArray(axis.domain)||axis.domain.length!==2||axis.limits.minSpan>axis.domain[1]!-axis.domain[0]!))return invalid('INVALID_CONFIG','BAD_VIEWPORT_LIMIT','viewport.'+name+'.limits');
      return numericViewportAxis(axis.type,axis.domain,state.displayed[name]);};
    const x=read('x');if(x.status==='invalid')return x;const y=read('y');if(y.status==='invalid')return y;
    const context:ViewportContext={x:x.value,y:y.value};
    const prepared=prepareViewport({mode:'controlled',axes:state.axes,value:state.value},context);if(prepared.status==='invalid')return prepared;
    if(!prepared.value)return invalid('INVALID_CONFIG','BAD_VIEWPORT','viewport');
    const spacing=(name:'x'|'y')=>{const axis=state.bounds[name];return axis.type==='category'?axis.edgeSpacing:.5;};
    const pan=(view:Viewport,delta:Readonly<{x?:number;y?:number}>,domains:ViewportDomains):ChartResult<Viewport>=>{
      if(Object.values(delta).some(value=>typeof value!=='number'||!Number.isFinite(value)))return invalid('INVALID_CONFIG','BAD_PAN','intent.delta');
      return panDisplayedViewport(view,domains,{...(delta.x===undefined?{}:{x:categoryPanFraction(view,'x',delta.x,spacing('x'))}),...(delta.y===undefined?{}:{y:categoryPanFraction(view,'y',delta.y,spacing('y'))})});
    };
    let next:ChartResult<Viewport>;
    if(action.type==='reset'){if(Object.keys(action).length!==1)return invalid('INVALID_CONFIG','BAD_VIEWPORT_INTENT','intent');return freezePlan({status:'ok',value:{}});}
    if(action.type==='zoom'||action.type==='transform'){
      if(Object.keys(action).some(key=>!(action.type==='transform'?['type','factor','anchor','delta']:['type','factor','anchor']).includes(key)))return invalid('INVALID_CONFIG','BAD_VIEWPORT_INTENT','intent');
      if(action.anchor&&(Object.keys(action.anchor).some(key=>!['x','y'].includes(key))||Object.values(action.anchor).some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)))return invalid('INVALID_CONFIG','BAD_VIEWPORT_ANCHOR','intent.anchor');
      if(!Number.isFinite(action.factor)||action.factor<=0)return invalid('INVALID_CONFIG','BAD_ZOOM','intent.factor');
      let factor=action.factor;
      if(factor>1)for(const name of ['x','y'] as const){
        if(state.axes!==name&&state.axes!=='xy')continue;
        const axis=state.bounds[name],displayed=state.displayed[name];
        if(axis.type!=='category'&&'limits' in axis&&axis.limits&&displayed){
          const span=displayed[1]-displayed[0];
          if(span<axis.limits.minSpan*(1-1e-12))return invalid('INVALID_CONFIG','BAD_VIEWPORT_LIMIT','viewport.'+name+'.limits');
          factor=Math.min(factor,Math.max(1,span/axis.limits.minSpan));
        }
      }
      next=zoomDisplayedViewport(prepared.value,state.displayed,factor,{x:categoryZoomAnchor(prepared.value,'x',action.anchor?.x??.5,spacing('x')),y:categoryZoomAnchor(prepared.value,'y',action.anchor?.y??.5,spacing('y'))});
      if(action.type==='transform'&&action.delta){
        if(Object.keys(action.delta).some(key=>!['x','y'].includes(key)))return invalid('INVALID_CONFIG','BAD_VIEWPORT_INTENT','intent.delta');
        if(next.status==='ok')next=pan(next.value,action.delta,withViewportDomains(state.displayed,next.value));
      }
    }else if(action.type==='pan'){
      if(Object.keys(action).some(key=>!['type','delta'].includes(key))||!action.delta||Object.keys(action.delta).some(key=>!['x','y'].includes(key)))return invalid('INVALID_CONFIG','BAD_VIEWPORT_INTENT','intent');
      next=pan(prepared.value,action.delta,state.displayed);
    }else return invalid('INVALID_CONFIG','BAD_VIEWPORT_INTENT','intent');
    return next.status==='invalid'?next:freezePlan({status:'ok',value:publicValue(next.value.value,next.value.context)});
  }catch{return invalid('INVALID_CONFIG','BAD_VIEWPORT','viewport');}
}
