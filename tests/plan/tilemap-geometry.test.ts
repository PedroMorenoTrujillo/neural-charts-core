import {it as test} from 'vitest';
import assert from 'node:assert/strict';
import {layoutTiles as layoutTilesInput, hitTile} from '../../src/plan/tilemap-geometry.js';
import type {TileSource,TileLayoutOptions} from '../../src/plan/tilemap-geometry.js';
const layoutTiles=(source:readonly TileSource[],options:unknown)=>layoutTilesInput(source,options as TileLayoutOptions);
const shapes=['hexagon','circle','diamond','square'];
const defaults={width:320,height:240,padding:1,shape:'hexagon'};
const grid=Array.from({length:35},(_,i)=>({id:`cell-${i}`,x:i%7-3,y:Math.floor(i/7)-2}));

function polygonsOverlap(a,b){
  // Independent separating-axis oracle: shared edges are permitted, interiors aren't.
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],nx=q.y-p.y,ny=p.x-q.x;
    const project=points=>points.map(v=>v.x*nx+v.y*ny);
    const aa=project(a),bb=project(b);
    if(Math.max(...aa)<=Math.min(...bb)+1e-7||Math.max(...bb)<=Math.min(...aa)+1e-7)return false;
  }
  return true;
}

for(const shape of shapes){
  test(`${shape}: grid fits portrait and landscape with no interior overlaps`,()=>{
    for(const [width,height] of [[320,240],[240,320],[768,1024]])for(const padding of [0,1,7]){
      const result=layoutTiles(grid,{width,height,padding,shape});
      assert.equal(result.tiles.length,grid.length);
      for(const tile of result.tiles){
        assert.ok(tile.bounds.x>=-1e-8&&tile.bounds.y>=-1e-8);
        assert.ok(tile.bounds.x+tile.bounds.width<=width+1e-8);
        assert.ok(tile.bounds.y+tile.bounds.height<=height+1e-8);
        assert.equal(hitTile(tile,tile.center.x,tile.center.y),!tile.omitted);
        assert.equal(hitTile(tile,tile.bounds.x-1,tile.center.y),false);
      }
      const visible=result.tiles.filter(t=>!t.omitted);
      for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
        const a=visible[i],b=visible[j];
        if(shape==='circle')assert.ok(Math.hypot(a.center.x-b.center.x,a.center.y-b.center.y)>=a.radius+b.radius-1e-7);
        else assert.equal(polygonsOverlap(a.points,b.points),false,`${a.id} overlaps ${b.id}`);
      }
    }
  });
  test(`${shape}: source order and caller mutations do not change owned geometry`,()=>{
    const source=grid.map(p=>({...p})),options={...defaults,shape};
    const result=layoutTiles(source,options);
    const reversed=layoutTiles([...source].reverse(),options);
    for(const tile of result.tiles)assert.deepEqual(tile,reversed.tiles.find(t=>t.id===tile.id));
    const before=JSON.stringify(result);source[0].id='mutated';options.width=1;
    assert.equal(JSON.stringify(result),before);
    assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.tiles)&&Object.isFrozen(result.tiles[0].center));
  });
}

test('negative columns retain exact alternating offsets independent of gaps',()=>{
  const source=[{id:'a',x:-3,y:0},{id:'b',x:-2,y:0},{id:'c',x:4,y:0}];
  const result=layoutTiles(source,{...defaults,padding:0});
  assert.ok(result.tiles[0].center.y>result.tiles[1].center.y);
  assert.equal(result.tiles[1].center.y,result.tiles[2].center.y);
  const translated=layoutTiles(source.map(p=>({...p,x:p.x+2,y:p.y+100})),{...defaults,padding:0});
  result.tiles.forEach((p,i)=>assert.deepEqual(p,translated.tiles[i]));
});

test('too-small cells preserve IDs but cannot capture touches',()=>{
  for(const shape of shapes){
    const result=layoutTiles([{id:'first',x:0,y:0},{id:'last',x:4096,y:4096}],{...defaults,width:2,height:2,padding:0,shape});
    assert.deepEqual(result.tiles.map(t=>t.id),['first','last']);
    for(const tile of result.tiles){assert.equal(tile.omitted,true);assert.equal(tile.points.length,0);assert.equal(hitTile(tile,tile.center.x,tile.center.y),false);}
  }
});

test('padding which consumes a cell does not fabricate a marker',()=>{
  for(const shape of shapes){const [tile]=layoutTiles([{id:'only',x:0,y:0}],{...defaults,width:20,height:20,padding:32,shape}).tiles;assert.equal(tile.omitted,true);assert.equal(hitTile(tile,tile.center.x,tile.center.y),false);}
});

test('source cells are unique before geometry and budgets are explicit',()=>{
  assert.throws(()=>layoutTiles([{id:'a',x:0,y:0},{id:'b',x:0,y:0}],defaults),/Duplicate/);
  assert.throws(()=>layoutTiles([{id:'a',x:0,y:0},{id:'a',x:1,y:0}],defaults),/identity/);
  assert.throws(()=>layoutTiles([{id:'a',x:.5,y:0}],defaults),/coordinate/);
  assert.throws(()=>layoutTiles([{id:'a',x:0,y:0},{id:'b',x:4097,y:0}],defaults),/span/);
  assert.throws(()=>layoutTiles(Array.from({length:2049},(_,i)=>({id:String(i),x:i,y:0})),defaults),/options/);
  for(const options of [{width:NaN},{height:0},{padding:-1},{shape:'unknown'}])assert.throws(()=>layoutTiles(grid,{...defaults,...options}));
  assert.deepEqual(layoutTiles([],defaults),{tiles:[],scale:0,bounds:null});
});

test('deterministic sparse grids remain inside tiles and outside neighbours',()=>{
  let state=1234567;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  for(let run=0;run<32;run++){
    const used=new Set(),source=[];
    for(let i=0;i<15;i++){let x,y,key;do{x=Math.floor(next()*12)-6;y=Math.floor(next()*12)-6;key=`${x},${y}`;}while(used.has(key));used.add(key);source.push({id:`${run}-${i}`,x,y});}
    for(const shape of shapes){const result=layoutTiles(source,{...defaults,shape,width:120+next()*500,height:180+next()*700});
      for(const tile of result.tiles)if(!tile.omitted)assert.deepEqual(result.tiles.filter(t=>hitTile(t,tile.center.x,tile.center.y)).map(t=>t.id),[tile.id]);}
  }
});
