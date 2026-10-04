import {it,expect} from 'vitest';
import {allowedRect,unsupportedPortalMapping,createTooltipView} from '../../src/internal/tooltip/view.js';
import {defaultPalette} from '../../src/internal/chart/presentation.js';
import type {Shell} from '../../src/internal/chart/shell.js';
import type {TooltipModel} from '../../src/internal/tooltip/model.js';
import {createTableView} from '../../src/internal/accessibility/table.js';
import type {TableSource} from '../../src/internal/accessibility/table.js';
import {createLegendView} from '../../src/internal/legend/view.js';
import {createSemanticView} from '../../src/internal/accessibility/view.js';
import type {SemanticModel} from '../../src/internal/accessibility/model.js';

it('default semantic text, focus, references and every series have measurable contrast',()=>{
  const lum=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]!*.2126+c[1]!*.7152+c[2]!*.0722;};
  const contrast=(a:string,b:string)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const theme of ['light','dark'] as const){const p=defaultPalette(theme,false);for(const color of [p.text,p.muted])expect(contrast(color,p.surface)).toBeGreaterThanOrEqual(4.5);for(const color of [p.axis,p.focus,p.reference,...p.series])expect(contrast(color,p.surface)).toBeGreaterThanOrEqual(3);expect(contrast(p.tooltipText,p.tooltipSurface)).toBeGreaterThanOrEqual(4.5);}
});
it('tooltip disposal drops shell access and all subsequent operations remain inert',()=>{
  let replaced=0;const detail={hidden:false,replaceChildren(){replaced++;}};
  const shell={root:{ownerDocument:{activeElement:null}},detail} as unknown as Shell;
  const view=createTooltipView(shell);expect(view.measure()).toBeNull();view.destroy();expect(detail.hidden).toBe(true);
  const model={} as TooltipModel;view.write(model,{x:0,y:0,width:100,height:100},defaultPalette('light',false),{family:'sans-serif',size:12,weight:400},'ltr');view.show({kind:'closed'},model);view.close(true);view.destroy();expect(view.measure()).toBeNull();expect(replaced).toBe(1);
});
it('portal bounds use the viewport fallback and contain zero-size/transformed content boxes',()=>{
  const style={getPropertyValue:(name:string)=>name.includes('left')?'2':name.includes('right')?'3':'0',overflowX:'visible',overflowY:'visible'};
  const win={innerWidth:100,innerHeight:80,getComputedStyle:()=>style};
  const host={ownerDocument:{defaultView:win},getBoundingClientRect:()=>({x:-5,y:5,width:50,height:30}),offsetWidth:0,offsetHeight:0,parentElement:null} as unknown as HTMLElement;
  expect(allowedRect(host)).toEqual({x:0,y:5,width:39,height:30});
  expect(unsupportedPortalMapping({defaultView:null} as unknown as Document)).toBe(true);
});
it('table disposal detaches all delegates and refuses late opens and DOM writes',()=>{
  let listeners=0,writes=0;const element={addEventListener(){listeners++;},removeEventListener(){listeners--;}};
  const shell={tableToggle:element,table:element} as unknown as Shell;
  const view=createTableView(shell,()=>writes++);expect(listeners).toBe(3);view.open();view.close();view.destroy();expect(listeners).toBe(0);
  view.update({} as TableSource,true);view.open();view.close();view.destroy();expect(view.isOpen()).toBe(false);expect(writes).toBe(0);
});
it('destroyed legend and semantic delegates cannot resurrect DOM or call application handlers',()=>{
  let listeners=0,calls=0;const element={addEventListener(){listeners++;},removeEventListener(){listeners--;}} as unknown as HTMLElement;
  const legend=createLegendView(element,()=>calls++);legend.destroy();legend.update([{id:'s',name:'S',color:'#000000',dash:'solid',width:100}],{hiddenSeriesIds:[]},false);legend.disable(false);legend.destroy();expect(listeners).toBe(0);expect(calls).toBe(0);
  const semantic=createSemanticView({} as Shell);semantic.destroy();semantic.update({} as SemanticModel,{x:0,y:0,width:100,height:100},true);semantic.destroy();
});
