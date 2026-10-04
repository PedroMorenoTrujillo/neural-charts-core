import { expect, test } from 'vitest';
import { fixture, value } from '../helpers.js';
import { createBandScale, createCategoryFrame, createPointScale } from '../../src/internal/math/category.js';
import { advanceUtc, enumerateUtc, floorUtc, MAX_DATE, MIN_DATE, UTC_INTERVALS } from '../../src/internal/math/utc.js';
import { createTimeScale, normalizeTimeDomain, selectTimeTicks, timeExtent } from '../../src/internal/math/time.js';
for(const row of fixture('categories').cases)test(`category ${row.id}`,()=>{
  const frame=value(createCategoryFrame(row.input.ids,row.input.range,row.input.edgeSpacing)),band=value(createBandScale(frame,row.input.gap)),point=createPointScale(frame);
  expect(band.frame).toBe(point.frame);expect(row.input.ids.map((id:string)=>point.center(id))).toEqual(row.expected.centers);
  expect(row.input.ids.map((id:string)=>{const b=band.band(id)!;return[b.start,b.end];})).toEqual(row.expected.bands);
  expect(frame.step).toBe(row.expected.step);expect(band.width).toBe(row.expected.width);
});
test('category containment, ties, zero and errors',()=>{
  for(const reversed of [false,true]){
    const f=value(createCategoryFrame(['a','b','c'],reversed?[300,0]:[0,300],.5)),b=value(createBandScale(f,.2)),p=createPointScale(f);
    expect(b.bandAt(100)).toBeNull();expect(p.indexAt(reversed?200:100)).toBe(1);expect(b.band('missing')).toBeNull();expect(p.center('missing')).toBeNull();
    expect(p.categoryAt(-1)).toBeNull();expect(p.indexAt(NaN)).toBeNull();expect(f.centerAt(-1)).toBeNull();expect(f.centerAt(.5)).toBeNull();
    const touching=value(createBandScale(f,0));expect(touching.bandAt(reversed?200:100)?.id).toBe('b');
  }
  const b=value(createBandScale(value(createCategoryFrame(['a','b','c'],[0,300],.5)),.2));expect(b.bandAt(90)).toBeNull();expect(b.bandAt(290)?.id).toBe('c');
  const empty=createPointScale(value(createCategoryFrame([],[0,300],0)));expect(empty.indexAt(1)).toBeNull();expect(empty.categoryAt(1)).toBeNull();
  const single=createPointScale(value(createCategoryFrame(['a'],[0,300],9)));expect(single.center('a')).toBe(150);expect(single.indexAt(1)).toBe(0);
  const zero=value(createCategoryFrame(['a','b'],[0,0],.5));expect(zero.invertible).toBe(false);expect(value(createBandScale(zero,0.2)).bandAt(0)).toBeNull();
  for(const [ids,range,e]of [[['a','a'],[0,1],.5],[[''],[0,1],.5],[['a'],[0,Infinity],.5],[['a'],[0,1],-1],[['a','b'],[-Number.MAX_VALUE,Number.MAX_VALUE],.5],[['a','b'],[0,1],Number.MAX_VALUE],[['a','b'],[1,1+Number.EPSILON],1e20]])expect(createCategoryFrame(ids as any,range as any,e as number).status).toBe('invalid');
  const frame=value(createCategoryFrame(['a','b'],[0,100],0));expect(createBandScale(frame,.2).status).toBe('invalid');
  for(const gap of [-1,1,NaN])expect(createBandScale(frame,gap).status).toBe('invalid');
});
for(const row of fixture('utc').cases)test(`UTC ${row.id}`,()=>{
  const ticks=row.expected.ticks,domain=[ticks[0],ticks[ticks.length-1]]as[number,number];
  if(row.input.intervalOnly)expect(enumerateUtc(domain[0],domain[1],row.expected.interval,false)).toEqual(ticks);
  else {const p=value(selectTimeTicks(domain,{nice:false,targetCount:row.input.targetCount}));expect(p.ticks).toEqual(ticks);expect(p.interval).toEqual(row.expected.interval);}
});
test('UTC floors, calendar and Date limits',()=>{
  expect(floorUtc(-1,{unit:'millisecond',step:2})).toBe(-2);expect(floorUtc(0,{unit:'week',step:1})).toBe(-259200000);expect(advanceUtc(-259200000,{unit:'week',step:1})).toBe(345600000);
  expect(floorUtc(NaN,{unit:'day',step:1})).toBeNull();expect(floorUtc(0,{unit:'day',step:3})).toBeNull();expect(advanceUtc(1,{unit:'day',step:1})).toBeNull();expect(advanceUtc(MAX_DATE,{unit:'millisecond',step:1})).toBeNull();
  expect(floorUtc(MIN_DATE,{unit:'year',step:1000000})).toBeNull();expect(enumerateUtc(MIN_DATE,MAX_DATE,{unit:'year',step:1000000},true)).toBeNull();
  expect(enumerateUtc(0,1000,{unit:'millisecond',step:1},false)).toBeNull();expect(enumerateUtc(1,2,{unit:'second',step:1},false)).toEqual([]);
  expect(enumerateUtc(2,1,{unit:'day',step:1},false)).toBeNull();
  expect(advanceUtc(-62167219200000,{unit:'year',step:1})).toBe(-62135596800000);
  expect(advanceUtc(-59014137600000,{unit:'month',step:1})).toBe(-59011459200000);
  for(const i of UTC_INTERVALS){const lo=floorUtc(0,i);expect(lo).not.toBeNull();const next=advanceUtc(lo!,i);if(next!==null)expect(next).toBeGreaterThan(lo!);else expect(i.unit==='year'&&i.step>=500000).toBe(true);}
});
test('time domain, projection and ticks validation',()=>{
  expect(timeExtent([null])).toEqual({status:'empty'});expect(timeExtent([-0,0])).toEqual({status:'constant',value:0});expect(timeExtent([1.5])).toMatchObject({diagnostic:{reason:'FRACTIONAL_TIMESTAMP'}});
  expect(normalizeTimeDomain(timeExtent([]),{})).toEqual({status:'empty'});expect(normalizeTimeDomain(timeExtent([0]),{})).toMatchObject({domain:[-1000,1000],expandedConstant:true});
  expect(normalizeTimeDomain(timeExtent([MAX_DATE]),{})).toMatchObject({domain:[MAX_DATE-1000,MAX_DATE]});
  expect(normalizeTimeDomain(timeExtent([NaN]),{explicit:[0,1]}).status).toBe('invalid');expect(normalizeTimeDomain(timeExtent([]),{explicit:[0,1]})).toMatchObject({source:'explicit'});
  expect(normalizeTimeDomain(timeExtent([1]),{explicit:[1,1]}).status).toBe('invalid');
  const scale=value(createTimeScale([0,1000],[0,100],false));expect(scale.map(500)).toBe(50);expect(scale.map(.5)).toBeNull();expect(scale.invert(0.05)).toBe(.5);expect(scale.invert(Infinity)).toBeNull();
  expect(createTimeScale([0,MAX_DATE+1],[0,1],false).status).toBe('invalid');expect(createTimeScale([0,1],[0,Infinity],false).status).toBe('invalid');
  expect(value(selectTimeTicks([60000,3540000],{targetCount:5,nice:true}))).toMatchObject({domain:[0,3600000],ticks:[0,900000,1800000,2700000,3600000],interval:{unit:'minute',step:15}});
  expect(value(selectTimeTicks([1,1999],{nice:false,manual:[1,1000,1999]})).ticks).toEqual([1,1000,1999]);expect(value(selectTimeTicks([0,1],{nice:false,manual:[]})).ticks).toEqual([]);
  for(const opts of [{nice:true,manual:[1]},{nice:false,targetCount:1},{nice:false,manual:[.5]},{nice:false,manual:[2]},{nice:false,manual:[0,0]},{nice:false,manual:Array(201).fill(0)},{nice:false,manual:undefined},{nice:'yes'}])expect(selectTimeTicks([0,1],opts as any).status).toBe('invalid');
  expect(selectTimeTicks([1,1],{nice:false}).status).toBe('invalid');
});
