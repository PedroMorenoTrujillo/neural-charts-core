import { it, expect } from 'vitest';
import fc from 'fast-check';
import { normalizeColumn } from '../../src/column/normalize.js';
import { projectColumn } from '../../src/column/geometry.js';
it('rectangles preserve lengths and transpose without changing identity',()=>{
  fc.assert(fc.property(fc.array(fc.integer({min:-100000,max:100000}),{minLength:1,maxLength:100}),fc.integer({min:0,max:900}).map(n=>n/1000),fc.integer({min:1,max:1000}),(values,groupGap,shift)=>{
    const spec={family:'column' as const,title:'Property',groupGap,axes:{x:{type:'category' as const,values:values.map((_,i)=>({id:String(i)}))},y:{type:'linear' as const}},series:[{id:'s',name:'S',data:values.map((y,i)=>({id:String(i),x:String(i),y}))}]},state={hiddenSeriesIds:[]};
    const vertical=projectColumn(normalizeColumn(spec),state,{x:0,y:0,width:600,height:300},[-100000,100000]);
    const horizontal=projectColumn(normalizeColumn({...spec,orientation:'horizontal'}),state,{x:0,y:0,width:300,height:600},[-100000,100000]);
    const moved=projectColumn(normalizeColumn(spec),state,{x:shift,y:shift,width:600,height:300},[-100000,100000]);
    expect(vertical.status).toBe('ok');expect(horizontal.status).toBe('ok');expect(moved.status).toBe('ok');
    if(vertical.status!=='ok'||horizontal.status!=='ok'||moved.status!=='ok')return;
    for(let i=0;i<values.length;i++){const a=vertical.value.rects[i]!,b=horizontal.value.rects[i]!,c=moved.value.rects[i]!;expect(b.key).toBe(a.key);expect(b.x).toBeCloseTo(300-a.y-a.height,8);expect(b.y).toBeCloseTo(a.x,8);expect(b.width).toBeCloseTo(a.height,8);expect(b.height).toBeCloseTo(a.width,8);expect(c.x-a.x).toBeCloseTo(shift,8);expect(c.y-a.y).toBeCloseTo(shift,8);expect([a.x,a.y,a.width,a.height].every(Number.isFinite)).toBe(true);expect(a.x).toBeGreaterThanOrEqual(-1e-9);expect(a.x+a.width).toBeLessThanOrEqual(600+1e-9);expect(a.y+a.height).toBeLessThanOrEqual(300+1e-9);}
  }),{seed:20261016,numRuns:100});
});
