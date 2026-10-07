import {it,expect} from 'vitest';
import {cleanup,removeOwnedNode,subscriptions} from '../../src/internal/chart/cleanup.js';
import {fullX} from '../../src/internal/tooltip/model.js';
import {shellFrame} from '../../src/internal/layout/frame.js';
import {referenceOutside} from '../../src/internal/axes/scene.js';
it('F01/F02 subscriptions roll back a side-effect-then-throw and continue sibling release',()=>{
  const calls:string[]=[];let active=0;
  const target={addEventListener(type:string){active++;if(type==='bad')throw Error('acquired');},removeEventListener(type:string){calls.push(type);active--;if(type==='bad')throw Error('released');}} as unknown as EventTarget;
  const owned=subscriptions();owned.add(target,'first',()=>{});expect(()=>owned.add(target,'bad',()=>{},true)).toThrow('acquired');expect(active).toBe(0);expect(calls).toEqual(['bad','first']);owned.clear();expect(active).toBe(0);
});
it('F02 owned-node cleanup falls back and never escapes an unavailable native release',()=>{
  let removed=0;const node={remove(){throw Error('remove');},parentNode:{removeChild(){removed++;}}} as unknown as Element;removeOwnedNode(node);expect(removed).toBe(1);removeOwnedNode(null);cleanup(()=>{throw Error('cleanup');});removeOwnedNode({remove(){throw Error();},parentNode:{removeChild(){throw Error();}}} as unknown as Element);
});
it('F07 full category values retain distinct IDs, Unicode and label-equals-ID without duplicating it',()=>{
  const labels=new Map([['north-a','North'],['north-b','North'],['😀','区'],['same','same']]);expect(fullX('north-a','category',labels)).toBe('North (north-a)');expect(fullX('north-b','category',labels)).toBe('North (north-b)');expect(fullX('😀','category',labels)).toBe('区 (😀)');expect(fullX('same','category',labels)).toBe('same');expect(fullX('missing','category',labels)).toBe('missing');
});
it('F08 logical end reserves the correct side at inner 639/640/641 independent of data direction',()=>{
  const font={family:'sans-serif',size:12,weight:400} as const,measurer={measure:()=>({width:10,height:15,baseline:12}),invalidate(){},destroy(){}};
  for(const direction of ['ltr','rtl'] as const)for(const inner of [639,640,641]){const f=shellFrame({width:inner+24,height:400},false,['S'],'end',font,direction,measurer);expect(f.legendPosition).toBe(inner<640?'bottom':'end');if(inner>=640){if(direction==='ltr')expect(f.legend.x).toBe(f.body.x+f.body.width+8);else expect(f.body.x).toBe(f.legend.x+f.legend.width+8);}}
});
it('F09 reference membership uses domains and category identity, not geometry or Y direction',()=>{
  const domains={x:[0,10] as const,y:[10,0] as const},categories=new Map([['a',0]]);for(const axis of ['x','y'] as const){for(const value of [0,5,10])expect(referenceOutside({id:'r',axis,value},domains,categories)).toBe(false);for(const value of [-1,11])expect(referenceOutside({id:'r',axis,value},domains,categories)).toBe(true);}expect(referenceOutside({id:'r',axis:'x',value:'a'},domains,categories)).toBe(false);expect(referenceOutside({id:'r',axis:'x',value:'b'},domains,categories)).toBe(true);expect(referenceOutside({id:'r',axis:'y',value:5},{x:null,y:null},categories)).toBe(false);
});
