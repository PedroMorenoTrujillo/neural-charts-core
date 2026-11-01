import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import {expect} from 'vitest';
function encode(_:string,v:unknown):unknown{
  if(typeof v==='bigint')return{binaryInteger:v.toString()};
  if(typeof v==='number'&&(!Number.isFinite(v)||Object.is(v,-0)))return{binary64:String(v),negativeZero:Object.is(v,-0)};
  return v;
}
export function assertProperty<T extends unknown[]>(property:fc.IProperty<T>,parameters:fc.Parameters<T>={}):void{
  const extended=process.env.NC_PROPERTY_EXTENDED==='1';
  const replayParameters={...(process.env.NC_PROPERTY_SEED?{seed:Number(process.env.NC_PROPERTY_SEED)}:{}),...(process.env.NC_PROPERTY_PATH?{path:process.env.NC_PROPERTY_PATH}:{})};
  const details=fc.check(property,{...parameters,...replayParameters,numRuns:extended?10000:1000,interruptAfterTimeLimit:10000,markInterruptAsFailure:true,verbose:1});
  if(!details.failed){
    const dir=path.resolve('work/property/property-success',extended?'extended':'ordinary');fs.mkdirSync(dir,{recursive:true});
    const label=expect.getState().currentTestName??'property';
    fs.writeFileSync(path.join(dir,label.replace(/[^a-z0-9]/gi,'_')+'.json'),JSON.stringify({test:label,seed:details.seed,successfulRuns:details.numRuns,interrupted:details.interrupted,mode:extended?'extended':'ordinary',timestamp:new Date().toISOString()},null,2));return;
  }
  const replay={seed:details.seed,path:details.counterexamplePath,minimalInput:details.counterexample,failingInputs:details.failures,interrupted:details.interrupted,error:String(details.errorInstance),successfulRuns:details.numRuns,numShrinks:details.numShrinks};
  const dir=path.resolve('work/property/property-replays');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`${process.pid}-${Date.now()}.json`);fs.writeFileSync(file,JSON.stringify(replay,encode,2));
  throw Error(`Property failed: seed=${details.seed} path=${details.counterexamplePath}; replay=${file}; ${String(details.errorInstance)}`);
}
