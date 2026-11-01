import type {PlanPictorialSpec,PlanPictorialVertex} from '../../../src/plan.js';
export function maximumSpec():PlanPictorialSpec {
  const vertices:PlanPictorialVertex[]=[],triangles:[number,number,number][]=[];
  for(let i=0;i<64;i++){
    const x=(i%8)/8,y=Math.floor(i/8)/8,n=vertices.length;
    vertices.push({x:x/.995,y:y/.995},{x:(x+.12)/.995,y:y/.995},{x:x/.995,y:(y+.12)/.995});triangles.push([n,n+1,n+2]);
  }
  const categories=Array.from({length:32},(_,i)=>({id:'c'+i,label:'Category '+i}));
  return{family:'pictorial',title:'Maximum bounded transport',axes:{x:{kind:'category',values:categories},y:{kind:'linear',domain:[0,100]}},series:Array.from({length:2},(_,s)=>({id:'s'+s,name:'Source '+s,data:categories.map((c,i)=>({id:'p'+i,x:c.id,y:60+s*30}))})),pictorial:{shape:{kind:'mesh',mesh:{id:'islands',aspectRatio:1,vertices,triangles}}}};
}
