import {expect,it} from 'vitest';
import {planChart} from '../../src/plan.js';
import {tilemapExample,tilemapExampleIds} from '../fixtures/tilemap/examples.js';
it('eight bilingual Tilemap examples use real source values and all four geometries',()=>{
  for(const locale of ['es','en'] as const)for(const id of tilemapExampleIds){
    const example=tilemapExample(id,locale),result=planChart(example.spec,example.options);
    if(result.status==='invalid')throw Error(JSON.stringify({locale,id,result}));
    expect(result.frame.tilemapData).toHaveLength(example.spec.series[0].data.length);
    expect(result.frame.unit).toBe(locale==='es'?'unidades':'units');
    expect(result.frame.observations.map(o=>o.value)).toEqual(example.spec.series[0].data.flatMap(p=>p.value===null?[]:[p.value]));
    expect(result.frame.series).toHaveLength(1);expect(example.note.length).toBeGreaterThan(20);
  }
});
