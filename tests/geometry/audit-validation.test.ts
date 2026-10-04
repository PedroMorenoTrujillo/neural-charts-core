import {expect,test} from 'vitest';
import {validateSceneFrame,LAYERS} from '../../src/internal/scene/validate.js';
function frame(mark:unknown){return{revision:1,width:100,height:100,defs:[],layers:Object.fromEntries(LAYERS.map(layer=>[layer,layer==='marks'?[mark]:[]]))};}
test('F01 non-string and inherited scene kinds are rejected before kind-specific validation',()=>{
  for(const kind of [['path'],['rect'],{toString:()=> 'path'},'constructor','toString','__proto__','unknown',null,0]){
    const result=validateSceneFrame(frame({kind,key:'x',commands:'unvalidated'}));
    expect(result.status).toBe('invalid');if(result.status==='invalid')expect(result.diagnostic.code).toBe('INVALID_CONFIG');
  }
  for(const mark of [{kind:'rect',key:'x',x:0,y:0,width:1,height:1},{kind:'path',key:'x',commands:[{kind:'M',x:0,y:0},{kind:'L',x:1,y:1}]},{kind:'line',key:'x',x1:0,y1:0,x2:1,y2:1},{kind:'circle',key:'x',cx:0,cy:0,r:1},{kind:'text',key:'x',x:0,y:0,text:'literal'}])expect(validateSceneFrame(frame(mark)).status).toBe('ok');
});
