import {expect,it} from 'vitest';
import {createPathBuilder,MAX_PATH_COMMANDS} from '../../src/internal/geometry/path.js';

it('rejects command allocation above the owned cap',()=>{
  const builder=createPathBuilder();
  for(let i=0;i<=MAX_PATH_COMMANDS;i++)builder.moveTo(i,0);
  const result=builder.finish();
  expect(result.status).toBe('invalid');
  if(result.status==='invalid')expect(result.diagnostic.reason).toBe('RESOURCE_LIMIT');
},30000);

it('rejects a finite path whose serialized payload exceeds the byte cap',()=>{
  const builder=createPathBuilder();
  for(let i=0;i<800000;i++)builder.moveTo(Number.MAX_VALUE,-Number.MAX_VALUE);
  const result=builder.finish();
  expect(result.status).toBe('invalid');
  if(result.status==='invalid')expect(result.diagnostic.reason).toBe('RESOURCE_LIMIT');
},30000);
