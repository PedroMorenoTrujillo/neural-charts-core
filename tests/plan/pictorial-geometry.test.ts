import {it as test} from 'vitest';
import assert from 'node:assert/strict';
import {presetMesh,validateMesh as validateMeshInput,fillBand,hitBand,signedArea} from '../../src/plan/pictorial-geometry.js';
import type {Mesh} from '../../src/plan/pictorial-geometry.js';
const validateMesh=(input:unknown)=>validateMeshInput(input as Mesh);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const square=()=>validateMesh({id:'square',aspectRatio:1,vertices:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],triangles:[[0,1,2],[0,2,3]]});

test('presets have valid original concave silhouettes and preserve all shape ink',()=>{
  for(const name of ['person','bottle','heart'] as const){
    const mesh=presetMesh(name),band=fillBand(mesh,0,1);
    assert.equal(band.loops.length,1,name);
    near(band.area,band.loops.reduce((s,p)=>s+signedArea(p),0));
    assert.ok(band.area>0&&band.area<1,name);
    assert.deepEqual(fillBand(mesh,0,1),band);
  }
});

test('partial fill is actual clipped geometry, not an independent rectangle',()=>{
  const mesh=presetMesh('bottle'),band=fillBand(mesh,0,.8);
  for(const poly of band.pieces)for(const p of poly)assert.ok(p.y>=.2-1e-12&&p.y<=1);
  assert.equal(hitBand(band,{x:.02,y:.25}),false); // outside the narrowed bottle shoulder
  assert.equal(hitBand(band,{x:.5,y:.5}),true);
  assert.equal(hitBand(band,{x:.5,y:.1}),false); // unfilled real silhouette
});

test('sum and percent bands partition ink without independently overlaid glyphs',()=>{
  const mesh=presetMesh('heart'),parts=[fillBand(mesh,0,.2),fillBand(mesh,.2,.6),fillBand(mesh,.6,1)];
  near(parts.reduce((s,b)=>s+b.area,0),fillBand(mesh,0,1).area);
  for(const band of parts)near(band.area,band.loops.reduce((s,p)=>s+signedArea(p),0));
  for(let i=0;i<30;i++)for(let j=0;j<30;j++){
    const p={x:(i+.3)/30,y:(j+.37)/30};
    assert.ok(parts.reduce((n,b)=>n+Number(hitBand(b,p)),0)<=1);
  }
});

test('a holed mesh remains unfilled and untouchable in its hole',()=>{
  const vertices=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:.3,y:.3},{x:.7,y:.3},{x:.7,y:.7},{x:.3,y:.7}];
  const mesh=validateMesh({id:'ring',aspectRatio:1,vertices,triangles:[[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]});
  const full=fillBand(mesh,0,1);
  near(full.area,.84);assert.equal(full.loops.length,2);
  assert.ok(full.loops.some(p=>signedArea(p)<0),'hole winding preserved');
  assert.equal(hitBand(full,{x:.5,y:.5}),false);
  assert.equal(hitBand(full,{x:.1,y:.5}),true);
  const half=fillBand(mesh,0,.5);near(half.area,.42);
  assert.equal(hitBand(half,{x:.5,y:.6}),false);
  near(half.area,half.loops.reduce((s,p)=>s+signedArea(p),0));
});

test('zero has no invented hit region while a tiny representable band retains its value',()=>{
  assert.deepEqual(fillBand(square(),0,0),{pieces:[],loops:[],area:0});
  const band=fillBand(square(),0,1e-12);assert.ok(band.area>0);
  near(band.area,1e-12);
  assert.equal(hitBand(band,{x:.5,y:1-5e-13}),true);
  const thin=fillBand(square(),0,1e-15);
  assert.ok(thin.area>0);assert.equal(thin.loops.length,1);
  assert.equal(fillBand(square(),0,Number.MIN_VALUE).area,0); // positive but no representable ink
});

test('rejects overlapping, invalid, degenerate, and unused mesh geometry',()=>{
  const mesh=square();
  assert.throws(()=>validateMesh({...mesh,triangles:[[0,1,2],[2,0,1]]}),/duplicate/);
  assert.throws(()=>validateMesh({...mesh,triangles:[[0,1,2],[0,1,3]]}),/overlap|nonManifold/);
  assert.throws(()=>validateMesh({...mesh,triangles:[[0,1,9]]}),/triangle/);
  assert.throws(()=>validateMesh({...mesh,vertices:[...mesh.vertices,{x:.5,y:.5}]}),/unused/);
  assert.throws(()=>validateMesh({...mesh,vertices:mesh.vertices.map(v=>({...v,x:v.x+.1}))}),/vertex/);
  assert.throws(()=>validateMesh({...mesh,aspectRatio:Infinity}),/aspectRatio/);
  assert.throws(()=>fillBand(mesh,-1,1),/band/);
  assert.throws(()=>fillBand(mesh,0,NaN),/band/);
});

test('requires a conforming manifold mesh without T junctions or coincident vertices',()=>{
  const mesh=square();
  assert.throws(()=>validateMesh({...mesh,vertices:[...mesh.vertices,{x:0,y:0}],triangles:[[0,1,2],[4,2,3]]}),/nearCoincident/);
  assert.throws(()=>validateMesh({...mesh,vertices:[...mesh.vertices,{x:.5,y:.5}],triangles:[[0,1,2],[0,4,3],[4,2,3]]}),/tJunction/);
  assert.throws(()=>validateMesh({id:'touching',aspectRatio:1,vertices:[{x:0,y:0},{x:.5,y:0},{x:.5,y:.5},{x:1,y:.5},{x:1,y:1}],triangles:[[0,1,2],[2,3,4]]}),/nonManifoldBoundary/);
});

test('mesh ownership does not retain mutable caller vertices or triangle arrays',()=>{
  const source={id:'square',aspectRatio:1,vertices:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],triangles:[[0,1,2],[0,2,3]]};
  const mesh=validateMesh(source),snapshot=fillBand(mesh,.1,.9);
  source.vertices[0]!.x=.9;source.triangles[0][0]=3;
  assert.deepEqual(fillBand(mesh,.1,.9),snapshot);
});

test('fixed bounded fuzz partitions every preset and stitches closed area-conserving loops',()=>{
  let seed=1979;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let n=0;n<48;n++){
    const mesh=presetMesh((['person','bottle','heart'] as const)[n%3]!),a=next(),b=next();
    const low=Math.min(a,b),high=Math.max(a,b),band=fillBand(mesh,low,high);
    near(band.area,band.loops.reduce((s,p)=>s+signedArea(p),0));
    for(const poly of band.pieces)for(const v of poly)assert.ok(v.x>=0&&v.x<=1&&v.y>=1-high-1e-12&&v.y<=1-low+1e-12);
    near(fillBand(mesh,0,low).area+band.area+fillBand(mesh,high,1).area,fillBand(mesh,0,1).area);
  }
});
