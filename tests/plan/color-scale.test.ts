import {it as test} from 'vitest';
import assert from 'node:assert/strict';
import {mapValueColors as mapValueColorsInput} from '../../src/plan/color-scale.js';
import type {PlanColorAxisSpec} from '../../src/plan.js';
const mapValueColors=(values:readonly(number|null)[],scale:unknown)=>mapValueColorsInput(values,scale as PlanColorAxisSpec);

test('shared color helper has a 4096 future-cell budget independent of the 2048 Tilemap source cap',()=>{
  const values=Array.from({length:4096},(_,i)=>i),scale={type:'continuous',stops:[{at:0,color:'#000000'},{at:1,color:'#FFFFFF'}],missingColor:'#EEEEEE'};
  assert.equal(mapValueColors(values,scale).values.length,4096);assert.throws(()=>mapValueColors([...values,0],scale));
});
const gradient={type:'continuous',stops:[{at:0,color:'#000000'},{at:1,color:'#FFFFFF'}],missingColor:'#778899'};
const classes={type:'classes',missingColor:'#778899',unclassifiedColor:'#AABBCC',classes:[
  {id:'low',label:'Below ten',maxExclusive:10,color:'#111111'},
  {id:'middle',label:'Ten to twenty',minInclusive:10,maxExclusive:20,color:'#222222'},
  {id:'high',label:'Twenty and above',minInclusive:20,color:'#333333'},
]};

test('continuous colors preserve zero, unknown and exact original values',()=>{
  const result=mapValueColors([null,-10,0,10],gradient);
  assert.deepEqual(result.domain,[-10,10]);
  assert.equal(result.values[0].type,'missing');assert.equal(result.values[0].color,'#778899');
  assert.deepEqual(result.values.slice(1).map(v=>v.value),[-10,0,10]);
  assert.deepEqual(result.values.slice(1).map(v=>v.color),['#000000','#808080','#FFFFFF']);
  assert.deepEqual(mapValueColors([null,null],gradient),{domain:null,classes:[],values:[{type:'missing',color:'#778899'},{type:'missing',color:'#778899'}]});
});

test('explicit domain clips only color, keeps original value and records clipping',()=>{
  const result=mapValueColors([-100,0,5,10,100],{...gradient,domain:[0,10]});
  assert.deepEqual(result.values.map(v=>v.ratio),[0,0,.5,1,1]);
  assert.deepEqual(result.values.map(v=>v.clamped),[true,false,false,false,true]);
  assert.deepEqual(result.values.map(v=>v.value),[-100,0,5,10,100]);
  assert.equal(mapValueColors([7,7],gradient).values[0].ratio,.5);
});

test('finite extremes and subnormals never produce NaN colors',()=>{
  for(const domain of [[-Number.MAX_VALUE,Number.MAX_VALUE],[0,Number.MIN_VALUE],[Number.MIN_VALUE,Number.MIN_VALUE*2]]){
    const result=mapValueColors([domain[0],domain[1]],{...gradient,domain});
    assert.deepEqual(result.values.map(v=>v.ratio),[0,1]);
    assert.deepEqual(result.values.map(v=>v.color),['#000000','#FFFFFF']);
  }
});

test('multiple stops interpolate only their own numeric interval',()=>{
  const result=mapValueColors([0,.25,.5,.75,1],{...gradient,domain:[0,1],stops:[{at:0,color:'#000000'},{at:.5,color:'#FF0000'},{at:1,color:'#FFFFFF'}]});
  assert.deepEqual(result.values.map(v=>v.color),['#000000','#800000','#FF0000','#FF8080','#FFFFFF']);
});

test('discrete boundaries are explicitly half-open and independent of input order',()=>{
  const values=[null,-100,0,9.999,10,19.999,20,1e100];
  const result=mapValueColors(values,classes);
  assert.deepEqual(result.values.map(v=>v.type==='class'?v.classId:v.type),['missing','low','low','low','middle','middle','high','high']);
  assert.deepEqual(result.values,[...mapValueColors([...values].reverse(),classes).values].reverse());
});

test('class gaps are distinct from unknown values and retain original measurement',()=>{
  const scale={...classes,classes:[{id:'small',label:'Small',maxExclusive:0,color:'#000000'},{id:'large',label:'Large',minInclusive:10,color:'#FFFFFF'}]};
  const result=mapValueColors([null,0,5,10],scale);
  assert.equal(result.values[0].type,'missing');
  assert.deepEqual(result.values[1],{type:'unclassified',value:0,color:'#AABBCC'});
  assert.deepEqual(result.values[2],{type:'unclassified',value:5,color:'#AABBCC'});
  assert.equal(result.values[3].classId,'large');
});

test('owned result does not retain caller classes, domain or source arrays',()=>{
  const input=[0,100],scale=structuredClone(classes),result=mapValueColors(input,scale),before=JSON.stringify(result);
  input[0]=1000;scale.classes[0].label='Changed';scale.classes[0].maxExclusive=9999;
  assert.equal(JSON.stringify(result),before);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.values)&&Object.isFrozen(result.values[0])&&Object.isFrozen(result.classes[0]));
});

test('invalid scale contracts cannot silently select a fallback color',()=>{
  for(const domain of [[1,1],[10,0],[0,Infinity]])assert.throws(()=>mapValueColors([0],{...gradient,domain}));
  for(const stops of [[],[{at:0,color:'#000000'}],[{at:0,color:'#000000'},{at:0,color:'#FFFFFF'}],[{at:0,color:'red'},{at:1,color:'#FFFFFF'}],[{at:.1,color:'#000000'},{at:1,color:'#FFFFFF'}]])assert.throws(()=>mapValueColors([0],{...gradient,stops}));
  for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>mapValueColors([value],gradient));
  assert.throws(()=>mapValueColors([0],{...classes,classes:[{id:'a',label:'A',maxExclusive:10,color:'#000000'},{id:'b',label:'B',minInclusive:5,color:'#FFFFFF'}]}),/overlapping/);
  assert.throws(()=>mapValueColors([0],{...classes,classes:[{id:'a',label:'A',maxExclusive:10,color:'#000000'},{id:'a',label:'B',minInclusive:10,color:'#FFFFFF'}]}));
});
