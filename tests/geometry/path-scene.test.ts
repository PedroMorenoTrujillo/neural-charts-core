import {expect,test}from'vitest';
import {createPathBuilder,serializePath}from'../../src/internal/geometry/path.js';
import {validHex,validPaint,validateSceneFrame}from'../../src/internal/scene/validate.js';
import {value}from'../helpers.js';
function frame(){return{revision:1,width:100,height:100,defs:[],layers:{background:[],grid:[],'reference-bands':[],marks:[]as any[],'reference-lines':[],axes:[],labels:[],interaction:[]}};}
test('path grammar and literal serialization',()=>{
  const b=createPathBuilder();b.moveTo(-0,0);b.lineTo(10,0);b.arcTo(5,0,1,10,10);b.close();expect(value(serializePath(value(b.finish())))).toBe('M 0 0 L 10 0 A 5 5 0 0 1 10 10 Z');expect(b.finish().status).toBe('invalid');b.lineTo(1,1);expect(b.finish().status).toBe('invalid');
  expect(value(serializePath([]))).toBe('');expect(value(serializePath([{kind:'M',x:1e-7,y:Number.MIN_VALUE}]))).toBe('M 1e-7 5e-324');
  for(const commands of [[{kind:'L',x:1,y:1}],[{kind:'Z'}],[{kind:'M',x:NaN,y:0}],[{kind:'M',x:0,y:0},{kind:'A',radius:0,largeArc:0,sweep:1,x:1,y:1}],[{kind:'M',x:0,y:0},{kind:'A',radius:1,largeArc:0,sweep:1,x:0,y:0}],[{kind:'M',x:0,y:0,onclick:'x'}],[{kind:'H',x:1,y:1}],Array(1000001)])expect(serializePath(commands as any).status).toBe('invalid');
  for(const action of [0,1,2,3]){const bad=createPathBuilder();if(action===0)bad.lineTo(1,1);if(action===1)bad.close();if(action===2)bad.moveTo(NaN,0);if(action===3){bad.moveTo(0,0);bad.arcTo(-1,0,1,1,1);}bad.moveTo(0,0);expect(bad.finish().status).toBe('invalid');}
});
test('closed scene validation and own copies',()=>{
  const f=frame();
  f.layers.marks.push({key:'r',kind:'rect',x:0,y:0,width:10,height:10,rx:2,presentation:{fill:{kind:'solid',value:'#ABC'},stroke:{kind:'none'},dash:[1,2]},classes:['nc-a'],semantic:{targetId:'r'},translate:{x:0,y:0}});
  const copied=value(validateSceneFrame(f));expect(copied).not.toBe(f);expect(Object.isFrozen(copied.layers.marks)).toBe(true);f.layers.marks[0].width=20;expect((copied.layers.marks[0]as any).width).toBe(10);
  for(const change of [{width:0},{revision:0},{defs:Array(10001)},{layers:{}},{unexpected:1}])expect(validateSceneFrame({...frame(),...change}).status).toBe('invalid');
  const base={key:'r',kind:'rect',x:0,y:0,width:10,height:10};
  for(const c of [null,{...base,width:-1},{...base,x:NaN},{...base,rx:6},{...base,onclick:'alert'},{...base,rx:undefined},{...base,clipKey:'missing'},{...base,presentation:{fill:{kind:'solid',value:'url(x)'}}},{...base,classes:['unsafe']},{...base,translate:{x:0,y:Infinity}},{...base,semantic:{targetId:''}},{key:'x',kind:'text',x:0,y:0,text:'x',fontSize:0},{key:'x',kind:'text',x:0,y:0,text:'x',fontWeight:999},{key:'x',kind:'path',commands:[{kind:'Z'}]}]){const x=frame();x.layers.marks=[c];expect(validateSceneFrame(x).status).toBe('invalid');}
  const dup=frame();dup.layers.marks=[base,base];expect(validateSceneFrame(dup).status).toBe('invalid');const defs=frame();defs.defs=[{key:'c',kind:'clip-rect',x:0,y:0,width:-1,height:1}]as any;expect(validateSceneFrame(defs).status).toBe('invalid');
  for(const p of [{kind:'none'},{kind:'solid',value:'#1234'},{kind:'solid',value:'#12345678'},{kind:'token',name:'--nc-a',fallback:{kind:'solid',value:'#123'}}])expect(validPaint(p)).toBe(true);
  for(const p of [null,{kind:'none',value:'#fff'},{kind:'token',name:'--other',fallback:{kind:'solid',value:'#fff'}},{kind:'token',name:'--nc-a',fallback:{kind:'none'}}])expect(validPaint(p)).toBe(false);
  expect(validHex('#12')).toBe(false);
});
