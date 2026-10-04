import {assertProperty} from '../property-runner.js';
import {expect,test}from'vitest';
import fc from'fast-check';
import {createPathBuilder,serializePath}from'../../src/internal/geometry/path.js';
import {value}from'../helpers.js';
test('finite path serialization and immutable builder',()=>assertProperty(fc.property(fc.array(fc.tuple(fc.double({min:-1e12,max:1e12,noNaN:true,noDefaultInfinity:true}),fc.double({min:-1e12,max:1e12,noNaN:true,noDefaultInfinity:true})),{maxLength:512}),points=>{
  const b=createPathBuilder();points.forEach(([x,y],i)=>i===0?b.moveTo(x,y):b.lineTo(x,y));const commands=value(b.finish()),a=value(serializePath(commands));expect(a).toBe(value(serializePath(commands)));expect(a).not.toMatch(/NaN|Infinity/);expect(Object.isFrozen(commands)).toBe(true);
}),{seed:Number(process.env.NC_PROPERTY_SEED??103),numRuns:Number(process.env.NC_PROPERTY_RUNS??1000),interruptAfterTimeLimit:10000,markInterruptAsFailure:true}));
