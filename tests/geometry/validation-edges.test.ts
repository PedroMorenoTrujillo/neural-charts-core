import {expect,test}from'vitest';
import {validateSceneFrame}from'../../src/internal/scene/validate.js';
import {serializePath,createPathBuilder}from'../../src/internal/geometry/path.js';
import {normalizeNumericDomain}from'../../src/internal/math/domain.js';
import {createTimeScale,normalizeTimeDomain,selectTimeTicks,timeExtent}from'../../src/internal/math/time.js';
import {MIN_DATE,MAX_DATE,advanceUtc}from'../../src/internal/math/utc.js';
import {value}from'../helpers.js';
const frame=(marks:any[]=[],defs:any[]=[])=>({revision:1,width:100,height:100,defs,layers:{background:[],grid:[],'reference-bands':[],marks,'reference-lines':[],axes:[],labels:[],interaction:[]}});
test('all validation rejection categories and payload limits',()=>{
  const base={key:'r',kind:'rect',x:0,y:0,width:1,height:1};
  for(const p of [null,{strokeWidth:-1},{opacity:2},{fillOpacity:-1},{strokeOpacity:NaN},{lineCap:'bad'},{lineJoin:'bad'},{dash:[0]},{dash:[-1]},{dash:Array(33).fill(1)},{dash:'bad'},{fill:undefined},{extra:1}])expect(validateSceneFrame(frame([{...base,presentation:p}])).status).toBe('invalid');
  for(const p of [{strokeWidth:0,opacity:0,fillOpacity:1,strokeOpacity:1,lineCap:'butt',lineJoin:'miter',dash:[]},{fill:{kind:'none'},stroke:{kind:'token',name:'--nc-x',fallback:{kind:'solid',value:'#abcd'}}}])expect(validateSceneFrame(frame([{...base,presentation:p}])).status).toBe('ok');
  for(const c of [{key:'t',kind:'text',x:0,y:0,text:'x',anchor:'bad'},{key:'t',kind:'text',x:0,y:0,text:'x',baseline:'bad'},{key:'t',kind:'text',x:0,y:0,text:'x',fontFamily:'bad'},{key:'t',kind:'text',x:0,y:0,text:1},{key:'t',kind:'text',x:0,y:0,text:'x'.repeat(65537)},{...base,translate:{x:1,y:1,extra:1}},{...base,semantic:{seriesId:'a',datumId:'b',targetId:'t',extra:1}},{...base,classes:Array(17).fill('nc-a')},{...base,key:''}])expect(validateSceneFrame(frame([c])).status).toBe('invalid');
  const def={key:'c',kind:'clip-rect',x:0,y:0,width:1,height:1};expect(validateSceneFrame(frame([], [def,def])).status).toBe('invalid');expect(validateSceneFrame(frame([],[{...def,x:NaN}])).status).toBe('invalid');
  expect(validateSceneFrame(frame(Array(100001).fill(base))).status).toBe('invalid');const text='x'.repeat(65536);expect(validateSceneFrame(frame(Array.from({length:513},(_,i)=>({key:String(i),kind:'text',x:0,y:0,text})))).status).toBe('invalid');
  expect(serializePath([null]as any).status).toBe('invalid');expect(serializePath([{kind:'M',x:0,y:0},{kind:'A',radius:1,largeArc:2,sweep:0,x:1,y:1}]as any).status).toBe('invalid');
  const b=createPathBuilder();b.moveTo(0,0);b.arcTo(1,1,0,2,2);b.close();b.moveTo(2,2);b.lineTo(3,3);expect(b.finish().status).toBe('ok');
});
test('numeric and time error boundaries',()=>{
  expect(normalizeNumericDomain({status:'span',domain:[NaN,1]},{includeZero:false}).status).toBe('invalid');
  expect(normalizeTimeDomain({status:'empty'},{explicit:undefined}as any).status).toBe('invalid');expect(normalizeTimeDomain({status:'constant',value:MAX_DATE+100000},{}).status).toBe('invalid');
  expect(timeExtent([null,0,1])).toMatchObject({status:'span',domain:[0,1]});expect(timeExtent([MIN_DATE-1]).status).toBe('invalid');
  for(const opts of [{nice:false,targetCount:undefined},{nice:false,targetCount:13},{nice:false,targetCount:2.5},{nice:false,manual:[0,1,0]},{nice:false,manual:[Infinity]}])expect(selectTimeTicks([0,1],opts as any).status).toBe('invalid');
  expect(value(createTimeScale([MAX_DATE-1,MAX_DATE],[0,1],false)).invert(2)).toBeNull();expect(advanceUtc(NaN,{unit:'day',step:1})).toBeNull();
});
