import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:640,height:320};
const histogram={family:'histogram',title:'Sample frequencies',samples:[0,1,2,3,4],binCount:2};
const bellcurve={family:'bellcurve',title:'Normal density',samples:[2,4,4,4,5,5,7,9]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec,opts=options){const result=planChart(spec,opts);assert.notEqual(result.status,'invalid',JSON.stringify(result));return result.frame;}
function close(actual,expected,tolerance=1e-10){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);}
function invalid(spec,opts=options){assert.equal(planChart(spec,opts).status,'invalid');}
function finite(value){if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value&&typeof value==='object')for(const child of Object.values(value))finite(child);}
function frozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))frozen(child);}}

check('histogram derives frequencies from raw samples with exact interval membership',()=>{
  const f=frame(histogram);
  assert.equal(f.family,'histogram');assert.deepEqual(f.observations.map(point=>point.value),[2,3]);
  assert.deepEqual(f.observations.map(point=>[point.lowValue,point.highValue]),[[0,2],[2,4]]);
  assert.deepEqual(f.observations.map(point=>point.label),['[0, 2)','[2, 4]']);
  assert.deepEqual(f.observations.map(point=>point.id),[{seriesId:'distribution',pointId:'bin-0'},{seriesId:'distribution',pointId:'bin-1'}]);
  assert.equal(f.observations.reduce((total,point)=>total+point.value,0),histogram.samples.length);
  const bars=f.series[0].bars;assert.equal(bars.length,2);close(bars[0].x+bars[0].width,bars[1].x);
  assert.equal(f.distribution.derived,true);assert.equal(f.distribution.sampleCount,5);close(f.distribution.mean,2);close(f.distribution.sampleStandardDeviation,Math.sqrt(2.5));
});
check('internal bin boundaries enter the following bin and final maximum remains included',()=>{
  const f=frame({...histogram,samples:[-4,-2,-2,0,2,4],binCount:4});
  assert.deepEqual(f.observations.map(point=>point.value),[1,2,1,2]);
  assert.deepEqual(f.observations.map(point=>[point.lowValue,point.highValue]),[[-4,-2],[-2,0],[0,2],[2,4]]);
});
check('histogram axis ticks are sparse numeric boundaries at real projected bar edges',()=>{
  const source={...histogram,samples:[12,15,18,20,21,22,24,25,25,26,28,30,32,35,38],binCount:12},f=frame(source);
  const bars=f.series[0].bars,first=bars[0],last=bars.at(-1);
  assert.ok(f.labels.length>=2&&f.labels.length<=8);close(f.labels[0].x,first.x);close(f.labels.at(-1).x,last.x+last.width);
  assert.equal(f.labels[0].label,'12');assert.equal(f.labels.at(-1).label,'38');
  const edges=[...bars.map(bar=>bar.x),last.x+last.width];
  for(const tick of f.labels){assert.ok(edges.some(edge=>Math.abs(edge-tick.x)<1e-9));assert.ok(Number.isFinite(Number(tick.label)));assert.ok(!tick.label.includes('['));}
  assert.equal(f.observations.reduce((total,point)=>total+point.value,0),source.samples.length);
  assert.equal(f.observations[0].label,'[12, 14.166666666666666)');
  const narrow=frame(source,{width:240,height:320});assert.ok(narrow.labels.length<f.labels.length);assert.equal(narrow.labels[0].label,'12');assert.equal(narrow.labels.at(-1).label,'38');
});
check('nearby histogram boundaries never receive ambiguous rounded duplicate ticks',()=>{
  const f=frame({...histogram,samples:[10000,10000.001,10000.002],binCount:2});
  assert.equal(new Set(f.labels.map(tick=>tick.label)).size,f.labels.length);
  assert.deepEqual(f.labels.map(tick=>Number(tick.label)),[10000,10000.001,10000.002]);
  assert.deepEqual(f.observations.map(point=>point.value),[1,2]);
});
check('default Sturges count and explicit bounded bin count are deterministic',()=>{
  const samples=Array.from({length:64},(_,index)=>index),source={family:'histogram',title:'Samples',samples};
  assert.equal(frame(source).observations.length,7);
  assert.equal(frame({...source,binCount:64}).observations.length,64);
  assert.deepEqual(frame({...source,binCount:1}).observations.map(point=>point.value),[64]);
  for(const binCount of [0,-1,1.5,65,Infinity,null,'4'])invalid({...source,binCount});
});
check('empty and constant samples preserve actual summaries without fabricated bins or density',()=>{
  for(const family of ['histogram','bellcurve']){
    const empty=planChart({family,title:'Empty',samples:[]},options);assert.equal(empty.status,'empty');assert.deepEqual(empty.frame.distribution,{derived:true,sampleCount:0});
    const constant=frame({family,title:'Constant',samples:[7,7,7]});assert.equal(constant.distribution.mean,7);assert.equal(constant.distribution.sampleStandardDeviation,0);
    if(family==='histogram'){assert.equal(constant.observations.length,1);assert.equal(constant.observations[0].value,3);assert.ok(constant.observations[0].lowValue<7&&constant.observations[0].highValue>7);}
    else {assert.equal(constant.observations.length,0);assert.ok(constant.series.every(series=>!series.commands?.length));}
  }
  const single=frame({...bellcurve,samples:[12]});assert.deepEqual(single.distribution,{derived:true,sampleCount:1,mean:12});assert.equal(single.observations.length,0);
});
check('bellcurve uses sample standard deviation and a mathematically normalized density',()=>{
  const f=frame(bellcurve),deviation=Math.sqrt(32/7);
  assert.equal(f.family,'bellcurve');assert.equal(f.observations.length,65);assert.equal(f.distribution.mean,5);close(f.distribution.sampleStandardDeviation,deviation);
  const centre=f.observations[32];close(centre.xValue,5);close(centre.value,1/(deviation*Math.sqrt(2*Math.PI)));
  close(f.observations[0].xValue,5-3*deviation);close(f.observations.at(-1).xValue,5+3*deviation);
  let integral=0;
  for(let index=1;index<f.observations.length;index++){const before=f.observations[index-1],after=f.observations[index];integral+=(after.xValue-before.xValue)*(before.value+after.value)/2;}
  close(integral,.9973,.0001);
  for(let index=0;index<33;index++)close(f.observations[index].value,f.observations[64-index].value);
  assert.ok(f.observations.every(point=>point.id.seriesId==='distribution'&&!Object.hasOwn(point,'lowValue')));
});
check('bellcurve interval and deviation settings change derived points while keeping original summaries',()=>{
  const before=frame(bellcurve),after=frame({...bellcurve,intervals:256,standardDeviations:6});
  assert.equal(after.observations.length,257);assert.deepEqual(after.distribution,before.distribution);
  close(after.observations[0].xValue,5-6*Math.sqrt(32/7));
  for(const intervals of [0,15,16.5,257,null,'64'])invalid({...bellcurve,intervals});
  for(const standardDeviations of [0,.5,6.1,Infinity,null,'3'])invalid({...bellcurve,standardDeviations});
});
check('shifted compensated statistics retain small variance around a large offset',()=>{
  const f=frame({...histogram,samples:[1e16,1e16+2],binCount:1});
  close(f.distribution.sampleStandardDeviation,Math.sqrt(2),1e-14);assert.equal(f.distribution.mean,1e16);
  const translated=frame({...histogram,samples:[-10,-9,-8,-7,-6]});close(translated.distribution.mean,-8);close(translated.distribution.sampleStandardDeviation,Math.sqrt(2.5));
});
check('finite extreme and tiny samples have bounded finite output or an explicit representability diagnostic',()=>{
  for(const value of [Number.MAX_VALUE,-Number.MAX_VALUE,Number.MIN_VALUE,0]){
    const f=frame({...histogram,samples:[value,value]});finite(f);assert.equal(f.observations[0].value,2);assert.equal(f.distribution.sampleStandardDeviation,0);assert.ok(f.labels.every(tick=>Number.isFinite(Number(tick.label))));
  }
  const tiny=frame({...histogram,samples:[0,Number.MIN_VALUE],binCount:1});finite(tiny);assert.equal(tiny.observations[0].value,2);
  invalid({...histogram,samples:[-Number.MAX_VALUE,Number.MAX_VALUE]});
  invalid({...bellcurve,samples:[0,Number.MIN_VALUE]});
  invalid({...bellcurve,samples:[1e16,1e16+2]});
  invalid({...histogram,samples:[1,1+Number.EPSILON],binCount:64});
  assert.equal(frame({family:'histogram',title:'Precision',samples:[1,1+Number.EPSILON]}).observations.length,1);
});
check('legend visibility hides only the derived series and preserves full-source summary',()=>{
  for(const source of [histogram,bellcurve]){
    const before=frame(source),hidden=planChart(source,{...options,hiddenSeriesIds:['distribution']});
    assert.equal(hidden.status,'empty');assert.equal(hidden.frame.observations.length,0);assert.deepEqual(hidden.frame.distribution,before.distribution);
    assert.equal(hidden.frame.legend[0].visible,false);assert.deepEqual(frame(source),before);
    invalid(source,{...options,hiddenSeriesIds:['missing']});invalid(source,{...options,hiddenSeriesIds:['distribution','distribution']});
  }
});
check('samples are complete finite bounded raw values and incompatible derived/layout fields are rejected',()=>{
  for(const source of [histogram,bellcurve]){
    for(const samples of [[0,null],[NaN],[Infinity],Array(3),Array(10001).fill(1),[{id:'a',value:1}]])invalid({...source,samples});
    for(const extra of [{data:[]},{axes:{}},{series:[]},{color:'#ffffff'}])invalid({...source,...extra});
    for(const extra of [{stacking:'sum'},{viewport:{axes:'x'}},{references:[]}])invalid(source,{...options,...extra});
  }
  invalid({...histogram,intervals:64});invalid({...bellcurve,binCount:4});
});
check('source ownership remains immutable and results never duplicate the raw samples',()=>{
  const source={...histogram,samples:[0,1,2,3,4]},before=JSON.stringify(source),f=frame(source);
  assert.equal(JSON.stringify(source),before);assert.equal(Object.isFrozen(source.samples),false);
  frozen(f);assert.equal(Object.hasOwn(f.distribution,'samples'),false);assert.equal(Object.hasOwn(f.distribution,'sampleIndices'),false);
  source.samples[0]=99;assert.equal(f.distribution.mean,2);assert.deepEqual(f.observations.map(point=>point.value),[2,3]);
  let reads=0;const malicious=[0,1];Object.defineProperty(malicious,'0',{enumerable:true,get(){reads++;return 0;}});invalid({...histogram,samples:malicious});assert.equal(reads,0);
});

writeFileSync(new URL('../../work/reports/core-plan-statistics-current.json',import.meta.url),JSON.stringify({status:'passed',date:new Date().toISOString(),scope:'Pure public Core histogram and normal-density derivation; no native-device acceptance',checks:checks.length,passed:checks},null,2));
console.log('PASS '+checks.length+' public histogram/bellcurve distribution checks.');
