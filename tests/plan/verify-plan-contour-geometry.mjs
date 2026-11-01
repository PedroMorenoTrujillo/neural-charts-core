import test from 'node:test';
import assert from 'node:assert/strict';
import {contourSegments} from '../../dist/plan/contour-geometry.js';
const field=values=>({x:[0,1],y:[0,1],values});
const ends=segment=>[segment.start,segment.end];
const edge=point=>point.y===0?'top':point.x===1?'right':point.y===1?'bottom':point.x===0?'left':'inside';
const topology=result=>result.segments.map(s=>ends(s).map(edge).sort().join('-')).sort();

test('plane values produce an interpolated level, not category-index geometry',()=>{
  const result=contourSegments({x:[0,2],y:[0,5],values:[0,2,0,2]},[1]);
  assert.equal(result.status,'ready');assert.equal(result.segments.length,1);
  assert.deepEqual(ends(result.segments[0]),[{x:1,y:0},{x:1,y:5}]);
});

test('a level through grid vertices is continuous without zero-length pieces',()=>{
  const result=contourSegments({x:[0,1,2],y:[0,1,2],values:[0,1,2,1,2,3,2,3,4]},[2]);
  assert.equal(result.segments.length,2);
  for(const segment of result.segments)for(const p of ends(segment))assert.equal(p.x+p.y,2);
  assert.equal(result.segments.flatMap(ends).filter(p=>p.x===1&&p.y===1).length,2);
});

test('missing cells are skipped, while zero remains an ordinary source value',()=>{
  const missing=contourSegments({x:[0,1,2],y:[0,1,2],values:[1,1,1,1,null,1,1,1,1]},[0]);
  assert.equal(missing.skippedMissingCells,4);assert.equal(missing.segments.length,0);
  const zero=contourSegments(field([0,1,0,1]),[.5]);
  assert.equal(zero.skippedMissingCells,0);assert.equal(zero.segments.length,1);
  assert.equal(contourSegments(field([0,0,0,0]),[0]).segments.length,0);
});

test('saddle connectivity follows bilinear asymptotic decider instead of cell average',()=>{
  assert.deepEqual(topology(contourSegments(field([1,-.1,-.1,1]),[0])),['bottom-left','right-top']);
  assert.deepEqual(topology(contourSegments(field([.1,-1,-1,.1]),[0])),['bottom-right','left-top']);
  // Multiplying by -1 preserves the actual contour topology.
  assert.deepEqual(topology(contourSegments(field([-1,.1,.1,-1]),[0])),['bottom-left','right-top']);
});

test('an exact saddle retains the four-way intersection at its actual coordinate',()=>{
  for(const [values,expected] of [[[1,-1,-1,1],{x:.5,y:.5}],[[2,-1,-2,1],{x:2/3,y:.5}]]){
    const result=contourSegments(field(values),[0]);
    assert.equal(result.segments.length,4);
    assert.ok(result.segments.every(s=>s.end.x===expected.x&&s.end.y===expected.y));
    assert.deepEqual(result.segments.map(s=>edge(s.start)).sort(),['bottom','left','right','top']);
  }
});

test('coincident shared-edge contours are emitted only once',()=>{
  const result=contourSegments({x:[0,1,2],y:[0,1],values:[-1,0,-1,-1,0,-1]},[0]);
  assert.equal(result.segments.length,1);assert.ok(ends(result.segments[0]).every(p=>p.x===1));
});

test('complementary corner masks retain the same contour geometry',()=>{
  const key=result=>result.segments.map(s=>ends(s).map(p=>`${p.x},${p.y}`).sort().join(';')).sort();
  for(let mask=0;mask<16;mask++){
    const corners=Array.from({length:4},(_,i)=>mask&(1<<i)?1:-1),values=[corners[0],corners[1],corners[3],corners[2]];
    assert.deepEqual(key(contourSegments(field(values),[0])),key(contourSegments(field(values.map(v=>-v)),[0])));
  }
});

test('budget rejection does not return a misleading partial contour',()=>{
  const result=contourSegments({x:[0,1,2],y:[0,1,2],values:[1,-1,null,-1,1,0,null,0,1]},[0],1);
  assert.equal(result.status,'budget');assert.equal(result.requiredMoreThan,1);assert.deepEqual(result.segments,[]);
  assert.equal(result.skippedMissingCells,2);
});

test('finite huge and subnormal values yield finite intersections',()=>{
  for(const [a,b,level] of [[-Number.MAX_VALUE,Number.MAX_VALUE,0],[0,Number.MIN_VALUE*2,Number.MIN_VALUE]]){
    const result=contourSegments(field([a,b,a,b]),[level]);
    assert.equal(result.segments.length,1);assert.ok(ends(result.segments[0]).every(p=>p.x===.5&&Number.isFinite(p.y)));
  }
});

test('source mutations do not change the frozen result',()=>{
  const input=field([0,2,0,2]),result=contourSegments(input,[1]),before=JSON.stringify(result);
  input.x[0]=-10;input.values[0]=NaN;assert.equal(JSON.stringify(result),before);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.segments)&&Object.isFrozen(result.segments[0].start));
});

test('invalid dimensions, sparse values and unordered levels are rejected',()=>{
  const examples=[{x:[0,0],y:[0,1],values:[1,2,3,4]},field([0,NaN,1,2]),field([0,1,2]),{x:[0,,2],y:[0,1],values:[1,2,3,4,5,6]},field(Array(4))];
  for(const input of examples)assert.throws(()=>contourSegments(input,[0]),/Invalid/);
  for(const levels of [[],[1,1],[1,0],[NaN],Array(2),Array.from({length:9},(_,i)=>i)])assert.throws(()=>contourSegments(field([0,1,0,1]),levels));
  for(const budget of [0,1.5,32769])assert.throws(()=>contourSegments(field([0,1,0,1]),[.5],budget));
});

test('random grids satisfy the actual bilinear level and shared-edge continuity',()=>{
  let state=984173;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  for(let run=0;run<32;run++){
    const input={x:[.1,.3,.8,1.7,3],y:[-.8,.1,.6,1,2],values:Array.from({length:25},()=>next()*2-1)};
    const result=contourSegments(input,[-.5,0,.5]);assert.equal(result.status,'ready');
    const endpointCounts=new Map();
    for(const s of result.segments){
      const row=Math.floor(s.cell/input.x.length),col=s.cell%input.x.length;
      for(const p of ends(s)){
        const u=(p.x-input.x[col])/(input.x[col+1]-input.x[col]),v=(p.y-input.y[row])/(input.y[row+1]-input.y[row]);
        const at=s.cell,tl=input.values[at],tr=input.values[at+1],br=input.values[at+1+input.x.length],bl=input.values[at+input.x.length];
        const interpolated=(1-u)*(1-v)*tl+u*(1-v)*tr+u*v*br+(1-u)*v*bl;
        assert.ok(Math.abs(interpolated-s.level)<1e-12);
        const key=`${s.level}:${p.x},${p.y}`;endpointCounts.set(key,(endpointCounts.get(key)??0)+1);
      }
    }
    for(const [key,count] of endpointCounts){const [x,y]=key.slice(key.indexOf(':')+1).split(',').map(Number);if(x>input.x[0]&&x<input.x.at(-1)&&y>input.y[0]&&y<input.y.at(-1))assert.equal(count,2);}
  }
});
