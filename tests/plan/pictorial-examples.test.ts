import {it as test} from 'vitest';
import assert from 'node:assert/strict';
import {exampleIds,pictorialExample} from '../fixtures/pictorial/examples.js';
import {planPictorial} from '../../src/plan/pictorial.js';
test('eight bilingual examples produce truthful source and geometry with no prepared-scene substitution',()=>{
  for(const locale of ['es','en'])for(const id of exampleIds){const example=pictorialExample(id,locale),result=planPictorial(example.spec,example.options);assert.notEqual(result.status,'invalid',JSON.stringify({locale,id,result}));assert.equal(result.frame.pictorialData.length,example.spec.series.reduce((n,s)=>n+s.data.length,0));assert.ok(example.note.length>20);}
});
